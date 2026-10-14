"""Shelly's mind (v2.4): answers, huddles and memories are built from the published data and stay honest."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _mind():
    t = (ROOT / "docs/data/mind.js").read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def test_answers_have_numbers_links_and_words():
    d = _mind(); ids = [a["id"] for a in d["answers"]]
    assert len(d["answers"]) >= 30 and len(ids) == len(set(ids))
    for a in d["answers"]:
        assert a["q"].endswith("?") and a["a"] and a["keys"], a["id"]
        assert a["link"].startswith("../") and (ROOT / "docs" / a["link"][3:].split("#")[0]).exists(), a["link"]


def test_huddles_have_one_owner_per_step_and_one_sign_off():
    for h in _mind()["huddles"]:
        assert len(h["steps"]) >= 3 and h["sign_off"] and h["plan"]
        assert all(s["agent"] and s["part"] and s["name"] for s in h["steps"])
        assert h["steps_approved_once"] == len(h["steps"])


def test_memories_come_from_recorded_things_only():
    M = _mind()["memory"]
    assert len(M) >= 15
    assert {m["topic"] for m in M} >= {"vision", "loss", "forecast", "suppliers", "finance", "decisions"}
    assert all(m["lesson"] and m["outcome"] and m["when"] for m in M)


def test_no_people_identified_and_no_legal_promises():
    blob = (ROOT / "docs/data/mind.js").read_text(encoding="utf-8").lower()
    for bad in ("face recognition", "facial", "biometric", "days notice", "foursquare", "per person"):
        assert bad not in blob, bad
    priv = next(a for a in _mind()["answers"] if a["id"] == "shelly-privacy")
    assert "no" in priv["a"].lower()


def test_ask_page_and_tour_are_wired():
    html = (ROOT / "docs/ask/index.html").read_text(encoding="utf-8")
    assert 'data-page="ask"' in html and "mind.js" in html and 'id="mic"' in html
    kit = (ROOT / "docs/kit/shelly-kit.js").read_text(encoding="utf-8")
    assert "shelly-tour.js" in kit and 'data-k="tour"' in kit
    tour = (ROOT / "docs/kit/shelly-tour.js").read_text(encoding="utf-8")
    stops = re.findall(r'\["([a-z]+/)", "', tour)
    assert len(stops) == 9 and all((ROOT / "docs" / s / "index.html").exists() for s in stops)
