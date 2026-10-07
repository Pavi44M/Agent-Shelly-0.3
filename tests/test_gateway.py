"""Gateway Warehousing & Transport (module v1.1): data builder, page, brain and approvals."""
import json
from datetime import date
from pathlib import Path

from shelly.gateway import build, load

ROOT = Path(__file__).resolve().parents[1]


def test_build_is_consistent_and_seeded():
    a, b = build(asof=date(2026, 10, 7)), build(asof=date(2026, 10, 8))
    assert a["kpis"] == b["kpis"]                                   # same week, same numbers
    cfg = load()
    assert len(a["sites"]) == len(cfg["sites"]) == 3 and len(a["clients"]) == 6
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
    assert d["meta"]["synthetic"] is True and d["meta"]["module_version"] == "1.1"
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
