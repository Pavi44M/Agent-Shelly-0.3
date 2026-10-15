"""Shelly quality (v2.5.4): proof that the numbers can be trusted.

  Forecast league table   every forecasting model's error, which one runs the store and why, by category too
  Anomaly radar           unusual trading days against a same-weekday baseline, with the likely reason and how sure
  Data checks             what was checked in the raw data before any model ran
  Build health            how many automated tests and page checks guard every release
Synthetic data only.
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import pandas as pd

from .calendar_nz import NZ_HOLIDAYS

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "data/sample"


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def league() -> dict:
    S = _js("docs/data/shelly-data.js"); out = {"overall": sorted(S["models"], key=lambda m: m["wape"]), "by_category": S["best_models"]}
    sh = ROOT / "docs/data/shift.js"
    if sh.exists():
        m = _js("docs/data/shift.js")["model"]
        out["daily_exam"] = {"wape_14d": m["exam14"]["wape"], "in_charge": m.get("live"), "wape_8w": m["exam56"].get("wape"), "why": m["why"]}
    best = out["overall"][0]; nxt = out["overall"][1]
    out["finding"] = (f"{best['model']} leads on weekly sales at {best['wape']}% WAPE, only {round(nxt['wape'] - best['wape'], 1)} points ahead of {nxt['model']}; "
                      f"every model beats the naive forecast ({next(x['wape'] for x in out['overall'] if x['model'] == 'Naive')}%).")
    return out


def anomalies(days: int = 120) -> dict:
    s = pd.read_csv(SAMPLE / "sales.csv", parse_dates=["date"])
    d = s.groupby("date").agg(sales=("net_sales", "sum"), promos=("promo_flag", "sum")).asfreq("D", fill_value=0)
    d["wd"] = d.index.weekday
    base = d.groupby("wd").sales.transform(lambda x: x.shift(1).rolling(4, min_periods=3).mean())
    sd = d.groupby("wd").sales.transform(lambda x: x.shift(1).rolling(8, min_periods=4).std())
    d["base"], d["z"] = base, (d.sales - base) / sd
    d = d.iloc[-days:]
    hol = set(pd.DatetimeIndex(NZ_HOLIDAYS).normalize())
    pm = d.promos.median()
    out = []
    for dt, r in d.iterrows():
        if pd.isna(r.z) or abs(r.z) < 2.2:
            continue
        why, sure = [], "medium"
        if dt.normalize() in hol: why.append("public holiday"); sure = "high"
        if (dt + pd.Timedelta(days=1)).normalize() in hol: why.append("day before a public holiday")
        if r.promos > pm * 1.8 and r.sales > r.base: why.append(f"{int(r.promos)} lines on promo (usual {int(pm)})")
        if r.sales < r.base and dt.weekday() >= 5: why.append("a quiet weekend: check the weather and local events")
        if not why: why.append("no known cause: check the till and stock records"); sure = "low"
        out.append({"date": dt.strftime("%Y-%m-%d"), "dow": dt.strftime("%a"), "sales": round(r.sales), "expected": round(r.base), "diff_pct": round((r.sales / r.base - 1) * 100, 1),
                    "z": round(float(r.z), 1), "why": "; ".join(why), "sure": sure})
    series = [{"date": i.strftime("%Y-%m-%d"), "sales": round(r.sales), "expected": None if pd.isna(r.base) else round(r.base)} for i, r in d.iterrows()]
    return {"days": days, "threshold_z": 2.2, "flags": sorted(out, key=lambda x: -abs(x["z"])), "series": series}


def data_checks() -> list:
    s = pd.read_csv(SAMPLE / "sales.csv", parse_dates=["date"]); p = pd.read_csv(SAMPLE / "products.csv")
    dup = int(s.duplicated(["date", "sku", "channel"]).sum())
    full = len(p) * ((s.date.max() - s.date.min()).days + 1)
    present = s[s.channel == "in_store"].groupby(["sku", "date"]).size().shape[0]
    neg = int((s.units < 0).sum()); zero_price = int(((s.units > 0) & (s.net_sales <= 0)).sum())
    unknown = int((~s.sku.isin(p.sku)).sum())
    pr = s[s.units > 0].assign(price=lambda x: x.net_sales / x.units).merge(p[["sku", "unit_price"]], on="sku")
    off = int(((pr.price - pr.unit_price).abs() / pr.unit_price > .35).sum())
    gtin = int((~p.gtin.astype(str).str.fullmatch(r"\d{13}")).sum())
    return [
        {"check": "Rows repeated for the same day, line and channel", "found": dup, "action": "summed before the promo model" if dup else "none needed"},
        {"check": "Line-days with no in-store row (no sales that day)", "found": full - present, "action": "filled with zero in the promo model, so a quiet day isn't a gap"},
        {"check": "Negative units", "found": neg, "action": "kept and read as returns" if neg else "none needed"},
        {"check": "Units sold with zero or negative takings", "found": zero_price, "action": "flagged for the till audit" if zero_price else "none needed"},
        {"check": "Sales for lines missing from the product list", "found": unknown, "action": "held out until mapped" if unknown else "none needed"},
        {"check": "Selling price more than 35% away from the list price", "found": off, "action": "checked against promo flags" if off else "none needed"},
        {"check": "Barcodes (GTIN) that aren't 13 digits", "found": gtin, "action": "flagged: fix in the product list" if gtin else "none needed"},
    ]


def build_health() -> dict:
    tests = 0; files = sorted((ROOT / "tests").glob("test_*.py"))
    for f in files:
        tree = ast.parse(f.read_text(encoding="utf-8"))
        tests += sum(1 for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name.startswith("test_"))
    pages = re.search(r"PAGES = \[(.*?)\]", (ROOT / "tests/test_pages_render.py").read_text(encoding="utf-8"), re.S)
    n_pages = len(re.findall(r'"[^"]*"', pages.group(1))) if pages else 0
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    releases = re.findall(r"^## What's new in (v[\d.]+)", readme, re.M)
    return {"test_functions": tests, "test_files": len(files), "pages_rendered": n_pages, "widths": ["desktop", "phone"], "releases": releases[:8],
            "ci": "every push runs the tests on GitHub Actions; every Monday the demo data is refreshed and the whole site rebuilt"}


def run() -> dict:
    return {"league": league(), "anomalies": anomalies(), "data_checks": data_checks(), "build": build_health()}
