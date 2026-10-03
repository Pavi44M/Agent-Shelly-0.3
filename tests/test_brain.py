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


def test_mascot_assets():
    kit = (ROOT / "docs/kit/shelly-kit.js").read_text()
    assert "shelly-bulb3d.js" in kit and "function bulb(" in kit and "function life(" in kit
    for f in ["shelly-bulb3d.js", "vendor/RoomEnvironment.js", "vendor/three.module.min.js"]:
        assert (ROOT / "docs/kit" / f).exists(), f
    assert "./three.module.min.js" in (ROOT / "docs/kit/vendor/RoomEnvironment.js").read_text()


def test_departments_and_heads():
    from shelly.brain.registry import DEPARTMENTS, AGENTS
    ids = {a.id: a for a in AGENTS}
    assert {d.id for d in DEPARTMENTS} == {"mgmt", "finance", "sales", "inventory", "office", "hr", "it", "dev"}
    for d in DEPARTMENTS:
        assert d.head_agent in ids and ids[d.head_agent].department == d.id
        for a in AGENTS:   # every agent reports to its own head
            if a.department == d.id and a.id != d.head_agent:
                assert d.head_agent in a.hands_off_to, a.id


def test_approval_chains():
    from shelly.brain.registry import approval_chain
    roles = lambda *a: [c["role"] for c in approval_chain(*a)]
    assert roles("inventory", "Purchase order", 1500) == ["Inventory Manager"]                       # within the head's limit
    assert roles("inventory", "Purchase order", 5000) == ["Inventory Manager", "Finance Manager"]    # over it: funds check
    assert roles("inventory", "Purchase order", 14600)[-1].startswith("Pavi")                       # over Finance's limit
    assert roles("office", "Pay run", 11840) == ["Office Manager", "Finance Manager"]               # shifts → pay
    assert roles("hr", "Hiring", 0) == ["HR Advisor", "Finance Manager", "Pavi (Managing Director)"]
    assert roles("mgmt", "Opportunity funding", 6500) == ["Chief of Staff", "Finance Manager", "Pavi (Managing Director)"]


def test_hq_v2_assets():
    js = (ROOT / "docs/data/brain.js").read_text()
    for k in ['"tasks"', '"routines"', '"opportunities"', '"policy"', '"head_agent"']:
        assert k in js, k
    ap = (ROOT / "docs/data/approvals.js").read_text()
    assert '"chain"' in ap and '"source":"org"' in ap
    assert (ROOT / "docs/brain/hq-panels.js").exists()
    assert 'id="hqLeft"' in (ROOT / "docs/brain/index.html").read_text()
