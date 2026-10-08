"""Gateway Warehousing & Transport (module v1.3): data builder, page, brain, approvals, sorting centres."""
import json
from datetime import date
from pathlib import Path

from shelly.gateway import build, load

ROOT = Path(__file__).resolve().parents[1]


def test_build_is_consistent_and_seeded():
    a, b = build(asof=date(2026, 10, 7)), build(asof=date(2026, 10, 8))
    assert a["kpis"] == b["kpis"]                                   # same week, same numbers
    cfg = load()
    assert len(a["sites"]) == len(cfg["sites"]) == 5 and len(a["clients"]) == 6
    assert sum(1 for s in a["sites"] if s.get("processing")) == 2
    for c in a["clients"]:                                          # OTIF is computed from whole deliveries
        assert c["otif"] == round((c["deliveries_4wk"] - c["late"]) / c["deliveries_4wk"] * 100, 1)
        assert c["status"] in {"ok", "watch", "alert"}
    assert sum(1 for c in a["clients"] if c["otif"] < c["otif_target"]) >= 1
    assert a["kpis"]["trucks"] == sum(f["count"] for f in cfg["fleet"]) == len(a["shipments"])
    assert a["kpis"]["forklifts"] == sum(s["forklifts"] for s in cfg["sites"])
    assert all(t["temp"] is not None for t in a["trucks"] if t["reefer"])
    assert {m["id"] for m in a["management"]} >= {"gm", "ops", "whm", "tpm", "ccq", "hse", "cam", "fin"}
    assert any(f["area"] == "Cold chain" for f in a["flags"]) and len(a["decisions"]) == 4


def test_page_and_data_are_built_and_synthetic():
    page = (ROOT / "docs/gateway/index.html").read_text()
    assert "{{SWITCH}}" not in page and 'href="../gateway/" aria-current="page"' in page
    assert "script-src 'self'" in page and "synthetic" in page.lower()
    s = (ROOT / "docs/data/gateway.js").read_text()
    d = json.loads(s[s.index("{"):s.rstrip().rstrip(";").rindex("}") + 1])
    assert d["meta"]["synthetic"] is True and d["meta"]["module_version"] == "1.3"
    for f in ["world.js", "app.js", "boot.js", "gateway.css"]:
        assert (ROOT / "docs/gateway" / f).exists()


def test_brain_knows_gateway_and_its_approvals():
    from shelly.brain.registry import AGENTS, BUSINESSES, ORG_REQUESTS, approval_chain
    assert any(b["id"] == "gateway" for b in BUSINESSES)
    gw = [a for a in AGENTS if a.business == "gateway"]
    assert len(gw) >= 5 and all(a.team.startswith("Gateway") for a in gw)
    reqs = {r["id"]: r for r in ORG_REQUESTS if r["id"].startswith("gw-")}
    assert set(reqs) == {d["id"] for d in build()["decisions"]}
    chain = approval_chain(reqs["gw-new-client"]["dept"], reqs["gw-new-client"]["area"], 0)
    assert chain[-1]["role"].startswith("Pavi")                    # new business always reaches Pavi


def test_rosters_shifts_and_cold_rooms():
    d = build(asof=date(2026, 10, 7))
    assert [s["id"] for s in d["shifts"]] == ["day", "aft", "night"]
    for site in d["sites"]:
        R = d["rosters"][site["id"]]
        assert set(R["by_shift"]) == {"day", "aft", "night"} and all(n > 5 for n in R["by_shift"].values())
        for sh in ("day", "aft", "night"):                         # every shift has a supervisor, a first aider, gate and yard
            on = [p for p in R["people"] if p["shift"] == sh]
            assert any(p["role"] == "Shift Supervisor" for p in on) and any(p["first_aid"] for p in on)
            assert sum(p["role"] == "Gatehouse Officer" for p in on) == 2 and any(p["role"] == "Yard Marshal" for p in on)   # Gate 1 in, Gate 2 out
            assert any(p["role"] in ("Sort Supervisor", "Sort Centre Manager") for p in on) and any(p["role"] == "Sort Operative" for p in on)
        ops = [p for p in R["people"] if p["role"] == "Forklift Operator"]
        assert all(p["forklift_licence"] for p in ops)
        assert (site["cold_rooms"] or site.get("processing")) and all(c["low"] <= c["temp"] <= c["high"] for c in site["cold_rooms"])
        assert len(d["bookings"][site["id"]]) == 24
    gaps = [c for R in d["rosters"].values() for c in R["checks"] if not c["ok"]]
    assert gaps and any(f["area"] == "Roster" for f in d["flags"])     # the leave gap is flagged, not hidden


def test_sorting_centres_and_workstations():
    d = build(asof=date(2026, 10, 7))
    for site in d["sites"]:
        so = site["sort"]
        assert so["chutes"] == len(d["clients"]) + 2 and set(so["by_client"]) == {c["id"] for c in d["clients"]}
        assert so["parcels_today"] == sum(so["by_client"].values()) and so["workstations"] >= so["benches"]
        packers = [p for p in d["rosters"][site["id"]]["people"] if p["role"] == "Pick & Pack Operative"]
        assert packers and all(sum(q["shift"] == p["shift"] for q in packers) <= so["benches"] for p in packers)
    big = [s for s in d["sites"] if s.get("processing")]
    assert all(s["sort"]["benches"] > max(x["sort"]["benches"] for x in d["sites"] if not x.get("processing")) for s in big)
    assert any(m["id"] == "spm" for m in d["management"]) and d["kpis"]["sorted_today"] > 0
    assert any(f["area"] == "Sorting" for f in d["flags"])
    js = (ROOT / "docs/gateway/world.js").read_text()
    for needle in ("function stepSort", "function makePC", "function tryLock", "function onRoad", "fleetCall", "turnIn"):
        assert needle in js
