"""Shelly Tower (module v1.3): data builder, page, brain and approvals."""
import json
from datetime import date
from pathlib import Path

from shelly.tower import build, load

ROOT = Path(__file__).resolve().parents[1]


def test_build_is_consistent_and_seeded():
    a, b = build(asof=date(2026, 10, 7)), build(asof=date(2026, 10, 8))
    assert a["kpis"] == b["kpis"]                                       # same week, same numbers
    cfg = load()
    F = a["floors"]
    assert len(F) == len(cfg["floors"]) and len({f["level"] for f in F}) == len(F)
    assert [f["order"] for f in F] == sorted((f["order"] for f in F), reverse=True)   # top floor first
    assert F[0]["level"] == "R" and F[-1]["level"] == "B3"
    k = a["kpis"]
    leased = [f for f in F if f["kind"] == "tenant"]
    assert k["tenants"] == len(leased) and k["rent_roll"] == sum(f["rent_m2"] * f["area_m2"] for f in leased)
    assert k["occupancy_pct"] == round(len(leased) / (len(leased) + k["available"]) * 100, 1)
    for need in ("core-business", "core-tech", "business", "new", "tenant", "available"):
        assert any(f["kind"] == need for f in F), need
    # every Shelly business has its own floor
    assert {f["business"] for f in F if f["kind"] == "business"} >= {"store", "totara", "gateway"}
    # the cores sit above the businesses, the tenants below them
    top = min(f["order"] for f in F if f["kind"] in ("core-business", "core-tech"))
    assert top > max(f["order"] for f in F if f["kind"] == "business") > max(f["order"] for f in F if f["kind"] == "tenant")
    assert all(f.get("available_from") for f in F if f["kind"] == "available")
    assert [e["id"] for e in a["eras"]] == ["now", "future"] and any(x["area"] == "Leasing" for x in a["flags"])


def test_page_and_data_are_built_and_synthetic():
    page = (ROOT / "docs/tower/index.html").read_text()
    assert "{{SWITCH}}" not in page and 'href="../tower/" aria-current="page"' in page
    assert "script-src 'self'" in page and "synthetic" in page.lower()
    s = (ROOT / "docs/data/tower.js").read_text()
    d = json.loads(s[s.index("{"):s.rstrip().rstrip(";").rindex("}") + 1])
    assert d["meta"]["synthetic"] is True and d["meta"]["module_version"] == "1.3"
    for f in ["world.js", "app.js", "boot.js", "tower.css"]:
        assert (ROOT / "docs/tower" / f).exists()
    js = (ROOT / "docs/tower/world.js").read_text()
    for needle in ("function buildInterior", "function setEra", "skyFut", "sats", "flyers", "worldMap", "pods50", "air50", "SKY", "lowIM", "ddrones", "sbots"):
        assert needle in js
    for p in ["docs/index.html", "docs/gateway/index.html", "docs/brain/index.html", "docs/launchpad/index.html"]:
        assert 'href="' in (ROOT / p).read_text() and "tower/" in (ROOT / p).read_text(), p


def test_brain_knows_the_tower_and_its_lease():
    from shelly.brain.registry import AGENTS, ORG_REQUESTS, approval_chain
    a = next(x for x in AGENTS if x.id == "tower-leasing")
    assert a.department == "office" and a.business == "group"
    for m in ("workplace", "retail", "logistics", "trade", "mobility", "energy", "security", "concierge"):
        assert any(x.id == "tower-" + m and x.team == "Shelly Group · Shelly OS" for x in AGENTS), m
    r2 = next(x for x in ORG_REQUESTS if x["id"] == "tw-mfc-restock")
    assert [c["role"] for c in approval_chain(r2["dept"], r2["area"], r2["amount"])][-1].startswith("Pavi")   # over Finance's limit
    r = next(x for x in ORG_REQUESTS if x["id"] == "tw-lease-12")
    assert approval_chain(r["dept"], r["area"], r["amount"])[-1]["role"].startswith("Pavi")   # a new lease always reaches Pavi
