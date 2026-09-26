"""Warehousing pack: ABC-XYZ slotting, pick productivity, capacity utilisation."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..core.skills import skill
from .common import Finding, SkillResult, register_pack


def demo(seed: int = 3) -> dict:
    rng = np.random.default_rng(seed)
    days = pd.date_range(end="2026-09-25", periods=56, freq="D")
    skus = [f"S{i:04d}" for i in range(1, 201)]
    pop = rng.pareto(1.2, len(skus)) + 0.2
    zone = rng.choice(["Golden (A)", "Mid (B)", "Back (C)"], len(skus), p=[0.2, 0.3, 0.5])
    picks = []
    for d in days:
        wk = 0.6 if d.dayofweek >= 5 else 1.0
        for s, p, z in zip(skus, pop, zone):
            lines = rng.poisson(p * wk * (rng.uniform(0.2, 1.8) if rng.random() < 0.2 else 1))
            if lines:
                picks.append((d, s, lines, lines * int(rng.integers(1, 6)), z))
    pickers = [f"P{i}" for i in range(1, 9)]
    hours = [(d, pk, round(rng.uniform(6, 8), 1), int(rng.normal(95 if pk != "P7" else 58, 10) * 7))
             for d in days if d.dayofweek < 6 for pk in pickers]
    return {"picks": pd.DataFrame(picks, columns=["date", "sku", "lines", "units", "current_zone"]),
            "labour": pd.DataFrame(hours, columns=["date", "picker", "hours", "lines_picked"]),
            "capacity": {"pallet_locations": 1800, "occupied": 1596, "weekly_growth_pct": 0.6}}


@skill("warehousing.abc_xyz", pack="warehousing", summary="ABC (velocity) × XYZ (variability) classification and slotting moves",
       inputs=["picks (date, sku, lines, current_zone)"], outputs=["ABC-XYZ matrix", "re-slot proposals"], confirm=True,
       triggers=["slotting", "ABC XYZ", "which SKUs should be in the golden zone?"])
def abc_xyz(d: dict) -> SkillResult:
    """A = top 80% of pick lines, B = next 15%, C = last 5%. X/Y/Z = daily coefficient of variation < 0.5 / < 1.0 / ≥ 1.0.
    Fast, steady movers (AX, AY) belong in the golden zone. Re-slots move physical stock, so they're proposals."""
    p = d["picks"]
    daily = p.pivot_table(index="date", columns="sku", values="lines", aggfunc="sum", fill_value=0)
    t = pd.DataFrame({"lines": daily.sum(), "cv": daily.std() / daily.mean().replace(0, np.nan)})
    t = t.sort_values("lines", ascending=False)
    t["cum"] = t["lines"].cumsum() / t["lines"].sum()
    t["abc"] = np.where(t["cum"] <= 0.8, "A", np.where(t["cum"] <= 0.95, "B", "C"))
    t["xyz"] = np.where(t["cv"] < 0.5, "X", np.where(t["cv"] < 1.0, "Y", "Z"))
    t = t.join(p.groupby("sku")["current_zone"].first())
    t["target_zone"] = np.where(t["abc"] == "A", "Golden (A)", np.where(t["abc"] == "B", "Mid (B)", "Back (C)"))
    moves = t[(t["abc"] == "A") & (t["current_zone"] != "Golden (A)")]
    mat = pd.crosstab(t["abc"], t["xyz"])
    travel_saving_h = moves["lines"].sum() / 8 * 6 / 3600   # ~6 s saved per pick line, per day
    f = [Finding("Slotting", f"Re-slot {len(moves)} A-class SKUs into the golden zone",
                 f"they're {moves['lines'].sum() / t['lines'].sum() * 100:.0f}% of pick lines but sit in mid/back zones; ~{travel_saving_h:.1f} picker-hours/day saved",
                 travel_saving_h * 5 * 30, "P2", "Warehouse Manager", 0.7, "warehousing:slotting")] if len(moves) else []
    return SkillResult("ABC-XYZ matrix (SKU counts)", mat.reset_index(), f,
                       {"A SKUs": int((t["abc"] == "A").sum()), "Misplaced A SKUs": len(moves)},
                       "Assumes ~6 s travel saved per pick line when A items move to the golden zone and $30/h labour.")


@skill("warehousing.productivity", pack="warehousing", summary="Pick productivity (lines/hour) by picker, with coaching flags",
       inputs=["labour (date, picker, hours, lines_picked)"], outputs=["productivity table"], triggers=["pick rate", "lines per hour"])
def productivity(d: dict) -> SkillResult:
    """Lines per hour over the period. Pickers under 70% of the median get a coaching check (training, equipment,
    zone allocation), never an automatic performance judgement."""
    l = d["labour"].groupby("picker").agg(hours=("hours", "sum"), lines=("lines_picked", "sum"))
    l["lines_per_hour"] = l["lines"] / l["hours"]
    med = l["lines_per_hour"].median()
    l["vs_median_pct"] = (l["lines_per_hour"] / med - 1) * 100
    f = [Finding("People", f"Coaching check-in with {pk}: pick rate {r.lines_per_hour:.0f}/h vs team median {med:.0f}/h",
                 "look at training, zone allocation and equipment first; this is a conversation, not a verdict",
                 0, "P3", "Shift Supervisor", 0.5, "warehousing:productivity") for pk, r in l[l["vs_median_pct"] < -30].iterrows()]
    return SkillResult("Pick productivity", l.reset_index().round(1), f, {"Team median": f"{med:.0f} lines/h"})


@skill("warehousing.capacity", pack="warehousing", summary="Storage utilisation and weeks until full",
       inputs=["capacity (locations, occupied, growth)"], outputs=["utilisation forecast"], triggers=["warehouse capacity", "how full are we?"])
def capacity(d: dict) -> SkillResult:
    c = d["capacity"]
    util = c["occupied"] / c["pallet_locations"] * 100
    g = c["weekly_growth_pct"] / 100
    weeks_to_95 = np.log(0.95 * c["pallet_locations"] / c["occupied"]) / np.log(1 + g) if util < 95 else 0
    f = [Finding("Capacity", f"Plan overflow storage or a range clean-out: {util:.0f}% full, 95% in ~{weeks_to_95:.0f} weeks",
                 "above ~90% utilisation, putaway and picking slow down sharply", 0, "P2" if weeks_to_95 < 12 else "P3",
                 "Operations Manager", 0.65, "warehousing:capacity")] if util > 85 else []
    return SkillResult("Capacity", pd.DataFrame([{"utilisation_pct": round(util, 1), "weeks_to_95pct": round(float(weeks_to_95), 1)}]), f,
                       {"Utilisation": f"{util:.0f}%"})


register_pack("warehousing", "Warehousing & logistics", demo,
              ["warehousing.abc_xyz", "warehousing.productivity", "warehousing.capacity"])
