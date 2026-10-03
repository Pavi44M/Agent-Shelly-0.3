"""
Export the week's computed facts as a small JSON bundle for the Shelly web app.

The web app never sees raw transactions: only aggregates, actions and model
results. It's written as `shelly-data.js` (window.SHELLY_DATA = {...}) so the page
works both on GitHub Pages and when opened straight from disk.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from . import __version__


def _r(v, n=1):
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return None
    return round(float(v), n)


def build(P, R, cfg, acts, summary, engine, quality) -> dict:
    k = R["commercial"]["kpis"]
    c = k["current"]
    daily = R["commercial"]["daily_sales"]
    daily = daily[daily.index > P.asof - pd.Timedelta(days=56)]
    fc = R["forecast"]["forecast"]
    fc_daily = fc.groupby("date")["forecast_sales"].sum()
    ch = P.sales.groupby(["date", "channel"])["net_sales"].sum().unstack(fill_value=0)
    ch = ch[ch.index > P.asof - pd.Timedelta(days=14)]

    pl = R["commercial"]["category_pl"].reset_index()
    cats = [{"category": r.category, "sales": _r(r.sales, 0), "gm_pct": _r(r.gm_pct), "wow_pct": _r(r.wow_pct),
             "yoy_pct": _r(r.yoy_pct), "budget": _r(r.budget, 0), "vs_budget": _r(r.vs_budget, 0),
             "waste": _r(r.waste_value, 0), "contribution": _r(r.contribution, 0)} for r in pl.itertuples()]

    # per-product fact sheet (for "how is <product> doing?")
    s7 = P.sales[P.sales["date"] > P.asof - pd.Timedelta(days=7)].groupby("sku").agg(
        units=("units", "sum"), sales=("net_sales", "sum"), cost=("cost", "sum"))
    p7 = P.sales[(P.sales["date"] > P.asof - pd.Timedelta(days=14)) &
                 (P.sales["date"] <= P.asof - pd.Timedelta(days=7))].groupby("sku")["net_sales"].sum()
    seg = R["segments"]["sku_segments"].set_index("sku")
    ab = R["assortment"].set_index("sku")
    rp = R["replenishment"].set_index("sku")
    an_by_sku = R["anomalies"].groupby("sku")["type"].apply(list).to_dict() if len(R["anomalies"]) else {}
    # store floor (docs/store): waste, last count variance and a 14-day trend per SKU
    w7 = (P.waste[P.waste["date"] > P.asof - pd.Timedelta(days=7)].groupby("sku")["waste_value"].sum()
          if P.waste is not None and len(P.waste) else pd.Series(dtype=float))
    if P.inventory is not None and len(P.inventory):
        last_cnt = P.inventory.sort_values("count_date").groupby("sku").tail(1).set_index("sku")["variance_units"]
    else:
        last_cnt = pd.Series(dtype=float)
    d14 = P.daily_sku[P.daily_sku["date"] > P.asof - pd.Timedelta(days=14)]
    trend = d14.sort_values("date").groupby("sku")["net_sales"].apply(lambda v: [_r(x, 0) for x in v]).to_dict()
    products = []
    for p in P.products.itertuples():
        s = p.sku
        sales = s7["sales"].get(s, 0.0)
        prev = p7.get(s, 0.0)
        products.append({
            "sku": s, "name": p.product_name, "category": p.category, "supplier": p.supplier,
            "price": _r(p.unit_price, 2), "units_7d": int(s7["units"].get(s, 0)), "sales_7d": _r(sales, 0),
            "wow_pct": _r((sales / prev - 1) * 100) if prev else None,
            "gm_pct": _r((sales - s7["cost"].get(s, 0)) / sales * 100) if sales else None,
            "segment": seg["segment"].get(s), "abc": ab["abc"].get(s), "range_action": ab["range_action"].get(s),
            "on_hand": _r(rp["est_on_hand"].get(s), 0), "days_cover": _r(rp["days_cover"].get(s)),
            "order_qty": _r(rp["suggested_order"].get(s), 0), "reorder_status": rp["status"].get(s),
            "flags": [t for t in an_by_sku.get(s, []) if t],
            "waste_7d": _r(w7.get(s, 0.0), 0), "count_var": _r(last_cnt.get(s), 0) if s in last_cnt.index else None,
            "trend14": trend.get(s, []),
        })

    reorder = [{"name": r.product_name, "supplier": r.supplier, "category": r.category,
                "on_hand": _r(r.est_on_hand, 0), "days_cover": _r(r.days_cover), "rop": _r(r.reorder_point, 0),
                "qty": _r(r.suggested_order, 0), "value": _r(r.order_value, 0), "status": r.status}
               for r in R["replenishment"].itertuples() if r.suggested_order > 0 or r.status.startswith("Blocked")]

    an = R["anomalies"]
    exceptions = [{"date": str(r.date), "type": r.type, "item": r.item, "detail": r.detail,
                   "impact": _r(r.impact_nzd, 0)} for r in an.itertuples()] if len(an) else []

    prof = R["segments"]["profile"]
    members = R["segments"]["sku_segments"].groupby("segment")["product_name"].apply(list).to_dict()
    segments = [{"segment": r.segment, "n": int(r.n_skus), "units_day": _r(r.avg_daily_units), "gm_pct": _r(r.gm_pct),
                 "waste_pct": _r(r.waste_rate_pct), "delivery_pct": _r(r.delivery_share_pct),
                 "promo_uplift": _r(r.promo_uplift), "jaccard": _r(r.jaccard_stability, 2),
                 "stability": str(r.stability_verdict), "products": members.get(r.segment, [])}
                for r in prof.itertuples()]
    pts = R["segments"]["sku_segments"][["product_name", "segment", "pc1", "pc2"]]

    lb = R["forecast"]["model_leaderboard"]
    best = R["forecast"]["best_by_category"]
    lp = R["labour"]
    b = R["commercial"]["bridge"]
    comp = R["compliance"]
    rc = comp["recalls"]

    return {
        "meta": {"app": "Shelly", "version": __version__, "asof": P.asof.strftime("%Y-%m-%d"),
                 "asof_label": P.asof.strftime("%A %d %B %Y"), "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
                 "store": cfg["store"]["name"], "summary": summary, "engine": engine,
                 "synthetic": True},
        "targets": cfg["kpi_targets"],
        "kpis": {"sales": _r(c["sales"], 0), "units": int(c["units"]), "gm": _r(c["gross_margin"], 0),
                 "gm_pct": _r(c["gm_pct"]), "waste": _r(c["waste_value"], 0), "waste_pct": _r(c["waste_pct"]),
                 "delivery_pct": _r(c["delivery_share_pct"]), "promo_pct": _r(c["promo_share_pct"]),
                 "wow_pct": _r(k["wow_pct"]), "yoy_pct": _r(k["yoy_pct"]), "budget": _r(k["budget"], 0),
                 "vs_budget_pct": _r(k["vs_budget_pct"]), "prev_sales": _r(k["previous"]["sales"], 0),
                 "ly_sales": _r(k["last_year"]["sales"], 0), "forecast_7d": _r(fc_daily.sum(), 0)},
        "daily": [{"d": d.strftime("%Y-%m-%d"), "v": _r(v, 0)} for d, v in daily.items()],
        "forecast": [{"d": d.strftime("%Y-%m-%d"), "v": _r(v, 0)} for d, v in fc_daily.items()],
        "forecast_by_cat": [{"d": r.date.strftime("%Y-%m-%d"), "category": r.category, "v": _r(r.forecast_sales, 0),
                             "model": r.model} for r in fc.itertuples()],
        "channels": [{"d": d.strftime("%Y-%m-%d"), **{c_: _r(ch.loc[d, c_], 0) for c_ in ch.columns}} for d in ch.index],
        "bridge": {kk: _r(v, 0) for kk, v in b.items()},
        "categories": cats,
        "actions": [{**a, "id": f"a{i}"} for i, a in enumerate(acts)],
        "exceptions": exceptions,
        "reorder": reorder,
        "roster": [{"d": r.date.strftime("%Y-%m-%d"), "day": r.day, "sales": _r(r.forecast_sales, 0),
                    "hours": _r(r.hours_needed), "wage": _r(r.wage_cost, 0)} for r in lp.itertuples()],
        "labour": cfg["labour"],
        "segments": segments,
        "segment_points": [{"name": r.product_name, "segment": r.segment, "x": _r(r.pc1, 2), "y": _r(r.pc2, 2)}
                           for r in pts.itertuples()],
        "silhouette": {str(kk): _r(v, 3) for kk, v in R["segments"]["silhouette"].items()},
        "models": [{"model": r.model, "wape": _r(r.wape), "mape": _r(r.mape)} for r in lb.itertuples()],
        "best_models": [{"category": r.category, "model": r.model, "wape": _r(r.wape)} for r in best.itertuples()],
        "recalls": [{"product": r.product_name, "gtin": r.gtin, "reason": r.reason, "date": str(r.notice_date),
                     "sold_7d": int(r.units_sold_last_7d), "on_hand": int(r.est_on_hand)} for r in rc.itertuples()] if len(rc) else [],
        "gs1_invalid": comp["gs1_invalid"][["product_name", "gtin"]].to_dict("records") if len(comp["gs1_invalid"]) else [],
        "liquor_delivery_units": comp["liquor_delivery_units"],
        "quality": {"score": _r(quality.score, 0), "issues": [{"severity": s, "msg": m} for s, m in quality.issues],
                    "rows": int(sum(quality.rows.values())),
                    "from": str(quality.date_range[0]), "to": str(quality.date_range[1])},
        "products": products,
    }


def write(data: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    js = out_dir / "shelly-data.js"
    js.write_text("window.SHELLY_DATA = " + json.dumps(data, default=str, separators=(",", ":")) + ";\n")
    (out_dir / "shelly-data.json").write_text(json.dumps(data, default=str, indent=1))
    return js
