"""
The 'thinking' layer: turns model outputs into prioritised, costed actions,
the way a category / commercial manager would.

1. Rules engine (always on, deterministic, auditable) produces the action list.
2. Optional LLM (Ollama locally - the OpenJarvis stack - or Claude API) rewrites the
   executive summary in natural language. It only sees the computed facts, never
   raw data, and it can't change a number.
"""
from __future__ import annotations

import json
import os
import urllib.request

import pandas as pd

PRIORITY = {"P1": "Today", "P2": "This week", "P3": "Next review"}


def _fmt(v: float) -> str:
    return f"${abs(v):,.0f}"


def build_actions(R: dict, cfg: dict) -> list[dict]:
    acts: list[dict] = []
    k = R["commercial"]["kpis"]
    t = cfg["kpi_targets"]
    an = R["anomalies"]

    def add(pri, area, action, why, impact, owner):
        acts.append({"priority": pri, "when": PRIORITY[pri], "area": area, "action": action,
                     "why": why, "weekly_impact_nzd": round(float(impact), 0), "owner": owner})

    # ---- compliance first: non-negotiable
    rc = R["compliance"]["recalls"]
    for r in rc.itertuples() if len(rc) else []:
        add("P1", "Compliance - recall",
            f"Pull {r.product_name} (GTIN {r.gtin}) from shelf and quarantine ~{int(r.est_on_hand)} units; "
            f"block the item at POS and follow the supplier recall steps",
            f"Supplier recall {r.notice_date}: {r.reason}. {r.units_sold_last_7d} units sold in the last 7 days.",
            0, "Duty Manager")
    gs1 = R["compliance"]["gs1_invalid"]
    if len(gs1):
        add("P2", "Data quality - GS1",
            f"Fix {len(gs1)} invalid barcode(s) in the product master: " + ", ".join(gs1["product_name"]),
            "An invalid GTIN check digit means scan failures, wrong prices and recall matching gaps.",
            0, "Admin / SAP")
    if R["compliance"]["liquor_delivery_units"]:
        add("P3", "Compliance - liquor",
            f"Spot-check ID verification on {R['compliance']['liquor_delivery_units']} liquor units sent by delivery this week",
            "Sale and Supply of Alcohol Act 2012 - remote sales need age verification at the door.", 0,
            "Licensee / Duty Manager")

    # ---- exceptions from anomaly detection
    for r in an.itertuples() if len(an) else []:
        imp = r.impact_nzd
        if r.type.startswith("Channel outage"):
            add("P1", "Delivery channel",
                f"Check the {r.item.replace('_', ' ').title()} tablet/app on shift start and add it to the opening checklist",
                f"{r.item} fell to {r.detail} on {r.date}.", imp, "Duty Manager")
        elif r.type.startswith("Sales drop"):
            add("P1", "Availability",
                f"Check stock and on-shelf availability for {r.item}; raise an emergency order if gapped",
                f"{r.date}: {r.detail} - looks like a stock-out, not a demand drop.", imp, "Duty Manager")
        elif r.type.startswith("Shrinkage"):
            add("P2", "Shrinkage", f"Re-count {r.item}, move to a higher-visibility location, and review CCTV around the gap",
                f"{r.detail}. Loss at cost {_fmt(imp)}.", imp, "Store Manager")
        elif r.type.startswith("Count gain"):
            add("P2", "SAP / receiving", f"Check the GR for {r.item} against the supplier invoice and raise a DDN if needed",
                f"{r.detail} - usually an extra case received but not booked.", imp, "Admin / SAP")
        elif r.type.startswith("Waste"):
            add("P2", "Waste", f"Cut the {r.item} order by ~30% and move markdowns to 2pm",
                f"{r.detail}.", imp, "Duty Manager")
        elif r.type.startswith("Sustained decline"):
            add("P2", "Category", f"Investigate {r.item}: price, quality, range position or a new competitor",
                f"{r.detail} over 14 days, and it isn't seasonal (last year held steady).", imp, "Store Manager")
        elif r.type.startswith("Sales spike") and imp >= 100:
            add("P3", "Demand", f"Find out what drove the {r.item} spike (local event? competitor out?) and hold extra cover if it repeats",
                f"{r.date}: {r.detail}.", imp, "Duty Manager")

    # ---- KPI vs target
    cur = k["current"]
    if cur["waste_pct"] > t["waste_pct_of_sales"]:
        add("P2", "Waste", "Tighten short-life ordering using the forecast and reorder list",
            f"Waste + markdown {cur['waste_pct']:.1f}% of sales vs {t['waste_pct_of_sales']}% target.",
            -(cur["waste_pct"] - t["waste_pct_of_sales"]) / 100 * cur["sales"], "Store Manager")
    if cur["gm_pct"] < t["gross_margin_pct"]:
        add("P2", "Margin", "Review promo depth and mix: margin is below target",
            f"GM {cur['gm_pct']:.1f}% vs {t['gross_margin_pct']}% target.",
            -(t["gross_margin_pct"] - cur["gm_pct"]) / 100 * cur["sales"], "Owner")
    if k["vs_budget_pct"] < -3:
        pl = R["commercial"]["category_pl"]
        worst = pl.nsmallest(2, "vs_budget")
        add("P2", "Budget", "Recovery plan for the categories furthest behind budget: " + ", ".join(worst.index),
            f"Store {k['vs_budget_pct']:+.1f}% vs budget; " + "; ".join(
                f"{c} {_fmt(v)} behind" for c, v in worst["vs_budget"].items()),
            worst["vs_budget"].sum(), "Owner")

    # ---- replenishment
    rp = R["replenishment"]
    urgent = rp[rp["status"].str.startswith("Order now")]
    if len(urgent):
        add("P1", "Replenishment", f"Place today's order: {len(urgent)} lines are below lead-time cover "
            f"(${urgent['order_value'].sum():,.0f} at cost). Top lines: " + ", ".join(urgent.head(5)["product_name"]),
            "JIT reorder point = lead-time demand + safety stock (95% service level).",
            0, "Duty Manager")

    # ---- range review
    ar = R["assortment"]
    delist = ar[ar["range_action"].str.startswith("Review / delist")]
    if len(delist):
        add("P3", "Range", "Range review candidates (C-class and high waste): " + ", ".join(delist["product_name"]),
            "Space could go to A-class lines that are stocking out.", 0, "Owner")

    # ---- labour
    lp = R["labour"]
    add("P3", "Rostering", f"Roster {lp['hours_needed'].sum():.0f} hours next week; peak day {lp.loc[lp['forecast_sales'].idxmax(), 'day']}",
        f"Forecast sales ${lp['forecast_sales'].sum():,.0f} at ${cfg['labour']['sales_per_labour_hour']}/labour hour, "
        f"wage cost {lp['wage_cost'].sum() / lp['forecast_sales'].sum() * 100:.1f}% of sales.", 0, "Store Manager")

    order = {"P1": 0, "P2": 1, "P3": 2}
    acts.sort(key=lambda a: (order[a["priority"]], not a["area"].startswith("Compliance"), a["weekly_impact_nzd"]))
    return acts


