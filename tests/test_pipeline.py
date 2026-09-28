"""Smoke + logic tests.  Run: python -m pytest -q"""
from pathlib import Path

import pandas as pd
import yaml

from shelly import insights
from shelly.data import load_raw, prepare, profile_quality
from shelly.forecasting import mape, wape

ROOT = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load(open(ROOT / "config.yaml"))


def _prep():
    raw = load_raw(ROOT / "data/sample", CFG["column_map"])
    return raw, prepare(raw)


def test_quality_catches_injected_issues():
    raw, _ = _prep()
    q = profile_quality(raw)
    text = " ".join(m for _, m in q.issues)
    assert "duplicate" in text and "negative" in text and q.score < 100


def test_gtin_check_digit():
    assert insights.gtin_valid("4006381333931")          # known-valid EAN-13
    assert not insights.gtin_valid("4006381333932")
    assert not insights.gtin_valid("94290008")           # wrong check digit / truncated


def test_metrics():
    assert wape([10, 10], [5, 15]) == 50.0
    assert round(mape([10, 20], [5, 20]), 1) == 25.0


def test_injected_anomalies_are_found():
    _, P = _prep()
    an = insights.anomalies(P, CFG)
    found = set(zip(an["type"].str.split().str[0], an["item"]))
    assert ("Channel", "uber_eats") in found               # tablet outage
    assert any(i == "Milk Standard 2L" for _, i in found)  # stock-out
    assert any(i == "Chocolate Block 200g" for _, i in found)  # shrinkage
    assert any(i == "Chicken Sandwich" for _, i in found)  # waste blow-out


def test_recall_is_matched():
    _, P = _prep()
    rp = insights.replenishment(P, CFG)
    c = insights.compliance(P, CFG, rp)
    assert len(c["recalls"]) == 1 and c["recalls"].iloc[0]["sku"] == "GRO004"
    assert set(c["gs1_invalid"]["sku"]) == {"GRO006", "HHD003"}


def test_reorder_never_exceeds_shelf_life():
    _, P = _prep()
    rp = insights.replenishment(P, CFG)
    assert (rp["order_up_to"] <= rp["mu"] * rp["shelf_life_days"].clip(lower=1) + 1e-6).all()


def test_segments_named_uniquely():
    _, P = _prep()
    seg = insights.segmentation(P, CFG, n_boot=10)
    assert seg["profile"]["segment"].is_unique


def test_recalled_item_not_reordered():
    from shelly.agent import run
    res = run(str(ROOT / "data/sample"), out_dir=str(ROOT / "outputs"))
    rp = res["results"]["replenishment"].set_index("sku")
    assert rp.loc["GRO004", "suggested_order"] == 0
    assert res["actions"][0]["area"] == "Compliance - recall"
