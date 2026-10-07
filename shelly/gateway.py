"""Gateway Warehousing & Transport: Shelly's third business (a 3PL), module v1.1.

Builds the data behind docs/gateway/ from modules/gateway/gateway.yaml: three sites, six client
contracts, the fleet, forklifts, the management team and floor roles, this week's service figures,
today's shipments, what Shelly flagged and the decisions waiting. Everything is synthetic (seeded,
so the same week always gives the same numbers); no real company, person or contract.

    from shelly.gateway import build, write_js
    data = build()                      # dict
    write_js(data, "docs/data/gateway.js")
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "modules/gateway/gateway.yaml"

FIRST = ["Hemi", "Ana", "Wiremu", "Losa", "Ben", "Mere", "Raj", "Sina", "Kahu", "Tama", "Lily", "Josh", "Nikau", "Ella", "Sam",
         "Tevita", "Maia", "Ravi", "Chloe", "Manu", "Isla", "Tane", "Ruby", "Leo", "Moana", "Finn", "Kiri", "Jun", "Zara", "Eli",
         "Pita", "Hana", "Arlo", "Mila", "Toby", "Ngaio", "Kai", "Sofia", "Vai", "Noah"]
PLACES = {  # fictional delivery points
    "NBS": ["Neighbourhood Store · Eden Terrace", "Neighbourhood Store · Ponsonby", "Neighbourhood Store · Mt Albert"],
    "TOT": ["Harbourview Hospital", "Kōwhai Private Hospital", "Tōtara Medical · Rosebank"],
    "KHS": ["Northcote Family Clinic", "Remuera GP Practice", "Ōtāhuhu Health Centre"],
    "PDX": ["City Lab Collection Centre", "Harbourview Hospital Lab", "Southern Lab Hub"],
    "HFF": ["Viaduct Seafood Bar", "Kingsland Café", "Newmarket Bistro", "Takapuna Hotel Kitchen"],
    "SPC": ["Showgrounds Event Kitchen", "Waterfront Conference Centre"],
}
LAST = ["Walker", "Ngata", "Tuilagi", "Singh", "Chen", "Kumar", "Brown", "Patel", "Smith", "Fa'alogo", "Lee", "Wilson", "Taufa", "Park",
        "Henare", "Nguyen", "Williams", "Tipene", "Reddy", "Martin", "Fifita", "Kaur", "Thompson", "Pōtae", "Wang", "Davies"]
STAGES = ["Order confirmed", "Picked", "Loaded", "In transit", "Delivered"]
LEADS = {"Shift Supervisor", "Yard Marshal", "Gatehouse Officer", "Cleaner / Hygiene"}


def _hm(s: str) -> float:
    h, m = s.split(":")
    return int(h) + int(m) / 60


def _fmt(h: float) -> str:
    h %= 24
    return f"{int(h):02d}:{int(round(h % 1 * 60)):02d}"


def rosters(cfg: dict, rnd: random.Random) -> dict:
    """Shift crews for every site: name, role, start/end, staggered breaks, station, licences, plus coverage checks."""
    out = {}
    for site in cfg["sites"]:
        used, people, n = set(), [], 0
        cold = bool(site.get("cold_rooms"))
        for sh in cfg["shifts"]:
            start, hrs = _hm(sh["start"]), sh["hours"]
            crew = dict(cfg["crew"][sh["id"]])
            k_in_shift = 0
            if cold and site["id"] == "WH-02":
                crew["Quality Officer (GDP)"] = 1
            for role, k in crew.items():
                count = max(1, round(k * site.get("crew_scale", 1))) if role in LEADS or "Leader" in role else round(k * site.get("crew_scale", 1))
                if role == "Forklift Operator":
                    count = min(count, site["forklifts"])
                for j in range(count):
                    while True:
                        nm = f"{rnd.choice(FIRST)} {rnd.choice(LAST)}"
                        if nm not in used:
                            used.add(nm)
                            break
                    off = (k_in_shift % 4) * cfg.get("break_stagger_minutes", 15) / 60   # four break groups across the shift, so docks stay covered
                    k_in_shift += 1
                    brk = [{"name": b["name"], "at": _fmt(start + b["after_h"] + off), "minutes": b["minutes"]} for b in cfg["breaks"]]
                    st = {"Forklift Operator": f"FL-{site['id'][-2:]}{j % site['forklifts'] + 1:02d}", "Order Picker": f"Aisles {1 + j % 4}–{2 + j % 4}",
                          "Loader": f"Docks {1 + (j * 3) % site['docks']}–{min(site['docks'], 3 + (j * 3) % site['docks'])}", "Receiver / Checker": "Inbound docks",
                          "Yard Marshal": "Yard", "Gatehouse Officer": "Gate", "Shift Supervisor": "Whole site", "Team Leader": ["Receiving", "Picking", "Despatch"][j % 3],
                          "Inventory Controller": "Cycle counts", "Cleaner / Hygiene": "Chilled zones + amenities", "Quality Officer (GDP)": "Cold rooms"}.get(role, "")
                    if cold and role in ("Order Picker", "Forklift Operator") and j == 0:
                        st += " · cold room"
                    n += 1
                    people.append({"id": f"{site['id']}-{n:03d}", "name": nm, "role": role, "shift": sh["id"], "start": sh["start"], "end": _fmt(start + hrs),
                                   "hours": hrs, "breaks": brk, "station": st, "forklift_licence": role == "Forklift Operator" or (role == "Team Leader" and j == 0),
                                   "first_aid": role in ("Shift Supervisor", "Team Leader") and j == 0, "cold_trained": cold and (role in ("Order Picker", "Forklift Operator", "Quality Officer (GDP)", "Receiver / Checker") or "Leader" in role)})
        if site["id"] == "WH-02":   # someone is always away: one night forklift driver on annual leave this week
            lv = next((p for p in people if p["shift"] == "night" and p["role"] == "Forklift Operator"), None)
            if lv:
                lv["leave"] = "Annual leave"
        checks = []
        for sh in cfg["shifts"]:
            on = [p for p in people if p["shift"] == sh["id"] and not p.get("leave")]
            def ok(text, good):
                checks.append({"shift": sh["id"], "ok": bool(good), "text": text})
            ok(f"{sh['name']}: a shift supervisor on site", any(p["role"] == "Shift Supervisor" for p in on))
            ok(f"{sh['name']}: first aider on every shift", any(p["first_aid"] for p in on))
            lic = sum(p["forklift_licence"] for p in on)
            ok(f"{sh['name']}: {lic} licensed forklift drivers for {site['forklifts']} forklifts", lic >= min(3, site["forklifts"]))
            ok(f"{sh['name']}: yard marshal and gatehouse covered", any(p["role"] == "Yard Marshal" for p in on) and any(p["role"] == "Gatehouse Officer" for p in on))
            if cold:
                ok(f"{sh['name']}: {sum(p['cold_trained'] for p in on)} people trained for the cold rooms", sum(p["cold_trained"] for p in on) >= 3)
        hrs = sum(p["hours"] for p in people)
        night = sum(p["hours"] for p in people if p["shift"] == "night")
        cost = round((hrs - night) * cfg["pay"]["base_hour"] + night * cfg["pay"]["base_hour"] * cfg["pay"]["night_rate"])
        out[site["id"]] = {"people": people, "checks": checks, "hours": hrs, "cost_day": cost,
                           "by_shift": {sh["id"]: sum(1 for p in people if p["shift"] == sh["id"]) for sh in cfg["shifts"]}}
    return out


def load(path: Path | str = CFG) -> dict:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def build(cfg: dict | None = None, asof: date | None = None) -> dict:
    cfg = cfg or load()
    asof = asof or date.today()
    wk = _week_start(asof)
    rnd = random.Random(int(wk.strftime("%Y%m%d")))
    sites = {s["id"]: dict(s) for s in cfg["sites"]}
    clients = [dict(c) for c in cfg["clients"]]

    # ---- client service this week + 12-week trend (OTIF, deliveries, pallets, revenue)
    for i, c in enumerate(clients):
        tgt = c["otif_target"]
        d4 = int(c["deliveries_wk"] * 4 * rnd.uniform(0.94, 1.08))           # last 4 weeks
        miss = (100 - tgt) / 100 * rnd.uniform(0.45, 1.3)
        if i == 3:                       # one client is deliberately under target so Shelly has something to flag
            miss = (100 - tgt) / 100 * 2.2
        late = max(0, round(d4 * miss))
        c["deliveries_4wk"], c["late"] = d4, late
        c["otif"] = round((d4 - late) / d4 * 100, 1)
        c["deliveries"] = int(c["deliveries_wk"] * rnd.uniform(0.92, 1.1))
        c["pallets_now"] = int(c["pallets"] * rnd.uniform(0.9, 1.08))
        c["revenue_wk"] = round(c["fee_month"] * 12 / 52 * rnd.uniform(0.95, 1.06))
        c["margin_pct"] = round(rnd.uniform(9, 19), 1)
        c["trend"] = [round(min(100, c["otif"] + rnd.uniform(-1.6, 1.2)), 1) for _ in range(11)] + [c["otif"]]
        c["status"] = "ok" if c["otif"] >= tgt else ("watch" if c["otif"] >= tgt - 1 else "alert")

    # ---- sites: stock, docks, people
    for s in sites.values():
        held = sum(c["pallets_now"] for c in clients if c["site"] == s["id"])
        s["stock"] = held + int(s["pallet_positions"] * rnd.uniform(0.18, 0.32))
        s["fill_pct"] = round(s["stock"] / s["pallet_positions"] * 100, 1)
        s["inbound_today"] = rnd.randint(8, 22)
        s["outbound_today"] = rnd.randint(14, 36)
        s["putaway_today"] = rnd.randint(18, 60)
        s["dock_util_pct"] = round(rnd.uniform(58, 86), 1)
        s["dock_to_stock_h"] = round(rnd.uniform(1.6, 3.4), 1)
        s["pick_accuracy"] = round(rnd.uniform(99.4, 99.9), 2)
        s["clients"] = [c["id"] for c in clients if c["site"] == s["id"]]

    # ---- fleet: every truck with a driver, a home site and today's job
    trucks, n = [], 2101
    for f in cfg["fleet"]:
        for _ in range(f["count"]):
            c = rnd.choice(clients)
            trucks.append({"id": f"TRK-{n}", "type": f["type"], "code": f["code"], "pallets": f["pallets"], "reefer": f["reefer"],
                           "colour": f["colour"], "stripe": f["stripe"], "driver": rnd.choice(FIRST), "client": c["id"],
                           "site": c["site"], "to": rnd.choice(PLACES[c["id"]]),
                           "temp": (round(rnd.uniform(2.8, 6.2), 1) if f["reefer"] else None)})
            n += rnd.randint(1, 7)
    # ---- forklifts per site
    forklifts = []
    for s in sites.values():
        for k in range(s["forklifts"]):
            forklifts.append({"id": f"FL-{s['id'][-2:]}{k + 1:02d}", "site": s["id"],
                              "type": ["Counterbalance", "Reach truck", "Electric pallet jack"][k % 3],
                              "operator": rnd.choice(FIRST), "battery": rnd.randint(34, 98)})

    # ---- today's shipments (one per truck): stage by time of day in the page; here the plan
    ships = []
    for i, t in enumerate(trucks):
        c = next(x for x in clients if x["id"] == t["client"])
        ships.append({"id": f"SHP-{78400 + i * 3 + rnd.randint(0, 2)}", "truck": t["id"], "client": c["id"], "client_name": c["name"],
                      "from": t["site"], "to": t["to"], "pallets": rnd.randint(max(1, t["pallets"] // 3), t["pallets"]),
                      "window": f"{rnd.randint(6, 14):02d}:{rnd.choice(['00', '30'])}", "temp": c["temp"]})

    # ---- network KPIs
    tot_stock = sum(s["stock"] for s in sites.values())
    cap = sum(s["pallet_positions"] for s in sites.values())
    otif = round(sum(c["deliveries_4wk"] - c["late"] for c in clients) / max(1, sum(c["deliveries_4wk"] for c in clients)) * 100, 1)
    kpis = {"stock": tot_stock, "capacity": cap, "fill_pct": round(tot_stock / cap * 100, 1), "otif": otif,
            "otif_prev": round(otif + rnd.uniform(-0.8, 0.6), 1), "deliveries": sum(c["deliveries"] for c in clients),
            "revenue_wk": sum(c["revenue_wk"] for c in clients), "trucks": len(trucks), "forklifts": len(forklifts),
            "temp_excursions": 1, "lti_free_days": 212, "staff": sum(s["staff_on_shift"] for s in sites.values()),
            "headcount": sum(r["count"] for r in cfg["roles"]) + len(cfg["management"])}

    # ---- what Shelly flagged (computed from the figures above)
    flags = []
    under = [c for c in sorted(clients, key=lambda x: x["otif"] - x["otif_target"]) if c["otif"] < c["otif_target"]]
    FIX = ["Re-plan the morning run and give them a priority dock slot.", "Check the pick cut-off: late orders are missing the first truck.",
           "Review the route: most misses are on the same run."]
    for j, c in enumerate(under[:3]):
        flags.append({"sev": "high" if c["status"] == "alert" else "med", "area": "Service",
                      "text": f"{c['name']} on-time-in-full {c['otif']}% against a {c['otif_target']}% target ({c['late']} of {c['deliveries_4wk']} deliveries late in 4 weeks). {FIX[j % 3]}", "client": c["id"]})
    reefer = next(t for t in trucks if t["reefer"])
    flags.append({"sev": "high", "area": "Cold chain", "text": f"{reefer['id']} reefer logged 8.6°C for 14 minutes at the dock (limit 8°C). Product checked and released by Quality; deviation report open, door-open time training booked.", "truck": reefer["id"]})
    full = max(sites.values(), key=lambda s: s["fill_pct"])
    if full["fill_pct"] > 70:
        flags.append({"sev": "med", "area": "Capacity", "text": f"{full['name']} is {full['fill_pct']}% full. Above 85% picking slows down: move slow stock to the Cross-Dock overflow or price peak storage.", "site": full["id"]})
    idle = min(sites.values(), key=lambda s: s["dock_util_pct"])
    busy = max([c for c in clients if c["site"] == idle["id"]] or clients, key=lambda c: c["deliveries"])
    flags.append({"sev": "low", "area": "Docks", "text": f"{idle['name']} docks are used {idle['dock_util_pct']}% of the day. Offer the spare morning slots to {busy['name']}, the busiest client there, or sell them to a new client.", "site": idle["id"]})
    low = min(forklifts, key=lambda f: f["battery"])
    flags.append({"sev": "low", "area": "Fleet", "text": f"Forklift {low['id']} battery at {low['battery']}%. Swap it before the afternoon despatch peak.", "forklift": low["id"]})

    # ---- decisions waiting (they also join Shelly's approvals tray through the Brain)
    decisions = [
        {"id": "gw-reefer-hire", "area": "Spend", "amount": 3400, "owner": "Transport Manager", "title": "Spot-hire 2 reefer trucks for Harbour Fresh's Friday–Saturday peak", "why": "Forecast 40 drops vs 31 reefer slots; late drops cost about $180 each in SLA credits."},
        {"id": "gw-night-ot", "area": "Spend", "amount": 2150, "owner": "Operations Manager", "title": "Overtime night shift at Cold Chain to clear Tōtara inbound containers", "why": "2 containers due Tuesday; dock-to-stock would otherwise exceed the 24 h GDP target."},
        {"id": "gw-new-client", "area": "New business", "amount": 0, "owner": "General Manager", "title": "Onboard Tūī Pharmacy Group: 3-month trial, 120 pallets, 2–8°C", "why": "Fits spare Cold Chain capacity; margin about 16% at the proposed rate."},
        {"id": "gw-batteries", "area": "Capex", "amount": 9800, "owner": "Fleet & Maintenance Manager", "title": "Replace lithium batteries on two Wiri reach trucks", "why": "Run time down to 4.5 h; a mid-shift swap costs about 40 minutes a day."},
    ]
    R = rosters(cfg, random.Random(int(wk.strftime("%Y%m%d")) + 7))
    for s in sites.values():
        s["cold_rooms"] = [dict(c, temp=round(c["set"] + rnd.uniform(-.6, .6), 1), fill_pct=round(rnd.uniform(62, 91), 1), door_opens_h=rnd.randint(9, 26))
                           for c in s.get("cold_rooms", [])]
        s["crew"] = R[s["id"]]["by_shift"]
    gaps = [(sid, c) for sid, r in R.items() for c in r["checks"] if not c["ok"]]
    for sid, c in gaps[:2]:
        flags.append({"sev": "med", "area": "Roster", "text": f"{sites[sid]['name']} · {c['text']}: not met. Move someone from another shift or book a temp.", "site": sid})
    bk = cfg["bookings"]
    bookings = {sid: [round(s["inbound_today"] + s["outbound_today"]) * bk[str(h)] / sum(bk.values()) for h in range(24)] for sid, s in sites.items()}
    return {"meta": {"name": cfg["company"]["name"], "short": cfg["company"]["short"], "module_version": cfg["company"]["module_version"],
                     "asof": asof.isoformat(), "week_start": wk.isoformat(), "synthetic": True},
            "company": cfg["company"], "kpis": kpis, "sites": list(sites.values()), "clients": clients, "fleet_types": cfg["fleet"],
            "trucks": trucks, "forklifts": forklifts, "shipments": ships, "stages": STAGES, "management": cfg["management"],
            "roles": cfg["roles"], "roadmap": cfg["roadmap"], "flags": flags, "decisions": decisions,
            "shifts": cfg["shifts"], "breaks": cfg["breaks"], "pay": cfg["pay"], "rosters": R, "bookings": bookings}


def write_js(data: dict, path: Path | str) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("window.SHELLY_GATEWAY = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    return p


def text(data: dict) -> str:
    k = data["kpis"]
    lines = [f"{data['meta']['name']} · week of {data['meta']['week_start']} (synthetic)",
             f"  {k['stock']:,} pallets stored of {k['capacity']:,} ({k['fill_pct']}%) · OTIF {k['otif']}% · {k['deliveries']} deliveries · ${k['revenue_wk']:,} revenue",
             f"  {k['trucks']} trucks · {k['forklifts']} forklifts · {k['headcount']} people"]
    for c in data["clients"]:
        lines.append(f"  {c['name']:<28} OTIF {c['otif']:>5}% (target {c['otif_target']}%)  {c['pallets_now']:>4} pallets  {c['status']}")
    lines += ["  Shelly flagged:"] + [f"   - [{f['sev']}] {f['area']}: {f['text']}" for f in data["flags"]]
    return "\n".join(lines)
