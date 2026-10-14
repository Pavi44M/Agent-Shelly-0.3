"""Shelly's mind pack (v2.4): ask anything, cross-department huddles, agent memory. Synthetic data."""
from __future__ import annotations

from ..core.skills import skill


def _mind():
    import importlib.util
    from pathlib import Path
    p = Path(__file__).resolve().parents[2] / "scripts/build_mind.py"
    spec = importlib.util.spec_from_file_location("build_mind", p); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod.build()


@skill("mind.ask", pack="mind", summary="Answer a plain question about any of the four businesses with today's numbers and a link to the full picture",
       inputs=["every page's data"], outputs=["answer", "link"], triggers=["ask", "question", "how are we doing"])
def ask():
    return _mind()["answers"]


@skill("mind.huddle", pack="mind", summary="Agents from different departments agree one plan (constraints checked, conflicts resolved, memory quoted) for one sign-off",
       inputs=["event bus", "budgets", "docks", "rosters"], outputs=["plan", "sign-off"], triggers=["huddle", "plan", "cross-department"], confirm=True)
def huddle():
    return _mind()["huddles"]


@skill("mind.memory", pack="mind", summary="What each agent did before, what happened and the lesson it keeps (only from recorded events)",
       inputs=["skill lab", "tuning logs", "exams", "decisions"], outputs=["memories"], triggers=["memory", "last time", "lessons"])
def memory():
    return _mind()["memory"]
