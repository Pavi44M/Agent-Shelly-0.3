"""Shelly quality (v2.5.4): the league is ordered, anomalies carry a reason, checks report honestly."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _q():
    t = (ROOT / "docs/data/quality.js").read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def test_league_is_ordered_and_beats_naive():
    L = _q()["league"]["overall"]
    assert [m["wape"] for m in L] == sorted(m["wape"] for m in L)
    assert L[0]["wape"] < next(m["wape"] for m in L if m["model"] == "Naive")


def test_every_anomaly_has_a_reason_and_is_beyond_the_threshold():
    A = _q()["anomalies"]
    for f in A["flags"]:
        assert abs(f["z"]) >= A["threshold_z"] and f["why"] and f["sure"] in ("high", "medium", "low")


def test_checks_and_build_health():
    q = _q()
    assert all(isinstance(c["found"], int) and c["action"] for c in q["data_checks"])
    assert q["build"]["test_functions"] >= 100 and q["build"]["pages_rendered"] >= 15
    html = (ROOT / "docs/quality/index.html").read_text(encoding="utf-8")
    assert 'data-page="quality"' in html and "quality.js" in html
