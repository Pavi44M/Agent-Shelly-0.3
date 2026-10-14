"""Operations (v2.2): Gateway docks, labour and billing; Tōtara scorecards, expiry rescue and what-if; flows end to end."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _min(s):
    a, b = s.split(":"); return int(a) * 60 + int(b)


def test_docks_never_double_booked_and_cold_on_chilled():
    from shelly.ops.gateway_ops import run
    for d in run()["docks"]:
        by = {}
        for j in d["jobs"]:
            by.setdefault(j["dock"], []).append((_min(j["start"]), _min(j["end"])))
            if j["cold"] and d["chilled_docks"]: assert j["dock_kind"] == "chilled", j
            assert _min(j["start"]) >= j["window"]                      # never before the truck's window
        for spans in by.values():
            spans.sort()
            assert all(a[1] <= b[0] for a, b in zip(spans, spans[1:]))  # one truck per dock at a time
        assert all(c["wait"] > 30 for c in d["clashes"])


def test_labour_and_billing_add_up():
    from shelly.ops.gateway_ops import run
    r = run()
    for l in r["labour"]:
        for s in l["shifts"]:
            assert all(s["gaps"][k] == s["rostered"][k] - s["need"][k] for k in s["need"])
    for b in r["billing"]:
        assert abs(sum(x["amount"] for x in b["lines"]) - b["total"]) < 0.05 and b["contract"] > 0


def test_totara_scorecards_expiry_whatif():
    from shelly.ops.totara_ops import HEALTHCARE, run
    t = run()
    g = {s["grade"] for s in t["scorecards"]}; assert g <= {"A", "B", "C", "D"}
    assert all(s["ask"] and not s["ask"].startswith("keep") for s in t["scorecards"] if s["grade"] in "CD")
    custs = {c["customer_name"]: c["segment"] for c in json.loads((lambda x: x[x.index("{"):x.rstrip().rstrip(";").rindex("}") + 1])((ROOT / "docs/supply-chain/data.js").read_text()))["customers"]}
    for e in t["expiry"]:
        assert sum(o["qty"] for o in e["offers"]) + e["left_qty"] == e["at_risk_qty"]
        if e["name"].startswith(("Syringe", "Enoxaparin", "Lidocaine", "Paracetamol")):   # medicines and clinical items: healthcare clients only
            assert all(custs[o["client"]] in HEALTHCARE for o in e["offers"]), e["name"]
    w = t["what_if"]
    for s in t["suppliers"]:
        assert w[f"{s['id']}:28"]["revenue"] >= w[f"{s['id']}:7"]["revenue"]            # later is never cheaper


def test_flows_cross_three_businesses():
    from shelly.ops.gateway_ops import run as g
    from shelly.ops.flow import run
    flows = run(g())
    bizes = {s["biz"] for f in flows for s in f["steps"]}
    assert {"store", "gateway", "totara"} <= bizes
    assert any("waits" in s["gate"] for f in flows for s in f["steps"])                  # a person signs off along the way


def test_ops_page():
    page = (ROOT / "docs/ops/index.html").read_text()
    assert "../data/ops.js" in page and 'src="boot.js"' in page
    assert 'ops/"' in (ROOT / "docs/index.html").read_text()
    from shelly.core.skills import load_all
    assert {"ops.docks", "ops.billing", "ops.whatif"} <= set(load_all())
