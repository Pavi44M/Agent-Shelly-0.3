"""Live POS feed for the Store Floor.

    python -m shelly live path/to/pos_export.csv            one update
    python -m shelly live path/to/exports/ --watch 60       newest file in the folder, every 60 s

Reads a till export with a time on every line (column such as datetime / timestamp / time, or date + time),
keeps the latest trading day, and writes docs/data/live.json:
    {"asof": "10:42", "date": "2026-10-03", "sales_today": 1234.5, "by_hour": [{"h": 6, "sales": 88.2, "baskets": 7}, ...]}
Baskets are counted from a receipt / transaction id when the export has one, otherwise estimated at $14.50 a basket.
Open the floor with ?live=1 (python -m http.server inside docs/, then http://localhost:8000/store/?live=1).
docs/data/live.json is git-ignored: real trading data never goes to the public site.
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/data/live.json"
TIME_COLS = ("datetime", "timestamp", "date_time", "transaction_time", "sale_time", "time")
SALES_COLS = ("net_sales", "sales", "amount", "total", "line_total", "value")
RECEIPT_COLS = ("receipt", "receipt_id", "receipt_no", "transaction", "transaction_id", "txn", "basket_id", "docket")
BASKET = 14.5


def _pick(cols, names):
    low = {c.lower().strip(): c for c in cols}
    return next((low[n] for n in names if n in low), None)


def newest(path: Path) -> Path:
    if path.is_file():
        return path
    files = [p for p in path.iterdir() if p.suffix.lower() in (".csv", ".xlsx", ".xls")]
    if not files:
        raise FileNotFoundError(f"no CSV or Excel export in {path}")
    return max(files, key=lambda p: p.stat().st_mtime)


def build(src: Path) -> dict:
    f = newest(Path(src))
    df = pd.read_excel(f) if f.suffix.lower() in (".xlsx", ".xls") else pd.read_csv(f)
    tcol = _pick(df.columns, TIME_COLS)
    if tcol is None and _pick(df.columns, ("date",)) and _pick(df.columns, ("time",)):
        ts = pd.to_datetime(df[_pick(df.columns, ("date",))].astype(str) + " " + df[_pick(df.columns, ("time",))].astype(str), errors="coerce")
    elif tcol is not None:
        ts = pd.to_datetime(df[tcol], errors="coerce")
    else:
        raise ValueError(f"{f.name}: no time column (expected one of {', '.join(TIME_COLS)} or date + time)")
    scol = _pick(df.columns, SALES_COLS)
    if scol is None:
        raise ValueError(f"{f.name}: no sales column (expected one of {', '.join(SALES_COLS)})")
    df = df.assign(_ts=ts, _s=pd.to_numeric(df[scol], errors="coerce")).dropna(subset=["_ts", "_s"])
    if df.empty:
        raise ValueError(f"{f.name}: no rows with a readable time and sales value")
    day = df["_ts"].dt.date.max()
    d = df[df["_ts"].dt.date == day]
    rcol = _pick(d.columns, RECEIPT_COLS)
    by = []
    for h, g in d.groupby(d["_ts"].dt.hour):
        sales = float(g["_s"].sum())
        baskets = int(g[rcol].nunique()) if rcol else round(sales / BASKET)
        by.append({"h": int(h), "sales": round(sales, 2), "baskets": baskets})
    last = d["_ts"].max()
    return {"asof": last.strftime("%H:%M"), "date": str(day), "sales_today": round(float(d["_s"].sum()), 2), "by_hour": by,
            "source": f.name, "baskets_from": "receipts" if rcol else "estimate", "written": datetime.now().isoformat(timespec="seconds")}


def run(src: str, out: Path = OUT, watch: int = 0) -> dict:
    while True:
        data = build(Path(src))
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, indent=1))
        print(f"live: {data['date']} to {data['asof']} · ${data['sales_today']:,.0f} · {len(data['by_hour'])} hours -> {out}")
        if not watch:
            return data
        time.sleep(max(15, watch))
