"""Group HQ (v2.3): P&L adds up with eliminations, cash flow, close, people (roles only), procurement, governance."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_pnl_adds_up_and_eliminations_cancel():
    from shelly.group.hq import run
    P = run()["pnl"]
    for v in P["by_business"].values():
        assert v["ebitda"] == sum(v["lines"].values())
    assert P["group_revenue"] == sum(v["revenue"] for v in P["by_business"].values()) + P["eliminations"]
    el = P["elim_lines"]; assert el["Revenue"] == -(el["Warehousing (Gateway)"] + el["Distribution (Gateway)"])   # revenue and cost both go
    assert P["group_ebitda"] == sum(v["ebitda"] for v in P["by_business"].values())


def test_cash_flow_rolls_forward():
    from shelly.group.hq import run
    c = run()["cash"]; bal = c["opening"]
    for w in c["weeks"]:
        bal += w["in"] + w["out"]; assert abs(bal - w["close"]) <= 13
    assert c["low"]["close"] == min(w["close"] for w in c["weeks"]) and c["warn"] == (c["low"]["close"] < c["buffer"])


def test_people_roles_only_and_certs():
    from shelly.group.hq import run
    p = run()["people"]
    assert all(set(r) == {"business", "role", "count", "pay_week"} for r in p["rows"])           # no names anywhere
    assert p["headcount"] == sum(r["count"] for r in p["rows"])
    assert any("Manager's Certificate" in c["what"] for c in p["certs"])


def test_governance_limits_and_audit():
    from shelly.group.hq import run
    from shelly.brain.registry import AGENTS
    r = run()
    assert len(r["limits"]) == len(AGENTS)
    for l in r["limits"]:
        assert (l["cap_nzd"] > 0) == (l["autonomy"] == "auto") and l["cap_nzd"] <= 500
        assert "Pay run" in l["always_escalates"] and "Hiring" in l["always_escalates"]
    assert len(r["audit"]) >= 100 and r["board"]["decisions"][0]["what"].startswith("Approve the action limits")
    t = (ROOT / "docs/data/approvals.js").read_text()
    assert "gov-limits" in t                                                                     # the limits wait in Pavi's approvals


def test_group_page():
    page = (ROOT / "docs/group/index.html").read_text()
    assert "../data/group.js" in page and 'src="boot.js"' in page
    t = (ROOT / "docs/data/group.js").read_text(); d = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
    assert d["procurement"] and d["close"] and d["board"]["headline"]
    assert 'group/"' in (ROOT / "docs/index.html").read_text()
