"""Shelly's mind · agent memory (v2.4): what each agent did before, what happened, and the lesson it keeps.

Memories come only from things Shelly really recorded (no invented history): Skill Lab tunings kept or rejected,
Loss Prevention tuning rounds, the forecast exams, decisions raised for a person, supplier track records,
budget variances and dock clashes. Each memory has the agent, the date, what happened, the outcome, and the
lesson the agent now applies. Huddles and answers quote them ("last time ...").
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def build(shift=None, ops=None, group=None) -> list:
    M = []
    def add(agent, when, kind, what, outcome, lesson, topic):
        M.append({"agent": agent, "when": when, "kind": kind, "what": what, "outcome": outcome, "lesson": lesson, "topic": topic})
    v = _js("docs/data/vision.js")["lab"]
    for c in v["changes"][-8:]:
        add("vision-lab", c["day"], "tuning", f"Tried {c['knob']} {c['from']} → {c['to']} for {c['skill']}",
            "kept" if c.get("kept") else "rejected", c["why"] if c.get("kept") else f"Rejected: {c['why']}. Rest that value for 4 days before trying again.", "vision")
    lp = _js("docs/data/lp.js")["tuning"]
    for c in lp["log"][:6]:
        add("lp-cases", f"round {c['round']}", "tuning", f"Tried {c['name']} {c['from']} → {c['to']}", "kept" if c["kept"] else "rejected",
            f"On held-out days: {c['held']['false_per_day']} false cases a day, {round(c['held']['recall'] * 100)}% of losses caught. Only keep a change the held-out days agree with.", "loss")
    if shift:
        m = shift["model"]
        add("store-shift", shift["day"], "exam", "14-day forecast exam, one day ahead",
            f"14 days: naive {m['exam14']['wape']['naive']}%, weekday {m['exam14']['wape']['weekday']}%, sensing {m['exam14']['wape']['sensing']}%",
            f"One fortnight is not enough: {m['why']}.", "forecast")
        r = shift["lab"]
        add("store-ordering", shift["day"], "exam", "Reorder safety stock tested on 14 days",
            f"chose setting {r['reorder_chosen']} ({next(t['fill'] for t in r['reorder_trials'] if t['k'] == r['reorder_chosen'])}% on the shelf)",
            "Leaner settings left too many empty shelves; keep the leanest setting that still holds the target.", "stock")
        add("store-shift", shift["day"], "handover", "Closing report", f"takings {shift['closing']['error_pct']:+.1f}% vs forecast; {shift['closing']['tasks']['open']} task(s) handed over",
            "Sign-offs left open at 09:30 end up in the handover: raise them in the morning briefing.", "shift")
    if ops:
        for s in ops["totara"]["scorecards"][:3]:
            add("totara-suppliers", ops["totara"]["asof"], "track record", f"{s['name']}: on time {s['on_time']}%, in full {s['in_full']}%", f"grade {s['grade']}",
                f"Order earlier from {s['name']} and keep {s['lead_sd'] * 1.65:.0f} days of buffer; {s['ask']}.", "suppliers")
        for d in ops["gateway"]["docks"]:
            for c in d["clashes"][:1]:
                add("gw-warehouse", ops["gateway"]["asof"], "clash", f"{c['truck']} waited {c['wait']} minutes at {d['name']}", "clash",
                    f"Cold loads queue for the {d['chilled_docks']} chilled docks around {c['window']}: stagger bookings by 30 minutes.", "docks")
    if group:
        for v_ in group["variances"]:
            add("fin-head", group["pnl"]["month"], "variance", f"{v_['business']} {v_['line'].lower()} {v_['var']:+,} against budget", "explained", v_["why"], "finance")
    store = _js("docs/data/shelly-data.js")
    for d in store["decisions"][:4]:
        add("group-governance", d["asof"], "decision", d["statement"], "waiting for a person", f"Confidence {round(d['confidence'] * 100)}%: suggest, never decide, in the {d['area'].lower()} area.", "decisions")
    return M


def recall(memories: list, topic: str, n: int = 2) -> list:
    return [m for m in memories if m["topic"] == topic][:n]
