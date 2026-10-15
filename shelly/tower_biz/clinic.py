"""Tōtara Clinic (v2.5.2): a mini hospital on L5 to L7 of Shelly Tower. Synthetic, counts only: no patient records.

One trading day (07:00 to 21:00) is simulated hour by hour: GP and nurse appointments, urgent-care walk-ins, imaging,
lab tests, physio and the day ward. From it: patient flow, waits against target, room and bed use, no-shows,
staffing by role against need, and the consumables the clinic re-orders from Tōtara Medical's supply chain.
Nothing here is medical advice.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOURS = list(range(7, 21))
ROOMS = [  # level, room, count, what it is for
    ("L7", "Imaging: X-ray", 1, "imaging"), ("L7", "Imaging: ultrasound", 1, "imaging"), ("L7", "Lab and sample collection", 1, "lab"),
    ("L7", "Clean store and dirty utility", 1, "support"), ("L6", "Reception and triage", 1, "front"), ("L6", "GP consult rooms", 8, "gp"),
    ("L6", "Nurse rooms", 3, "nurse"), ("L6", "Urgent care bays", 3, "urgent"), ("L6", "Minor procedures room", 1, "procedure"),
    ("L6", "Tōtara pharmacy", 1, "pharmacy"), ("L5", "Day ward beds", 8, "ward"), ("L5", "Physio and rehab gym", 1, "physio"), ("L5", "Family room", 1, "support")]
# stream: (share of the day's visits by hour profile, minutes a visit, target wait in minutes, rooms that serve it)
STREAMS = {"GP appointment": (0.42, 15, 15, 8), "Nurse clinic": (0.16, 20, 15, 3), "Urgent care walk-in": (0.22, 30, 60, 3), "Physio": (0.08, 40, 10, 2)}
WHO = {"GP appointment": "GP", "Nurse clinic": "Nurse", "Urgent care walk-in": "Urgent care doctor", "Physio": "Physio"}
PROFILE = {7: .5, 8: 1.1, 9: 1.3, 10: 1.2, 11: 1.0, 12: .8, 13: .9, 14: 1.0, 15: 1.0, 16: 1.1, 17: 1.4, 18: 1.3, 19: .9, 20: .5}
STAFF_NEED = {"GP": 1 / 4, "Nurse": 1 / 3.2, "Urgent care doctor": 1 / 2.2, "Radiographer": 1 / 6, "Lab scientist": 1 / 8, "Pharmacist": 1 / 9, "Physio": 1 / 1.6, "Receptionist": 1 / 10}
ROSTER = {"GP": [(7, 15, 4), (13, 21, 4)], "Nurse": [(7, 15, 4), (13, 21, 3)], "Urgent care doctor": [(7, 15, 2), (14, 21, 2)], "Radiographer": [(7, 15, 1), (13, 21, 1)],
          "Lab scientist": [(7, 15, 1), (13, 19, 1)], "Pharmacist": [(7, 15, 2), (13, 21, 1)], "Physio": [(8, 16, 2), (12, 20, 1)], "Receptionist": [(7, 15, 2), (13, 21, 2)]}


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def run(day: str = "2026-09-25", visits: int = 260) -> dict:
    rnd = random.Random(day)
    tot_w = sum(PROFILE.values())
    hours = []
    q = {s: 0.0 for s in STREAMS}
    for h in HOURS:
        row = {"hour": h, "arrivals": 0, "streams": {}}
        for s, (share, mins, target, rooms) in STREAMS.items():
            demand = visits * share * PROFILE[h] / tot_w * (1.35 if s.startswith("Urgent") and h >= 17 else 1)
            staffed = sum(k for a, b, k in ROSTER[WHO[s]] if a <= h < b)
            arrivals = max(0, round(demand + rnd.uniform(-1.2, 1.2))) if staffed else 0   # no bookings when nobody is on
            if s.startswith("GP") or s.startswith("Nurse") or s == "Physio":     # booked: a share don't arrive
                booked = round(arrivals / 0.93); noshow = booked - arrivals
            else:
                booked, noshow = 0, 0
            cap = min(rooms, staffed) * 60 / mins
            q[s] = max(0.0, q[s] + arrivals - cap)
            wait = min(240, round(max(4, (q[s] / max(cap, .1)) * 60 + mins * 0.35 * arrivals / max(cap, .1))))
            row["streams"][s] = {"arrivals": arrivals, "booked": booked, "no_show": noshow, "capacity": round(cap, 1), "queue": round(q[s], 1), "wait_min": wait, "target_min": target}
            row["arrivals"] += arrivals
        hours.append(row)
    streams = []
    for s, (share, mins, target, rooms) in STREAMS.items():
        W = [r["streams"][s] for r in hours]; n = sum(w["arrivals"] for w in W)
        within = sum(w["arrivals"] for w in W if w["wait_min"] <= target)
        booked = sum(w["booked"] for w in W); ns = sum(w["no_show"] for w in W)
        worst = max(hours, key=lambda r: r["streams"][s]["wait_min"])
        streams.append({"stream": s, "patients": n, "median_wait": sorted(w["wait_min"] for w in W for _ in range(max(1, w["arrivals"])))[n // 2] if n else 0,
                        "target_min": target, "within_target_pct": round(within / max(1, n) * 100), "no_show_pct": round(ns / booked * 100, 1) if booked else None,
                        "worst_hour": worst["hour"], "worst_wait": worst["streams"][s]["wait_min"]})
    # imaging and lab follow from consults; the day ward from procedures and urgent care
    consults = sum(s["patients"] for s in streams if s["stream"] != "Physio")
    imaging = round(consults * .14); lab = round(consults * .22); scripts = round(consults * .58)
    ward = []
    occ = 0
    for h in HOURS:
        occ = max(0, min(8, occ + (2 if 9 <= h <= 15 else 0) + (1 if h in (17, 18) else 0) - (2 if h >= 13 else 0) + rnd.choice([0, 0, 1, -1])))
        ward.append({"hour": h, "beds_used": occ, "beds": 8})
    # staffing by role and hour against need
    staff = []
    PER_HOUR = {"GP": 4, "Nurse": 3, "Urgent care doctor": 2, "Physio": 1.5, "Radiographer": 4, "Lab scientist": 6, "Pharmacist": 10, "Receptionist": 12}
    for role in STAFF_NEED:
        row = {"role": role, "hours": []}
        for r in hours:
            on = sum(n for a, b, n in ROSTER[role] if a <= r["hour"] < b)
            st = r["streams"]
            load = {"GP": st["GP appointment"]["arrivals"], "Nurse": st["Nurse clinic"]["arrivals"], "Urgent care doctor": st["Urgent care walk-in"]["arrivals"],
                    "Physio": st["Physio"]["arrivals"], "Radiographer": r["arrivals"] * .14, "Lab scientist": r["arrivals"] * .22,
                    "Pharmacist": r["arrivals"] * .58, "Receptionist": r["arrivals"]}[role]
            need = math.ceil(load / PER_HOUR[role]) if load else 0
            row["hours"].append({"hour": r["hour"], "on": on, "need": need})
        row["short_hours"] = [x["hour"] for x in row["hours"] if x["on"] < x["need"]]
        staff.append(row)
    # consumables from Tōtara Medical's own inventory (real SKUs of the synthetic importer)
    T = _js("docs/supply-chain/data.js")
    inv = [i for i in T["inventory"] if not i.get("cold_chain")][:8]
    supplies = [{"sku": i.get("sku"), "name": i.get("product_name"), "category": i.get("category"), "use_day": max(1, round(consults * [.03, .08, .12, .05, .02, .06, .1, .04][k % 8])), "status_at_totara": i.get("status")} for k, i in enumerate(inv)]
    patients = sum(s["patients"] for s in streams)
    urgent = next(s for s in streams if s["stream"].startswith("Urgent"))
    peak = max(hours, key=lambda r: r["arrivals"])
    short = [s for s in staff if s["short_hours"]]
    actions = []
    if urgent["within_target_pct"] < 90:
        actions.append(f"Urgent care: {urgent['within_target_pct']}% seen within {urgent['target_min']} minutes; the queue peaks at {urgent['worst_hour']}:00 ({urgent['worst_wait']} min). Open a fourth bay from 17:00 to 20:00.")
    for s in short[:2]:
        actions.append(f"{s['role']}s short at {', '.join(f'{h}:00' for h in s['short_hours'][:4])}: move a shift or add a 4-hour evening shift.")
    gp = next(s for s in streams if s["stream"].startswith("GP"))
    if gp["no_show_pct"]:
        actions.append(f"GP no-shows {gp['no_show_pct']}%: send a text reminder the day before and offer freed slots to the urgent-care queue.")
    return {"name": "Tōtara Clinic", "levels": "L5 to L7", "day": day, "rooms": [{"level": l, "room": r, "count": c, "kind": k} for l, r, c, k in ROOMS],
            "hours": hours, "streams": streams, "ward": ward, "staff": staff, "supplies": supplies,
            "kpis": {"patients": patients, "imaging": imaging, "lab": lab, "scripts": scripts, "peak_hour": peak["hour"], "peak_arrivals": peak["arrivals"],
                     "ward_peak": max(w["beds_used"] for w in ward), "within_target_pct": round(sum(s["patients"] * s["within_target_pct"] for s in streams) / max(1, patients))},
            "flow": ["Arrive and check in", "Triage", "Consult", "Imaging or lab (if needed)", "Treatment or day ward (if needed)", "Pharmacy", "Home with a follow-up"],
            "actions": actions}
