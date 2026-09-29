"""Industry pack reports: consumer electronics, wholesale, warehousing, production."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import spec as S
from .context import money
from .excel import Block, ChartSpec, Col, Kpi, PivotSpec, WorkbookPlan

TITLES = {"electronics": "Consumer electronics report", "wholesale": "Wholesale report",
          "warehousing": "Warehouse operations report", "production": "Production report"}


def _raw(name: str, d: dict):
    """(raw table, dimension column, date column, measures {col: fmt}, ratio cols [(label, num, den, fmt)])"""
    if name == "electronics":
        r = d["sales"].merge(d["products"][["sku", "name", "category", "unit_cost"]], on="sku")
        r["cost"] = r["units"] * r["unit_cost"]
        r = r.rename(columns={"week": "Week", "sku": "SKU", "name": "Product", "category": "Category", "units": "Units", "revenue": "Revenue", "cost": "Cost"})
        r["Gross margin"] = (r["Revenue"] - r["Cost"]).round(2)
        return r[["Week", "SKU", "Product", "Category", "Units", "Revenue", "Cost", "Gross margin"]], "Category", "Week", \
            {"Units": "int", "Revenue": "money", "Gross margin": "money"}, [("GM %", "Gross margin", "Revenue", "pct")]
    if name == "wholesale":
        r = d["invoices"].merge(d["customers"], on="customer")
        r["gm"] = r["revenue"] - r["cost"]
        r["week"] = r["date"] - pd.to_timedelta(r["date"].dt.weekday, unit="D")
        r = r.rename(columns={"date": "Date", "week": "Week", "order_id": "Order", "name": "Customer", "revenue": "Revenue", "cost": "Cost", "gm": "Gross margin"})
        return r[["Date", "Week", "Order", "Customer", "Revenue", "Cost", "Gross margin"]].round(2), "Customer", "Week", \
            {"Revenue": "money", "Gross margin": "money"}, [("GM %", "Gross margin", "Revenue", "pct")]
    if name == "warehousing":
        r = d["picks"].copy()
        r["week"] = r["date"] - pd.to_timedelta(r["date"].dt.weekday, unit="D")
        r = r.rename(columns={"date": "Date", "week": "Week", "sku": "SKU", "lines": "Lines", "units": "Units", "current_zone": "Zone"})
        r["Zone"] = r["Zone"].astype(str)
        return r[["Date", "Week", "SKU", "Zone", "Lines", "Units"]], "Zone", "Week", {"Lines": "int", "Units": "int"}, \
            [("Units per line", "Units", "Lines", "num1")]
    if name == "production":
        r = d["runs"].copy()
        r["scrap"] = r["units"] - r["good_units"]
        r["week"] = r["date"] - pd.to_timedelta(r["date"].dt.weekday, unit="D")
        r = r.rename(columns={"date": "Date", "week": "Week", "line": "Line", "planned_min": "Planned min", "downtime_min": "Downtime min",
                              "units": "Units", "good_units": "Good units", "scrap": "Scrap units", "scheduled_units": "Scheduled units"})
        r["Line"] = r["Line"].astype(str)
        return r[["Date", "Week", "Line", "Planned min", "Downtime min", "Units", "Good units", "Scrap units", "Scheduled units"]], "Line", "Week", \
            {"Units": "int", "Good units": "int", "Scrap units": "int", "Downtime min": "int"}, \
            [("Scrap %", "Scrap units", "Units", "pct"), ("Availability", "Downtime min", "Planned min", "pct_inv"), ("Adherence", "Good units", "Scheduled units", "pct")]
    raise KeyError(name)


def _fmt_for(col: str, s: pd.Series) -> str:
    c = col.lower()
    if not pd.api.types.is_numeric_dtype(s):
        return "text"
    if "pct" in c or "%" in c or "oee" in c or c in ("availability", "performance", "quality"):
        return "pctv"
    if any(k in c for k in ("value", "revenue", "cost", "contribution", "amount", "current", "1-30", "31-60", "60+", "total", "asp", "order")):
        return "money"
    return "num1"


def pack_spec(name: str, res: dict, synthetic: bool = True) -> dict:
    class _C:  # minimal ctx for spec.new
        asof = pd.Timestamp.today().normalize()
        store, version = "Industry pack (demo data)" if synthetic else "Industry pack", ""
    ctx = _C()
    ctx.synthetic = synthetic
    sp = S.new(ctx, f"pack-{name}", "pack", TITLES[name], "Demo data" if synthetic else "Business data", "All")
    kp = {k: v for r in res["results"].values() for k, v in r.kpis.items()}
    for k, v in list(kp.items())[:6]:
        sp["kpis"].append({"label": k, "value": str(v), "fmt": "text", "sub": "", "tone": "neutral"})
    f = res["findings"]
    p1 = [x for x in f if x.priority == "P1"]
    sp["headline"] = f"{len(f)} findings, {len(p1)} for today. Largest: {f[0].action}." if f else "No findings."
    if f:
        fd = pd.DataFrame([x.as_action() for x in f])
        sp["sections"].append(S.section("Actions", "Ranked by urgency and $ impact.",
            S.table(fd, [("priority", "P", "text"), ("area", "Area", "text"), ("action", "Action", "text"), ("why", "Why", "text"),
                         ("weekly_impact_nzd", "$/week", "money"), ("owner", "Owner", "text")], max_rows=15)))
    for key, r in res["results"].items():
        t = r.table.reset_index() if r.table.index.name else r.table.copy()
        t = t.loc[:, ~t.columns.duplicated()]
        cols = [(c, c.replace("_", " ").capitalize(), _fmt_for(c, t[c])) for c in t.columns[:9]]
        blocks = []
        num = [c for c in t.columns if pd.api.types.is_numeric_dtype(t[c])]
        lab = [c for c in t.columns if not pd.api.types.is_numeric_dtype(t[c])]
        if 2 <= len(t) <= 16 and num and lab:
            blocks.append(S.chart("hbar", r.title, t[lab[0]].astype(str), [{"name": num[-1].replace("_", " "), "values": t[num[-1]].tolist()}],
                                  fmt="money" if _fmt_for(num[-1], t[num[-1]]) == "money" else "num1"))
        blocks.append(S.table(t, cols, max_rows=15, note=r.note))
        sp["sections"].append(S.section(r.title, " · ".join(f"{k}: {v}" for k, v in r.kpis.items()), *blocks))
    sp["approvals"] = [x.action for x in f if x.priority == "P1"][:5]
    return sp


def pack_workbook(name: str, d: dict, res: dict) -> WorkbookPlan:
    raw, dim, date, meas, ratios = _raw(name, d)
    keys = sorted(raw[dim].astype(str).unique())
    cols = [Col(m, f"SUMIFS({{R:{m}}},{{R:{dim}}},{{key}})", "money" if f == "money" else ("int" if f == "int" else "num1")) for m, f in meas.items()]
    week_cols = [Col(m, f"SUMIFS({{R:{m}}},{{R:{dim}}},{{SEL}},{{R:{date}}},{{key}})", "money" if f == "money" else ("int" if f == "int" else "num1"))
                 for m, f in meas.items()]
    for lab, num, den, f in ratios:
        num_f, den_f = f"SUMIFS({{R:{num}}},{{R:{dim}}},{{key}})", f"SUMIFS({{R:{den}}},{{R:{dim}}},{{key}})"
        if f == "pct_inv":
            cols.append(Col(lab, f"IFERROR(1-{num_f}/{den_f},0)", "pct", total=None))
        else:
            cols.append(Col(lab, f"IFERROR({num_f}/{den_f},0)", "pct" if f == "pct" else "num1", total=None))
    by_dim = Block(f"By {dim.lower()}", dim, keys, name="dim", cols=cols, conditional=[(list(meas)[-1], "bars")])
    weeks = sorted(raw[date].unique())
    by_week = Block("By week (follows the selector)", "Week", weeks, key_fmt="date", name="weeks", cols=week_cols)
    kpis = [Kpi(m, f"SUMIFS({{R:{m}}},{{R:{dim}}},{{SEL}})", "money" if f == "money" else "int") for m, f in meas.items()]
    for lab, num, den, f in ratios:
        n_, d_ = f"SUMIFS({{R:{num}}},{{R:{dim}}},{{SEL}})", f"SUMIFS({{R:{den}}},{{R:{dim}}},{{SEL}})"
        kpis.append(Kpi(lab, f"IFERROR(1-{n_}/{d_},0)" if f == "pct_inv" else f"IFERROR({n_}/{d_},0)", "pct" if f.startswith("pct") else "num1"))
    extra = {}
    if res["findings"]:
        fd = pd.DataFrame([x.as_action() for x in res["findings"]])[["priority", "area", "action", "why", "weekly_impact_nzd", "owner"]]
        fd.columns = ["Priority", "Area", "Action", "Why", "Impact $/week", "Owner"]
        extra["Actions"] = fd
    for key, r in res["results"].items():
        t = r.table.reset_index() if r.table.index.name else r.table.copy()
        extra[r.title[:31].replace("/", "-").replace("(", "").replace(")", "").replace(",", "").replace("%", "pct")] = t.round(3)
    raw_fmts = {c: ("date" if pd.api.types.is_datetime64_any_dtype(raw[c]) else ("money2" if meas.get(c) == "money" or c in ("Cost",) else None)) for c in raw.columns}
    return WorkbookPlan(
        title=TITLES[name], subtitle="Demo data · industry pack", raw=raw, raw_formats={k: v for k, v in raw_fmts.items() if v},
        categories=keys, category_label=dim, blocks=[by_dim, by_week], kpis=kpis[:8],
        charts=[ChartSpec(f"{list(meas)[-1]} by {dim.lower()}", "dim", [list(meas)[-1]]), ChartSpec(f"Weekly {list(meas)[0].lower()}", "weeks", [list(meas)[0]], "line")],
        pivots=[PivotSpec(f"{list(meas)[-1]} by {dim.lower()} and week", dim, list(meas)[-1], cols=None, caption=list(meas)[-1]),
                PivotSpec(f"{list(meas)[0]} by week", date, list(meas)[0], caption=list(meas)[0])],
        extra_sheets=extra,
        notes=[("About this workbook", ["Industry pack demo. Replace Raw with your own export (same column names) and the Model, KPIs and pivots follow.",
                                        "Analysis sheets hold Shelly's skill results; Actions lists findings for your confirmation."])],
        dictionary={c: "" for c in raw.columns}, signoff=["Findings reviewed"])
