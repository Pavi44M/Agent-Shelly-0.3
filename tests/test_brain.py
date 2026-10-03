import json, re
from pathlib import Path

from shelly.brain.registry import AGENTS, DEPARTMENTS, BUSINESSES, org
from shelly.brain.orchestrator import ask

ROOT = Path(__file__).resolve().parents[1]


def test_registry_is_consistent():
    deps = {d.id for d in DEPARTMENTS}
    bizs = {b["id"] for b in BUSINESSES}
    ids = [a.id for a in AGENTS]
    assert len(ids) == len(set(ids))
    for a in AGENTS:
        assert a.department in deps and a.business in bizs
        assert a.autonomy in ("auto", "suggest", "approve")
        for h in a.hands_off_to:
            assert h in ids, (a.id, h)
    o = org()
    assert len(o["agents"]) == len(AGENTS)


def test_routing():
    cases = {
        "which medical products will run out this week?": "Stock & expiry agent",
        "what do I need to order?": "Ordering agent",
        "make a budget for next quarter": "Budget agent",
        "how many hours should I roster": "Roster agent",
    }
    for q, want in cases.items():
        r = ask(q)
        assert r["in_scope"] and r.get("agent_name") == want, (q, r)
    assert ask("book me a flight")["in_scope"] is False


def test_site_outputs():
    js = (ROOT / "docs/data/brain.js").read_text()
    brain = json.loads(re.sub(r"^window\.SHELLY_BRAIN\s*=\s*|;\s*$", "", js.strip()))
    assert len(brain["agents"]) == len(AGENTS)
    ap = (ROOT / "docs/data/approvals.js").read_text()
    assert "SHELLY_APPROVALS" in ap
    for page in ["index.html", "launchpad/index.html", "supply-chain/index.html", "brain/index.html"]:
        html = (ROOT / "docs" / page).read_text()
        assert "shelly-kit.js" in html and "apBadge" in html, page


def test_hq_assets():
    html = (ROOT / "docs/brain/index.html").read_text()
    assert 'type="module" src="hq.js"' in html and 'id="hq"' in html and 'id="tabMap"' in html
    assert (ROOT / "docs/brain/hq.js").exists() and (ROOT / "docs/kit/vendor/three.module.min.js").exists()
