"""Store Floor (docs/store): planogram, SKU placement, shelf status and the v3 operations config."""
import json
import re
from pathlib import Path

import pytest

from shelly.storefloor import build_floor, fixture_status, floor_text, load_planogram, place_skus

ROOT = Path(__file__).resolve().parents[1]


def _p(sku, name, cat, **kw):
    base = {"sku": sku, "name": name, "category": cat, "sales_7d": 100.0, "units_7d": 20, "wow_pct": 0.0, "gm_pct": 40.0,
            "on_hand": 50, "days_cover": 5.0, "order_qty": 0, "reorder_status": "OK", "waste_7d": 0, "count_var": 0,
            "flags": [], "abc": "B", "trend14": [10] * 14}
    base.update(kw)
    return base


def test_planogram_is_valid():
    pg = load_planogram()
    ids = [f["id"] for f in pg["fixtures"]]
    assert len(ids) == len(set(ids)) and len(ids) >= 25
    for f in pg["fixtures"]:
        assert ("rect" in f) != ("seg" in f)
        assert f["type"] in {"wall", "gondola", "chiller", "multideck", "freezer", "island", "counter", "table"}
    # every exact SKU is listed once
    skus = [s for f in pg["fixtures"] for s in f.get("skus", [])]
    assert len(skus) == len(set(skus))


def test_operations_config():
    ops = load_planogram()["operations"]
    assert ops["trading_hours"] == {"open": "07:00", "close": "21:00"}
    assert [s["start"] for s in ops["shifts"]][0] == "06:00" and all(s["hours"] == 8 for s in ops["shifts"])
    assert [(b["after_h"], b["minutes"]) for b in ops["breaks"]] == [(2, 10), (4, 30), (6, 10)]
    assert ops["deliveries"]["days"] == ["Tue", "Thu", "Sat"]
    assert sum(1 for m in ops["team"] if m["role"] == "Duty Manager") >= 2
    # busier after 5pm
    f = {int(h): v for h, v in ops["footfall"].items()}
    assert max(f, key=f.get) >= 17
    shifts = {s["id"] for s in ops["shifts"]}
    assert all(m.get("shift") in shifts or m.get("start") for m in ops["team"])


def test_sku_placement_exact_then_category_then_unplaced():
    pg = {"fixtures": [{"id": "a", "rect": [0, 0, 1, 1], "skus": ["X1"]}, {"id": "b", "rect": [0, 0, 1, 1], "categories": ["Dairy"]}]}
    by, un = place_skus(pg, [_p("X1", "Exact", "Dairy"), _p("D2", "Milk", "Dairy"), _p("Z9", "Mystery", "Pets")])
    assert [p["sku"] for p in by["a"]] == ["X1"] and [p["sku"] for p in by["b"]] == ["D2"]
    assert [p["sku"] for p in un] == ["Z9"]


@pytest.mark.parametrize("prod,want", [
    (_p("A", "Ok", "G"), "ok"),
    (_p("A", "Low", "G", reorder_status="Order now - below lead time", days_cover=0.4), "alert"),
    (_p("A", "Soon", "G", reorder_status="Order now - below lead time", days_cover=1.5), "watch"),
    (_p("A", "Ordered", "G", reorder_status="Order"), "watch"),
    (_p("A", "Shrink", "G", flags=["Shrinkage (physical < SAP)"]), "alert"),
    (_p("A", "Falling", "G", wow_pct=-30.0), "watch"),
])
def test_status_rules(prod, want):
    st, reasons = fixture_status([prod], {"count_variance_units": 5}, set())
    assert st == want and reasons


def test_recall_is_alert():
    st, reasons = fixture_status([_p("A", "Sauce", "G")], {}, {"Sauce"})
    assert st == "alert" and "recalled" in reasons[0]


def test_build_floor_on_site_data():
    js = (ROOT / "docs/data/shelly-data.js").read_text()
    web = json.loads(re.sub(r"^window\.SHELLY_DATA\s*=\s*|;\s*$", "", js.strip()))
    floor = build_floor(web)
    assert sum(floor["counts"].values()) == len(floor["fixtures"])
    placed = sum(len(f["products"]) for f in floor["fixtures"]) + len(floor["unplaced"])
    assert placed == len(web["products"])
    assert floor["operations"]["customers_per_day"] > 0
    assert "storeroom" in {r["id"] for r in floor["backroom"]["rooms"]}
    assert "Store floor" in floor_text(floor)


def test_page_is_built():
    assert (ROOT / "docs/store/index.html").exists()
    html = (ROOT / "docs/store/index.html").read_text()
    assert "script-src 'self'" in html and "store.js" in html and "store-floor.js" in html
    for f in ["store.js", "store.css", "v3/sim.js", "v3/nav.js", "v3/people.js", "v3/backroom.js", "v3/ui.js"]:
        assert (ROOT / "docs/store" / f).exists(), f
