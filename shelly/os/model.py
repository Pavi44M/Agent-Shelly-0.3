"""Shelly OS · the data model (v2.0): one SQLite database that every department reads.

Until v1.22 each page built its own data file. Shelly OS loads all of them into one set of tables with
the same names and keys everywhere (business ids store / totara / gateway / group, department ids from
the Brain), so the event bus can join across businesses: a store stock-out can find the Gateway agent
that books the delivery.

    from shelly.os.model import build, TABLES
    con = build()                 # in memory, from the published synthetic data (docs/data, docs/supply-chain)
    con = build("outputs/shelly.db")

Real-data mode (later releases) fills the same tables from a business's own exports on its own PC;
the public site only ever sees the synthetic build.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# table -> (what it holds, DDL columns). The page draws this list, so the description is for people.
TABLES = {
    "businesses": ("The four Shelly businesses", "id TEXT PRIMARY KEY, name TEXT, kind TEXT, page TEXT"),
    "departments": ("Company-wide departments and their spending limits", "id TEXT PRIMARY KEY, name TEXT, head TEXT, head_agent TEXT, limit_nzd REAL"),
    "agents": ("Every agent: business, department, autonomy", "id TEXT PRIMARY KEY, name TEXT, business TEXT, department TEXT, autonomy TEXT, team TEXT"),
    "sites": ("Places: the store, warehouses, the tower", "id TEXT PRIMARY KEY, business TEXT, name TEXT, kind TEXT"),
    "stock": ("Stock on hand and cover, store and Tōtara", "business TEXT, sku TEXT, name TEXT, category TEXT, supplier TEXT, on_hand REAL, cover_days REAL, reorder_point REAL, order_qty REAL, value REAL, status TEXT"),
    "sales": ("Sales by category against budget", "business TEXT, category TEXT, sales REAL, budget REAL, gm_pct REAL, wow_pct REAL"),
    "service": ("Delivery service by Gateway client", "business TEXT, client TEXT, name TEXT, otif REAL, target REAL, late INTEGER, deliveries INTEGER"),
    "expiry": ("Batches at risk of expiring (Tōtara)", "business TEXT, batch TEXT, sku TEXT, name TEXT, days_left INTEGER, at_risk_value REAL"),
    "kpis": ("Headline numbers for each business", "business TEXT, metric TEXT, value REAL, unit TEXT, asof TEXT"),
    "flags": ("Things flagged by each business", "business TEXT, severity TEXT, area TEXT, text TEXT, client TEXT"),
    "approvals": ("Requests waiting for a person", "id TEXT PRIMARY KEY, business TEXT, agent TEXT, dept TEXT, area TEXT, title TEXT, amount REAL"),
    "events": ("What happened: the event bus log", "id TEXT PRIMARY KEY, ts TEXT, type TEXT, business TEXT, source TEXT, subject TEXT, severity TEXT, payload TEXT"),
    "actions": ("What agents did or asked for, per event", "id TEXT PRIMARY KEY, event_id TEXT, agent TEXT, business TEXT, dept TEXT, action TEXT, area TEXT, amount REAL, needs TEXT, chain TEXT, status TEXT"),
}


def load_js(path) -> dict:
    """read a published data file (window.X = {...}; or const X = {...};) as JSON"""
    t = Path(path).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def _ins(con, table, rows):
    rows = list(rows)
    if not rows: return 0
    cols = list(rows[0])
    con.executemany(f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", [tuple(r[c] for c in cols) for r in rows])
    return len(rows)


def build(db=":memory:", root=ROOT) -> sqlite3.Connection:
    """create the tables and fill them from the synthetic data the site publishes"""
    root = Path(root); D = root / "docs/data"
    if db != ":memory:":
        Path(db).parent.mkdir(parents=True, exist_ok=True)
        if Path(db).exists(): Path(db).unlink()
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    for t, (_, cols) in TABLES.items():
        con.execute(f"CREATE TABLE {t} ({cols})")
    brain, store, gw, tower = (load_js(D / f) for f in ("brain.js", "shelly-data.js", "gateway.js", "tower.js"))
    tot = load_js(root / "docs/supply-chain/data.js")
    ap = load_js(D / "approvals.js")
    s_asof, g_asof = store["meta"]["asof"], gw["meta"]["asof"]

    _ins(con, "businesses", ({"id": b["id"], "name": b["name"], "kind": b["kind"], "page": b["page"]} for b in brain["businesses"]))
    _ins(con, "departments", ({"id": d["id"], "name": d["name"], "head": d["head"], "head_agent": d["head_agent"], "limit_nzd": d["limit"]} for d in brain["departments"]))
    _ins(con, "agents", ({"id": a["id"], "name": a["name"], "business": a["business"], "department": a["department"], "autonomy": a["autonomy"], "team": a.get("team", "")} for a in brain["agents"]))
    _ins(con, "sites", [{"id": "NBS", "business": "store", "name": store["meta"].get("store", "Neighbourhood Store"), "kind": "Convenience store"},
                        {"id": "TWR", "business": "group", "name": tower["tower"]["name"], "kind": "Office tower"}] +
         [{"id": s["id"], "business": "gateway", "name": s["name"], "kind": s["kind"]} for s in gw["sites"]])
    _ins(con, "stock", [{"business": "store", "sku": r["name"], "name": r["name"], "category": r["category"], "supplier": r["supplier"], "on_hand": r["on_hand"],
                         "cover_days": r["days_cover"], "reorder_point": r["rop"], "order_qty": r["qty"], "value": r["value"], "status": r["status"]} for r in store["reorder"]] +
         [{"business": "totara", "sku": r["sku"], "name": r["product_name"], "category": r["category"], "supplier": r.get("primary_supplier_id", ""), "on_hand": r["on_hand"],
           "cover_days": r["cover_days"], "reorder_point": r["reorder_point"], "order_qty": r.get("next_qty") or 0, "value": r.get("revenue_at_risk") or 0, "status": r["status"]} for r in tot["inventory"]])
    _ins(con, "sales", ({"business": "store", "category": c["category"], "sales": c["sales"], "budget": c["budget"], "gm_pct": c["gm_pct"], "wow_pct": c["wow_pct"]} for c in store["categories"]))
    _ins(con, "service", ({"business": "gateway", "client": c["id"], "name": c["name"], "otif": c["otif"], "target": c["otif_target"], "late": c.get("late", 0), "deliveries": c.get("deliveries_4wk", 0)} for c in gw["clients"]))
    _ins(con, "expiry", ({"business": "totara", "batch": e["batch_id"], "sku": e["sku"], "name": e["product_name"], "days_left": e["days_left"], "at_risk_value": e["at_risk_value"]} for e in tot["expiry"]))
    k = store["kpis"]; tk = tot["kpi"]; gk = gw["kpis"]; wk = tower["kpis"]
    _ins(con, "kpis", [
        {"business": "store", "metric": "Sales (7 days)", "value": k["sales"], "unit": "NZD", "asof": s_asof},
        {"business": "store", "metric": "Sales vs budget", "value": k["vs_budget_pct"], "unit": "%", "asof": s_asof},
        {"business": "store", "metric": "Gross margin", "value": k["gm_pct"], "unit": "%", "asof": s_asof},
        {"business": "store", "metric": "Waste", "value": k["waste_pct"], "unit": "% of sales", "asof": s_asof},
        {"business": "totara", "metric": "Revenue (30 days)", "value": tk["revenue_30d"], "unit": "NZD", "asof": tot["generated"]},
        {"business": "totara", "metric": "SKUs at risk", "value": tk["at_risk_skus"], "unit": "SKUs", "asof": tot["generated"]},
        {"business": "totara", "metric": "Supplier OTIF (90 days)", "value": round(tk["otif_90"] * 100, 1), "unit": "%", "asof": tot["generated"]},
        {"business": "gateway", "metric": "OTIF", "value": gk["otif"], "unit": "%", "asof": g_asof},
        {"business": "gateway", "metric": "Warehouse full", "value": gk["fill_pct"], "unit": "%", "asof": g_asof},
        {"business": "gateway", "metric": "Revenue (week)", "value": gk["revenue_wk"], "unit": "NZD", "asof": g_asof},
        {"business": "group", "metric": "Tower occupancy", "value": wk.get("occupancy_pct", 0), "unit": "%", "asof": tower["meta"]["asof"]},
    ])
    _ins(con, "flags", [{"business": "gateway", "severity": f["sev"], "area": f["area"], "text": f["text"], "client": f.get("client", "")} for f in gw["flags"]] +
         [{"business": "group", "severity": f["sev"], "area": f["area"], "text": f["text"], "client": ""} for f in tower["flags"]] +
         [{"business": "totara", "severity": "high", "area": e.get("kind", "Escalation"), "text": e["title"], "client": ""} for e in tot["escalate"]])
    _ins(con, "approvals", ({"id": a["key"], "business": a["business"], "agent": a["agent"], "dept": a.get("dept", ""), "area": a["area"], "title": a["title"], "amount": a.get("amount") or 0} for a in ap["items"]))
    con.commit()
    return con


def counts(con) -> dict:
    return {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
