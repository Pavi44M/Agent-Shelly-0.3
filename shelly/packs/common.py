"""Shared helpers for industry packs: findings format, pack runner, markdown report."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pandas as pd

PACKS: dict[str, dict] = {}   # name -> {"demo": fn, "pipeline": [skill names], "title": str}


@dataclass
class Finding:
    area: str
    action: str
    why: str
    weekly_impact_nzd: float = 0.0
    priority: str = "P2"
    owner: str = "Manager"
    confidence: float = 0.6
    rule: str = ""

    def as_action(self) -> dict:
        return {"area": self.area, "action": self.action, "why": self.why, "weekly_impact_nzd": round(self.weekly_impact_nzd, 0),
                "priority": self.priority, "owner": self.owner, "confidence": self.confidence,
                "rule": self.rule or f"{self.area}", "when": {"P1": "Today", "P2": "This week", "P3": "Next review"}[self.priority]}


@dataclass
class SkillResult:
    title: str
    table: pd.DataFrame
    findings: list = field(default_factory=list)
    kpis: dict = field(default_factory=dict)
    note: str = ""


def register_pack(name: str, title: str, demo, pipeline: list[str]):
    PACKS[name] = {"title": title, "demo": demo, "pipeline": pipeline}


def run_pack(name: str, data: dict | None = None) -> dict:
    from ..core.skills import REGISTRY
    pk = PACKS[name]
    data = data or pk["demo"]()
    results = {s: REGISTRY[s](data) for s in pk["pipeline"]}
    findings = [f for r in results.values() for f in r.findings]
    order = {"P1": 0, "P2": 1, "P3": 2}
    findings.sort(key=lambda f: (order[f.priority], -abs(f.weekly_impact_nzd)))
    return {"pack": name, "title": pk["title"], "results": results, "findings": findings}


def pack_markdown(res: dict, decisions: list[dict] | None = None) -> str:
    md = [f"# Shelly · {res['title']} report", f"_Generated {date.today():%d %b %Y} · demo data unless stated_", ""]
    md += ["## Actions", "", "| Priority | Area | Action | $/week | Confirm? |", "|---|---|---|---:|---|"]
    dec = {d["statement"]: d for d in (decisions or [])}
    for f in res["findings"]:
        st = dec.get(f.action, {}).get("status", "")
        md.append(f"| {f.priority} | {f.area} | {f.action} <br><sub>{f.why}</sub> | {f.weekly_impact_nzd:+,.0f} | "
                  f"{'⏳ ' + dec[f.action]['id'] if st == 'pending' else ('auto' if st else '')} |")
    for key, r in res["results"].items():
        md += ["", f"## {r.title}  (`{key}`)", ""]
        if r.kpis:
            md.append(" · ".join(f"**{k}** {v}" for k, v in r.kpis.items()))
            md.append("")
        md.append(r.table.head(15).to_markdown(index=False, floatfmt=".1f"))
        if r.note:
            md += ["", f"_{r.note}_"]
    return "\n".join(md) + "\n"
