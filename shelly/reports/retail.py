"""Retail report builders: each returns report specs (per category / horizon) and one Excel plan."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import spec as S
from .context import (Ctx, complete_months, daily_cat_full, money, pct, plan_months, plan_weeks, weekly_actuals)
from .excel import Block, ChartSpec, Col, Kpi, PivotSpec, WorkbookPlan

OWNERS = {"Food To Go": "Store Manager", "Bakery": "Store Manager", "Dairy": "Duty Manager", "Produce": "Duty Manager",
          "Beer & Wine": "Licence Manager", "Frozen": "Duty Manager", "Grocery": "Duty Manager", "Beverages": "Duty Manager",
          "Snacks & Confectionery": "Duty Manager", "Health & Beauty": "Store Manager", "Household": "Duty Manager"}


def _sel(df, cat, col="category"):
    return df if cat in (None, "All") else df[df[col] == cat]


def _scope(cat):
    return "the whole store" if cat in (None, "All") else cat


def _targets_lookup(ctx: Ctx) -> pd.DataFrame:
    m = complete_months(ctx)
    last12 = m[m["month"] > m["month"].max() - pd.DateOffset(months=12)].groupby("category")[["net_sales", "gm"]].sum()
    t = pd.DataFrame({"category": ctx.categories})
    t["gm_target_pct"] = [round(float(last12.loc[c, "gm"] / last12.loc[c, "net_sales"]), 3) if c in last12.index else 0.35
                          for c in t["category"]]
    t["owner"] = t["category"].map(OWNERS).fillna("Duty Manager")
    t["short_life"] = t["category"].isin(["Food To Go", "Bakery", "Dairy", "Produce"]).map({True: "Yes", False: "No"})
    return t


def _common_notes(ctx: Ctx, extra: list) -> list:
    return [("About this workbook", [f"Store: {ctx.store}.  Data to {ctx.asof:%d %b %Y}.  Shelly v{ctx.version}.",
                                     "Synthetic demo data." if ctx.synthetic else "Built from the business's own exports.",
                                     "Change the blue Category cell on the Dashboard, or any blue input on Assumptions: every formula follows."]),
            ("Method", extra)]


# =====================================================================================  BUDGET
def budget_specs(ctx: Ctx, cat: str = "All", months: int = 3) -> dict:
    plan, meta = plan_months(ctx, 12)
    g = ctx.growth
    fut = plan[~plan["outlook"]]
    months_list = sorted(fut["month"].unique())[:months]
    p = _sel(fut[fut["month"].isin(months_list)], cat)
    by_m = p.groupby("month").agg(ly=("ly_sales", "sum"), ly_gm=("ly_gm", "sum"), fc=("forecast", "sum"),
                                  lo=("low", "sum"), hi=("high", "sum"), hol=("holidays", "max"), hol_ly=("holidays_ly", "max")).reset_index()
    by_m["budget"] = by_m["ly"] * (1 + g)
    by_m["gap"] = by_m["fc"] - by_m["budget"]
    by_m["gap_pct"] = by_m["gap"] / by_m["budget"] * 100
    by_m["budget_gm"] = by_m["budget"] * by_m["ly_gm"] / by_m["ly"]
    by_m["label"] = by_m["month"].dt.strftime("%b %Y")
    by_c = p.groupby("category").agg(ly=("ly_sales", "sum"), ly_gm=("ly_gm", "sum"), fc=("forecast", "sum"),
                                     trend=("trend_pct", "mean")).reset_index()
    by_c["budget"] = by_c["ly"] * (1 + g)
    by_c["gap"] = by_c["fc"] - by_c["budget"]
    by_c["gap_pct"] = by_c["gap"] / by_c["budget"] * 100
    by_c["gm_pct"] = by_c["ly_gm"] / by_c["ly"] * 100
    by_c["owner"] = by_c["category"].map(OWNERS).fillna("Duty Manager")
    by_c = by_c.sort_values("gap")
    tb, tf = by_m["budget"].sum(), by_m["fc"].sum()
    tgap, tly = tf - tb, by_m["ly"].sum()
    gm_pct = by_m["budget_gm"].sum() / tb * 100 if tb else 0
    bt = meta["backtest"]
    span = f"{months_list[0]:%b %Y} to {months_list[-1]:%b %Y}" if months > 1 else f"{months_list[0]:%B %Y}"
    sp = S.new(ctx, f"budget-{months}m-{cat}", "budget", f"{months}-month budget" + ("" if cat == "All" else f" · {cat}"),
               f"{span} · {_scope(cat)} · budget = last year +{g * 100:.0f}%, checked against Shelly's forecast", cat, months, "months")
    tone = "good" if tgap >= 0 else "bad"
    sp["headline"] = (f"Budget {money(tb)} for {span}; Shelly forecasts {money(tf)}, "
                      f"{'ahead of' if tgap >= 0 else 'short of'} budget by {money(abs(tgap))} ({pct(tgap / tb * 100)}).")
    sp["kpis"] = [S.kpi("Budget", tb, sub=f"LY {money(tly)} +{g * 100:.0f}%"),
                  S.kpi("Forecast", tf, sub=f"range {money(by_m['lo'].sum())} – {money(by_m['hi'].sum())}"),
                  S.kpi("Gap to budget", tgap, sub=pct(tgap / tb * 100), tone=tone),
                  S.kpi("Budget GM %", gm_pct, "pctv", sub="at last year's mix"),
                  S.kpi("Forecast accuracy", (1 - bt["mape_store"]) * 100, "pctv", sub=f"store level, {bt['n']} backtests")]
    at_risk = by_c[by_c["gap_pct"] < -1.5]
    ahead = by_c[by_c["gap_pct"] > 1.5].sort_values("gap", ascending=False)
    sp["sections"].append(S.section("Summary", "",
        S.bullets([f"The budget for {span} is **{money(tb)}**: last year's same months ({money(tly)}) plus the {g * 100:.0f}% growth target.",
                   f"On current trends Shelly expects **{money(tf)}** ({pct((tf / tly - 1) * 100)} on last year), "
                   f"{'which beats' if tgap >= 0 else 'which misses'} budget by **{money(abs(tgap))}**.",
                   (f"**{len(at_risk)} {'category is' if len(at_risk) == 1 else 'categories are'} tracking below budget**: "
                    + ", ".join(f"{r.category} ({money(r.gap)})" for r in at_risk.head(4).itertuples()) + ".") if len(at_risk)
                   else "No category is tracking materially below budget.",
                   (f"Ahead of budget: " + ", ".join(f"{r.category} (+{money(r.gap)})" for r in ahead.head(3).itertuples()) + ".") if len(ahead) else
                   "No category is materially ahead of budget.",
                   f"Budget gross margin is **{gm_pct:.1f}%** if the category mix matches last year."]),
        S.callout("What needs your decision",
                  f"Confirm the {g * 100:.0f}% growth target" + (f", and agree recovery plans for {', '.join(at_risk['category'].head(3))}" if len(at_risk) else "")
                  + ". Nothing is final until you approve it.", "warn")))
    sp["sections"].append(S.section("Month by month", "Budget is fixed from last year; the forecast moves with the trend.",
        S.chart("combo", "Budget vs forecast by month", by_m["label"],
                [{"name": "Budget", "values": by_m["budget"].tolist(), "kind": "bar"},
                 {"name": "Forecast", "values": by_m["fc"].tolist(), "kind": "bar"},
                 {"name": "Last year", "values": by_m["ly"].tolist(), "kind": "line"}]),
        S.table(by_m, [("label", "Month", "text"), ("ly", "Last year", "money"), ("budget", "Budget", "money"),
                       ("fc", "Forecast", "money"), ("lo", "Low", "money"), ("hi", "High", "money"),
                       ("gap", "Gap", "money"), ("gap_pct", "Gap %", "pct"), ("budget_gm", "Budget GM $", "money")],
                total={"label": "Total", "ly": tly, "budget": tb, "fc": tf, "lo": by_m["lo"].sum(), "hi": by_m["hi"].sum(),
                       "gap": tgap, "gap_pct": tgap / tb * 100, "budget_gm": by_m["budget_gm"].sum()},
                note="Low/High is the range the forecast has landed in 8 times out of 10 in backtests.")))
    if p["ly_estimated"].any():
        mm = p[p["ly_estimated"]]["month"].iloc[0]
        sp["sections"][-1]["blocks"].append(S.callout("Last year still in progress",
            f"{mm:%B %Y}'s 'last year' is {(mm - pd.DateOffset(years=1)):%B %Y}, which isn't finished, so Shelly completes it with "
            "actual month-to-date plus its forecast for the remaining days.", "info"))
    hol = by_m[by_m["hol"] != by_m["hol_ly"]]
    if len(hol):
        sp["sections"][-1]["blocks"].append(S.callout("Calendar shifts", "; ".join(
            f"{r.label}: {r.hol} public holiday(s) vs {r.hol_ly} last year" for r in hol.itertuples())
            + ". Budget is based on last year's calendar, so expect these months to trade differently.", "info"))
    if cat == "All":
        sp["sections"].append(S.section("By category", "Sorted by gap: the ones needing a plan are at the top.",
            S.chart("hbar", "Forecast gap to budget by category", by_c["category"], [{"name": "Gap", "values": by_c["gap"].tolist()}]),
            S.table(by_c, [("category", "Category", "text"), ("ly", "Last year", "money"), ("budget", "Budget", "money"),
                           ("fc", "Forecast", "money"), ("gap", "Gap", "money"), ("gap_pct", "Gap %", "pct"),
                           ("trend", "Trend", "pct"), ("gm_pct", "GM %", "pctv"), ("owner", "Owner", "text")])))
    sp["assumptions"] = [f"Budget = last year's same month × (1 + {g * 100:.0f}%) growth target (config.yaml › budget).",
                         "Forecast = last year's same month × recent trend (last 12 weeks vs same weeks last year, capped at ±15%).",
                         f"Forecast range from {bt['n']} backtests: category error at the 80th percentile is ±{bt['p80_abs_err'] * 100:.1f}%.",
                         "Budget gross margin assumes last year's category mix and margins.",
                         "No new ranging, price changes or store events are included unless added to the Assumptions sheet."]
    sp["risks"] = ([f"{r.category}: forecast {money(r.gap)} ({pct(r.gap_pct)}) below budget; trend {pct(r.trend)}." for r in at_risk.head(5).itertuples()]
                   or ["No category is forecast materially below budget."]) + \
                  ["Trend is measured over 12 weeks; a sudden change (competitor opening, supply issue) will take a few weeks to show."]
    sp["approvals"] = [f"Growth target of {g * 100:.0f}% on last year", "Category budgets (table above)",
                       "Recovery actions for categories below budget"]
    sp["method"] = [f"Backtest: stand 3–6 months back, forecast the following months, compare with actuals. "
                    f"Store-level error {bt['mape_store'] * 100:.1f}%, category median error {bt['mape_cat'] * 100:.1f}%.",
                    "Seasonality comes from last year's same month, so holidays and events repeat automatically; calendar shifts are flagged."]
    return sp


def budget_workbook(ctx: Ctx) -> WorkbookPlan:
    plan, meta = plan_months(ctx, 12)
    hist = complete_months(ctx)
    raw = pd.concat([
        pd.DataFrame({"Month": hist["month"], "Category": hist["category"], "Type": "Actual", "Sales": hist["net_sales"].round(2),
                      "Gross margin": hist["gm"].round(2), "Units": hist["units"], "Low": np.nan, "High": np.nan}),
        pd.DataFrame({"Month": plan["month"], "Category": plan["category"], "Type": np.where(plan["outlook"], "Outlook", "Forecast"),
                      "Sales": plan["forecast"].round(2),
                      "Gross margin": np.where(plan["outlook"], (plan["forecast"] * plan["category"].map(_targets_lookup(ctx).set_index("category")["gm_target_pct"])).round(2), np.nan),
                      "Units": np.nan,
                      "Low": plan["low"].round(2), "High": plan["high"].round(2)}),
    ], ignore_index=True).sort_values(["Month", "Category"])
    fut = sorted(plan[~plan["outlook"]]["month"].unique())
    start = pd.Timestamp(fut[0])
    look = _targets_lookup(ctx)
    MK = "{R:Month}"
    ly = (f'SUMIFS({{R:Sales}},{{R:Type}},"Actual",{{R:Category}},{{SEL}},{MK},EDATE({{key}},-12))'
          f'+SUMIFS({{R:Sales}},{{R:Type}},"Outlook",{{R:Category}},{{SEL}},{MK},EDATE({{key}},-12))')
    months = Block("Monthly plan (next 12 months)", "Month", fut, key_fmt="month", name="months",
                   note="Rows inside the plan window (Assumptions: start month + months in plan) are counted in the KPIs.",
                   cols=[Col("Last year", ly, note="Actual sales, same month last year"),
                         Col("Budget", "{C:Last year}*(1+{IN:growth})", note="Last year × (1 + growth target)"),
                         Col("Forecast", f'SUMIFS({{R:Sales}},{{R:Type}},"Forecast",{{R:Category}},{{SEL}},{MK},{{key}})'),
                         Col("Low", f'SUMIFS({{R:Low}},{{R:Type}},"Forecast",{{R:Category}},{{SEL}},{MK},{{key}})'),
                         Col("High", f'SUMIFS({{R:High}},{{R:Type}},"Forecast",{{R:Category}},{{SEL}},{MK},{{key}})'),
                         Col("Gap", "{C:Forecast}-{C:Budget}"),
                         Col("Gap %", "IFERROR({C:Gap}/{C:Budget},0)", "pct", total="IFERROR({C:Gap}/{C:Budget},0)"),
                         Col("LY GM", f'SUMIFS({{R:Gross margin}},{{R:Type}},"Actual",{{R:Category}},{{SEL}},{MK},EDATE({{key}},-12))'
                                      f'+SUMIFS({{R:Gross margin}},{{R:Type}},"Outlook",{{R:Category}},{{SEL}},{MK},EDATE({{key}},-12))'),
                         Col("Budget GM", "IFERROR({C:Budget}*{C:LY GM}/{C:Last year},0)"),
                         Col("In plan", "IF(AND({key}>={IN:start},{key}<=EDATE({IN:start},{IN:months}-1)),1,0)", "int",
                             note="1 = inside the plan window")],
                   conditional=[("Gap", "neg_red")])
    win = '{R:Month},">="&{IN:start},{R:Month},"<="&EDATE({IN:start},{IN:months}-1)'
    winly = '{R:Month},">="&EDATE({IN:start},-12),{R:Month},"<="&EDATE({IN:start},{IN:months}-13)'
    cats = Block("Category plan (plan window)", "Category", ctx.categories, name="cats",
                 note="Every category for the plan window, whatever the Category selector says. Targets and owners come from Lookup via INDEX-MATCH.",
                 cols=[Col("Last year", f'SUMIFS({{R:Sales}},{{R:Type}},"Actual",{{R:Category}},{{key}},{winly})+SUMIFS({{R:Sales}},{{R:Type}},"Outlook",{{R:Category}},{{key}},{winly})'),
                       Col("Budget", "{C:Last year}*(1+{IN:growth})"),
                       Col("Forecast", f'SUMIFS({{R:Sales}},{{R:Type}},"Forecast",{{R:Category}},{{key}},{win})'),
                       Col("Gap", "{C:Forecast}-{C:Budget}"),
                       Col("Gap %", "IFERROR({C:Gap}/{C:Budget},0)", "pct", total="IFERROR({C:Gap}/{C:Budget},0)"),
                       Col("LY GM %", f'IFERROR((SUMIFS({{R:Gross margin}},{{R:Type}},"Actual",{{R:Category}},{{key}},{winly})+SUMIFS({{R:Gross margin}},{{R:Type}},"Outlook",{{R:Category}},{{key}},{winly}))/{{C:Last year}},0)', "pct",
                           total=None),
                       Col("GM target", "IFERROR(INDEX({L:targets.gm_target_pct},MATCH({key},{L:targets.category},0)),0)", "pct", total=None,
                           note="Lookup: last 12 months' GM % for the category"),
                       Col("Owner", "IFERROR(INDEX({L:targets.owner},MATCH({key},{L:targets.category},0)),\"\")", "text", total=None, width=18)],
                 conditional=[("Gap", "neg_red"), ("Forecast", "bars")])
    inplan = "{B:months|In plan|range}"
    return WorkbookPlan(
        title="Budget & forecast plan", subtitle=f"{ctx.store} · 12 months from {start:%b %Y} · data to {ctx.asof:%d %b %Y}",
        raw=raw, raw_formats={"Month": "month", "Sales": "money2", "Gross margin": "money2", "Low": "money2", "High": "money2", "Units": "int"},
        categories=ctx.categories, lookups={"targets": look},
        inputs=[("growth", "Growth target vs last year", ctx.growth, "pct", "config.yaml › budget.growth_vs_last_year_pct"),
                ("start", "Plan starts (first month)", start.to_pydatetime(), "month", "First whole month after the data date"),
                ("months", "Months in plan", 3, "int", "1-12. KPI tiles and the category plan use this window")],
        blocks=[months, cats],
        kpis=[Kpi("Budget (plan window)", f"SUMIFS({{B:months|Budget|range}},{inplan},1)"),
              Kpi("Forecast", f"SUMIFS({{B:months|Forecast|range}},{inplan},1)"),
              Kpi("Gap to budget", f"SUMIFS({{B:months|Gap|range}},{inplan},1)", note="Forecast − budget"),
              Kpi("Gap %", f"IFERROR(SUMIFS({{B:months|Gap|range}},{inplan},1)/SUMIFS({{B:months|Budget|range}},{inplan},1),0)", "pct"),
              Kpi("Last year", f"SUMIFS({{B:months|Last year|range}},{inplan},1)"),
              Kpi("Budget GM %", f"IFERROR(SUMIFS({{B:months|Budget GM|range}},{inplan},1)/SUMIFS({{B:months|Budget|range}},{inplan},1),0)", "pct"),
              Kpi("Forecast low", f"SUMIFS({{B:months|Low|range}},{inplan},1)"),
              Kpi("Forecast high", f"SUMIFS({{B:months|High|range}},{inplan},1)")],
        charts=[ChartSpec("Budget vs forecast by month", "months", ["Budget", "Forecast"]),
                ChartSpec("Gap to budget by category (plan window)", "cats", ["Gap"])],
        pivots=[PivotSpec("Sales by category and month (filter Type: Actual / Forecast)", "Category", "Sales", cols=None, page="Type",
                          caption="Sales"),
                PivotSpec("Sales by month and type", "Month", "Sales", cols="Type", caption="Sales")],
        notes=_common_notes(ctx, ["Budget = last year's same month × (1 + growth target).",
                                  "Forecast = last year's same month × recent 12-week trend (capped ±15%), backtested; Low/High = 80% range.",
                                  "Outlook rows = the current part-month (actual month-to-date + forecast for the rest)."]),
        dictionary={"Month": "First day of the month", "Category": "Product category", "Type": "Actual = history; Forecast = Shelly's plan months; Outlook = current month",
                    "Sales": "Net sales excl. GST ($)", "Gross margin": "Sales − cost of goods ($), actuals only", "Units": "Units sold (actuals)",
                    "Low / High": "80% forecast range ($)"},
        signoff=["Growth target and budget approved", "Category owners briefed on their numbers"])


# =====================================================================================  13-WEEK FORECAST
def forecast_specs(ctx: Ctx, cat: str = "All", weeks: int = 13) -> dict:
    pw, meta = plan_weeks(ctx, 13)
    p = _sel(pw[pw["week"] <= weeks], cat)
    wk = p.groupby(["week", "week_start"]).agg(fc=("forecast", "sum"), lo=("low", "sum"), hi=("high", "sum"),
                                               ly=("ly_sales", "sum"), hol=("holidays", "max")).reset_index()
    wk["vs_ly"] = (wk["fc"] / wk["ly"] - 1) * 100
    wk["label"] = wk["week_start"].dt.strftime("%d %b")
    hist = _sel(weekly_actuals(ctx, 26), cat).groupby("week_start")["net_sales"].sum().reset_index()
    bt = meta["backtest"]
    tot, tly = wk["fc"].sum(), wk["ly"].sum()
    sp = S.new(ctx, f"forecast-{weeks}w-{cat}", "forecast", f"{weeks}-week forecast" + ("" if cat == "All" else f" · {cat}"),
               f"{wk['week_start'].min():%d %b} to {(wk['week_start'].max() + pd.Timedelta(days=6)):%d %b %Y} · {_scope(cat)}",
               cat, weeks, "weeks")
    peak = wk.loc[wk["fc"].idxmax()]
    low = wk.loc[wk["fc"].idxmin()]
    sp["headline"] = f"Shelly expects {money(tot)} over the next {weeks} weeks ({pct((tot / tly - 1) * 100)} on last year). Busiest week starts {peak['week_start']:%d %b}."
    sp["kpis"] = [S.kpi(f"Next {weeks} weeks", tot, sub=f"{money(wk['lo'].sum())} – {money(wk['hi'].sum())}"),
                  S.kpi("vs last year", (tot / tly - 1) * 100, "pct", tone="good" if tot >= tly else "bad", sub=f"LY {money(tly)}"),
                  S.kpi("Next week", wk.iloc[0]["fc"], sub=f"{wk.iloc[0]['week_start']:%d %b}"),
                  S.kpi("Average week", tot / weeks),
                  S.kpi("Weekly accuracy", (1 - bt["mape_store"]) * 100, "pctv", sub=f"{bt['n']} weekly backtests")]
    x = [d.strftime("%d %b") for d in hist["week_start"]] + wk["label"].tolist()
    nh = len(hist)
    sp["sections"].append(S.section("Outlook", "",
        S.bullets([f"Next week: **{money(wk.iloc[0]['fc'])}** (range {money(wk.iloc[0]['lo'])}–{money(wk.iloc[0]['hi'])}).",
                   f"Peak week starts **{peak['week_start']:%d %b}** at {money(peak['fc'])}; quietest starts {low['week_start']:%d %b} at {money(low['fc'])}.",
                   f"Over {weeks} weeks: {money(tot)}, {pct((tot / tly - 1) * 100)} on the same weeks last year."] +
                  ([f"Public holidays fall in {int((wk['hol'] > 0).sum())} of these weeks: plan rosters and orders around them."] if (wk["hol"] > 0).any() else [])),
        S.chart("band", "Weekly sales: last 26 weeks and forecast", x,
                [{"name": "Actual", "values": hist["net_sales"].tolist() + [None] * len(wk)},
                 {"name": "Forecast", "values": [None] * nh + wk["fc"].tolist()},
                 {"name": "Low", "values": [None] * nh + wk["lo"].tolist(), "role": "low"},
                 {"name": "High", "values": [None] * nh + wk["hi"].tolist(), "role": "high"}])))
    sp["sections"].append(S.section("Week by week", "",
        S.table(wk, [("week", "Wk", "int"), ("label", "Starts", "text"), ("fc", "Forecast", "money"), ("lo", "Low", "money"),
                     ("hi", "High", "money"), ("ly", "Last year", "money"), ("vs_ly", "vs LY", "pct"), ("hol", "Holidays", "int")],
                total={"label": "Total", "fc": tot, "lo": wk["lo"].sum(), "hi": wk["hi"].sum(), "ly": tly, "vs_ly": (tot / tly - 1) * 100})))
    if cat == "All":
        bc = pw[pw["week"] <= weeks].groupby("category").agg(fc=("forecast", "sum"), ly=("ly_sales", "sum")).reset_index()
        bc["vs_ly"] = (bc["fc"] / bc["ly"] - 1) * 100
        bc["share"] = bc["fc"] / bc["fc"].sum() * 100
        bc = bc.sort_values("fc", ascending=False)
        sp["sections"].append(S.section("By category", "",
            S.table(bc, [("category", "Category", "text"), ("fc", "Forecast", "money"), ("ly", "Last year", "money"),
                         ("vs_ly", "vs LY", "pct"), ("share", "Share", "pctv")])))
    m1 = meta["model_week1"].sum() if cat == "All" else meta["model_week1"].get(cat, np.nan)
    sp["assumptions"] = ["Weeks 4+ = last year's same week × recent 12-week trend (capped ±15%).",
                         "Week 1 = the daily models' 7-day forecast (best of 5 models per category); the short-term signal fades out by week 4.",
                         f"Range = ±{bt['p80_abs_err'] * 100:.1f}% (80th percentile of category errors in {bt['n']} weekly backtests)."]
    sp["risks"] = ["Promotions, price changes and new competitors are not in the forecast unless added.",
                   "Weather-driven categories (Beverages, Frozen, Food To Go) swing more than the range suggests in heatwaves or storms."]
    sp["method"] = [f"Store-level weekly error {bt['mape_store'] * 100:.1f}%, category median {bt['mape_cat'] * 100:.1f}%.",
                    f"Daily models' next 7 days: {money(m1)}."]
    return sp


def forecast_workbook(ctx: Ctx) -> WorkbookPlan:
    pw, meta = plan_weeks(ctx, 13)
    hist = weekly_actuals(ctx, 104)
    raw = pd.concat([
        pd.DataFrame({"Week start": hist["week_start"], "Category": hist["category"], "Type": "Actual", "Sales": hist["net_sales"].round(2),
                      "Low": np.nan, "High": np.nan}),
        pd.DataFrame({"Week start": pw["week_start"], "Category": pw["category"], "Type": "Forecast", "Sales": pw["forecast"].round(2),
                      "Low": pw["low"].round(2), "High": pw["high"].round(2)})], ignore_index=True)
    keys = sorted(pw["week_start"].unique())
    W = "{R:Week start}"
    blk = Block("13-week forecast", "Week starting", keys, key_fmt="date", name="weeks",
                cols=[Col("Forecast", f'SUMIFS({{R:Sales}},{{R:Type}},"Forecast",{{R:Category}},{{SEL}},{W},{{key}})'),
                      Col("Low", f'SUMIFS({{R:Low}},{{R:Type}},"Forecast",{{R:Category}},{{SEL}},{W},{{key}})'),
                      Col("High", f'SUMIFS({{R:High}},{{R:Type}},"Forecast",{{R:Category}},{{SEL}},{W},{{key}})'),
                      Col("Last year", f'SUMIFS({{R:Sales}},{{R:Type}},"Actual",{{R:Category}},{{SEL}},{W},{{key}}-364)',
                          note="Same week last year (364 days earlier, so weekdays line up)"),
                      Col("vs LY", "IFERROR({C:Forecast}/{C:Last year}-1,0)", "pct", total="IFERROR({C:Forecast}/{C:Last year}-1,0)"),
                      Col("Uplift ($)", "{C:Forecast}*{IN:uplift}", note="Extra sales if the promo/event uplift input is used"),
                      Col("Plan", "{C:Forecast}+{C:Uplift ($)}")],
                conditional=[("vs LY", "neg_red")])
    recent = sorted(hist["week_start"].unique())[-13:]
    act = Block("Last 13 weeks (actual)", "Week starting", recent, key_fmt="date", name="actual",
                cols=[Col("Actual", f'SUMIFS({{R:Sales}},{{R:Type}},"Actual",{{R:Category}},{{SEL}},{W},{{key}})'),
                      Col("Year before", f'SUMIFS({{R:Sales}},{{R:Type}},"Actual",{{R:Category}},{{SEL}},{W},{{key}}-364)'),
                      Col("YoY", "IFERROR({C:Actual}/{C:Year before}-1,0)", "pct", total="IFERROR({C:Actual}/{C:Year before}-1,0)")],
                conditional=[("YoY", "neg_red")])
    return WorkbookPlan(
        title="13-week sales forecast", subtitle=f"{ctx.store} · from {keys[0]:%d %b %Y} · data to {ctx.asof:%d %b %Y}",
        raw=raw, raw_formats={"Week start": "date", "Sales": "money2", "Low": "money2", "High": "money2"},
        categories=ctx.categories, lookups={"targets": _targets_lookup(ctx)},
        inputs=[("uplift", "Promo / event uplift on forecast", 0.0, "pct", "Add a planned uplift, e.g. 3% for a promotion season")],
        blocks=[blk, act],
        kpis=[Kpi("Next 13 weeks", "{B:weeks|Forecast|total}"), Kpi("Low", "{B:weeks|Low|total}"), Kpi("High", "{B:weeks|High|total}"),
              Kpi("vs last year", "{B:weeks|vs LY|total}", "pct"), Kpi("Next week", "{B:weeks|Forecast|1}"),
              Kpi("Plan incl. uplift", "{B:weeks|Plan|total}"), Kpi("Last 13 weeks", "{B:actual|Actual|total}"),
              Kpi("Last 13 weeks YoY", "{B:actual|YoY|total}", "pct")],
        charts=[ChartSpec("Forecast by week", "weeks", ["Forecast", "Last year"], "line"),
                ChartSpec("Last 13 weeks vs year before", "actual", ["Actual", "Year before"], "line")],
        pivots=[PivotSpec("Sales by category (filter Type)", "Category", "Sales", page="Type", caption="Sales"),
                PivotSpec("Weekly sales by type", "Week start", "Sales", cols="Type", caption="Sales")],
        notes=_common_notes(ctx, ["Weeks 4-13: last year's same week × recent 12-week trend (capped ±15%).",
                                  "Weeks 1-3 blend in the daily models' 7-day forecast (weights 1, 0.5, 0.25).",
                                  f"80% range from 13 weekly backtests: ±{meta['backtest']['p80_abs_err'] * 100:.1f}%."]),
        dictionary={"Week start": "First day of the 7-day week", "Type": "Actual or Forecast", "Sales": "Net sales ($)", "Low/High": "80% range"},
        signoff=["Forecast reviewed for ordering and rostering"])


# =====================================================================================  WEEKLY TRADING PACK
def _week_frames(ctx: Ctx):
    s = ctx.P.sales
    end = ctx.asof
    x = s[((s["date"] > end - pd.Timedelta(days=56)) & (s["date"] <= end)) |
          ((s["date"] > end - pd.Timedelta(days=56 + 364)) & (s["date"] <= end - pd.Timedelta(days=364)))]
    g = x.groupby(["date", "category", "channel"]).agg(Sales=("net_sales", "sum"), Cost=("cost", "sum"), Units=("units", "sum")).reset_index()
    w = ctx.P.waste
    if w is not None:
        ww = w[(w["date"] > end - pd.Timedelta(days=56)) & (w["date"] <= end)].groupby(["date", "category"]).agg(
            W=("waste_value", "sum"), M=("markdown_value", "sum")).reset_index()
        ww["channel"] = "in_store"
        g = g.merge(ww, on=["date", "category", "channel"], how="left")
    else:
        g["W"], g["M"] = 0.0, 0.0
    g["Waste $"] = (g["W"].fillna(0) + g["M"].fillna(0)).round(2)
    g = g.drop(columns=["W", "M"])
    g["Gross margin"] = (g["Sales"] - g["Cost"]).round(2)
    g["Week ending"] = end - ((end - g["date"]).dt.days // 7) * pd.Timedelta(days=7)
    g = g.rename(columns={"date": "Date", "category": "Category", "channel": "Channel"})
    g["Channel"] = g["Channel"].map({"in_store": "In-store", "uber_eats": "Uber Eats", "on_demand": "On-Demand"}).fillna(g["Channel"])
    return g[["Date", "Week ending", "Category", "Channel", "Sales", "Cost", "Gross margin", "Units", "Waste $"]]


def weekly_specs(ctx: Ctx, cat: str = "All") -> dict:
    C = ctx.R["commercial"]
    k = C["kpis"]
    pl = C["category_pl"].reset_index()
    g = _week_frames(ctx)
    end = ctx.asof

    def wsum(df, a, b):
        return df[(df["Date"] > end - pd.Timedelta(days=b)) & (df["Date"] <= end - pd.Timedelta(days=a))]
    sel = _sel(g, cat, "Category")
    cur, prev, ly = wsum(sel, 0, 7), wsum(sel, 7, 14), wsum(sel, 364, 371)
    sales, psales, lysales = cur["Sales"].sum(), prev["Sales"].sum(), ly["Sales"].sum()
    budget = lysales * (1 + ctx.growth)
    gm = cur["Gross margin"].sum() / sales * 100 if sales else 0
    waste = cur["Waste $"].sum() / sales * 100 if sales else 0
    deliv = cur[cur["Channel"] != "In-store"]["Sales"].sum() / sales * 100 if sales else 0
    t = ctx.cfg["kpi_targets"]
    sp = S.new(ctx, f"weekly-{cat}", "weekly", "Weekly trading report" + ("" if cat == "All" else f" · {cat}"),
               f"Week ending {end:%A %d %B %Y} · {_scope(cat)}", cat)
    sp["headline"] = (f"Sales {money(sales)}: {pct((sales / psales - 1) * 100)} on last week, {pct((sales / lysales - 1) * 100)} on last year "
                      f"and {pct((sales / budget - 1) * 100)} against budget.")
    sp["kpis"] = [S.kpi("Sales", sales, sub=f"LW {money(psales)}"),
                  S.kpi("vs last week", (sales / psales - 1) * 100, "pct", tone="good" if sales >= psales else "bad"),
                  S.kpi("vs budget", (sales / budget - 1) * 100, "pct", tone="good" if sales >= budget else "bad", sub=f"budget {money(budget)}"),
                  S.kpi("Gross margin", gm, "pctv", tone="good" if gm >= t["gross_margin_pct"] else "bad", sub=f"target {t['gross_margin_pct']}%"),
                  S.kpi("Waste + markdown", waste, "pctv", tone="good" if waste <= t["waste_pct_of_sales"] else "bad", sub=f"target ≤{t['waste_pct_of_sales']}%"),
                  S.kpi("Delivery share", deliv, "pctv", sub=f"target {t['delivery_share_pct']}%")]
    acts = [a for a in ctx.acts if cat == "All" or cat.lower() in (a["action"] + a["why"] + a["area"]).lower()]
    p1 = [a for a in acts if a["priority"] == "P1"]
    daily = cur.groupby("Date")["Sales"].sum()
    daily_lw = prev.groupby("Date")["Sales"].sum()
    daily_ly = ly.groupby("Date")["Sales"].sum()
    sp["sections"].append(S.section("The week in brief", "",
        S.text(ctx.summary if cat == "All" and ctx.summary else sp["headline"]),
        S.bullets([f"**{len(p1)} actions for today**" + (": " + "; ".join(a["action"].split(";")[0] for a in p1[:3]) if p1 else "."),
                   f"Gross margin {gm:.1f}% vs target {t['gross_margin_pct']}%; waste and markdowns {waste:.1f}% of sales."])))
    sp["sections"].append(S.section("Daily sales", "",
        S.chart("line", "Sales by day: this week, last week, last year", [d.strftime("%a %d") for d in daily.index],
                [{"name": "This week", "values": daily.tolist()}, {"name": "Last week", "values": daily_lw.tolist()},
                 {"name": "Last year", "values": daily_ly.tolist()}])))
    if cat == "All":
        b = C["bridge"]
        sp["sections"].append(S.section("What moved sales", "Change vs last week split into volume, mix and price.",
            S.chart("bar", "Sales bridge vs last week", ["Volume", "Mix", "Price"], [{"name": "Impact", "values": [b["volume"], b["mix"], b["price"]]}]),
            S.text(f"Last week {money(b['previous'])} → this week {money(b['current'])}. Volume {money(b['volume'])}, mix {money(b['mix'])}, price {money(b['price'])}.")))
        pl2 = pl.assign(vs_budget_pct=pl["vs_budget"] / pl["budget"] * 100)
        sp["sections"].append(S.section("Categories", "",
            S.table(pl2, [("category", "Category", "text"), ("sales", "Sales", "money"), ("wow_pct", "vs LW", "pct"), ("yoy_pct", "vs LY", "pct"),
                          ("vs_budget", "vs budget", "money"), ("gm_pct", "GM %", "pctv"), ("waste_value", "Waste $", "money"),
                          ("contribution", "Contribution", "money")],
                    total={"category": "Total", "sales": pl2["sales"].sum(), "vs_budget": pl2["vs_budget"].sum(), "waste_value": pl2["waste_value"].sum(),
                           "contribution": pl2["contribution"].sum()})))
    ch = cur.groupby("Channel")["Sales"].sum()
    chp = prev.groupby("Channel")["Sales"].sum()
    chdf = pd.DataFrame({"channel": ch.index, "sales": ch.values, "prev": chp.reindex(ch.index).values})
    chdf["chg"] = (chdf["sales"] / chdf["prev"] - 1) * 100
    chdf["share"] = chdf["sales"] / chdf["sales"].sum() * 100
    sp["sections"].append(S.section("Channels", "",
        S.table(chdf, [("channel", "Channel", "text"), ("sales", "This week", "money"), ("prev", "Last week", "money"),
                       ("chg", "Change", "pct"), ("share", "Share", "pctv")])))
    ex = ctx.R["anomalies"]
    if cat != "All":
        ex = ex[ex["item"].astype(str).str.contains(cat, case=False) | ex["sku"].isin(ctx.P.products[ctx.P.products["category"] == cat]["sku"])]
    if len(ex):
        e = ex.assign(date_s=pd.to_datetime(ex["date"]).dt.strftime("%a %d %b"))
        sp["sections"].append(S.section("Exceptions", "Unusual results found by the anomaly checks.",
            S.table(e, [("date_s", "Date", "text"), ("type", "Type", "text"), ("item", "Item", "text"), ("detail", "Detail", "text"),
                        ("impact_nzd", "Impact", "money")], max_rows=15)))
    if acts:
        a = pd.DataFrame(acts)
        sp["sections"].append(S.section("Actions", "Ranked by urgency and $ impact. P1 = today.",
            S.table(a, [("priority", "P", "text"), ("area", "Area", "text"), ("action", "Action", "text"),
                        ("weekly_impact_nzd", "$/week", "money"), ("owner", "Owner", "text")], max_rows=20)))
    sp["approvals"] = [a["action"].split(";")[0] for a in acts if a.get("decision_status") == "pending"][:6]
    sp["assumptions"] = [f"Budget for the week = same week last year (364 days earlier) × (1 + {ctx.growth * 100:.0f}%).",
                         "Waste + markdown valued at cost (waste) and 50% of retail (markdowns)."]
    sp["risks"] = [f"{r['type']}: {r['item']} ({r['detail']})" for r in ex.head(4).to_dict("records")]
    return sp


def weekly_workbook(ctx: Ctx) -> WorkbookPlan:
    g = _week_frames(ctx)
    end = ctx.asof
    D = "{R:Date}"
    this = f'{D},">"&({{IN:week_end}}-7),{D},"<="&{{IN:week_end}}'
    last = f'{D},">"&({{IN:week_end}}-14),{D},"<="&({{IN:week_end}}-7)'
    ly = f'{D},">"&({{IN:week_end}}-371),{D},"<="&({{IN:week_end}}-364)'
    cats = Block("Category P&L (selected week)", "Category", ctx.categories, name="cats",
                 cols=[Col("Sales", f"SUMIFS({{R:Sales}},{{R:Category}},{{key}},{this})"),
                       Col("Last week", f"SUMIFS({{R:Sales}},{{R:Category}},{{key}},{last})"),
                       Col("vs LW", "IFERROR({C:Sales}/{C:Last week}-1,0)", "pct", total="IFERROR({C:Sales}/{C:Last week}-1,0)"),
                       Col("Last year", f"SUMIFS({{R:Sales}},{{R:Category}},{{key}},{ly})"),
                       Col("Budget", "{C:Last year}*(1+{IN:growth})"),
                       Col("vs budget", "{C:Sales}-{C:Budget}"),
                       Col("Gross margin", f"SUMIFS({{R:Gross margin}},{{R:Category}},{{key}},{this})"),
                       Col("GM %", "IFERROR({C:Gross margin}/{C:Sales},0)", "pct", total="IFERROR({C:Gross margin}/{C:Sales},0)"),
                       Col("Waste $", f"SUMIFS({{R:Waste $}},{{R:Category}},{{key}},{this})"),
                       Col("Waste %", "IFERROR({C:Waste $}/{C:Sales},0)", "pct", total="IFERROR({C:Waste $}/{C:Sales},0)"),
                       Col("GM target", "IFERROR(INDEX({L:targets.gm_target_pct},MATCH({key},{L:targets.category},0)),0)", "pct", total=None)],
                 conditional=[("vs budget", "neg_red"), ("Sales", "bars")])
    chans = Block("Channels (selected week)", "Channel", ["In-store", "Uber Eats", "On-Demand"], name="chans",
                  cols=[Col("Sales", f"SUMIFS({{R:Sales}},{{R:Channel}},{{key}},{{R:Category}},{{SEL}},{this})"),
                        Col("Last week", f"SUMIFS({{R:Sales}},{{R:Channel}},{{key}},{{R:Category}},{{SEL}},{last})"),
                        Col("Change", "IFERROR({C:Sales}/{C:Last week}-1,0)", "pct", total="IFERROR({C:Sales}/{C:Last week}-1,0)"),
                        Col("Share", "IFERROR({C:Sales}/SUMIFS({R:Sales},{R:Category},{SEL}," + this + "),0)", "pct", total="1")],
                  conditional=[("Change", "neg_red")])
    days = [end - pd.Timedelta(days=i) for i in range(6, -1, -1)]
    daily = Block("Daily sales (selected week)", "Date", days, key_fmt="date", name="days",
                  note="Dates follow the week in the input only if you retype them; the sums use the week-end input.",
                  cols=[Col("This week", f"SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{D},{{IN:week_end}}-7+{{IDX}})"),
                        Col("Last week", f"SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{D},{{IN:week_end}}-14+{{IDX}})"),
                        Col("Last year", f"SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{D},{{IN:week_end}}-371+{{IDX}})")])
    acts = pd.DataFrame(ctx.acts)[["priority", "when", "area", "action", "why", "weekly_impact_nzd", "owner", "decision_id", "decision_status"]]
    acts.columns = ["Priority", "When", "Area", "Action", "Why", "Impact $/week", "Owner", "Decision ID", "Decision status"]
    ex = ctx.R["anomalies"].copy()
    ex = ex[["date", "type", "item", "detail", "z", "impact_nzd"]]
    ex.columns = ["Date", "Type", "Item", "Detail", "z-score", "Impact $"]
    return WorkbookPlan(
        title="Weekly trading report", subtitle=f"{ctx.store} · week ending {end:%d %b %Y}",
        raw=g, raw_formats={"Date": "date", "Week ending": "date", "Sales": "money2", "Cost": "money2", "Gross margin": "money2",
                            "Units": "int", "Waste $": "money2"},
        categories=ctx.categories, lookups={"targets": _targets_lookup(ctx)},
        inputs=[("week_end", "Week ending", end.to_pydatetime(), "date", "Last day of the week to report (data covers the last 8 weeks)"),
                ("growth", "Budget growth vs last year", ctx.growth, "pct", "config.yaml › budget")],
        blocks=[cats, chans, daily],
        kpis=[Kpi("Sales", f"SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{this})"),
              Kpi("vs last week", f"IFERROR(SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{this})/SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{last})-1,0)", "pct"),
              Kpi("vs budget", f"IFERROR(SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{this})/(SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{ly})*(1+{{IN:growth}}))-1,0)", "pct"),
              Kpi("Gross margin %", f"IFERROR(SUMIFS({{R:Gross margin}},{{R:Category}},{{SEL}},{this})/SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{this}),0)", "pct"),
              Kpi("Waste %", f"IFERROR(SUMIFS({{R:Waste $}},{{R:Category}},{{SEL}},{this})/SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{this}),0)", "pct"),
              Kpi("Delivery share", f'IFERROR(1-SUMIFS({{R:Sales}},{{R:Channel}},"In-store",{{R:Category}},{{SEL}},{this})/SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{this}),0)', "pct"),
              Kpi("Units", f"SUMIFS({{R:Units}},{{R:Category}},{{SEL}},{this})", "int"),
              Kpi("Actions for today", f'{len([a for a in ctx.acts if a["priority"] == "P1"])}', "int", note="From the Actions sheet")],
        charts=[ChartSpec("Daily sales: this week vs last week vs last year", "days", ["This week", "Last week", "Last year"], "line"),
                ChartSpec("Sales vs budget by category", "cats", ["Sales", "Budget"])],
        pivots=[PivotSpec("Sales by category and channel", "Category", "Sales", cols="Channel", caption="Sales"),
                PivotSpec("Sales by week ending", "Week ending", "Sales", caption="Sales")],
        extra_sheets={"Actions": acts, "Exceptions": ex},
        notes=_common_notes(ctx, ["Week = the 7 days ending on the Week ending input.", "Last year = the same weekdays 364 days earlier.",
                                  "Waste $ = waste at cost + markdowns at 50% of retail, recorded against In-store rows."]),
        dictionary={"Date": "Trading day", "Week ending": "Last day of the 7-day week the row belongs to", "Channel": "In-store / Uber Eats / On-Demand",
                    "Sales": "Net sales ($)", "Cost": "Cost of goods ($)", "Gross margin": "Sales − cost ($)", "Units": "Units sold",
                    "Waste $": "Waste + markdown value ($), on In-store rows"},
        signoff=["Week reviewed with the store team", "P1 actions assigned"])


# =====================================================================================  CATEGORY REVIEW
def _product_weeks(ctx: Ctx, weeks: int = 26) -> pd.DataFrame:
    d = ctx.P.daily_sku
    end = ctx.asof
    x = d[d["date"] > end - pd.Timedelta(days=7 * weeks)].copy()
    x["Week ending"] = end - ((end - x["date"]).dt.days // 7) * pd.Timedelta(days=7)
    cost = ctx.P.sales.groupby(["date", "sku"])["cost"].sum()
    x = x.merge(cost.rename("cost2").reset_index(), on=["date", "sku"], how="left")
    g = x.groupby(["Week ending", "sku", "product_name", "category"]).agg(Sales=("net_sales", "sum"), Units=("units", "sum"),
                                                                          Cost=("cost2", "sum")).reset_index()
    g["Gross margin"] = (g["Sales"] - g["Cost"]).round(2)
    g = g.rename(columns={"sku": "SKU", "product_name": "Product", "category": "Category"})
    return g[["Week ending", "SKU", "Product", "Category", "Sales", "Units", "Gross margin"]]


def _product_view(ctx: Ctx) -> pd.DataFrame:
    g = _product_weeks(ctx)
    end = ctx.asof
    cur = g[g["Week ending"] > end - pd.Timedelta(days=91)].groupby("SKU")[["Sales", "Units", "Gross margin"]].sum()
    pri = g[g["Week ending"] <= end - pd.Timedelta(days=91)].groupby("SKU")["Sales"].sum()
    a = ctx.R["assortment"].set_index("sku")
    rp = ctx.R["replenishment"].set_index("sku")
    v = cur.join(pri.rename("prior")).join(a[["product_name", "category", "abc", "segment", "waste_rate_pct", "range_action"]])
    v["change_pct"] = (v["Sales"] / v["prior"] - 1) * 100
    v["gm_pct"] = v["Gross margin"] / v["Sales"] * 100
    v["reorder"] = rp["status"].reindex(v.index)
    return v.reset_index().rename(columns={"index": "SKU"})


def category_specs(ctx: Ctx, cat: str = "All") -> dict:
    v = _product_view(ctx)
    g = _product_weeks(ctx)
    title = "Category review" + ("" if cat == "All" else f" · {cat}")
    sp = S.new(ctx, f"category-{cat}", "category", title, f"Last 13 weeks to {ctx.asof:%d %b %Y} · {_scope(cat)}", cat)
    if cat == "All":
        c = v.groupby("category").agg(sales=("Sales", "sum"), prior=("prior", "sum"), gm=("Gross margin", "sum"), n=("SKU", "count")).reset_index()
        c["chg"] = (c["sales"] / c["prior"] - 1) * 100
        c["gm_pct"] = c["gm"] / c["sales"] * 100
        c["share"] = c["sales"] / c["sales"].sum() * 100
        c = c.sort_values("sales", ascending=False)
        up, down = c.sort_values("chg").iloc[-1], c.sort_values("chg").iloc[0]
        sp["headline"] = f"{len(c)} categories, {money(c['sales'].sum())} in 13 weeks. Fastest growing: {up['category']} ({pct(up['chg'])}); weakest: {down['category']} ({pct(down['chg'])})."
        sp["kpis"] = [S.kpi("13-week sales", c["sales"].sum()), S.kpi("vs prior 13 weeks", (c["sales"].sum() / c["prior"].sum() - 1) * 100, "pct"),
                      S.kpi("Gross margin", c["gm"].sum() / c["sales"].sum() * 100, "pctv"), S.kpi("Products", int(c["n"].sum()), "int")]
        sp["sections"].append(S.section("Category overview", "",
            S.chart("hbar", "13-week sales by category", c["category"], [{"name": "Sales", "values": c["sales"].tolist()}]),
            S.table(c, [("category", "Category", "text"), ("sales", "Sales 13w", "money"), ("chg", "vs prior", "pct"), ("gm_pct", "GM %", "pctv"),
                        ("share", "Share", "pctv"), ("n", "Products", "int")])))
        sp["method"] = ["Open a single category for product detail: ask Shelly for e.g. \"category review for Dairy\"."]
        return sp
    p = v[v["category"] == cat].sort_values("Sales", ascending=False)
    wk = g[g["Category"] == cat].groupby("Week ending")["Sales"].sum()
    total, prior = p["Sales"].sum(), p["prior"].sum()
    gm = p["Gross margin"].sum() / total * 100 if total else 0
    store_total = v["Sales"].sum()
    grow = p.sort_values("change_pct", ascending=False).head(3)
    fall = p.sort_values("change_pct").head(3)
    sp["headline"] = f"{cat}: {money(total)} over 13 weeks ({pct((total / prior - 1) * 100)} vs the 13 weeks before), gross margin {gm:.1f}%."
    sp["kpis"] = [S.kpi("13-week sales", total, sub=f"{total / store_total * 100:.1f}% of store"),
                  S.kpi("vs prior 13 weeks", (total / prior - 1) * 100, "pct", tone="good" if total >= prior else "bad"),
                  S.kpi("Gross margin", gm, "pctv"), S.kpi("Products", len(p), "int"),
                  S.kpi("Waste rate", p["waste_rate_pct"].mean(), "pctv", sub="average of products")]
    sp["sections"].append(S.section("Trend", "",
        S.chart("line", f"{cat}: weekly sales, last 26 weeks", [d.strftime("%d %b") for d in wk.index], [{"name": "Sales", "values": wk.tolist()}]),
        S.bullets([f"Growing: " + ", ".join(f"{r.product_name} ({pct(r.change_pct)})" for r in grow.itertuples()),
                   f"Declining: " + ", ".join(f"{r.product_name} ({pct(r.change_pct)})" for r in fall.itertuples()),
                   f"Range calls: {int((p['range_action'].astype(str).str.contains('Review|Delist|Cut', case=False)).sum())} product(s) flagged for review."])))
    sp["sections"].append(S.section("Products", "Sorted by sales. ABC = share of category sales (A = top 80%).",
        S.table(p, [("product_name", "Product", "text"), ("Sales", "Sales 13w", "money"), ("change_pct", "vs prior", "pct"), ("gm_pct", "GM %", "pctv"),
                    ("abc", "ABC", "text"), ("waste_rate_pct", "Waste %", "pctv"), ("segment", "Segment", "text"), ("range_action", "Range call", "text"),
                    ("reorder", "Reorder", "text")])))
    pf, _ = budget_specs(ctx, cat, 3), None
    fc = forecast_specs(ctx, cat, 4)
    sp["sections"].append(S.section("Looking ahead", "",
        S.bullets([f"Next 4 weeks: {money(fc['kpis'][0]['value'])} forecast ({fc['kpis'][0]['sub']}).",
                   f"Next 3 months: budget {money(pf['kpis'][0]['value'])}, forecast {money(pf['kpis'][1]['value'])}, gap {money(pf['kpis'][2]['value'])}."])))
    acts = [a for a in ctx.acts if cat.lower() in (a["action"] + a["why"]).lower() or any(n.lower() in a["action"].lower() for n in p["product_name"])]
    if acts:
        sp["sections"].append(S.section("Actions", "",
            S.table(pd.DataFrame(acts), [("priority", "P", "text"), ("action", "Action", "text"), ("weekly_impact_nzd", "$/week", "money"), ("owner", "Owner", "text")])))
    sp["risks"] = [f"{r.product_name}: {r.range_action}" for r in p[p["range_action"].astype(str).str.len() > 0].head(4).itertuples()]
    sp["approvals"] = ["Range calls for flagged products"]
    return sp


def category_workbook(ctx: Ctx) -> WorkbookPlan:
    g = _product_weeks(ctx)
    v = _product_view(ctx)
    master = v[["SKU", "product_name", "category", "abc", "segment", "range_action", "reorder"]].rename(
        columns={"product_name": "product", "range_action": "range_call"})
    W = "{R:Week ending}"
    c13 = f'{W},">"&({{IN:end}}-91),{W},"<="&{{IN:end}}'
    p13 = f'{W},">"&({{IN:end}}-182),{W},"<="&({{IN:end}}-91)'
    cats = Block("Categories (13 weeks)", "Category", ctx.categories, name="cats",
                 cols=[Col("Sales 13w", f"SUMIFS({{R:Sales}},{{R:Category}},{{key}},{c13})"),
                       Col("Prior 13w", f"SUMIFS({{R:Sales}},{{R:Category}},{{key}},{p13})"),
                       Col("Change", "IFERROR({C:Sales 13w}/{C:Prior 13w}-1,0)", "pct", total="IFERROR({C:Sales 13w}/{C:Prior 13w}-1,0)"),
                       Col("Gross margin", f"SUMIFS({{R:Gross margin}},{{R:Category}},{{key}},{c13})"),
                       Col("GM %", "IFERROR({C:Gross margin}/{C:Sales 13w},0)", "pct", total="IFERROR({C:Gross margin}/{C:Sales 13w},0)"),
                       Col("Share", "IFERROR({C:Sales 13w}/SUMIFS({R:Sales}," + c13 + "),0)", "pct", total="1")],
                 conditional=[("Change", "neg_red"), ("Sales 13w", "bars")])
    L = "{L:products.SKU}"
    prods = Block("Products (use the filter buttons; 'In selection' follows the Category cell)", "SKU", v.sort_values(["category", "Sales"], ascending=[True, False])["SKU"].tolist(),
                  name="prods", autofilter=True, total_label=None,
                  cols=[Col("Product", f"INDEX({{L:products.product}},MATCH({{key}},{L},0))", "text", width=26),
                        Col("Category", f"INDEX({{L:products.category}},MATCH({{key}},{L},0))", "text", width=18),
                        Col("Sales 13w", f"SUMIFS({{R:Sales}},{{R:SKU}},{{key}},{c13})"),
                        Col("Prior 13w", f"SUMIFS({{R:Sales}},{{R:SKU}},{{key}},{p13})"),
                        Col("Change", "IFERROR({C:Sales 13w}/{C:Prior 13w}-1,0)", "pct"),
                        Col("GM %", f"IFERROR(SUMIFS({{R:Gross margin}},{{R:SKU}},{{key}},{c13})/{{C:Sales 13w}},0)", "pct"),
                        Col("ABC", f"INDEX({{L:products.abc}},MATCH({{key}},{L},0))", "text", width=6),
                        Col("Range call", f"INDEX({{L:products.range_call}},MATCH({{key}},{L},0))", "text", width=26),
                        Col("In selection", 'IF(OR(SelCat="All",{C:Category}=SelCat),1,0)', "int")],
                  conditional=[("Change", "neg_red")])
    return WorkbookPlan(
        title="Category review", subtitle=f"{ctx.store} · 13 weeks to {ctx.asof:%d %b %Y}",
        raw=g, raw_formats={"Week ending": "date", "Sales": "money2", "Gross margin": "money2", "Units": "int"},
        categories=ctx.categories, lookups={"products": master, "targets": _targets_lookup(ctx)},
        inputs=[("end", "Period ends (week ending)", ctx.asof.to_pydatetime(), "date", "13-week window ends here")],
        blocks=[cats, prods],
        kpis=[Kpi("13-week sales", f"SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{c13})"),
              Kpi("vs prior 13 weeks", f"IFERROR(SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{c13})/SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{p13})-1,0)", "pct"),
              Kpi("Gross margin %", f"IFERROR(SUMIFS({{R:Gross margin}},{{R:Category}},{{SEL}},{c13})/SUMIFS({{R:Sales}},{{R:Category}},{{SEL}},{c13}),0)", "pct"),
              Kpi("Products in selection", "SUM({B:prods|In selection|range})", "int")],
        charts=[ChartSpec("13-week sales by category", "cats", ["Sales 13w", "Prior 13w"])],
        pivots=[PivotSpec("Sales by product (filter Category)", "Product", "Sales", page="Category", caption="Sales"),
                PivotSpec("Weekly sales by category", "Week ending", "Sales", cols="Category", caption="Sales")],
        notes=_common_notes(ctx, ["13 weeks = the 91 days ending on the Period ends input; prior = the 91 days before that.",
                                  "ABC: products ranked by sales; A = top 80% of category sales, B = next 15%, C = last 5%.",
                                  "Segment and range call come from the K-means segmentation and assortment rules."]),
        dictionary={"Week ending": "Last day of the week", "SKU": "Product code", "Sales": "Net sales ($)", "Units": "Units sold",
                    "Gross margin": "Sales − cost ($)"},
        signoff=["Range calls agreed", "Category owner briefed"])


# =====================================================================================  LABOUR / ROSTER
def labour_specs(ctx: Ctx, cat: str = "All") -> dict:
    lab = ctx.cfg["labour"]
    d = ctx.R["labour"].copy()
    pw, _ = plan_weeks(ctx, 13)
    wk = pw.groupby(["week", "week_start"])["forecast"].sum().reset_index()
    wk["hours"] = np.maximum(wk["forecast"] / lab["sales_per_labour_hour"], lab["min_hours_per_day"] * 7)
    wk["wage"] = wk["hours"] * lab["wage_rate"]
    wk["wage_pct"] = wk["wage"] / wk["forecast"] * 100
    wk["label"] = wk["week_start"].dt.strftime("%d %b")
    sp = S.new(ctx, "labour-All", "labour", "Roster & labour plan", f"Next 7 days and next 13 weeks · target ${lab['sales_per_labour_hour']} sales per paid hour", "All")
    h7, w7, s7 = d["hours_needed"].sum(), d["wage_cost"].sum(), d["forecast_sales"].sum()
    busiest = d.loc[d["forecast_sales"].idxmax()]
    sp["headline"] = f"Roster {h7:.0f} hours next week ({money(w7)} wages, {w7 / s7 * 100:.1f}% of forecast sales). Busiest day: {busiest['day']}."
    sp["kpis"] = [S.kpi("Hours next 7 days", h7, "num1"), S.kpi("Wage cost", w7, sub=f"at ${lab['wage_rate']}/h"),
                  S.kpi("Wage % of sales", w7 / s7 * 100, "pctv"), S.kpi("13-week wage budget", wk["wage"].sum(), sub=f"{wk['hours'].sum():,.0f} hours")]
    sp["sections"].append(S.section("Next 7 days", f"Hours = forecast sales ÷ ${lab['sales_per_labour_hour']} per hour, never below {lab['min_hours_per_day']} hours (two people open to close).",
        S.chart("bar", "Hours needed by day", d["day"], [{"name": "Hours", "values": d["hours_needed"].tolist()}], fmt="num1"),
        S.table(d, [("day", "Day", "text"), ("forecast_sales", "Forecast sales", "money"), ("hours_needed", "Hours", "num1"),
                    ("wage_cost", "Wages", "money"), ("wage_pct_sales", "Wage %", "pctv")],
                total={"day": "Total", "forecast_sales": s7, "hours_needed": h7, "wage_cost": w7, "wage_pct_sales": w7 / s7 * 100})))
    sp["sections"].append(S.section("Next 13 weeks", "Use for leave planning and the labour budget.",
        S.chart("bar", "Weekly hours", wk["label"], [{"name": "Hours", "values": wk["hours"].tolist()}], fmt="num1"),
        S.table(wk, [("label", "Week of", "text"), ("forecast", "Forecast sales", "money"), ("hours", "Hours", "num1"), ("wage", "Wages", "money"),
                     ("wage_pct", "Wage %", "pctv")], total={"label": "Total", "forecast": wk["forecast"].sum(), "hours": wk["hours"].sum(), "wage": wk["wage"].sum()})))
    sp["assumptions"] = [f"Productivity target ${lab['sales_per_labour_hour']} per paid hour; minimum {lab['min_hours_per_day']} hours a day; wage ${lab['wage_rate']}/h (config.yaml › labour).",
                         "Forecast from the 7-day models (days) and the 13-week plan (weeks)."]
    sp["approvals"] = ["Next week's roster hours", "13-week labour budget"]
    return sp


def labour_workbook(ctx: Ctx) -> WorkbookPlan:
    lab = ctx.cfg["labour"]
    d = ctx.R["labour"]
    pw, _ = plan_weeks(ctx, 13)
    wk = pw.groupby("week_start")["forecast"].sum().reset_index()
    raw = pd.concat([pd.DataFrame({"Date": d["date"], "Type": "Day", "Forecast sales": d["forecast_sales"].round(2)}),
                     pd.DataFrame({"Date": wk["week_start"], "Type": "Week", "Forecast sales": wk["forecast"].round(2)})], ignore_index=True)
    fs = '{R:Forecast sales}'
    days = Block("Next 7 days", "Date", d["date"].tolist(), key_fmt="date", name="days",
                 cols=[Col("Forecast sales", f'SUMIFS({fs},{{R:Type}},"Day",{{R:Date}},{{key}})'),
                       Col("Hours", "MAX({IN:min_hours},{C:Forecast sales}/{IN:splh})", "num1"),
                       Col("Wages", "{C:Hours}*{IN:wage}"),
                       Col("Wage %", "IFERROR({C:Wages}/{C:Forecast sales},0)", "pct", total="IFERROR({C:Wages}/{C:Forecast sales},0)"),
                       Col("People (8h shifts)", "ROUNDUP({C:Hours}/8,0)", "int")])
    weeks = Block("Next 13 weeks", "Week starting", wk["week_start"].tolist(), key_fmt="date", name="weeks",
                  cols=[Col("Forecast sales", f'SUMIFS({fs},{{R:Type}},"Week",{{R:Date}},{{key}})'),
                        Col("Hours", "MAX({IN:min_hours}*7,{C:Forecast sales}/{IN:splh})", "num1"),
                        Col("Wages", "{C:Hours}*{IN:wage}"),
                        Col("Wage %", "IFERROR({C:Wages}/{C:Forecast sales},0)", "pct", total="IFERROR({C:Wages}/{C:Forecast sales},0)"),
                        Col("FTE (40h)", "{C:Hours}/40", "num1", total="avg")])
    return WorkbookPlan(
        title="Roster & labour plan", subtitle=f"{ctx.store} · from {d['date'].min():%d %b %Y}",
        raw=raw, raw_formats={"Date": "date", "Forecast sales": "money2"}, categories=[], category_label="Scope (store)",
        inputs=[("splh", "Sales per labour hour target ($)", lab["sales_per_labour_hour"], "money", "Productivity target"),
                ("min_hours", "Minimum hours per day", lab["min_hours_per_day"], "num1", "e.g. two people open to close"),
                ("wage", "Average wage rate ($/h)", lab["wage_rate"], "money2", "Include on-costs if you want the full cost")],
        blocks=[days, weeks],
        kpis=[Kpi("Hours next 7 days", "{B:days|Hours|total}", "num1"), Kpi("Wages next 7 days", "{B:days|Wages|total}"),
              Kpi("Wage % of sales", "{B:days|Wage %|total}", "pct"), Kpi("13-week wage budget", "{B:weeks|Wages|total}"),
              Kpi("13-week hours", "{B:weeks|Hours|total}", "num1"), Kpi("Average FTE", "{B:weeks|FTE (40h)|total}", "num1")],
        charts=[ChartSpec("Hours by day", "days", ["Hours"]), ChartSpec("Hours by week", "weeks", ["Hours"])],
        pivots=[PivotSpec("Forecast sales by type", "Type", "Forecast sales", caption="Forecast sales")],
        notes=_common_notes(ctx, ["Hours = forecast sales ÷ sales-per-hour target, never below the minimum.",
                                  "Change the three blue inputs on Assumptions to test other productivity or wage levels."]),
        dictionary={"Date": "Day (Type = Day) or week start (Type = Week)", "Forecast sales": "Shelly's forecast ($)"},
        signoff=["Roster approved", "Labour budget approved"])


# =====================================================================================  STOCK & REORDER
def stock_specs(ctx: Ctx, cat: str = "All") -> dict:
    rp = _sel(ctx.R["replenishment"], cat)
    r = ctx.cfg["replenishment"]
    order = rp[rp["suggested_order"] > 0].sort_values("order_value", ascending=False)
    urgent = rp[rp["status"].str.startswith("Order now")]
    blocked = rp[rp["status"].str.startswith("Blocked")]
    sup = order.groupby("supplier").agg(lines=("sku", "count"), value=("order_value", "sum")).reset_index().sort_values("value", ascending=False)
    sp = S.new(ctx, f"stock-{cat}", "stock", "Stock & reorder plan" + ("" if cat == "All" else f" · {cat}"),
               f"Just-in-time orders for {_scope(cat)} · lead time {r['lead_time_days']} days · ~95% service level", cat)
    sp["headline"] = f"Order {len(order)} lines worth {money(order['order_value'].sum())}; {len(urgent)} are below lead-time cover and need ordering today."
    sp["kpis"] = [S.kpi("Order value", order["order_value"].sum(), sub=f"{len(order)} lines"),
                  S.kpi("Order today", len(urgent), "int", tone="bad" if len(urgent) else "good", sub="below lead-time cover"),
                  S.kpi("Median days cover", rp["days_cover"].median(), "num1"),
                  S.kpi("Blocked (recall)", len(blocked), "int", tone="bad" if len(blocked) else "neutral")]
    o = order.assign(cover=order["days_cover"])
    sp["sections"].append(S.section("Orders", "Largest first. Quantities are capped by shelf life so short-life lines don't turn into waste.",
        S.table(o, [("product_name", "Product", "text"), ("category", "Category", "text"), ("supplier", "Supplier", "text"), ("est_on_hand", "On hand", "int"),
                    ("cover", "Days cover", "num1"), ("reorder_point", "Reorder point", "num1"), ("suggested_order", "Order qty", "int"),
                    ("order_value", "Order $", "money"), ("status", "Status", "text")], total={"product_name": "Total", "order_value": o["order_value"].sum()})))
    if len(sup):
        sp["sections"].append(S.section("By supplier", "",
            S.chart("hbar", "Order value by supplier", sup["supplier"], [{"name": "Order $", "values": sup["value"].tolist()}]),
            S.table(sup, [("supplier", "Supplier", "text"), ("lines", "Lines", "int"), ("value", "Order $", "money")])))
    if len(blocked):
        sp["sections"].append(S.section("Blocked", "", S.callout("Do not reorder", "; ".join(blocked["product_name"]) + ": under product recall.", "warn")))
    sp["assumptions"] = [f"Safety stock = {r['service_level_z']} × daily demand σ × √(lead {r['lead_time_days']} + review {r['review_period_days']} days).",
                         "Reorder point = demand over lead + review time + safety stock; order up to = reorder point + one review period of demand.",
                         "Order-up-to is capped at shelf-life days of demand. On-hand = last stock count minus sales since."]
    sp["risks"] = ["On-hand is estimated from the last count; a missed delivery or unrecorded waste makes it too high."]
    sp["approvals"] = ["Orders over $250 per line (governance rule)"] if (order["order_value"] > 250).any() else []
    return sp


def stock_workbook(ctx: Ctx) -> WorkbookPlan:
    rp = ctx.R["replenishment"].copy()
    rp["blocked"] = rp["status"].str.startswith("Blocked").astype(int)
    raw = rp[["sku", "product_name", "category", "supplier", "mu", "sigma", "est_on_hand", "shelf_life_days", "unit_cost", "blocked"]].rename(columns={
        "sku": "SKU", "product_name": "Product", "category": "Category", "supplier": "Supplier", "mu": "Daily demand", "sigma": "Demand sd",
        "est_on_hand": "On hand", "shelf_life_days": "Shelf life days", "unit_cost": "Unit cost", "blocked": "Blocked"}).round(3)
    r = ctx.cfg["replenishment"]
    RL = lambda col: f"INDEX({{R:{col}}},MATCH({{key}},{{R:SKU}},0))"
    prods = Block("Reorder calculation (live)", "SKU", raw.sort_values(["Category", "Product"])["SKU"].tolist(), name="prods", autofilter=True,
                  note="Change lead time, review period or service level on Assumptions and every order recalculates.",
                  cols=[Col("Product", RL("Product"), "text", total=None, width=26), Col("Category", RL("Category"), "text", total=None, width=16),
                        Col("Supplier", RL("Supplier"), "text", total=None, width=18),
                        Col("Daily demand", RL("Daily demand"), "num1", total=None), Col("On hand", RL("On hand"), "int"),
                        Col("Safety stock", f"{{IN:z}}*{RL('Demand sd')}*SQRT({{IN:lead}}+{{IN:review}})", "num1", total=None),
                        Col("Reorder point", f"MIN({{C:Daily demand}}*({{IN:lead}}+{{IN:review}})+{{C:Safety stock}},{{C:Daily demand}}*MAX(1,{RL('Shelf life days')}))", "num1", total=None),
                        Col("Order up to", f"MIN({{C:Reorder point}}+{{C:Daily demand}}*{{IN:review}},{{C:Daily demand}}*MAX(1,{RL('Shelf life days')}))", "num1", total=None),
                        Col("Order qty", f"IF(OR({RL('Blocked')}=1,{{C:On hand}}>{{C:Reorder point}}),0,ROUNDUP(MAX(0,{{C:Order up to}}-{{C:On hand}}),0))", "int"),
                        Col("Order $", f"{{C:Order qty}}*{RL('Unit cost')}"),
                        Col("Days cover", "IFERROR({C:On hand}/{C:Daily demand},0)", "num1", total=None),
                        Col("Status", f'IF({RL("Blocked")}=1,"Blocked - recall",IF({{C:Days cover}}<{{IN:lead}},"Order now",IF({{C:Order qty}}>0,"Order","OK")))', "text", total=None, width=16),
                        Col("In selection", 'IF(OR(SelCat="All",{C:Category}=SelCat),1,0)', "int")],
                  conditional=[("Order $", "bars")])
    sups = sorted(raw["Supplier"].unique())
    sup = Block("Orders by supplier", "Supplier", sups, name="sup",
                cols=[Col("Order $", "SUMIFS({BR:prods|Order $},{BR:prods|Supplier},{key},{BR:prods|In selection},1)"),
                      Col("Lines", 'COUNTIFS({BR:prods|Supplier},{key},{BR:prods|Order qty},">0",{BR:prods|In selection},1)', "int")],
                conditional=[("Order $", "bars")])
    return WorkbookPlan(
        title="Stock & reorder plan", subtitle=f"{ctx.store} · stock position at {ctx.asof:%d %b %Y}",
        raw=raw, raw_formats={"Daily demand": "num1", "Demand sd": "num1", "On hand": "int", "Unit cost": "money2"},
        categories=ctx.categories,
        inputs=[("lead", "Supplier lead time (days)", r["lead_time_days"], "num1", "Order to shelf"),
                ("review", "Review period (days)", r["review_period_days"], "num1", "How often you order"),
                ("z", "Service level (z)", r["service_level_z"], "num1", "1.65 ≈ 95% of days without a stock-out; 2.05 ≈ 98%")],
        blocks=[prods, sup],
        kpis=[Kpi("Order value", "SUMIFS({B:prods|Order $|range},{B:prods|In selection|range},1)"),
              Kpi("Lines to order", 'COUNTIFS({B:prods|Order qty|range},">0",{B:prods|In selection|range},1)', "int"),
              Kpi("Order now", 'COUNTIFS({B:prods|Status|range},"Order now",{B:prods|In selection|range},1)', "int"),
              Kpi("Blocked (recall)", 'COUNTIFS({B:prods|Status|range},"Blocked - recall",{B:prods|In selection|range},1)', "int")],
        charts=[ChartSpec("Order value by supplier", "sup", ["Order $"])],
        pivots=[PivotSpec("On hand by category and supplier", "Category", "On hand", cols="Supplier", caption="On hand")],
        notes=_common_notes(ctx, ["Safety stock = z × demand sd × √(lead + review). Reorder point = demand × (lead + review) + safety stock.",
                                  "Order up to = reorder point + one review period, capped at shelf-life days of demand.",
                                  "Recalled products are blocked (order 0)."]),
        dictionary={"Daily demand": "Average units a day, last 28 days", "Demand sd": "Day-to-day variation (standard deviation)",
                    "On hand": "Last count minus sales since", "Blocked": "1 = under product recall"},
        signoff=["Orders approved"])


# =====================================================================================  WASTE & SHRINK
def waste_specs(ctx: Ctx, cat: str = "All") -> dict:
    w = ctx.P.waste
    sp = S.new(ctx, f"waste-{cat}", "waste", "Waste & shrink report" + ("" if cat == "All" else f" · {cat}"),
               f"13 weeks to {ctx.asof:%d %b %Y} · {_scope(cat)}", cat)
    if w is None:
        sp["headline"] = "No waste file was provided, so waste can't be reported."
        return sp
    end = ctx.asof
    x = _sel(w[w["date"] > end - pd.Timedelta(days=91)], cat)
    sales = _sel(daily_cat_full(ctx)[daily_cat_full(ctx)["date"] > end - pd.Timedelta(days=91)], cat)["net_sales"].sum()
    tot = x["waste_value"].sum() + x["markdown_value"].sum()
    t = ctx.cfg["kpi_targets"]["waste_pct_of_sales"]
    x = x.assign(week=end - ((end - x["date"]).dt.days // 7) * pd.Timedelta(days=7))
    wk = x.groupby("week").agg(w=("waste_value", "sum"), m=("markdown_value", "sum")).reset_index()
    rs = x.groupby("reason").agg(v=("waste_value", "sum"), u=("units_wasted", "sum")).reset_index().sort_values("v", ascending=False)
    pr = x.groupby(["product_name", "category"]).agg(w=("waste_value", "sum"), m=("markdown_value", "sum"), u=("units_wasted", "sum")).reset_index()
    pr["tot"] = pr["w"] + pr["m"]
    pr = pr.sort_values("tot", ascending=False)
    inv = ctx.P.inventory
    shrink = pd.DataFrame()
    if inv is not None:
        iv = _sel(inv[inv["count_date"] > end - pd.Timedelta(days=91)], cat)
        shrink = iv.groupby(["product_name", "category"]).agg(units=("variance_units", "sum"), value=("variance_value", "sum"), counts=("count_date", "count")).reset_index()
        shrink = shrink[shrink["value"] < 0].sort_values("value")
    sp["headline"] = f"Waste and markdowns cost {money(tot)} in 13 weeks: {tot / sales * 100:.1f}% of sales vs a {t}% target." + (
        f" Stock counts show {money(-shrink['value'].sum())} of unexplained loss." if len(shrink) else "")
    sp["kpis"] = [S.kpi("Waste + markdown", tot, sub="13 weeks"), S.kpi("% of sales", tot / sales * 100, "pctv", tone="good" if tot / sales * 100 <= t else "bad", sub=f"target ≤{t}%"),
                  S.kpi("Top reason", rs.iloc[0]["v"] if len(rs) else 0, sub=str(rs.iloc[0]["reason"]) if len(rs) else ""),
                  S.kpi("Count shrink", -shrink["value"].sum() if len(shrink) else 0, sub="SAP vs physical, at cost", tone="bad" if len(shrink) else "neutral")]
    sp["sections"].append(S.section("Trend", "",
        S.chart("stacked", "Weekly waste and markdowns", wk["week"].dt.strftime("%d %b"),
                [{"name": "Waste (cost)", "values": wk["w"].tolist()}, {"name": "Markdowns", "values": wk["m"].tolist()}])))
    sp["sections"].append(S.section("Where it comes from", "",
        S.table(pr.head(12), [("product_name", "Product", "text"), ("category", "Category", "text"), ("u", "Units wasted", "int"),
                              ("w", "Waste $", "money"), ("m", "Markdown $", "money"), ("tot", "Total", "money")]),
        S.table(rs, [("reason", "Reason", "text"), ("u", "Units", "int"), ("v", "Waste $", "money")])))
    if len(shrink):
        sp["sections"].append(S.section("Stock count shrink", "Physical count below SAP = unexplained loss (theft, admin error, unrecorded waste).",
            S.table(shrink.head(10), [("product_name", "Product", "text"), ("category", "Category", "text"), ("units", "Units", "int"),
                                      ("value", "Value", "money"), ("counts", "Counts", "int")])))
    sp["assumptions"] = ["Waste valued at cost; markdowns valued at 50% of retail (the money given away).", "Shrink = physical count − SAP quantity, valued at cost."]
    sp["risks"] = [f"{r.product_name}: {money(r.tot)} lost" for r in pr.head(3).itertuples()]
    sp["approvals"] = ["Order-quantity cuts on the top waste lines"]
    return sp


def waste_workbook(ctx: Ctx) -> WorkbookPlan:
    w = ctx.P.waste
    end = ctx.asof
    x = w[w["date"] > end - pd.Timedelta(days=91)].copy()
    x["Week ending"] = end - ((end - x["date"]).dt.days // 7) * pd.Timedelta(days=7)
    raw = x[["date", "Week ending", "sku", "product_name", "category", "reason", "units_wasted", "waste_value", "units_marked_down", "markdown_value"]].rename(columns={
        "date": "Date", "sku": "SKU", "product_name": "Product", "category": "Category", "reason": "Reason", "units_wasted": "Units wasted",
        "waste_value": "Waste $", "units_marked_down": "Units marked down", "markdown_value": "Markdown $"}).round(2)
    s13 = daily_cat_full(ctx)
    s13 = s13[s13["date"] > end - pd.Timedelta(days=91)].groupby("category")["net_sales"].sum().reset_index().rename(columns={"net_sales": "sales_13w"})
    cats = Block("By category (13 weeks)", "Category", ctx.categories, name="cats",
                 cols=[Col("Waste $", "SUMIFS({R:Waste $},{R:Category},{key})"), Col("Markdown $", "SUMIFS({R:Markdown $},{R:Category},{key})"),
                       Col("Total", "{C:Waste $}+{C:Markdown $}"),
                       Col("Sales 13w", "IFERROR(INDEX({L:sales.sales_13w},MATCH({key},{L:sales.category},0)),0)", note="Lookup: category sales, same 13 weeks"),
                       Col("% of sales", "IFERROR({C:Total}/{C:Sales 13w},0)", "pct", total="IFERROR({C:Total}/{C:Sales 13w},0)"),
                       Col("vs target", "{C:% of sales}-{IN:target}", "pct", total="IFERROR({C:Total}/{C:Sales 13w},0)-{IN:target}")],
                 conditional=[("Total", "bars")])
    weeks = sorted(raw["Week ending"].unique())
    wk = Block("By week", "Week ending", weeks, key_fmt="date", name="weeks",
               cols=[Col("Waste $", "SUMIFS({R:Waste $},{R:Category},{SEL},{R:Week ending},{key})"),
                     Col("Markdown $", "SUMIFS({R:Markdown $},{R:Category},{SEL},{R:Week ending},{key})"),
                     Col("Total", "{C:Waste $}+{C:Markdown $}")])
    reasons = Block("By reason", "Reason", sorted(raw["Reason"].astype(str).unique()), name="reasons",
                    cols=[Col("Units", "SUMIFS({R:Units wasted},{R:Category},{SEL},{R:Reason},{key})", "int"),
                          Col("Waste $", "SUMIFS({R:Waste $},{R:Category},{SEL},{R:Reason},{key})")])
    extra = {}
    inv = ctx.P.inventory
    if inv is not None:
        iv = inv[inv["count_date"] > end - pd.Timedelta(days=91)]
        sh = iv.groupby(["sku", "product_name", "category"]).agg(Units=("variance_units", "sum"), Value=("variance_value", "sum"), Counts=("count_date", "count")).reset_index()
        sh = sh[sh["Value"] < 0].sort_values("Value")
        sh.columns = ["SKU", "Product", "Category", "Variance units", "Variance value", "Counts"]
        extra["Stock counts"] = sh
    return WorkbookPlan(
        title="Waste & shrink report", subtitle=f"{ctx.store} · 13 weeks to {end:%d %b %Y}",
        raw=raw, raw_formats={"Date": "date", "Week ending": "date", "Waste $": "money2", "Markdown $": "money2", "Units wasted": "int", "Units marked down": "int"},
        categories=ctx.categories, lookups={"sales": s13},
        inputs=[("target", "Waste + markdown target (% of sales)", ctx.cfg["kpi_targets"]["waste_pct_of_sales"] / 100, "pct", "config.yaml › kpi_targets")],
        blocks=[cats, wk, reasons],
        kpis=[Kpi("Waste + markdown", "SUMIFS({R:Waste $},{R:Category},{SEL})+SUMIFS({R:Markdown $},{R:Category},{SEL})"),
              Kpi("Waste at cost", "SUMIFS({R:Waste $},{R:Category},{SEL})"), Kpi("Markdowns", "SUMIFS({R:Markdown $},{R:Category},{SEL})"),
              Kpi("Units wasted", "SUMIFS({R:Units wasted},{R:Category},{SEL})", "int")],
        charts=[ChartSpec("Waste and markdowns by week", "weeks", ["Waste $", "Markdown $"], "stacked"),
                ChartSpec("Total by category", "cats", ["Total"])],
        pivots=[PivotSpec("Waste $ by category and reason", "Category", "Waste $", cols="Reason", caption="Waste $"),
                PivotSpec("Waste $ by product (filter Category)", "Product", "Waste $", page="Category", caption="Waste $")],
        extra_sheets=extra,
        notes=_common_notes(ctx, ["Waste at cost; markdowns at 50% of retail.", "Stock counts sheet: physical below SAP, last 13 weeks."]),
        dictionary={"Waste $": "Units wasted × unit cost", "Markdown $": "Units marked down × 50% of retail price", "Reason": "Waste reason code"},
        signoff=["Waste actions agreed"])
