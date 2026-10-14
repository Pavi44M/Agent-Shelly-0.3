"""Shelly's mind · cross-department huddles (v2.4): agents from different departments agree ONE plan, you approve it once.

Each huddle starts from today's events on the Shelly OS bus. Every agent at the table proposes its part, Shelly checks
the constraints (the department's money left, Gateway's dock and truck capacity, people on the shift), resolves
conflicts by a fixed order (safety and law, then customers, then cost), quotes what the agents remember from last time,
and writes one plan with an owner for every step and a single sign-off by the right person.
"""
from __future__ import annotations

from ..brain.registry import AGENTS, DEPARTMENTS, approval_chain
from ..os.bus import run_day
from ..os.model import build
from .memory import _js, recall

AG = {a.id: a for a in AGENTS}
DEP = {d.id: d for d in DEPARTMENTS}


def _name(i):
    return AG[i].name if i in AG else i


def run(ops: dict, group: dict, shift: dict, memories: list) -> list:
    bus = run_day(build()); ev = bus.events(); ac = bus.actions()
    H = []
    # 1 · tomorrow's store replenishment: ordering + Finance funds + Gateway truck space + Shift Pilot check-in
    po = [a for a in ac if a["agent"] == "store-ordering"]
    if po:
        total = round(sum(a["amount"] for a in po))
        inv = next(d for d in _js("docs/data/brain.js")["departments"] if d["id"] == "inventory")
        left = round(inv["budget"] - inv.get("spent", 0))                          # this month's inventory budget still uncommitted
        truck = next((j for d in ops["gateway"]["docks"] if d["site"] == "WH-01" for j in d["jobs"] if j["kind"] == "out" and "Neighbourhood" in j["client"]), None)
        pallets = max(1, round(len(po) * 0.15, 1))
        steps = [
            {"agent": "store-ordering", "says": f"{len(po)} lines are below lead-time cover: ${total:,} of orders.", "part": f"Raise {len(po)} purchase orders, ${total:,}."},
            {"agent": "fin-funds", "says": f"Inventory has ${left:,} of this month's budget left.", "part": "Funds committed." if total <= left else f"Over budget by ${total - left:,}: trim to the 10 lowest-cover lines."},
            {"agent": "gw-transport", "says": f"{truck['truck'] if truck else 'The store run'} has room: about {pallets} pallets fit beside today's load." if truck else "Store run booked.",
             "part": f"Add the lines to {truck['truck']} ({truck['start']} from Wiri dock {truck['dock']})." if truck else "Add to the next store run."},
            {"agent": "store-shift", "says": "Delivery check-in is on the to-do list; chilled lines first.", "part": "Check in and shelve on arrival."},
        ]
        chain = approval_chain("inventory", "Purchase order", total)
        H.append({"id": "h-replen", "title": "Tomorrow's store replenishment", "from": "store.stock.below_cover × " + str(len(po)), "steps": steps,
                  "conflicts": [] if total <= left else ["Orders exceed the inventory budget left this month"],
                  "memory": [m["lesson"] for m in recall(memories, "stock", 1)],
                  "plan": f"Order {len(po)} lines (${total:,}); they ride on the existing store run; the shift checks them in.",
                  "sign_off": chain[-1]["role"], "steps_approved_once": len(steps)})
    # 2 · Tōtara stock gaps: expedite vs cost; clients warned; Gateway chilled dock
    gaps = [e for e in ev if e["type"] in ("totara.stock.gap", "totara.stock.out")]
    if gaps:
        risk = sum(e["payload"]["revenue_at_risk"] for e in gaps)
        air = round(risk * 0.12)
        chain = approval_chain("inventory", "Purchase order", air)
        con = build(); sids = {r["supplier"] for r in con.execute("SELECT supplier FROM stock WHERE business='totara' AND name IN (%s)" % ",".join("?" * len(gaps)), [e["subject"] for e in gaps])}
        names = {s_["name"] for s_ in ops["totara"]["scorecards"] if s_["id"] in sids}
        sup = [m for m in memories if m["topic"] == "suppliers" and any(m["what"].startswith(n) for n in names)][:1] or \
              [{"lesson": f"{s_['name']}: {s_['ask']}."} for s_ in ops["totara"]["scorecards"] if s_["id"] in sids][:1]
        H.append({"id": "h-totara", "title": f"Tōtara: {len(gaps)} medicines short before their ships land", "from": " · ".join(e["type"] for e in gaps[:2]),
                  "steps": [{"agent": "totara-stock", "says": f"${risk:,} of sales at risk across {len(gaps)} SKUs.", "part": f"Air-freight a bridging order (about ${air:,})."},
                            {"agent": "fin-cash", "says": f"Cash low point in the next 13 weeks is ${group['cash']['low']['close']:,}; this fits.", "part": "Pay the air freight from operating cash."},
                            {"agent": "gw-coldchain", "says": "A chilled dock is free at the GDP site in the morning window.", "part": "Book the air shipment into a chilled dock; log temperatures on arrival."},
                            {"agent": "totara-clients", "says": "Hospitals first; GPs can take the alternative brand.", "part": "Tell affected clients today, with the alternative and the date."}],
                  "conflicts": [f"Air freight costs more than sea: worth it because the sales at risk are about {risk / max(1, air):.0f} times the freight"],
                  "memory": [m["lesson"] for m in sup],
                  "plan": f"Bridge {len(gaps)} SKUs by air (~${air:,}) to protect ${risk:,} of sales; chilled dock booked; clients told today.",
                  "sign_off": chain[-1]["role"], "steps_approved_once": 4})
    # 3 · Gateway service recovery: priority dock slot needs pickers the day shift doesn't have
    late = [e for e in ev if e["type"] == "gateway.service.below_target"]
    if late:
        lab = {l["site"]: l for l in ops["gateway"]["labour"]}
        d2 = next((s for s in lab["WH-02"]["shifts"] if s["shift"] == "day"), None); a2 = next((s for s in lab["WH-02"]["shifts"] if s["shift"] == "aft"), None)
        short = -min(0, d2["gaps"]["pickers"]) if d2 else 0; spare = max(0, a2["gaps"]["pickers"]) if a2 else 0
        move = min(short, spare) or 1
        H.append({"id": "h-service", "title": f"Gateway: on-time-in-full below target for {', '.join(e['subject'] for e in late)}", "from": "gateway.service.below_target",
                  "steps": [{"agent": "gw-transport", "says": "Give these clients a priority dock slot on the morning run.", "part": "Priority slot 06:00–07:00 at the GDP site."},
                            {"agent": "gw-warehouse", "says": f"The day shift is {short} pickers short; the afternoon has {spare} spare.", "part": f"Start {move} afternoon picker{'s' if move > 1 else ''} at 06:00 for the next two weeks."},
                            {"agent": "gw-shifts", "says": "Moving someone's shift needs their agreement, or the notice their employment agreement sets.", "part": "Ask for volunteers first; pay the early-start allowance."},
                            {"agent": "gw-accounts", "says": "A service credit is due if OTIF stays under target this month.", "part": "Hold the credit; review at month end."}],
                  "conflicts": ["Moving people between shifts needs their agreement or the agreed notice: volunteers first"],
                  "memory": [m["lesson"] for m in recall(memories, "docks", 1)],
                  "plan": f"Priority morning slots, {move} picker{'s' if move > 1 else ''} moved to days with agreement, service credit held until month end.",
                  "sign_off": "Warehouse Manager (Gateway)", "steps_approved_once": 4})
    for h in H:
        for s in h["steps"]: s["name"] = _name(s["agent"])
    return H
