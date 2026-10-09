"""Shelly Tower (module v1.3): the Shelly Business Tower, the group's head office and business complex.

Builds the data behind docs/tower/ from modules/tower/tower.yaml, following "Shelly Business Tower:
Integrated Architecture": every floor with its occupant, people and rent; Shelly OS (six layers, the agent
mesh, the decision ledger); the nine sectors matched to Shelly's businesses; sustainability, trust and
governance; the business model, phases and success measures; and the two looks (today and 2050).
Synthetic demo data, seeded by week; no real company, person or lease.

    python -m shelly tower        # prints the summary
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "modules" / "tower" / "tower.yaml"
LET = ("tenant", "available")


def load(path: Path | str = CFG) -> dict:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def _order(level: str) -> int:
    """Height order: B2 < B1 < G < 1.. < R."""
    if level == "R":
        return 999
    if level == "G":
        return 0
    if level.startswith("B"):
        return -int(level[1:])
    return int(level)


def build(cfg: dict | None = None, asof: date | None = None) -> dict:
    cfg = cfg or load()
    asof = asof or date.today()
    wk = asof - timedelta(days=asof.weekday())
    rnd = random.Random(int(wk.strftime("%Y%m%d")) + 31)
    t = cfg["tower"]
    try:
        from shelly.brain.registry import AGENTS, BUSINESSES
        agents = {b["id"]: sum(1 for a in AGENTS if a.business == b["id"]) for b in BUSINESSES}
        biz = {b["id"]: {"name": b["name"], "colour": b["colour"], "icon": b["icon"], "page": b["page"]} for b in BUSINESSES}
    except Exception:            # the tower page still builds without the Brain
        agents, biz = {}, {}
    floors = []
    for f in cfg["floors"]:
        f = dict(f)
        f["level"] = str(f["level"])
        f["order"] = _order(f["level"])
        k = cfg["kinds"][f["kind"]]
        f["kind_label"], f["colour"] = k["label"], f.get("brand") or k["colour"]
        if f.get("business") in biz:
            f["colour"] = biz[f["business"]]["colour"] if f["kind"] in ("business",) else f["colour"]
            f["agents"] = agents.get(f["business"], 0)
        f["sectors"] = [x["id"] for x in cfg.get("sectors", []) if f["level"] in [str(v) for v in x["floors"]]]
        f["area_m2"] = t["floor_m2"] if f["kind"] not in ("podium", "amenity", "basement") else int(t["floor_m2"] * (1.6 if f["kind"] == "podium" else 1.0))
        if f["kind"] == "tenant":
            f["rent_year"] = f["rent_m2"] * f["area_m2"]
        if f["kind"] == "available":
            f["enquiries"] = [e for e in cfg["leasing"]["enquiries"] if str(e["floor"]) == f["level"]]
        f["here_now"] = int(f.get("people", 0) * rnd.uniform(.62, .93))
        floors.append(f)
    floors.sort(key=lambda x: -x["order"])
    let = [f for f in floors if f["kind"] in LET]
    leased = [f for f in floors if f["kind"] == "tenant"]
    avail = [f for f in floors if f["kind"] == "available"]
    shelly_biz = sorted({f["business"] for f in floors if f.get("business") and f["kind"] in ("business", "core-business", "core-tech", "new")})
    rent = sum(f["rent_year"] for f in leased)
    revenue = [dict(r, year=rent if r["year"] == "rent" else r["year"]) for r in cfg.get("revenue", [])]
    rev_total = sum(r["year"] for r in revenue)
    for r in revenue:
        r["share"] = round(r["year"] / rev_total * 100, 1) if rev_total else 0
    sectors = []
    for x in cfg.get("sectors", []):
        x = dict(x, floors=[str(v) for v in x["floors"]])
        x["people"] = sum(f.get("people", 0) for f in floors if f["level"] in x["floors"])
        sectors.append(x)
    kpis = {
        "floors": sum(1 for f in floors if f["order"] > 0 and f["level"] != "R"), "levels": len(floors), "height_m": t["height_m"],
        "businesses": len({f["occupant"] for f in floors if f["kind"] in ("business",)}) + 1,   # + the group itself
        "shelly_floors": sum(1 for f in floors if f["kind"] in ("business", "core-business", "core-tech", "new", "shared")),
        "tenants": len(leased), "available": len(avail), "available_m2": sum(f["area_m2"] for f in avail),
        "occupancy_pct": round(len(leased) / len(let) * 100, 1) if let else 0,
        "rent_roll": rent, "rent_month": round(rent / 12),
        "people": sum(f.get("people", 0) for f in floors), "here_now": sum(f["here_now"] for f in floors),
        "visitors_today": rnd.randint(380, 720), "lift_trips_today": rnd.randint(4200, 6800),
        "solar_kw": round(rnd.uniform(120, 210)), "energy_mwh_wk": round(rnd.uniform(48, 62), 1),
        "agents": sum(agents.values()), "mesh_agents": len(cfg.get("mesh", [])), "sectors": len(sectors),
        "revenue_year": rev_total, "non_rent_pct": round((rev_total - rent) / rev_total * 100, 1) if rev_total else 0,
        "onsite_energy_pct": 18, "decisions_logged_pct": 100,
        "decisions_today": rnd.randint(1800, 2600), "asked_people_today": rnd.randint(9, 17),
    }
    flags = []
    if avail:
        a = min(avail, key=lambda f: _order(f["level"]))
        flags.append({"sev": "med", "area": "Leasing", "text": f"{len(avail)} floors ({kpis['available_m2']:,} m²) to let. Level {a['level']} is ready {a['available_from']}; "
                      f"letting all of them adds about ${sum(f['rent_m2'] * f['area_m2'] for f in avail):,} a year."})
    soon = sorted(leased, key=lambda f: f["lease_to"])[0]
    flags.append({"sev": "low", "area": "Lease expiry", "text": f"{soon['occupant']} (Level {soon['level']}) lease ends {soon['lease_to']}. Start the renewal talk 18 months out."})
    full = max((f for f in floors if f["kind"] in ("business", "core-tech", "core-business")), key=lambda f: f["people"] / f["area_m2"])
    flags.append({"sev": "low", "area": "Space", "text": f"{full['name']} (Level {full['level']}) is the busiest Shelly floor: {full['people']} people on {full['area_m2']:,} m². Hybrid-work forecasting can move a team to the flex floor on busy days."})
    behind = [x for x in cfg.get("kpis_targets", []) if x["pct"] < 80]
    if behind:
        flags.append({"sev": "med", "area": "Targets", "text": f"{len(behind)} of {len(cfg['kpis_targets'])} success measures are behind target in phase {cfg.get('current_phase', 1)}: "
                      + "; ".join(f"{x['kpi'].lower()} {x['now']} vs {x['target'].lower()}" for x in behind[:3]) + "."})
    return {"meta": {"name": t["name"], "short": t["short"], "module_version": t["module_version"], "asof": asof.isoformat(), "week_start": wk.isoformat(), "synthetic": True},
            "tower": t, "eras": cfg["eras"], "kinds": cfg["kinds"], "floors": floors, "kpis": kpis, "flags": flags,
            "leasing": cfg["leasing"], "roadmap": cfg["roadmap"], "businesses": biz, "shelly_businesses": shelly_biz,
            "principles": cfg.get("principles", []), "layers": cfg.get("layers", []), "trust_band": cfg.get("trust_band", []),
            "os_elevated": cfg.get("os_elevated", []), "os_new": cfg.get("os_new", []), "mesh": cfg.get("mesh", []),
            "negotiations": cfg.get("negotiations", []), "decision_tiers": cfg.get("decision_tiers", []), "ledger": cfg.get("ledger", []),
            "sectors": sectors, "sustainability": cfg.get("sustainability", []), "trust": cfg.get("trust", {}), "revenue": revenue,
            "phases": cfg.get("phases", []), "current_phase": cfg.get("current_phase", 1), "kpis_targets": cfg.get("kpis_targets", [])}


def write_js(data: dict, path: Path | str) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("window.SHELLY_TOWER = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    return p


def text(data: dict) -> str:
    k = data["kpis"]
    lines = [f"{data['meta']['name']} · week of {data['meta']['week_start']} (synthetic)",
             f"  {k['floors']} floors + roof and 2 basements · {k['shelly_floors']} Shelly floors · {k['tenants']} tenants · {k['available']} floors to let",
             f"  occupancy {k['occupancy_pct']}% of lettable floors · rent roll ${k['rent_roll']:,} a year · {k['people']} people work here"]
    for f in data["floors"]:
        lines.append(f"  L{f['level']:<3} {f['kind_label']:<20} {f['name']}")
    lines += ["  Shelly flagged:"] + [f"   - [{x['sev']}] {x['area']}: {x['text']}" for x in data["flags"]]
    return "\n".join(lines)
