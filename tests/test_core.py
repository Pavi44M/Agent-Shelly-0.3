"""Tests for Shelly Core v0.3: skills, decisions, learning, packs, connectors."""
import pandas as pd
import pytest


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    monkeypatch.setenv("SHELLY_STATE_DIR", str(tmp_path))
    import importlib
    import shelly.core.decisions as d
    import shelly.core.learning as l
    importlib.reload(d); importlib.reload(l)
    yield


def test_all_packs_register_skills():
    from shelly.core.skills import load_all
    R = load_all()
    for pack in ["retail", "electronics", "wholesale", "warehousing", "production"]:
        assert any(s.pack == pack for s in R.values()), pack
    assert R["electronics.aged_stock"].confirm and not R["production.oee"].confirm


def test_decision_lifecycle_and_audit_trail(tmp_path):
    from shelly.core.decisions import DecisionLog
    log = DecisionLog(tmp_path / "d.jsonl")
    ev = log.propose(asof="2026-09-25", pack="retail", area="Markdown", rule="x", statement="Mark down A 20%",
                     evidence={}, impact_nzd=-500, confidence=0.7)
    assert ev["status"] == "pending"
    again = log.propose(asof="2026-09-25", pack="retail", area="Markdown", rule="x", statement="Mark down A 20%",
                        evidence={}, impact_nzd=-500)
    assert again["id"] == ev["id"] and len(log.state()) == 1          # no duplicates
    log.decide(ev["id"], "rejected", "promo week")
    st = log.state().set_index("id").loc[ev["id"]]
    assert st["status"] == "rejected" and st["note"] == "promo week"
    assert len(log._events()) == 2                                     # append-only history kept


def test_governance_policy():
    from shelly.core.decisions import needs_confirmation
    pol = {"confirm_if_impact_over_nzd": 250, "always_confirm_areas": ["Credit"]}
    assert needs_confirmation({"area": "Credit", "weekly_impact_nzd": 0}, pol)
    assert needs_confirmation({"area": "Waste", "weekly_impact_nzd": -400}, pol)
    assert not needs_confirmation({"area": "Waste", "weekly_impact_nzd": -40}, pol)


def test_learning_tightens_after_repeated_rejections():
    from shelly.core import learning
    rows = [{"area": "Demand", "status": "rejected"}] * 6 + [{"area": "Demand", "status": "confirmed"}]
    s, ch = learning.learn_from_decisions(pd.DataFrame(rows), learning.load())
    assert ch and ch[0]["knob"] == "spike_z" and ch[0]["to"] > ch[0]["from"]
    cfg = learning.apply_to_config({"analysis": {}, "kpi_targets": {}}, s)
    assert cfg["analysis"]["spike_z"] == ch[0]["to"]


def test_learning_needs_enough_evidence():
    from shelly.core import learning
    s, ch = learning.learn_from_decisions(pd.DataFrame([{"area": "Demand", "status": "rejected"}] * 2), learning.load())
    assert ch == []


@pytest.mark.parametrize("pack", ["electronics", "wholesale", "warehousing", "production"])
def test_packs_run_and_produce_findings(pack):
    from shelly.core.skills import load_all
    from shelly.packs import pack_markdown, run_pack
    load_all()
    res = run_pack(pack)
    assert res["findings"], pack
    md = pack_markdown(res)
    assert md.startswith("# Shelly")


def test_oee_math():
    from shelly.core.skills import load_all
    load_all()
    from shelly.packs.production import oee
    runs = pd.DataFrame([{"date": "2026-09-01", "line": "L", "planned_min": 100, "downtime_min": 20, "ideal_units_per_min": 10,
                          "units": 640, "good_units": 608, "scheduled_units": 700}])
    r = oee({"runs": runs}).table.iloc[0]
    assert r["availability"] == 80.0 and r["performance"] == 80.0 and r["quality"] == 95.0 and r["oee"] == pytest.approx(60.8)


def test_connectors_folder_and_extension_registry(tmp_path):
    from shelly.core.connectors import KINDS, Connector, build
    (tmp_path / "sales.csv").write_text("a,b\n1,2\n")
    c = build([{"name": "x", "kind": "folder", "path": str(tmp_path)}])["x"]
    assert c.read("sales").shape == (1, 2)

    class Dummy(Connector):
        kind = "dummy_test"
    assert "dummy_test" in KINDS
