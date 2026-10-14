"""Gateway operations (v2.2): dock scheduler, labour planner and client billing for Gateway Warehousing & Transport.

  docks    every truck (today's outbound runs + inbound deliveries arriving on the site's usual hourly shape) is
           booked into a dock: cold loads only on the chilled docks, each job takes setup + time per pallet;
           a truck that has to wait more than 30 minutes past its window is a clash, with the fix suggested
  labour   pickers, forklift drivers and loaders needed per shift from the day's pallets, against the roster
  billing  each client's month: storage (pallet-weeks by temperature), handling in and out, deliveries and
           cold-chain monitoring, against the contract fee

Synthetic Gateway data only (docs/data/gateway.js).
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SETUP_MIN, PER_PALLET_MIN, CLASH_MIN = 20, 6.0, 30           # minutes: back on, open, temperature check; unload/load per pallet
RATES = {"ambient": 9.5, "chilled": 14.0, "frozen": 18.0}          # $ per pallet per week
HANDLING, DROP, COLD_MONITOR = 6.5, 85.0, 450.0                     # $ per pallet in/out, $ per delivery, $ per month
PRODUCTIVITY = {"picker": 5.0, "forklift": 10.0, "loader": 9.0}    # pallet-equivalents per person-hour (case picking is slow)
ROLE = {"pickers": ("Order Picker",), "forklift": ("Forklift Operator",), "loaders": ("Loader",)}


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def _min(s):
    a, b = s.split(":"); return int(a) * 60 + int(b)


def _hm(m):
    return f"{int(m // 60):02d}:{int(m % 60):02d}"


def _cold(temp: str) -> bool:
    t = temp.lower(); return "chill" in t or "2–8" in t or "frozen" in t or "°c" in t and "ambient" not in t


def jobs_for(site: dict, gw: dict) -> list:
    """today's dock jobs: outbound shipments from this site + inbound deliveries spread over the site's usual hourly shape"""
    out = [{"id": s["id"], "truck": s["truck"], "kind": "out", "client": s["client_name"], "window": _min(s["window"]), "pallets": s["pallets"], "cold": _cold(s["temp"])}
           for s in gw["shipments"] if s["from"] == site["id"]]
    shape = [v if 5 <= h <= 16 else 0 for h, v in enumerate(gw["bookings"][site["id"]])]; tot = sum(shape)   # suppliers deliver 05:00-17:00
    r = random.Random(sum(map(ord, site["id"])))
    n = site["inbound_today"]; cold_share = 0.6 if "Temperature" in site["kind"] else 0.3 if "chilled" in site["kind"] else 0.0
    cum, k = 0.0, 0
    for h, v in enumerate(shape):
        cum += v / tot * n
        while k < int(round(cum)):
            out.append({"id": f"IN-{site['id'][-2:]}{k + 1:02d}", "truck": f"Supplier truck {k + 1}", "kind": "in", "client": r.choice(site.get("clients") or ["Mixed"]),
                        "window": h * 60 + r.choice([0, 15, 30, 45]), "pallets": r.randint(4, 22), "cold": r.random() < cold_share})
            k += 1
    return sorted(out, key=lambda j: (j["window"], j["id"]))


def schedule(site: dict, gw: dict) -> dict:
    n = site["docks"]; chilled = max(1, n // 3) if ("chill" in site["kind"].lower() or "Temperature" in site["kind"]) else 0
    free = [5 * 60] * n                                    # docks open at 05:00
    booked, clashes = [], []
    for j in jobs_for(site, gw):
        dur = SETUP_MIN + PER_PALLET_MIN * j["pallets"]
        pool = list(range(chilled)) if j["cold"] and chilled else list(range(chilled if chilled < n else 0, n)) or list(range(n))
        d = min(pool, key=lambda i: max(free[i], j["window"]))
        start = max(free[d], j["window"]); end = start + dur; free[d] = end
        wait = start - j["window"]
        b = j | {"dock": d + 1, "start": _hm(start), "end": _hm(end), "wait": int(wait), "dock_kind": "chilled" if d < chilled else "ambient"}
        booked.append(b)
        if wait > CLASH_MIN:
            alt = "move the booking to " + _hm(start) + " or open a second chilled dock" if j["cold"] else "move it to " + _hm(start) + " or swap with a later ambient job"
            clashes.append({"job": j["id"], "truck": j["truck"], "window": _hm(j["window"]), "start": _hm(start), "wait": int(wait), "dock": d + 1, "fix": alt})
    busy = sum(SETUP_MIN + PER_PALLET_MIN * b["pallets"] for b in booked)
    return {"site": site["id"], "name": site["name"], "docks": n, "chilled_docks": chilled, "jobs": booked, "clashes": clashes,
            "utilisation_pct": round(busy / (n * 12 * 60) * 100, 1)}                # dock time used, 05:00-17:00


def labour(site: dict, gw: dict, sched: dict) -> dict:
    """people needed per shift from the day's pallets (in + out), against who is rostered"""
    pallets = {"day": 0, "aft": 0, "night": 0}
    for j in sched["jobs"]:
        m = _min(j["start"]); sh = "day" if 6 * 60 <= m < 14 * 60 else "aft" if 14 * 60 <= m < 22 * 60 else "night"
        pallets[sh] += j["pallets"]
    pallets["night"] += round(sum(pallets.values()) * 0.35)            # night replenishment and pick for the morning runs
    people = gw["rosters"][site["id"]]["people"]
    out = []
    for sh in ("day", "aft", "night"):
        p = pallets[sh]; hrs = 7.5
        need = {"pickers": math.ceil(p * 1.6 / PRODUCTIVITY["picker"] / hrs), "forklift": math.ceil(p * 2 / PRODUCTIVITY["forklift"] / hrs),
                "loaders": math.ceil(p / PRODUCTIVITY["loader"] / hrs)}
        have = {k: sum(1 for x in people if x["shift"] == sh and x["role"] in roles) for k, roles in ROLE.items()}
        gaps = {k: have[k] - need[k] for k in need}
        out.append({"shift": sh, "pallets": p, "need": need, "rostered": have, "gaps": gaps,
                    "advice": "; ".join(f"{-v} more {k}" for k, v in gaps.items() if v < 0) or ("spare: " + ", ".join(f"{v} {k}" for k, v in gaps.items() if v > 1) if any(v > 1 for v in gaps.values()) else "right size")})
    return {"site": site["id"], "shifts": out}


