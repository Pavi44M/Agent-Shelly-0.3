"""Loss Prevention: the policy refuses anything that identifies people or leaves Shelly's businesses, the
concealment gesture needs a reach first, a case needs the whole pattern, and tuning is held-out checked."""
import copy
import json
from pathlib import Path

import pytest

from shelly.lp import pose as P
from shelly.lp.cases import CaseEngine, score
from shelly.lp.policy import PolicyError, allowed_site, check_action, validate
from shelly.lp.run import load_cfg

ROOT = Path(__file__).resolve().parents[1]


def cfg():
    return load_cfg(live=False)


@pytest.mark.parametrize("path,value", [(("privacy", "biometrics"), True), (("privacy", "face_match"), True), (("privacy", "identity"), "name"),
                                        (("privacy", "per_person_score"), True), (("privacy", "demographics"), True), (("privacy", "store_frames"), True),
                                        (("privacy", "retention_days"), 365), (("scope", "internal_only"), False), (("scope", "expansion"), "open")])
def test_policy_refuses_identity_biometrics_and_scope_changes(path, value):
    c = cfg(); c[path[0]][path[1]] = value
    with pytest.raises(PolicyError): validate(c)


def test_scope_is_locked_to_shelly_businesses():
    c = cfg()
    assert all(allowed_site(c, b) for b in ("store", "gateway", "totara", "group"))
    assert not allowed_site(c, "someone-elses-shop")
    c2 = copy.deepcopy(c); c2["sites"]["other"] = {**c["sites"]["store"], "business": "acme"}
    with pytest.raises(PolicyError): validate(c2)
    with pytest.raises(PolicyError): check_action("chase")


def frames(keys, cx=640, fps=5, dur=None):
    dur = dur or keys[-1][0] + .4
    return [(i / fps, P.skeleton(cx, 600, 430, [(.25, 1.04, .9), P.wrist_path(keys, i / fps)])) for i in range(int(dur * fps))]


def run(keys, params=None):
    g = P.Gestures(params)
    for t, k in frames(keys): g.update(t, 1, k)
    return [e["kind"] for e in g.events]


def test_face_points_are_dropped():
    k = P.strip_face(P.skeleton(640, 600, 430, [(.2, 1, .9), (.2, 1, .9)]))
    assert all(k[i] == [0.0, 0.0, 0.0] for i in P.FACE) and k[P.L_WR][2] > 0


def test_reach_then_pocket_is_a_gesture_but_pocket_alone_is_not():
    reach_pocket = [(0, .25, 1.04, .9), (1, 1.1, .3, .9), (1.6, 1.0, .3, .9), (2.0, .0, 1.0, .15), (3.5, .0, 1.02, .15), (4, .25, 1.04, .9)]
    phone = [(0, .25, 1.04, .9), (1, .0, 1.0, .2), (3, .0, 1.02, .2), (3.5, .25, 1.04, .9)]
    arms = [(0, .25, 1.04, .9), (1, -.6, .5, .5), (6, -.6, .5, .5)]
    basket = [(0, .25, 1.04, .9), (1, 1.1, .3, .9), (1.6, 1.0, .3, .9), (2.2, .7, 1.0, .9), (3, .7, 1.0, .9), (3.5, .25, 1.04, .9)]
    tuned = {"pocket_box": .15, "window_s": 2.0, "hold_s": 1.0}
    assert "conceal" in run(reach_pocket, tuned)
    assert "conceal" not in run(phone, tuned) and "conceal" not in run(arms, tuned) and "conceal" not in run(basket, tuned)


def test_a_case_needs_the_whole_pattern():
    e = CaseEngine(cfg(), "store")
    pick, conceal = {"kind": "pick", "t": 10, "zone": "spirits"}, {"kind": "conceal", "t": 12, "conf": .8}
    assert e.visit(1, [pick, {"kind": "exit", "t": 90}]) is None                                  # browsed, left: nothing
    assert e.visit(2, [conceal, {"kind": "exit", "t": 90}]) is None                               # phone in pocket: nothing
    assert e.visit(3, [pick, conceal, {"kind": "till", "t": 60, "cats": ["spirits"]}, {"kind": "exit", "t": 90}]) == "assist"   # own bag, paid
    assert e.visit(4, [pick, conceal, {"kind": "till", "t": 60, "cats": ["bread"]}, {"kind": "exit", "t": 90}]) == "review"     # paid for bread only
    c = e.cases[-1]
    assert c["clip"]["faces"] == "pixelated" and c["clip"]["seconds"] >= 20 and c["value"] > 0
    keys = set()
    def walk(o):
        if isinstance(o, dict): keys.update(o); [walk(v) for v in o.values()]
        elif isinstance(o, list): [walk(v) for v in o]
    walk(e.public())
    assert not keys & {"name", "face", "face_id", "gender", "age", "ethnicity", "person", "track", "score_person"}


def test_tuning_is_held_out_checked_and_within_budget():
    d = (ROOT / "docs/data/lp.js").read_text(encoding="utf-8"); D = json.loads(d[d.index("{"):d.rstrip().rstrip(";").rindex("}") + 1])
    tu = D["tuning"]
    for l in tu["log"]:
        assert (l["kept"] and l["gain"] >= 1) or not l["kept"]
    assert tu["final"]["held"]["false_per_day"] <= tu["budget"] < tu["start"]["held"]["false_per_day"]
    assert tu["status"] == "waiting for Pavi"
    assert D["privacy"]["biometrics"] is False and D["scope"]["internal_only"] is True and set(D["sites"]) == {"store", "gateway", "totara", "group"}
    look = D["lookalike"]["tuned"]
    for k in ("phone", "arms"): assert look[k]["review"] == 0


def test_every_site_scores_against_the_truth():
    from shelly.lp.simulate import site_day
    for s in ("gateway", "totara", "group"):
        eng, truth = site_day(cfg(), s, 5)
        r = score(eng, truth)
        assert r["true"] == truth["losses"]          # system rules open a case for every real event; people explain the rest


def test_page_brain_and_skills():
    page = (ROOT / "docs/lp/index.html").read_text(encoding="utf-8")
    assert "Content-Security-Policy" in page and "../data/lp.js" in page and "app.js" in page
    from shelly.brain.registry import AGENTS
    assert {"lp-store", "lp-warehouse", "lp-tower", "lp-cases"} <= {a.id for a in AGENTS}
    from shelly.core.skills import load_all
    assert {"lp.unpaid_exit", "lp.evidence", "lp.pia"} <= set(load_all())
