"""Shelly Tower Hotel (v2.5.2): rooms and suites on L16 and L17, the restaurant, ballroom and conference centre on L18.
Synthetic and deterministic: bookings are counts and room numbers, never guest names.

Revenue management: occupancy, average daily rate (ADR) and revenue per available room (RevPAR) for 60 nights back
and 30 ahead, with weekends and event nights priced up. Reservations: booking channel, lead time, segment, repeat guests.
Housekeeping: every room's status this morning. Dining: covers per sitting, table bookings and menu engineering.
Events: the function diary. Guest experience: a satisfaction score from synthetic surveys (demo data, labelled so)
tracked against what a five-star standard needs.
"""
from __future__ import annotations

import datetime as dt
import random

ROOMS = [("Delegation room", "L17", 20, 289), ("Delegation suite", "L17", 4, 529), ("Serviced apartment", "L16", 18, 349), ("Two-bed apartment", "L16", 6, 489)]
SEGMENTS = [("Corporate and delegations", .46), ("Leisure", .28), ("Medical stay (Tōtara Clinic)", .08), ("Event guests", .18)]
CHANNELS = [("Direct website", .34), ("Corporate contract", .27), ("Online travel agents", .29), ("Phone and walk-in", .10)]
EVENTS = [("Trade delegation dinner", "banquet", 140), ("Product launch", "cocktail", 220), ("Board offsite", "boardroom", 24), ("Wedding", "banquet", 160),
          ("Conference day", "theatre", 260), ("Charity gala", "banquet", 200), ("Training day", "classroom", 60)]
MENU = [("Kingfish crudo", 26, .71, 140), ("Lamb rump", 44, .62, 210), ("Market fish", 42, .58, 120), ("Wagyu burger", 32, .64, 260), ("Mushroom risotto", 30, .78, 90),
        ("Pork belly", 36, .66, 70), ("Pavlova", 16, .80, 150), ("Cheese board", 24, .55, 40), ("Kids' fish and chips", 18, .70, 60), ("Seasonal salad", 22, .76, 50)]