def billing(gw: dict) -> list:
    out = []
    for c in gw["clients"]:
        t = c["temp"].lower()
        mix = {"frozen": 0.4, "chilled": 0.4, "ambient": 0.2} if "frozen" in t else {"chilled": 0.7, "ambient": 0.3} if ("2–8" in t or "chill" in t) else {"ambient": 1.0}
        weeks = 4.33
        lines = [{"item": f"Storage · {k} ({round(c['pallets_now'] * v)} pallets × {weeks} weeks × ${RATES[k]:.2f})", "amount": round(c["pallets_now"] * v * weeks * RATES[k], 2)} for k, v in mix.items()]
        moves = c["deliveries_4wk"] * 9
        lines.append({"item": f"Handling in and out ({moves:,} pallets × ${HANDLING:.2f})", "amount": round(moves * HANDLING, 2)})
        lines.append({"item": f"Deliveries ({c['deliveries_4wk']} drops × ${DROP:.0f})", "amount": round(c["deliveries_4wk"] * DROP, 2)})
        if "frozen" in t or "2–8" in t or "chill" in t:
            lines.append({"item": "Cold-chain monitoring and temperature records", "amount": COLD_MONITOR})
        total = round(sum(l["amount"] for l in lines), 2)
        out.append({"client": c["id"], "name": c["name"], "lines": lines, "total": total, "contract": c["fee_month"], "vs_contract_pct": round((total - c["fee_month"]) / c["fee_month"] * 100, 1),
                    "note": "bill as used: activity is above the contract fee" if total > c["fee_month"] * 1.05 else "contract fee covers the month" if total >= c["fee_month"] * 0.9 else "under-using the contract: offer a smaller plan or more services"})
    return out


def run() -> dict:
    gw = _js("docs/data/gateway.js")
    sites = [s for s in gw["sites"] if any(sh["from"] == s["id"] for sh in gw["shipments"]) or s["inbound_today"]]
    docks = [schedule(s, gw) for s in sites]
    lab = [labour(s, gw, d) for s, d in zip(sites, docks)]
    return {"asof": gw["meta"]["asof"], "docks": docks, "labour": lab, "billing": billing(gw)}
