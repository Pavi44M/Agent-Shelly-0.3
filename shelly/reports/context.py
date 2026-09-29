"""Shared data for every report: monthly / weekly history, the planning forecast, and helpers.

Planning forecast (months and weeks ahead)
------------------------------------------
The daily models in forecasting.py look 7 days ahead. Budgets and quarter plans need 3-13 weeks or
3-12 months, so reports use a seasonal-trend method that is simple enough to explain in a meeting:

    forecast(period) = same period last year  x  recent trend

    recent trend = sales of the last 12 weeks / same 12 weeks last year   (per category, capped +/-15%)

It is backtested the same way before it is trusted: the method is re-run as if we were standing 3 months
(or 13 weeks) earlier and compared with what actually happened. The error becomes the forecast range.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..calendar_nz import NZ_HOLIDAYS

TREND_CAP = 0.15


@dataclass
class Ctx:
    P: object
    R: dict
    cfg: dict
    acts: list
    summary: str = ""
    version: str = ""
    store: str = ""
    synthetic: bool = True
    cache: dict = field(default_factory=dict)

    @property
    def asof(self) -> pd.Timestamp:
        return self.P.asof

    @property
    def categories(self) -> list:
        return sorted(self.P.daily_cat["category"].unique().tolist())

    @property
    def growth(self) -> float:
        return self.cfg["budget"]["growth_vs_last_year_pct"] / 100


def _trend(daily: pd.DataFrame, end: pd.Timestamp, days: int = 84) -> pd.Series:
    """Per-category ratio of the last `days` to the same days a year (364 days) earlier."""
    cur = daily[(daily["date"] > end - pd.Timedelta(days=days)) & (daily["date"] <= end)]
    ly = daily[(daily["date"] > end - pd.Timedelta(days=days + 364)) & (daily["date"] <= end - pd.Timedelta(days=364))]
    r = cur.groupby("category")["net_sales"].sum() / ly.groupby("category")["net_sales"].sum()
    return (r - 1).clip(-TREND_CAP, TREND_CAP).fillna(0)


def daily_cat_full(ctx: Ctx) -> pd.DataFrame:
    """date x category with sales, units, cost, gross margin (from clean line-level sales)."""
    if "dcf" not in ctx.cache:
        s = ctx.P.sales
        d = s.groupby(["date", "category"]).agg(net_sales=("net_sales", "sum"), units=("units", "sum"),
                                                 cost=("cost", "sum")).reset_index()
        d["gm"] = d["net_sales"] - d["cost"]
        ctx.cache["dcf"] = d
    return ctx.cache["dcf"]


def month_start(ts) -> pd.Timestamp:
    return pd.Timestamp(ts).to_period("M").to_timestamp()


def complete_months(ctx: Ctx) -> pd.DataFrame:
    """Monthly history by category, only whole months (the current part-month is left out)."""
    d = daily_cat_full(ctx).copy()
    d["month"] = d["date"].dt.to_period("M").dt.to_timestamp()
    last_full = month_start(ctx.asof) - pd.Timedelta(days=1) if ctx.asof != ctx.asof + pd.offsets.MonthEnd(0) else ctx.asof
    d = d[d["date"] <= last_full]
    m = d.groupby(["month", "category"])[["net_sales", "units", "cost", "gm"]].sum().reset_index()
    first_full = d["date"].min()
    if first_full.day != 1:
        m = m[m["month"] > month_start(first_full)]
    return m


def plan_months(ctx: Ctx, months: int = 12) -> tuple[pd.DataFrame, dict]:
    """Monthly plan by category for the next `months` whole months: LY, budget, forecast, range."""
    key = f"pm{months}"
    if key in ctx.cache:
        return ctx.cache[key]
    d = daily_cat_full(ctx)
    hist = complete_months(ctx)
    # plans start with the next whole month; the current month is reported as an outlook (actual MTD + forecast)
    cur_m = month_start(ctx.asof)
    month_done = ctx.asof >= cur_m + pd.offsets.MonthEnd(0)
    future = pd.date_range(cur_m + pd.offsets.MonthBegin(1), periods=months, freq="MS")
    if not month_done:
        future = future.insert(0, cur_m)
    trend = _trend(d, ctx.asof)
    rows = []
    for m in future:
        ly_m = m - pd.DateOffset(years=1)
        ly = d[(d["date"] >= ly_m) & (d["date"] < ly_m + pd.offsets.MonthBegin(1))].groupby("category")[["net_sales", "gm", "units"]].sum()
        mtd = d[(d["date"] >= m) & (d["date"] <= ctx.asof)].groupby("category")["net_sales"].sum()
        days_in = (m + pd.offsets.MonthEnd(0)).day
        days_done = max(0, min(days_in, (ctx.asof - m).days + 1)) if ctx.asof >= m else 0
        hol = int(((NZ_HOLIDAYS >= m) & (NZ_HOLIDAYS < m + pd.offsets.MonthBegin(1))).sum())
        hol_ly = int(((NZ_HOLIDAYS >= ly_m) & (NZ_HOLIDAYS < ly_m + pd.offsets.MonthBegin(1))).sum())
        for c in ctx.categories:
            lys = float(ly["net_sales"].get(c, 0)) if c in ly.index else 0.0
            lyg = float(ly["gm"].get(c, 0)) if c in ly.index else 0.0
            f = lys * (1 + float(trend.get(c, 0)))
            if days_done:           # blend: actual month-to-date + forecast for the remaining days
                done = float(mtd.get(c, 0))
                f = done + f * (days_in - days_done) / days_in
            rows.append({"month": m, "category": c, "outlook": bool(days_done), "ly_sales": lys, "ly_gm": lyg,
                         "forecast": f, "trend_pct": float(trend.get(c, 0)) * 100,
                         "mtd_actual": float(mtd.get(c, 0)) if days_done else 0.0, "days_done": days_done,
                         "holidays": hol, "holidays_ly": hol_ly})
    plan = pd.DataFrame(rows)
    plan["ly_estimated"] = False
    if not month_done:
        # "last year" for the month one year after the current one is the current month, which isn't finished:
        # complete it with the outlook (actual month-to-date + forecast for the remaining days)
        hist = complete_months(ctx)
        h12 = hist[hist["month"] > hist["month"].max() - pd.DateOffset(months=12)].groupby("category")[["gm", "net_sales"]].sum()
        gm_ratio = (h12["gm"] / h12["net_sales"]).to_dict()
        outlook = plan[plan["month"] == cur_m].set_index("category")["forecast"]
        nxt = plan["month"] == cur_m + pd.DateOffset(years=1)
        plan.loc[nxt, "ly_sales"] = plan.loc[nxt, "category"].map(outlook).values
        plan.loc[nxt, "ly_gm"] = plan.loc[nxt, "ly_sales"] * plan.loc[nxt, "category"].map(gm_ratio).fillna(0.35)
        plan.loc[nxt, "ly_estimated"] = True
        plan.loc[nxt, "forecast"] = plan.loc[nxt, "ly_sales"] * (1 + plan.loc[nxt, "trend_pct"] / 100)
    bt = _backtest_months(ctx, d)
    plan["low"] = plan["forecast"] * (1 - bt["p80_abs_err"])
    plan["high"] = plan["forecast"] * (1 + bt["p80_abs_err"])
    ctx.cache[key] = (plan, {"trend": trend, "backtest": bt, "hist": hist})
    return ctx.cache[key]


def _backtest_months(ctx: Ctx, d: pd.DataFrame) -> dict:
    """Stand 1-3 months back, forecast the following months with the same method, measure the error."""
    errs = []
    cm = month_start(ctx.asof)
    for back in (3, 4, 5, 6):
        origin_m = cm - pd.DateOffset(months=back)
        origin = origin_m - pd.Timedelta(days=1)
        if origin - pd.Timedelta(days=84 + 364) < d["date"].min():
            continue
        tr = _trend(d, origin)
        for ahead in range(0, 3):
            m = origin_m + pd.DateOffset(months=ahead)
            if m + pd.offsets.MonthEnd(0) > ctx.asof:
                continue
            ly_m = m - pd.DateOffset(years=1)
            act = d[(d["date"] >= m) & (d["date"] < m + pd.offsets.MonthBegin(1))].groupby("category")["net_sales"].sum()
            ly = d[(d["date"] >= ly_m) & (d["date"] < ly_m + pd.offsets.MonthBegin(1))].groupby("category")["net_sales"].sum()
            pred = ly * (1 + tr.reindex(ly.index).fillna(0))
            tot_err = abs(pred.sum() - act.sum()) / act.sum()
            cat_err = (abs(pred - act) / act).replace([np.inf], np.nan).dropna()
            errs.append({"origin": origin_m, "month": m, "store_err": tot_err, "cat_err": float(cat_err.median())})
    e = pd.DataFrame(errs)
    if not len(e):
        return {"mape_store": np.nan, "mape_cat": np.nan, "p80_abs_err": 0.08, "n": 0, "detail": e}
    return {"mape_store": float(e["store_err"].mean()), "mape_cat": float(e["cat_err"].mean()),
            "p80_abs_err": float(max(0.03, np.quantile(e["cat_err"], 0.8))), "n": len(e), "detail": e}


def plan_weeks(ctx: Ctx, weeks: int = 13) -> tuple[pd.DataFrame, dict]:
    """Weekly forecast by category for the next `weeks` (weeks start the day after as-of)."""
    key = f"pw{weeks}"
    if key in ctx.cache:
        return ctx.cache[key]
    d = daily_cat_full(ctx)
    trend = _trend(d, ctx.asof)
    start = ctx.asof + pd.Timedelta(days=1)
    rows = []
    for w in range(weeks):
        ws = start + pd.Timedelta(days=7 * w)
        we = ws + pd.Timedelta(days=6)
        lyws, lywe = ws - pd.Timedelta(days=364), we - pd.Timedelta(days=364)
        ly = d[(d["date"] >= lyws) & (d["date"] <= lywe)].groupby("category")["net_sales"].sum()
        hol = int(((NZ_HOLIDAYS >= ws) & (NZ_HOLIDAYS <= we)).sum())
        for c in ctx.categories:
            lys = float(ly.get(c, 0))
            rows.append({"week_start": ws, "week": w + 1, "category": c, "ly_sales": lys,
                         "forecast": lys * (1 + float(trend.get(c, 0))), "holidays": hol})
    plan = pd.DataFrame(rows)
    # short-term signal: the daily models' 7-day forecast (best model per category) sets week 1, and the
    # difference to the seasonal-trend view fades out over weeks 2-3 (weights 1, 0.5, 0.25, then 0)
    fc7 = ctx.R["forecast"]["forecast"].groupby("category")["forecast_sales"].sum()
    w1 = plan[plan["week"] == 1].set_index("category")["forecast"]
    ratio = (fc7 / w1).replace([np.inf, -np.inf], np.nan).fillna(1).clip(0.7, 1.3)
    weight = {1: 1.0, 2: 0.5, 3: 0.25}
    plan["trend_only"] = plan["forecast"]
    plan["forecast"] = [f * float(ratio.get(c, 1)) ** weight.get(w, 0) for f, c, w in zip(plan["forecast"], plan["category"], plan["week"])]
    bt = _backtest_weeks(ctx, d)
    plan["low"] = plan["forecast"] * (1 - bt["p80_abs_err"])
    plan["high"] = plan["forecast"] * (1 + bt["p80_abs_err"])
    ctx.cache[key] = (plan, {"trend": trend, "backtest": bt, "model_week1": fc7})
    return ctx.cache[key]


def _backtest_weeks(ctx: Ctx, d: pd.DataFrame) -> dict:
    errs = []
    for back in range(13, 0, -1):
        origin = ctx.asof - pd.Timedelta(days=7 * back)
        tr = _trend(d, origin)
        ws, we = origin + pd.Timedelta(days=1), origin + pd.Timedelta(days=7)
        act = d[(d["date"] >= ws) & (d["date"] <= we)].groupby("category")["net_sales"].sum()
        ly = d[(d["date"] >= ws - pd.Timedelta(days=364)) & (d["date"] <= we - pd.Timedelta(days=364))].groupby("category")["net_sales"].sum()
        pred = ly * (1 + tr.reindex(ly.index).fillna(0))
        e = (abs(pred - act) / act).replace([np.inf], np.nan).dropna()
        errs.append({"week_start": ws, "store_err": abs(pred.sum() - act.sum()) / act.sum(), "cat_err": float(e.median())})
    e = pd.DataFrame(errs)
    return {"mape_store": float(e["store_err"].mean()), "mape_cat": float(e["cat_err"].mean()),
            "p80_abs_err": float(max(0.03, np.quantile(e["cat_err"], 0.8))), "n": len(e), "detail": e}


def weekly_actuals(ctx: Ctx, weeks: int = 52) -> pd.DataFrame:
    """Actual sales by week (weeks ending on the as-of weekday) and category."""
    d = daily_cat_full(ctx)
    start = ctx.asof - pd.Timedelta(days=7 * weeks - 1)
    x = d[d["date"] >= start].copy()
    x["week_start"] = start + ((x["date"] - start).dt.days // 7) * pd.Timedelta(days=7)
    return x.groupby(["week_start", "category"])[["net_sales", "units", "cost", "gm"]].sum().reset_index()


def money(v: float, dp: int = 0) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "–"
    s = f"${abs(v):,.{dp}f}"
    return f"−{s}" if v < 0 else s


def pct(v: float, dp: int = 1, sign: bool = True) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "–"
    return (f"{v:+.{dp}f}%" if sign else f"{v:.{dp}f}%").replace("-", "−")
