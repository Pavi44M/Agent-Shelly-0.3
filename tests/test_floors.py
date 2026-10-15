"""Shelly Tower floor by floor (v2.5.1): every level has a sound plan, washrooms for everyone, people as counts only."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _f():
    t = (ROOT / "docs/data/floors.js").read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def test_every_floor_has_lifts_two_exits_and_washrooms():
    d = _f()
    assert len(d["floors"]) == 35
    for f in d["floors"]:
        names = [c["name"] for c in f["plan"]["core"]]
        assert "Lifts" in names and sum("fire exit" in n for n in names) == 2, f["level"]
        assert {"Accessible", "All-gender", "Women's", "Men's"} <= set(names), f["level"]


def test_rooms_sit_inside_the_floor_and_off_the_core():
    for f in _f()["floors"]:
        P = f["plan"]
        for r in P["rooms"]:
            assert r["x"] >= 0 and r["y"] >= 0 and r["x"] + r["w"] <= P["w"] + .5 and r["y"] + r["h"] <= P["h"] + .5, (f["level"], r)
        assert sum(r["label"] for r in P["rooms"]) == len({r["name"] for r in P["rooms"]})


def test_people_are_counts_by_role_only():
    for f in _f()["floors"]:
        assert sum(f["roles"].values()) <= f["here_now"]
        assert all(isinstance(v, int) for v in f["roles"].values())
    blob = (ROOT / "docs/data/floors.js").read_text(encoding="utf-8").lower()
    for bad in ('"face', '"person_id', "@"):
        assert bad not in blob, bad


def test_page_is_wired():
    html = (ROOT / "docs/floors/index.html").read_text(encoding="utf-8")
    assert 'data-page="floors"' in html and "floors.js" in html and 'aria-current="page"' in html
