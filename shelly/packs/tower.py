"""Tower businesses pack (v2.5): Tōtara Clinic and the Shelly Tower Hotel, and the tower floor by floor. Synthetic data."""
from __future__ import annotations

from ..core.skills import skill


@skill("tower.clinic", pack="tower", summary="Clinic patient flow, waits against target, rooms and beds, staffing by role and supplies (counts only, no records)",
       inputs=["appointments", "walk-ins", "rosters", "stock"], outputs=["waits", "staffing gaps", "actions"], triggers=["clinic", "patients", "wait", "urgent care"])
def clinic():
    from ..tower_biz import clinic as c
    return c.run()


@skill("tower.hotel", pack="tower", summary="Hotel occupancy, ADR, RevPAR, reservations, housekeeping, menu engineering, events and guest experience",
       inputs=["bookings", "rooms", "covers", "events"], outputs=["revenue", "housekeeping order", "menu classes"], triggers=["hotel", "rooms", "occupancy", "revpar", "menu", "events"])
def hotel():
    from ..tower_biz import hotel as h
    return h.run()


@skill("tower.floors", pack="tower", summary="Every tower floor: plan, people by role, technology and building systems", inputs=["tower data"], outputs=["floor plans"], triggers=["floor", "lift", "tower tour"])
def floors():
    from .. import floors as f
    return f.run()
