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


def test_robot_head():
    kit = (ROOT / "docs/kit/shelly-kit.js").read_text()
    head = (ROOT / "docs/kit/shelly-head.js").read_text()
    assert "kit/shelly-head.js" in kit and "bulb=(classic|3d)" in kit          # the head by default, the old bulb on request
    assert "export function mount(" in head and "function flat(" in head        # 3D head with a 2D fallback
    for m in ["idle", "thinking", "searching", "listening", "speaking", "working", "happy", "alert", "error", "sleeping"]:
        assert f"{m}:" in head, m
    assert "ShellyVoice" in head and "prefers-reduced-motion" in head and "window.ShellyHead" in head
    assert "./vendor/three.module.min.js" in head and "http" not in head.split("*/", 1)[1].split("\n", 1)[0]


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


def test_kit_files_are_version_stamped():
    """browsers keep an old saved copy of the mascot unless the address changes: every page asks for the kit
    with ?v=<version>, and the kit asks for the head and guide with the same version"""
    import re
    from shelly import __version__
    kit = (ROOT / "docs/kit/shelly-kit.js").read_text()
    assert f'const KIT_V = "{__version__}"' in kit and '"?v=" + KIT_V' in kit and 'shelly-guide.js?v=" + KIT_V' in kit
    for html in ROOT.glob("docs/**/*.html"):
        for ref in re.findall(r'shelly-kit\.(?:js|css)[^"]*"', html.read_text()):
            assert f"?v={__version__}" in ref, (html, ref)


def test_every_page_has_its_own_mascot_lines():
    """Shelly greets you with something about the page you're on (not the generic Launchpad line) and, on the
    newer pages, says something real about each section as the guide follows you down the page"""
    import re
    kit = (ROOT / "docs/kit/shelly-kit.js").read_text()
    for html in ROOT.glob("docs/**/index.html"):
        m = re.search(r'shelly-kit\.js[^"]*" data-page="([a-z]+)"', html.read_text())
        if m:
            assert re.search(rf"\n\s+{m.group(1)}: \[", kit), f"{html}: no welcome for data-page={m.group(1)}"
    for page in ("shift", "os", "ops", "group", "ask"):
        js = (ROOT / f"docs/{page}/app.js").read_text()
        ids = set(re.findall(r'<section id="([^"]+)"', (ROOT / f"docs/{page}/index.html").read_text()))
        said = set(re.findall(r'"(s-[a-z0-9-]+)": ', js.split("window.SHELLY_GUIDE", 1)[1]))
        assert ids <= said, f"{page}: no guide line for {ids - said}"
