"""Shelly Vision (Store Vision) and the Skill Lab: the engine counts people properly, the heatmap is time,
privacy defaults hold, and the lab only keeps changes a held-out day agrees with."""
import json
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pytest

from shelly.vision.engine import VisionEngine, point_in_poly
from shelly.vision.run import load_cfg

ROOT = Path(__file__).resolve().parents[1]


def cfg():
    return load_cfg(learned=False)


def box(x, y, h=120):   # a person standing with feet at (x, y)
    return (x - h * .19, y - h, x + h * .19, y)


def walk(e, tid, pts, t0=0.0, dt=.2):
    t = t0
    for x, y in pts:
        e.update(t, [(tid, *box(x, y))]); t += dt
    return t


def test_unique_visitors_not_per_frame():
    e = VisionEngine(cfg())
    walk(e, 1, [(300, 350)] * 50)                       # one person standing 10 s = 50 frames
    assert e.visitors == 1


def test_flicker_is_not_a_visitor():
    e = VisionEngine(cfg())
    e.update(0, [(9, *box(700, 300))]); e.update(.2, [])  # a one-frame false positive
    e.update(5, [])
    assert e.visitors == 0


def test_in_out_with_dead_band_and_no_double_count():
    e = VisionEngine(cfg())
    ys = list(np.linspace(715, 560, 40))
    jitter = [650 + (6 if i % 2 else -6) for i in range(20)]    # dithering on the line, inside the dead band
    t = walk(e, 1, [(640, y) for y in ys[:15]] + [(640, y) for y in jitter] + [(640, y) for y in ys[15:]])
    assert e.counts["door_in"] == 1 and e.counts["door_out"] == 0
    walk(e, 1, [(640, y) for y in np.linspace(560, 720, 40)], t0=t + 10)
    assert e.counts["door_out"] == 1


def test_crossing_beside_the_door_does_not_count():
    e = VisionEngine(cfg())
    walk(e, 1, [(1100, y) for y in np.linspace(715, 560, 40)])   # x far outside the door segment
    assert e.counts["door_in"] == 0


def test_identity_switch_is_relinked():
    e = VisionEngine(cfg())
    t = walk(e, 1, [(300 + i * 4, 350) for i in range(20)])
    walk(e, 2, [(380 + i * 4, 350) for i in range(20)], t0=t)    # tracker gave the same person a new id
    assert e.visitors == 1


def test_zone_visit_survives_boundary_jitter():
    c = cfg(); e = VisionEngine(c)
    pts = [(250, 360)] * 20 + [(250 + (180 if i % 3 == 0 else 0), 360) for i in range(10)] + [(250, 360)] * 20 + [(250, 600)] * 20
    walk(e, 1, pts)
    walk(e, 1, [(250, 600)], t0=40)
    assert len(e.visits["produce"]) == 1


def test_heat_is_seconds_and_live_map_fades():
    c = cfg(); c["heatmap"]["half_life_s"] = 10; e = VisionEngine(c)
    walk(e, 1, [(640, 300)] * 51, dt=.2)                 # 10 s standing
    assert abs(e.heat_day.sum() - (10 - e.min_life)) < .6   # seconds, after the person became a visitor
    before, day = e.heat_live.sum(), e.heat_day.sum()
    e.update(e.t + 10, [])                               # 10 s later, nobody there
    assert abs(e.heat_live.sum() - before / 2) < before * .05   # the live map halves in one half-life
    assert e.heat_day.sum() == pytest.approx(day)                # the day map keeps every second


def test_queue_alert_and_wait():
    e = VisionEngine(cfg())
    for t in np.arange(0, 6, .2):
        e.update(float(t), [(i, *box(600 + i * 40, 540)) for i in range(5)])
    q = [x for x in e.events if x["kind"] == "queue"]
    assert q and q[0]["length"] >= 4 and q[0]["wait_s"] >= 4 * 45


