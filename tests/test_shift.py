"""Store Shift Pilot (v2.1): demand sensing marked honestly, the roster rule, the shift day, the Skill Lab, the page."""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DAY = date(2026, 9, 25)


def test_history_is_the_same_every_build():
    from shelly.shift.sensing import history
    a, b = history(DAY), history(DAY)
    assert a == b and len(a) == 182 and a[-1]["date"] == DAY.isoformat()


def test_exam_is_one_day_ahead_and_honest():
    from shelly.shift import sensing as S
    rows = S.history(DAY); e = S.exam(rows, 14)
    assert len(e["actual"]) == 14 and set(e["wape"]) == {"naive", "weekday", "sensing"}
    i = len(rows) - 14                       # the first exam day is forecast only from the days before it
    assert e["sensing"][0] == round(S.predict(S.fit(rows[:i]), rows[i], i))
    assert e["champion"] == min(e["wape"], key=e["wape"].get)


def test_sensing_finds_the_real_drivers():
    from shelly.shift import sensing as S
    eff = {e["driver"]: e for e in S.effects(S.history(DAY))}
    for f in ("rain_10mm", "holiday", "event", "payday"):          # right direction, sensible size
        assert (eff[f]["learned_pct"] > 0) == (eff[f]["true_pct"] > 0), f
    assert abs(eff["event"]["learned_pct"] - eff["event"]["true_pct"]) < 10


def test_a_model_takes_the_roster_only_by_winning_both_checks():
    from shelly.shift import sensing as S
    from shelly.shift.pilot import choose_model
    c = choose_model(S.history(DAY)[:-1])
    if c["live"] != "weekday":
        assert c["exam14"]["wape"][c["live"]] < c["exam14"]["wape"]["weekday"] and c["exam56"]["wape"][c["live"]] < c["exam56"]["wape"]["weekday"]
    else:
        for m in ("naive", "sensing"):
            assert not (c["exam14"]["wape"][m] < c["exam14"]["wape"]["weekday"] and c["exam56"]["wape"][m] < c["exam56"]["wape"]["weekday"])


def test_shift_day_brief_tasks_and_handover():
    from shelly.shift.pilot import build
    d = build(DAY); b, c, t = d["brief"], d["closing"], d["tasks"]
    assert b["low"] < b["forecast"] < b["high"] and len(b["top3"]) == 3
    assert [x["at"] for x in t] == sorted(x["at"] for x in t)
    assert any(x["source"] == "Compliance" and "Liquor" in x["title"] for x in t)     # never skipped
    assert any(x["source"] == "Event bus" for x in t)                                  # Shelly OS feeds the day
    assert c["tasks"]["total"] == len(t) and any("Tomorrow" in h for h in c["handover"])
    so = next(x for x in t if x["title"].startswith("Sign off"))
    hand = " ".join(c["handover"])
    assert ("still wait" in hand) == (so["status"] == "open")                          # the handover matches what happened


def test_skill_lab_levels():
    from shelly.shift import lab
    r = lab.run(DAY)
    assert set(r["skills"]) == {"shift.forecast", "shift.reorder", "shift.roster"}
    for v in r["skills"].values():
        assert len(v["scores"]) == 14 and 1 <= v["level"] <= 5
    fills = {t["k"]: t["fill"] for t in r["reorder_trials"]}
    ok = [k for k, f in fills.items() if f >= lab.TARGET_FILL]
    assert r["reorder_chosen"] == (min(ok) if ok else max(fills, key=fills.get))         # the leanest that holds the target


def test_shift_page_and_brain():
    page = (ROOT / "docs/shift/index.html").read_text()
    assert "../data/shift.js" in page and 'src="boot.js"' in page and "Content-Security-Policy" in page
    t = (ROOT / "docs/data/shift.js").read_text(); d = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
    assert d["tasks"] and d["closing"]["handover"] and d["lab"]["skills"] and len(d["next7"]) == 7
    assert 'shift/"' in (ROOT / "docs/index.html").read_text()
    from shelly.brain.registry import AGENTS
    assert "store-shift" in {a.id for a in AGENTS}
    from shelly.core.skills import load_all
    assert "shift.brief" in load_all()
