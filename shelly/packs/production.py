"""Production pack: OEE by line, scrap/yield cost, schedule adherence."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..core.skills import skill
from .common import Finding, SkillResult, register_pack

UNIT_COST = 0.35


def demo(seed: int = 5) -> dict:
    rng = np.random.default_rng(seed)
    days = pd.date_range(end="2026-09-25", periods=28, freq="D")
    rows = []
    for d in days:
        if d.dayofweek == 6:
            continue
        for line, ideal, down, scrap in [("Line 1", 60, 35, 0.02), ("Line 2", 45, 70, 0.03), ("Line 3", 80, 30, 0.07)]:
            planned = 450
            dt = max(0, rng.normal(down, 12))
            run = planned - dt
            units = int(run * ideal * rng.uniform(0.78, 0.95))
            good = int(units * (1 - max(0, rng.normal(scrap, 0.01))))
            sched = int(planned * ideal * 0.8)
            rows.append((d, line, planned, round(dt, 0), ideal, units, good, sched))
    return {"runs": pd.DataFrame(rows, columns=["date", "line", "planned_min", "downtime_min", "ideal_units_per_min",
                                                "units", "good_units", "scheduled_units"])}


@skill("production.oee", pack="production", summary="OEE = availability × performance × quality, by line",
       inputs=["runs (date, line, planned_min, downtime_min, ideal rate, units, good_units)"], outputs=["OEE table", "loss focus"],
       triggers=["OEE", "which line is the bottleneck?", "production efficiency"])
def oee(d: dict) -> SkillResult:
    """World-class OEE is ~85%. Shelly points each line at its biggest loss (availability, speed or quality)."""
    r = d["runs"].groupby("line").agg(planned=("planned_min", "sum"), down=("downtime_min", "sum"), units=("units", "sum"),
                                      good=("good_units", "sum"), ideal=("ideal_units_per_min", "mean"))
    r["availability"] = (r["planned"] - r["down"]) / r["planned"]
    r["performance"] = r["units"] / ((r["planned"] - r["down"]) * r["ideal"])
    r["quality"] = r["good"] / r["units"]
    r["oee"] = r["availability"] * r["performance"] * r["quality"]
    f = []
    for line, x in r.iterrows():
        losses = {"availability (downtime)": 1 - x.availability, "performance (speed)": 1 - x.performance, "quality (scrap)": 1 - x.quality}
        worst = max(losses, key=losses.get)
        if x.oee < 0.65:
            gain_units = (0.65 - x.oee) * x.planned * x.ideal / 4
            f.append(Finding("Production", f"{line}: attack {worst}, OEE {x.oee * 100:.0f}% vs 65% floor",
                             f"availability {x.availability:.0%}, performance {x.performance:.0%}, quality {x.quality:.0%}",
                             gain_units * UNIT_COST * 0.3, "P2", "Production Manager", 0.7, "production:oee"))
    out = r[["availability", "performance", "quality", "oee"]].mul(100).round(1).reset_index()
    return SkillResult("OEE by line (4 weeks, %)", out, f, {"Site OEE": f"{(r['oee'] * r['planned']).sum() / r['planned'].sum() * 100:.0f}%"})


@skill("production.scrap", pack="production", summary="Scrap rate and scrap cost by line",
       inputs=["runs"], outputs=["scrap table"], triggers=["scrap", "yield", "waste in production"])
def scrap(d: dict) -> SkillResult:
    r = d["runs"].groupby("line").agg(units=("units", "sum"), good=("good_units", "sum"))
    r["scrap_pct"] = (1 - r["good"] / r["units"]) * 100
    r["scrap_cost_4w"] = (r["units"] - r["good"]) * UNIT_COST
    f = [Finding("Quality", f"{line}: root-cause scrap at {x.scrap_pct:.1f}% (${x.scrap_cost_4w:,.0f} in 4 weeks)",
                 "above the 5% threshold; start with changeovers and first-off checks", -x.scrap_cost_4w / 4, "P2", "Quality Lead", 0.65, "production:scrap")
         for line, x in r.iterrows() if x.scrap_pct > 5]
    return SkillResult("Scrap", r.reset_index().round(1), f, {"Scrap cost (4 wks)": f"${r['scrap_cost_4w'].sum():,.0f}"},
                       f"Unit cost assumed ${UNIT_COST:.2f}.")


@skill("production.schedule_adherence", pack="production", summary="Actual vs scheduled output",
       inputs=["runs"], outputs=["adherence by line"], triggers=["schedule adherence", "are we hitting plan?"])
def schedule_adherence(d: dict) -> SkillResult:
    r = d["runs"].groupby("line").agg(good=("good_units", "sum"), sched=("scheduled_units", "sum"))
    r["adherence_pct"] = r["good"] / r["sched"] * 100
    f = [Finding("Planning", f"{line} is producing {x.adherence_pct:.0f}% of schedule: re-plan or fix capacity",
                 "persistent under-delivery pushes stock-outs downstream", 0, "P2", "Planner", 0.6, "production:schedule")
         for line, x in r.iterrows() if x.adherence_pct < 90]
    return SkillResult("Schedule adherence", r.reset_index().round(1), f)


register_pack("production", "Production & manufacturing", demo, ["production.oee", "production.scrap", "production.schedule_adherence"])
