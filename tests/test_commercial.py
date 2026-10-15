"""Commercial lab (v2.5.0): promo maths adds up, the depth lab is sane, baskets stay anonymous and honest."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _c():
    t = (ROOT / "docs/data/commercial.js").read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def test_each_promo_nets_out():
    for e in _c()["events"]:
        assert abs(e["inc_gp"] - (e["extra_gp"] - e["subsidy"])) < 0.05, e
        assert abs(e["net"] - (e["inc_gp"] - e["cannibalised"] - e["dip"])) < 0.05, e
        assert e["cannibalised"] >= 0 and e["dip"] >= 0 and e["worth_it"] == (e["net"] > 0)


def test_totals_and_categories_agree():
    d = _c(); T = d["totals"]
    assert abs(T["net"] - sum(e["net"] for e in d["events"])) < 1
    assert abs(T["net"] - sum(c["net"] for c in d["categories"])) < 1
    assert sum(c["events"] for c in d["categories"]) == len(d["events"]) >= 100


def test_depth_lab_more_discount_more_units():
    for l in _c()["price_lab"]:
        u = [r["units_day"] for r in l["depths"]]
        assert u == sorted(u), l["name"]
        assert l["response"] < 0 and 0 <= l["funding_at_usual_pct"] <= 100


def test_baskets_are_anonymous_and_labelled_simulated():
    d = _c(); B = d["basket"]
    assert B["baskets"] > 1000 and B["pairs"] and all(p["lift"] > 1 for p in B["pairs"])
    assert abs(sum(m["share_pct"] for m in B["missions"]) - 100) < 0.5
    blob = (ROOT / "docs/data/commercial.js").read_text(encoding="utf-8").lower()
    for bad in ('"customer', '"card', "loyalty", "@", '"face'):
        assert bad not in blob, bad
    page = (ROOT / "docs/commercial/app.js").read_text(encoding="utf-8")
    assert "simulated" in page and "No basket is linked to a person" in page


def test_page_is_wired():
    html = (ROOT / "docs/commercial/index.html").read_text(encoding="utf-8")
    assert 'data-page="commercial"' in html and "commercial.js" in html and 'aria-current="page"' in html
    assert "commercial/" in (ROOT / "docs/launchpad/index.html").read_text(encoding="utf-8")