def rules_summary(R: dict, acts: list[dict]) -> str:
    k = R["commercial"]["kpis"]
    c = k["current"]
    lb = R["forecast"]["model_leaderboard"]
    fc_total = R["forecast"]["forecast"]["forecast_sales"].sum()
    p1 = [a for a in acts if a["priority"] == "P1"]
    best = lb.iloc[0]
    parts = [
        f"Sales were ${c['sales']:,.0f} this week ({k['wow_pct']:+.1f}% on last week, {k['yoy_pct']:+.1f}% on last year, "
        f"{k['vs_budget_pct']:+.1f}% vs budget). Gross margin held at {c['gm_pct']:.1f}%, "
        f"and delivery channels made up {c['delivery_share_pct']:.1f}% of sales.",
        f"{len(p1)} items need action today" + (f", starting with: {p1[0]['action'].split(';')[0]}." if p1 else "."),
        f"Next 7 days forecast: ${fc_total:,.0f}. {best['model']} was the most accurate model in backtesting "
        f"(WAPE {best['wape']:.1f}%).",
    ]
    return " ".join(parts)


def _facts_for_llm(R, acts) -> dict:
    k = R["commercial"]["kpis"]
    return {
        "kpis": {kk: round(float(v), 1) for kk, v in k["current"].items()},
        "wow_pct": round(k["wow_pct"], 1), "yoy_pct": round(k["yoy_pct"], 1),
        "vs_budget_pct": round(k["vs_budget_pct"], 1),
        "forecast_next_7d": round(float(R["forecast"]["forecast"]["forecast_sales"].sum()), 0),
        "actions": acts[:10],
    }


PROMPT = ("You are a retail commercial analyst writing the Monday digest for a convenience store owner in Auckland. "
          "Using ONLY the facts in the JSON, write a 120-word executive summary: performance, the 3 most important "
          "actions and why. Don't invent numbers. Plain NZ English, no bullet points.\n\nFACTS:\n")


def llm_summary(R, acts, cfg) -> tuple[str, str]:
    """Returns (summary, engine_used). Falls back to rules if the LLM is unavailable."""
    llm = cfg.get("llm", {})
    provider = llm.get("provider", "rules")
    facts = json.dumps(_facts_for_llm(R, acts), default=str)
    try:
        if provider == "ollama":
            body = json.dumps({"model": llm["ollama_model"], "prompt": PROMPT + facts, "stream": False}).encode()
            req = urllib.request.Request(f"{llm['ollama_url']}/api/generate", body, {"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())["response"].strip(), f"Ollama ({llm['ollama_model']})"
        if provider == "anthropic" and os.environ.get("ANTHROPIC_API_KEY"):
            body = json.dumps({"model": llm["anthropic_model"], "max_tokens": 400,
                               "messages": [{"role": "user", "content": PROMPT + facts}]}).encode()
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", body, {
                "Content-Type": "application/json", "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                "anthropic-version": "2023-06-01"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())["content"][0]["text"].strip(), f"Claude ({llm['anthropic_model']})"
    except Exception as e:  # never let the LLM break the digest
        return rules_summary(R, acts), f"Rules engine (LLM unavailable: {type(e).__name__})"
    return rules_summary(R, acts), "Rules engine"


def actions_frame(acts: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(acts)