def run(asof: str = "2026-09-25") -> dict:
    rnd = random.Random(asof + "hotel")
    today = dt.date.fromisoformat(asof)
    inv = sum(n for _, _, n, _ in ROOMS)
    event_days = {today + dt.timedelta(days=d) for d in (-52, -41, -30, -23, -16, -9, -2, 5, 9, 16, 23, 27)}
    nights = []
    for d in range(-60, 31):
        day = today + dt.timedelta(days=d); wk = day.weekday()
        base = .62 + (.14 if wk in (3, 4) else .08 if wk == 5 else -.06 if wk == 6 else 0) + (.12 if day in event_days else 0)
        occ = min(.98, max(.35, base + rnd.uniform(-.06, .06)))
        if d > 0: occ = occ * max(.45, 1 - d / 55)                       # on the books: the future fills as it gets closer
        rate = 300 * (1 + (.18 if day in event_days else 0) + (.08 if wk in (3, 4, 5) else 0)) * (1 + rnd.uniform(-.03, .03))
        sold = round(inv * occ)
        nights.append({"date": day.isoformat(), "dow": day.strftime("%a"), "past": d <= 0, "event": day in event_days, "sold": sold, "occ_pct": round(sold / inv * 100, 1),
                       "adr": round(rate), "revpar": round(rate * sold / inv), "revenue": round(rate * sold)})
    past = [n for n in nights if n["past"]][-30:]; ahead = [n for n in nights if not n["past"]]
    k = {"rooms": inv, "occ_pct": round(sum(n["occ_pct"] for n in past) / len(past), 1), "adr": round(sum(n["revenue"] for n in past) / max(1, sum(n["sold"] for n in past))),
         "revpar": round(sum(n["revenue"] for n in past) / (inv * len(past))), "room_revenue_30d": sum(n["revenue"] for n in past),
         "on_books_30d_pct": round(sum(n["occ_pct"] for n in ahead) / len(ahead), 1)}
    # reservations (counts only)
    bookings = []
    for i in range(420):
        seg = rnd.choices([s for s, _ in SEGMENTS], [w for _, w in SEGMENTS])[0]
        ch = rnd.choices([c for c, _ in CHANNELS], [w for _, w in CHANNELS])[0]
        lead = int(rnd.expovariate(1 / (24 if seg.startswith("Corporate") else 45 if seg == "Leisure" else 9)))
        nights_ = max(1, int(rnd.expovariate(1 / (2.1 if seg != "Medical stay (Tōtara Clinic)" else 3.4))) + 1)
        repeat = rnd.random() < (.38 if seg.startswith("Corporate") else .14)
        bookings.append({"segment": seg, "channel": ch, "lead_days": min(lead, 180), "nights": min(nights_, 14), "repeat": repeat})
    def share(key):
        tot = len(bookings); out = {}
        for b in bookings: out[b[key]] = out.get(b[key], 0) + 1
        return [{"name": n, "pct": round(c / tot * 100, 1)} for n, c in sorted(out.items(), key=lambda x: -x[1])]
    seg = []
    for s, _ in SEGMENTS:
        B = [b for b in bookings if b["segment"] == s]
        seg.append({"segment": s, "bookings": len(B), "avg_lead": round(sum(b["lead_days"] for b in B) / max(1, len(B))), "avg_nights": round(sum(b["nights"] for b in B) / max(1, len(B)), 1),
                    "repeat_pct": round(sum(b["repeat"] for b in B) / max(1, len(B)) * 100)})
    ota = next(c for c in share("channel") if c["name"].startswith("Online"))
    # housekeeping this morning
    rooms = []; nums = {"L16": 1, "L17": 1}
    for typ, lv, n, rack in ROOMS:
        for j in range(n):
            st = rnd.choices(["Occupied", "Check-out, to clean", "Clean and ready", "Being cleaned", "Out of order"], [.5, .22, .2, .07, .01])[0]
            rooms.append({"room": f"{lv[1:]}{nums[lv]:02d}", "level": lv, "type": typ, "status": st}); nums[lv] += 1
    hk = {}
    for r in rooms: hk[r["status"]] = hk.get(r["status"], 0) + 1
    # dining: three sittings, table bookings, menu engineering
    covers = [{"sitting": s, "booked": b, "walk_in": w, "seats": 96} for s, b, w in (("Breakfast", 58, 12), ("Lunch", 44, 21), ("Dinner", 81, 9))]
    avg_pop = sum(m[3] for m in MENU) / len(MENU); avg_gp = sum(p * g for _, p, g, _ in MENU) / len(MENU)
    menu = []
    for name, price, gm, sold in MENU:
        hi_pop, hi_gp = sold >= avg_pop, price * gm >= avg_gp
        cls = "Star" if hi_pop and hi_gp else "Plough-horse" if hi_pop else "Puzzle" if hi_gp else "Dog"
        act = {"Star": "keep it front and centre", "Plough-horse": "popular but thin: trim the portion cost or nudge the price", "Puzzle": "profitable but slow: move it up the menu, let staff recommend it", "Dog": "replace or rework"}[cls]
        menu.append({"item": name, "price": price, "gm_pct": round(gm * 100), "gp_each": round(price * gm, 2), "sold_7d": sold, "class": cls, "action": act})
    # events diary (next 30 days)
    diary = []
    for d in sorted(e for e in event_days if e > today):
        name, layout, guests = EVENTS[d.toordinal() % len(EVENTS)]
        diary.append({"date": d.isoformat(), "event": name, "room": "Ballroom" if guests > 100 else "Conference suite", "layout": layout, "guests": guests,
                      "fnb_per_head": 95 if layout == "banquet" else 45 if layout == "cocktail" else 38, "rooms_blocked": round(guests * (.12 if layout != "boardroom" else .5))})
    # guest experience: synthetic survey scores against a five-star standard
    sat = [("Check-in under 3 minutes", 91, 95), ("Room ready by 14:00", 86, 98), ("Cleanliness", 94, 95), ("Restaurant service", 89, 92),
           ("Complaints closed within 24 hours", 97, 100), ("Would recommend", 88, 90)]
    gx = [{"measure": m, "score": s, "target": t, "gap": s - t} for m, s, t in sat]
    actions = []
    rr = next(g for g in gx if g["measure"].startswith("Room ready"))
    if rr["gap"] < 0:
        actions.append(f"Room readiness {rr['score']}% against {rr['target']}%: {hk.get('Check-out, to clean', 0)} check-outs to clean this morning; start departures first and add a housekeeper from 10:00 to 14:00.")
    actions.append(f"Online travel agents bring {ota['pct']}% of bookings and charge commission: offer repeat corporate guests a direct-booking rate.")
    ph = [m for m in menu if m["class"] == "Plough-horse"]
    if ph: actions.append(f"{ph[0]['item']} is a plough-horse: it sells well but earns ${ph[0]['gp_each']:.2f} a plate, under the menu's average; trim its plate cost before changing the price.")
    nxt = diary[0] if diary else None
    if nxt: actions.append(f"{nxt['event']} on {nxt['date']}: {nxt['guests']} guests; block {nxt['rooms_blocked']} rooms and tell the store and kitchen today.")
    return {"name": "Shelly Tower Hotel", "levels": "L16 to L18", "asof": asof, "room_types": [{"type": t, "level": l, "count": n, "rack_rate": r} for t, l, n, r in ROOMS],
            "kpis": k, "nights": nights, "segments": seg, "channels": share("channel"), "lead": [{"band": b, "pct": round(sum(1 for x in bookings if lo <= x["lead_days"] < hi) / len(bookings) * 100, 1)}
                                                                                                  for b, lo, hi in (("same week", 0, 7), ("1 to 4 weeks", 7, 28), ("1 to 3 months", 28, 90), ("3 months +", 90, 999))],
            "repeat_pct": round(sum(b["repeat"] for b in bookings) / len(bookings) * 100), "housekeeping": hk, "rooms": rooms, "covers": covers, "menu": menu,
            "events": diary, "guest_experience": gx, "actions": actions,
            "note": "Guest scores are synthetic survey results for this demo, not real reviews."}
