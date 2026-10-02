"""Orchestrator: which department agent takes a question.

1. The relevance check (shelly.core.router) decides in or out of scope and the best skill.
2. Every agent is scored: trigger-phrase overlap (x2), mission overlap (x0.5),
   +1.5 if it owns the router's skill, +0.75 if the question names its business.
3. The top score wins; below 1.5 the question goes to the Briefing agent.
"""
from __future__ import annotations

import re

from .registry import AGENTS, BUSINESSES, DEPARTMENTS

_STOP = {"the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "is", "are", "what", "which", "how", "do", "i", "we",
         "my", "our", "this", "that", "be", "it", "me", "need", "will", "can", "should", "with", "at", "by", "any"}


def _words(t: str) -> set:
    return {w[:-1] if len(w) > 4 and w.endswith("s") else w for w in re.findall(r"[a-zāēīōū0-9]+", t.lower()) if w not in _STOP and len(w) > 2}


def _score(agent, q: set) -> float:
    trig = set().union(*[_words(t) for t in agent.triggers]) if agent.triggers else set()
    return 2 * len(q & trig) + 0.5 * len(q & _words(agent.mission + " " + agent.name))


def ask(text: str) -> dict:
    from ..core.router import route
    r = route(text)
    q = _words(text)
    biz_hint = "totara" if re.search(r"medic|t[oō]tara|hospital|medsafe|wand|pharma|clinic", text, re.I) else \
               "store" if re.search(r"store|shop|four square|uber|roster|liquor|bakery|dairy", text, re.I) else None
    if not r.in_scope:
        return {"in_scope": False, "advice": r.advice, "kind": r.kind}
    def total(a):   # trigger/mission overlap, plus a bonus when the agent owns the router's best skill
        return _score(a, q) + (1.5 if r.skill and r.skill in a.skills else 0) + (0.75 if biz_hint and a.business == biz_hint else 0)
    best = max(AGENTS, key=total)
    if total(best) < 1.5:
        return {"in_scope": True, "agent": None, "skill": r.skill,
                "advice": "In scope, but no single department owns it: the Briefing agent will answer from the weekly results."}
    dep = next(d for d in DEPARTMENTS if d.id == best.department)
    biz = next(b for b in BUSINESSES if b["id"] == best.business)
    return {"in_scope": True, "skill": r.skill, "agent": best.id, "agent_name": best.name, "department": dep.name,
            "business": biz["name"], "autonomy": best.autonomy, "owner": best.owner, "page": best.page}
