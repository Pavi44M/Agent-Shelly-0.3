"""Store Floor: Shelly's weekly results placed on the 3D store plan.

The planogram (modules/store-floor/planogram.yaml) says where each fixture stands
and which SKUs sit on it. This module joins it with the weekly web data
(docs/data/shelly-data.js, built by shelly.webexport) and works out, per fixture:
sales, week-on-week, margin, waste, stock cover, count variance, a status
(alert / watch / ok / no products) with plain reasons, and the actions and
decisions that mention its products.

    from shelly.storefloor import build_floor, floor_text
    floor = build_floor(web_data)          # dict, written to docs/data/store-floor.js
    print(floor_text(floor))               # python -m shelly store
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PLANOGRAM = ROOT / "modules" / "store-floor" / "planogram.yaml"

ALERT_FLAGS = ("stock-out", "Shrinkage", "Waste blow-out")
WATCH_FLAGS = ("Sustained decline", "Count gain")


def load_planogram(path: Path | str = PLANOGRAM) -> dict:
    pg = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    ids = [f["id"] for f in pg["fixtures"]]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise ValueError(f"planogram: duplicate fixture ids {sorted(dup)}")
    for f in pg["fixtures"]:
        if ("rect" in f) == ("seg" in f):
            raise ValueError(f"planogram: fixture '{f['id']}' needs exactly one of rect / seg")
    return pg


def read_web_data(path: Path | str) -> dict:
    s = Path(path).read_text(encoding="utf-8")
    return json.loads(s[s.index("{"):s.rstrip().rstrip(";").rindex("}") + 1])


def place_skus(pg: dict, products: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
    """SKU -> fixture: an exact `skus` entry wins, then the first fixture listing the category."""
    by_fx: dict[str, list[dict]] = {f["id"]: [] for f in pg["fixtures"]}
    exact = {sku: f["id"] for f in pg["fixtures"] for sku in f.get("skus", [])}
    by_cat: dict[str, str] = {}
    for f in pg["fixtures"]:
        for c in f.get("categories", []):
            by_cat.setdefault(c, f["id"])
    unplaced = []
    for p in products:
        fid = exact.get(p["sku"]) or by_cat.get(p.get("category"))
        (by_fx[fid] if fid else unplaced).append(p)
    return by_fx, unplaced


def _num(v, d=0.0):
    return d if v is None else float(v)


def fixture_status(prods: list[dict], targets: dict, recalled: set[str]) -> tuple[str, list[str]]:
    if not prods:
        return "empty", ["No products from the data are placed here yet"]
    alert, watch = [], []
    var_lim = _num(targets.get("count_variance_units"), 5)
    for p in prods:
        n = p["name"]
        flags = p.get("flags") or []
        st = p.get("reorder_status") or ""
        if p["name"] in recalled or st.startswith("Blocked"):
            alert.append(f"{n}: recalled, pull from shelf")
        for f in flags:
            if any(k in f for k in ALERT_FLAGS):
                alert.append(f"{n}: {f.lower()}")
            elif any(k in f for k in WATCH_FLAGS):
                watch.append(f"{n}: {f.lower()}")
        dc = p.get("days_cover")
        if st.startswith("Order now"):
            (alert if dc is not None and dc < 1 else watch).append(
                f"{n}: order now ({dc:.1f} days cover)" if dc is not None else f"{n}: order now")
        elif st == "Order":
            watch.append(f"{n}: on today's order")
        if p.get("count_var") is not None and abs(p["count_var"]) >= var_lim and not any("Shrinkage" in f or "Count gain" in f for f in flags):
            watch.append(f"{n}: count off by {p['count_var']:+.0f} units")
        if p.get("wow_pct") is not None and p["wow_pct"] <= -15:
            watch.append(f"{n}: sales {p['wow_pct']:+.0f}% on last week")
    # keep reasons unique, worst first
    seen, reasons = set(), []
    for r in alert + watch:
        if r not in seen:
            seen.add(r)
            reasons.append(r)
    return ("alert" if alert else "watch" if watch else "ok"), reasons or ["On plan: stocked, selling and no flags"]


def _linked_actions(prods: list[dict], actions: list[dict]) -> list[dict]:
    names = [p["name"] for p in prods]
    out = []
    for a in actions:
        text = f"{a.get('action', '')} {a.get('why', '')}"
        if any(n in text for n in names):
            out.append({k: a.get(k) for k in ("id", "priority", "area", "action", "why", "owner", "when",
                                               "weekly_impact_nzd", "decision_id", "decision_status")})
    return out


def _category_shares(web: dict) -> tuple[dict, dict, dict]:
    """Category sales, 7-day forecast and budget gap, so each fixture can carry its share."""
    cat_sales, cat_fc, cat_bud = {}, {}, {}
    for c in web.get("categories", []):
        cat_sales[c["category"]] = _num(c.get("sales"))
        cat_bud[c["category"]] = _num(c.get("vs_budget"))
    for f in web.get("forecast_by_cat", []):
        cat_fc[f["category"]] = cat_fc.get(f["category"], 0.0) + _num(f.get("v"))
    return cat_sales, cat_fc, cat_bud


def build_floor(web: dict, pg: dict | None = None) -> dict:
    _CS = _category_shares(web)
    pg = pg or load_planogram()
    targets = web.get("targets", {})
    by_fx, unplaced = place_skus(pg, web.get("products", []))
    recalled = {r.get("product") for r in web.get("recalls", [])}
    total = sum(_num(p.get("sales_7d")) for p in web.get("products", [])) or 1.0
    fixtures = []
    for f in pg["fixtures"]:
        prods = by_fx[f["id"]]
        sales = sum(_num(p.get("sales_7d")) for p in prods)
        prev = sum(_num(p.get("sales_7d")) / (1 + p["wow_pct"] / 100) if p.get("wow_pct") not in (None, -100)
                   else _num(p.get("sales_7d")) for p in prods)
        gm_w = sum(_num(p.get("gm_pct")) * _num(p.get("sales_7d")) for p in prods if p.get("gm_pct") is not None)
        waste = sum(_num(p.get("waste_7d")) for p in prods)
        covers = [p["days_cover"] for p in prods if p.get("days_cover") is not None]
        if f.get("shelf", True) is False and not prods:
            status, reasons = "service", ["Service point: no stock is held here"]
        else:
            status, reasons = fixture_status(prods, targets, recalled)
        trend = [0.0] * 14
        for p in prods:
            for i, v in enumerate((p.get("trend14") or [])[-14:]):
                trend[i + 14 - len((p.get("trend14") or [])[-14:])] += _num(v)
        geo = {k: f[k] for k in ("rect", "seg", "face", "height", "type", "kind", "max_depth", "no_endcaps", "count") if k in f}
        fixtures.append({
            "id": f["id"], "name": f["name"], "zone": f.get("zone", ""), "aisle": f.get("aisle"), "colour": f["colour"],
            "items": f.get("items", []), **geo,
            "kpi": {
                "sales": round(sales), "share_pct": round(sales / total * 100, 1),
                "wow_pct": round((sales / prev - 1) * 100, 1) if prev else None,
                "gm_pct": round(gm_w / sales, 1) if sales else None,
                "waste": round(waste), "waste_pct": round(waste / sales * 100, 1) if sales else None,
                "units": int(sum(_num(p.get("units_7d")) for p in prods)),
                "min_cover": round(min(covers), 1) if covers else None,
                "to_order": sum(1 for p in prods if (p.get("reorder_status") or "").startswith("Order")),
                "order_now": sum(1 for p in prods if (p.get("reorder_status") or "").startswith("Order now")),
                "forecast_7d": round(sum(_num(p.get("sales_7d")) / _CS[0][p["category"]] * _CS[1].get(p["category"], 0)
                                         for p in prods if _CS[0].get(p.get("category")))),
                "vs_budget": round(sum(_num(p.get("sales_7d")) / _CS[0][p["category"]] * _CS[2].get(p["category"], 0)
                                       for p in prods if _CS[0].get(p.get("category")))),
            },
            "trend": [round(v) for v in trend] if prods else [],
            "status": status, "reasons": reasons[:6],
            "products": [{k: p.get(k) for k in ("sku", "name", "category", "sales_7d", "units_7d", "wow_pct", "gm_pct",
                                                "on_hand", "days_cover", "order_qty", "reorder_status", "waste_7d",
                                                "count_var", "flags", "abc")} for p in
                         sorted(prods, key=lambda p: -_num(p.get("sales_7d")))],
            "actions": _linked_actions(prods, web.get("actions", [])),
        })
    ops = dict(pg.get("operations") or {})
    if ops:
        daily = [d.get("v", 0) for d in web.get("daily", [])][-7:]
        avg_day = sum(daily) / len(daily) if daily else total / 7
        ops["avg_daily_sales"] = round(avg_day)
        ops["customers_per_day"] = int(round(avg_day / max(1.0, float(ops.get("avg_basket_nzd", 14)))))
    ch = web.get("channels", [])[-7:]
    ue, od = sum(_num(x.get("uber_eats")) for x in ch), sum(_num(x.get("on_demand")) for x in ch)
    if ops:
        ops["delivery"] = {"share_pct": web.get("kpis", {}).get("delivery_pct", 0), "uber_share": round(ue / (ue + od), 2) if ue + od else 0.7,
                           "outages": [e for e in web.get("exceptions", []) if e.get("item") in ("uber_eats", "on_demand")]}
    counts = {s: sum(1 for f in fixtures if f["status"] == s) for s in ("alert", "watch", "ok", "empty", "service")}
    meta = web.get("meta", {})
    return {
        "plan": pg["plan"], "fixtures": fixtures, "counts": counts, "targets": targets,
        "kpis": web.get("kpis", {}), "roster": web.get("roster", []),
        "categories": [{k: c.get(k) for k in ("category", "sales", "vs_budget", "waste", "gm_pct", "wow_pct")} for c in web.get("categories", [])],
        "operations": ops, "backroom": pg.get("backroom") or {},
        "unplaced": [{"sku": p["sku"], "name": p["name"], "category": p.get("category")} for p in unplaced],
        "meta": {"asof": meta.get("asof"), "asof_label": meta.get("asof_label"), "store": meta.get("store"),
                 "version": meta.get("version"), "synthetic": meta.get("synthetic", True),
                 "store_sales": round(total), "store_gm_pct": web.get("kpis", {}).get("gm_pct")},
    }


def write_floor_js(floor: dict, path: Path | str) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window.SHELLY_STORE = " + json.dumps(floor, default=str, separators=(",", ":"),
                                                          ensure_ascii=False) + ";\n", encoding="utf-8")
    return path


def floor_text(floor: dict) -> str:
    """The walk-the-floor summary for the command line, worst fixtures first."""
    order = {"alert": 0, "watch": 1, "ok": 2, "empty": 3, "service": 4}
    icon = {"alert": "!!", "watch": " !", "ok": "ok", "empty": " -", "service": "  "}
    m, c = floor["meta"], floor["counts"]
    lines = [f"Store floor, week ending {m.get('asof_label') or m.get('asof')}: "
             f"{c['alert']} need action now, {c['watch']} to watch, {c['ok']} on plan, {c['empty']} with no products in the data"]
    for f in sorted(floor["fixtures"], key=lambda f: (order[f["status"]], -f["kpi"]["sales"])):
        k = f["kpi"]
        where = f"Aisle {f['aisle']}" if f.get("aisle") else f["zone"]
        wow = f"{k['wow_pct']:+.0f}%" if k["wow_pct"] is not None else "  -"
        lines.append(f"[{icon[f['status']]}] {f['name'][:30]:30s} {where[:16]:16s} ${k['sales']:>6,}  {wow:>5}  "
                     + (f["reasons"][0] if f["status"] in ("alert", "watch", "empty") else ""))
    if floor["unplaced"]:
        lines.append("Not placed on the plan (add them to planogram.yaml): "
                     + ", ".join(p["name"] for p in floor["unplaced"]))
    return "\n".join(lines)
