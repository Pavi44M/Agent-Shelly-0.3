"""Report spec: a plain JSON document the Shelly report page renders (screen, print/PDF, presentation).

Numbers stay numbers (with a format key) so the page can format them and charts can use them.
"""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd


def clean(v):
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return None if np.isnan(v) else round(float(v), 4)
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x) for x in v]
    return v


def new(ctx, rid: str, rtype: str, title: str, subtitle: str, category: str = "All", horizon=None, unit: str = "") -> dict:
    return {"id": rid, "type": rtype, "title": title, "subtitle": subtitle, "category": category, "horizon": horizon,
            "unit": unit, "asof": ctx.asof.strftime("%Y-%m-%d"), "asof_label": ctx.asof.strftime("%A %d %B %Y"),
            "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "store": ctx.store, "version": ctx.version,
            "synthetic": ctx.synthetic, "headline": "", "kpis": [], "sections": [], "assumptions": [], "risks": [],
            "approvals": [], "method": [], "data_notes": [], "excel": None}


def kpi(label, value, fmt="money", sub="", tone="neutral"):
    return {"label": label, "value": clean(value), "fmt": fmt, "sub": sub, "tone": tone}


def section(title, lead="", *blocks, sid=None):
    return {"id": sid or title.lower().replace(" ", "-")[:40], "title": title, "lead": lead, "blocks": list(blocks)}


def text(t):
    return {"type": "text", "text": t}


def bullets(items):
    return {"type": "bullets", "items": list(items)}


def callout(title, t, tone="info"):
    return {"type": "callout", "title": title, "text": t, "tone": tone}


def table(df: pd.DataFrame, columns: list, total: dict | None = None, note: str = "", max_rows: int | None = None):
    """columns: list of (key, label, fmt[, align]). fmt: money|int|pct|pctpt|num1|date|month|text"""
    cols = [{"key": c[0], "label": c[1], "fmt": c[2], "align": c[3] if len(c) > 3 else ("left" if c[2] in ("text", "date", "month") else "right")}
            for c in columns]
    rows = df[[c[0] for c in columns]].to_dict("records")
    if max_rows:
        rows = rows[:max_rows]
    return {"type": "table", "columns": cols, "rows": clean(rows), "total": clean(total) if total else None, "note": note}


def chart(kind, title, x, series, fmt="money", note="", height=220):
    """kind: bar | line | band (line + low/high range) | hbar | stacked | combo"""
    return {"type": "chart", "kind": kind, "title": title, "x": clean(list(x)), "series": clean(series), "fmt": fmt,
            "note": note, "height": height}
