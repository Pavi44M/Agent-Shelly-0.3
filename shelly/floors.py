"""Shelly Tower floor by floor (v2.5.1): a plan for every level, the people at work (roles and counts only),
the technology on the floor and the building's own numbers. Synthetic and deterministic.

Every floor shares one core: four lifts, two fire stairs at opposite ends, risers, a cleaner's room, and washrooms
(women's, men's, all-gender, an accessible washroom and, on working floors, a parents' room). Around the core,
the fit-out depends on what the floor is for. Plans are laid out in metres on the floor's real area.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# fit-out templates: (zone, weight, roles that work there)
OFFICE = [("Open workspace", 4, ["analyst", "manager"]), ("Meeting rooms", 1.5, ["manager"]), ("Focus rooms", 1, ["analyst"]),
          ("Kitchen and social", 1, []), ("Reception", .7, ["host"])]
SPECIAL = {
    "boardroom": [("Boardroom", 2.5, ["director"]), ("Executive offices", 2, ["director"]), ("Meeting rooms", 1.5, ["manager"]), ("Kitchen and social", 1, []), ("Reception", .7, ["host"])],
    "operations centre": [("AI operations centre", 3, ["engineer"]), ("Control wall", 1.5, ["engineer"]), ("Agent review desks", 2, ["analyst"]), ("Meeting rooms", 1, ["manager"]), ("Kitchen and social", 1, [])],
    "data centre": [("Server hall", 4, ["engineer"]), ("Security operations", 2, ["engineer"]), ("Battery and cooling", 1.5, []), ("Secure entry", .6, ["host"])],
    "launchpad": [("Living lab", 3, ["engineer", "analyst"]), ("Maker space", 2, ["engineer"]), ("Demo stage", 1.5, ["host"]), ("Kitchen and social", 1, [])],
    "control tower": [("Transport control room", 3.5, ["planner"]), ("Driver desk", 1, ["planner"]), ("Meeting rooms", 1, ["manager"]), ("Kitchen and social", 1, [])],
    "trade centre": [("Trade floor", 3, ["trader"]), ("Customs and documents desk", 1.5, ["officer"]), ("Meeting rooms", 1.5, ["manager"]), ("Reception", .8, ["host"])],
    "deal rooms": [("Deal rooms", 3, ["trader"]), ("Virtual showroom", 2, ["host"]), ("Translation booths", 1, ["officer"]), ("Lounge", 1, [])],
    "available": [("Shell space, ready to fit out", 6, []), ("Viewing suite", 1, ["host"])],
    "flex": [("Bookable desks", 3, ["analyst"]), ("Team rooms", 2, ["manager"]), ("Kitchen and social", 1, [])],
    "clinic": [("Consult rooms", 3, ["clinician"]), ("Treatment room", 1.5, ["nurse"]), ("Waiting area", 1.5, []), ("Reception", .8, ["host"])],
    "imaging": [("X-ray room", 1.5, ["radiographer"]), ("Ultrasound room", 1.2, ["radiographer"]), ("Lab and sample collection", 2, ["lab scientist"]),
                ("Waiting area", 1.5, []), ("Clean store and dirty utility", 1, ["nurse"]), ("Staff base", 1, ["nurse"])],
    "day ward": [("Day ward beds", 3, ["nurse"]), ("Physio and rehab gym", 2, ["physio"]), ("Family room", .8, []), ("Gym and showers", 2, ["trainer"]), ("Quiet rooms", .8, [])],
    "gp & urgent": [("GP consult rooms", 3, ["GP", "nurse"]), ("Urgent care bays", 2, ["urgent care doctor"]), ("Reception and triage", 1, ["receptionist"]),
                    ("Waiting area", 1.4, []), ("Minor procedures room", .8, ["GP"]), ("Tōtara pharmacy", .8, ["pharmacist"])],
    "restaurant": [("Restaurant and bar", 3, ["chef", "server"]), ("Ballroom", 3, ["event host"]), ("Conference suites", 2, ["event host"]), ("Sky lobby", 1, ["concierge"]), ("Kitchen", 1.4, ["chef"])],
    "hotel": [("Guest rooms", 6, ["housekeeper"]), ("Suites", 2, ["housekeeper"]), ("Housekeeping store", .8, ["housekeeper"]), ("Lift lobby lounge", .6, [])],
    "apartments": [("Serviced apartments", 7, ["housekeeper"]), ("Residents' lounge", 1, ["host"]), ("Laundry", .6, [])],
    "sky lobby": [("Conference hall", 3, ["host"]), ("Breakout rooms", 2, ["host"]), ("Sky lobby and café", 2, ["barista"]), ("AV control", .5, ["engineer"])],
    "wellbeing": [("Gym", 2.5, ["trainer"]), ("Studio", 1.5, ["trainer"]), ("Quiet rooms", 1, []), ("Changing rooms", 1.2, [])],
    "food hall": [("Food hall seating", 3, []), ("Kitchens", 2, ["chef"]), ("Ghost kitchen", 1.5, ["chef"]), ("Servery", 1, ["server"])],
    "store": [("Fresh and produce", 1.6, ["store team"]), ("Grocery aisles", 2.6, ["store team"]), ("Chillers and freezers", 1.4, ["store team"]), ("Café", 1, ["barista"]),
              ("Tōtara pharmacy counter", .8, ["pharmacist"]), ("Checkouts and self-checkout", 1.2, ["store team"]), ("Click-and-collect lockers", .5, [])],
    "mall": [("Pop-up pods", 3, ["retail host"]), ("AR showrooms", 2, ["retail host"]), ("Retail media wall", 1, []), ("Seating", 1, [])],
    "plaza": [("Lobby and visitor check-in", 2, ["host"]), ("Public plaza", 3, []), ("Security desk", .6, ["security"]), ("Bike park", 1, [])],
    "rooftop": [("Drone pads", 2.5, ["drone pilot"]), ("Vertiport", 2, ["controller"]), ("Solar array", 2, []), ("Sky garden", 1.5, ["gardener"])],
    "mfc": [("Robot picking grid", 4, ["picker"]), ("Dispatch bays", 1.5, ["driver"]), ("Returns", .8, ["picker"]), ("Chilled store", 1.2, ["picker"])],
    "parking": [("Parking bays", 5, []), ("EV chargers", 1.5, []), ("Valet desk", .5, ["valet"]), ("Bike and scooter store", .8, [])],
    "dock": [("Loading dock", 3, ["dock hand"]), ("Battery microgrid", 1.5, ["engineer"]), ("Plant room", 1.5, ["engineer"]), ("Waste and recycling", 1, ["dock hand"])],
}
TECH = {
    "office": [("Occupancy sensors", "desks and rooms booked from live counts, no cameras"), ("Smart glass", "shades itself to cut glare and cooling"),
               ("Agent desk", "Shelly agents draft the routine work for people to approve")],
    "store": [("Electronic shelf labels", "price changes reach every shelf in seconds"), ("Self-checkout and lockers", "queues and click-and-collect in one place"),
              ("Shelf cameras for stock gaps", "count gaps, never people")],
    "hotel": [("Mobile key", "check in on the phone, the room unlocks"), ("Room sensors", "housekeeping sees which rooms are free to clean"), ("Energy saver", "air and lights ease off in empty rooms")],
    "clinic": [("Digital triage", "patients check in on a tablet; urgent ones go first"), ("Smart dispensing", "medicines counted and logged automatically")],
    "tech": [("Liquid cooling", "servers run cooler on less power"), ("Digital twin", "every system in the tower on one live model")],
    "logistics": [("Picking robots", "bring the shelf to the picker"), ("EV and battery microgrid", "trucks and cars charge off-peak and from the roof's solar")],
    "public": [("Visitor check-in kiosks", "badges in under a minute"), ("Wayfinding screens", "directions to any floor")],
    "rooftop": [("Drone traffic control", "routes and slots for every flight"), ("Rooftop solar", "feeds the basement battery")],
}
INTENSITY = {"office": 0.42, "store": 1.1, "hotel": 0.55, "clinic": 0.7, "tech": 2.4, "logistics": 0.8, "public": 0.35, "rooftop": 0.1}   # kWh per m² a day


def _template(f: dict) -> tuple:
    n, k, lv = f["name"].lower(), f["kind"], f["level"]
    for key, fam in (("imaging", "clinic"), ("day ward", "clinic"), ("gp & urgent", "clinic"), ("restaurant", "hotel"), ("boardroom", "office"), ("operations centre", "tech"), ("data centre", "tech"), ("launchpad", "tech"), ("control tower", "office"),
                     ("trade centre", "office"), ("deal rooms", "office"), ("flex", "office"), ("sky lobby", "public"), ("wellbeing", "public"),
                     ("food hall", "public"), ("clinic", "clinic"), ("apartments", "hotel")):
        if key in n: return SPECIAL[key], fam
    if k == "hospitality": return SPECIAL["hotel"], "hotel"
    if k == "available": return SPECIAL["available"], "office"
    if lv == "R": return SPECIAL["rooftop"], "rooftop"
    if lv == "2": return SPECIAL["store"], "store"
    if lv == "3": return SPECIAL["mall"], "store"
    if lv == "G": return SPECIAL["plaza"], "public"
    if lv == "B1": return SPECIAL["mfc"], "logistics"
    if lv == "B2": return SPECIAL["parking"], "logistics"
    if lv == "B3": return SPECIAL["dock"], "logistics"
    return OFFICE, "office"


def _plan(f: dict, zones: list) -> dict:
    A = f.get("area_m2") or 1450
    W = round(math.sqrt(A * 1.45)); H = round(A / W)
    cw, ch = 16, 10; cx, cy = (W - cw) / 2, (H - ch) / 2
    core = [{"name": "Lifts", "x": cx + 5, "y": cy, "w": 6, "h": 4}, {"name": "Stair 1 (fire exit)", "x": cx, "y": cy, "w": 3, "h": 10},
            {"name": "Stair 2 (fire exit)", "x": cx + cw - 3, "y": cy, "w": 3, "h": 10}, {"name": "Risers", "x": cx + 3, "y": cy, "w": 2, "h": 4},
            {"name": "Cleaner's room", "x": cx + 11, "y": cy, "w": 2, "h": 4}]
    working = f["kind"] not in ("basement",) and f["level"] not in ("R",)
    wash = [("Women's", 2.4), ("Men's", 2.4), ("All-gender", 1.6), ("Accessible", 1.8)] + ([("Parents' room", 1.8)] if working else [])
    x = cx + 3
    for nm, w in wash:
        core.append({"name": nm, "x": round(x, 1), "y": cy + 5, "w": w, "h": 5, "wash": True}); x += w
    # the ring round the core: north band, south band, west and east wings
    dn = cy - 1; ds = H - (cy + ch) - 1
    slots = [("N", 1, 1, W - 2, dn), ("S", 1, cy + ch + 1, W - 2, ds), ("W", 1, cy - 0, cx - 2, ch), ("E", cx + cw + 1, cy, W - cx - cw - 2, ch)]
    total = sum(z[1] for z in zones); areas = {s[0]: s[3] * s[4] for s in slots}; ring = sum(areas.values())
    rooms = []; zi = 0; Z = list(zones)
    # fill N then S then W then E, splitting each band by the zone weights that land in it
    want = [(nm, wt / total * ring, roles) for nm, wt, roles in Z]
    for key, x0, y0, w, h in slots:
        cap = w * h; used = 0; xs = x0
        while zi < len(want) and used < cap - 8:                    # a sliver under 8 m² stays as corridor
            nm, a, roles = want[zi]
            take = min(a, cap - used)
            if cap - used - take < 8: take = cap - used                  # don't leave a sliver behind either
            ww = take / h if key in ("N", "S") else w
            hh = h if key in ("N", "S") else take / w
            rooms.append({"name": nm, "x": round(xs, 1) if key in ("N", "S") else x0, "y": y0 if key in ("N", "S") else round(y0 + used / w, 1),
                          "w": round(ww, 1), "h": round(hh, 1), "roles": roles, "label": not any(r["name"] == nm for r in rooms)})
            if key in ("N", "S"): xs += ww
            used += take; want[zi] = (nm, a - take, roles)
            if want[zi][1] <= 4: zi += 1
    rooms = [r for r in rooms if r["w"] * r["h"] >= 6 and min(r["w"], r["h"]) >= 1.5]                 # slivers stay as corridor
    for r in rooms:                                                       # the label goes on the biggest piece of each zone
        r["label"] = r is max((q for q in rooms if q["name"] == r["name"]), key=lambda q: q["w"] * q["h"])
    return {"w": W, "h": H, "core": core, "rooms": rooms}


def floor(f: dict) -> dict:
    zones, fam = _template(f)
    plan = _plan(f, zones)
    now = int(f.get("here_now") or 0)
    roles = {}
    weights = [(z[0], z[1], z[2]) for z in zones if z[2]]
    tw = sum(w for _, w, _ in weights) or 1
    left = now
    for i, (nm, w, rs) in enumerate(weights):
        n = left if i == len(weights) - 1 else round(now * w / tw); left -= n
        for j, r in enumerate(rs):
            k = n // len(rs) + (1 if j < n % len(rs) else 0)
            if k: roles[r] = roles.get(r, 0) + k
    A = f.get("area_m2") or 1450; cap = max(1, int(f.get("people") or 1))
    occ = min(1, now / cap)
    energy = round(A * INTENSITY[fam] * (0.6 + 0.4 * occ))
    co2 = round(430 + 900 * now / max(1, A / 10))
    visits = round(now * 2.6)
    return {"level": f["level"], "name": f["name"], "kind": f["kind"], "kind_label": f.get("kind_label", ""), "colour": f.get("colour", "#63b6d8"),
            "occupant": f.get("occupant", ""), "about": f.get("about", ""), "future": f.get("future", ""), "area_m2": A, "people": cap, "here_now": now,
            "agents": f.get("agents", 0), "page": f.get("page"), "plan": plan, "roles": roles,
            "tech": [{"name": n, "does": d} for n, d in TECH[fam]],
            "systems": {"energy_kwh": energy, "co2_ppm": co2, "lift_wait_s": 18 + (7 if occ > .7 else 0) + (5 if f["kind"] in ("podium", "amenity") else 0),
                        "washroom_visits": visits, "cleaning_rounds": max(2, math.ceil(visits / 40)), "occupancy_pct": round(occ * 100)}}


def run() -> dict:
    t = (ROOT / "docs/data/tower.js").read_text(encoding="utf-8")
    T = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
    F = [floor(f) for f in T["floors"]]
    return {"floors": F, "totals": {"floors": len(F), "here_now": sum(f["here_now"] for f in F), "energy_kwh": sum(f["systems"]["energy_kwh"] for f in F),
                                    "washrooms": sum(sum(1 for c in f["plan"]["core"] if c.get("wash")) for f in F)}}