def test_restricted_prompt_grace_and_hours():
    e = VisionEngine(cfg(), start=datetime(2026, 10, 13, 9, 0))
    walk(e, 1, [(200, 150)] * 10)                        # 2 s: inside the grace period
    assert not [x for x in e.events if x["kind"] == "restricted"]
    walk(e, 1, [(200, 150)] * 20, t0=2)
    r = [x for x in e.events if x["kind"] == "restricted"]
    assert len(r) == 1 and "check" in r[0]["note"]
    e2 = VisionEngine(cfg(), start=datetime(2026, 10, 13, 23, 0))   # after hours: straight away
    walk(e2, 1, [(200, 150)] * 6)
    assert [x for x in e2.events if x["kind"] == "restricted" and x["after_hours"]]


def test_synthetic_day_matches_the_truth():
    from shelly.vision.simulate import simulate
    c = cfg(); e = VisionEngine(c, start=datetime(2026, 10, 13, 17, 0))
    simulate(c, e, hours=(17, 19), seed=5)
    s, T = e.summary(), e.truth
    assert abs(s["visitors"] - T["people"]) / T["people"] < .03
    assert abs(s["in"] - T["in"]) / T["in"] < .04 and abs(s["out"] - T["out"]) / T["out"] < .04
    q = next(z for z in s["zones"] if z["kind"] == "queue")
    assert abs(q["visits"] - T["queued"]) / T["queued"] < .05


def test_privacy_defaults_and_anonymise():
    pv = cfg()["privacy"]
    assert pv["anonymise"] in ("head", "body") and pv["store_frames"] is False and pv["no_identity"] is True
    cv2 = pytest.importorskip("cv2")
    from shelly.vision.run import anonymise
    f = np.random.default_rng(1).integers(0, 255, (200, 200, 3), dtype=np.uint8); orig = f.copy()
    anonymise(f, [(50, 20, 110, 180)], "head", "pixelate")
    assert not np.array_equal(f[20:50, 50:110], orig[20:50, 50:110])      # the head is changed
    assert np.array_equal(f[100:180, 50:110], orig[100:180, 50:110])      # the body (head mode) is not


def test_skill_lab_levels_coaching_and_go_live(tmp_path, monkeypatch):
    from shelly.vision import skilllab as L
    assert L.level_of(98)[1] == "Expert" and L.level_of(90)[0] == 3 and L.level_of(10)[0] == 1
    st = L.fresh(); c = cfg()
    rec = L.run_day(c, st, date(2026, 10, 1), hours=(12, 13))
    assert set(rec["scores"]) >= set(L.BASE) and rec["difficulty"]
    for ch in rec["changes"]:   # a kept change must have won on the held-out day without hurting anything
        assert (ch["kept"] and ch["gain"] >= 1 and not ch["others_worse"]) or not ch["kept"]
    k = next(iter(st["skills"]))
    st["skills"]["vision.test"] = {"name": "t", "status": "training", "level": 3}
    st["proposals"].append({"skill": "vision.test", "status": "waiting"})
    L.approve(st, "vision.test")
    assert st["skills"]["vision.test"]["status"] == "live"


def test_site_page_and_brain():
    page = (ROOT / "docs/vision/index.html").read_text()
    assert "Content-Security-Policy" in page and "app.js" in page and "../data/vision.js" in page
    t = (ROOT / "docs/data/vision.js").read_text(); d = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
    assert d["day"]["visitors"] > 0 and d["play"]["frames"] and d["lab"]["skills"] and d["privacy"]["store_frames"] is False
    from shelly.brain.registry import AGENTS
    ids = {a.id for a in AGENTS}
    assert {"vision-footfall", "vision-floor", "vision-queue", "vision-safety", "vision-lab"} <= ids
    from shelly.core.skills import load_all
    assert "vision.footfall" in load_all()


def test_boot_screens():
    for p in ("vision", "lp"):
        html = (ROOT / f"docs/{p}/index.html").read_text()
        assert 'id="boot"' in html and 'id="bootSv"' in html and 'src="boot.js"' in html and "skipBoot" in html
        js = (ROOT / f"docs/{p}/boot.js").read_text()
        assert 'classList.add("done")' in js and "prefers-reduced-motion" in js
