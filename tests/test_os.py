"""Shelly OS (v2.0): one data model, the event bus, departments talking, and the release command."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_model_has_every_business():
    from shelly.os.model import TABLES, build, counts
    con = build(); n = counts(con)
    assert set(TABLES) <= set(n) and n["agents"] >= 60 and n["businesses"] == 4
    assert {r[0] for r in con.execute("SELECT DISTINCT business FROM stock")} == {"store", "totara"}
    assert n["service"] > 0 and n["kpis"] >= 10


def test_bus_reacts_and_checks_approval():
    from shelly.os.model import build
    from shelly.os.bus import run_day, summary
    bus = run_day(build()); s = summary(bus)
    assert s["events"] > 10 and s["actions"] >= s["events"]
    ac = bus.actions()
    po = [a for a in ac if a["agent"] == "store-ordering"]
    assert po and all(a["status"] == "waiting" and a["chain"] for a in po)        # ordering agent needs approval: a person signs
    assert all((a["status"] == "done") == (a["needs"] == "runs on its own") for a in ac)


def test_departments_talk_across_businesses():
    from shelly.os.model import build
    from shelly.os.bus import run_day
    bus = run_day(build())
    ev = {e["id"]: e for e in bus.events()}
    cross = [(ev[a["event_id"]]["business"], a["business"]) for a in bus.actions() if a["business"] != ev[a["event_id"]]["business"]]
    assert ("store", "gateway") in cross          # a store stock-out books a Gateway delivery


def test_custom_subscriber():
    from shelly.os.model import build
    from shelly.os.bus import Bus
    bus = Bus(build()); seen = []
    bus.subscribe("test.*", lambda e: seen.append(e) or [{"agent": "store-briefing", "action": "note it", "area": "Brief", "amount": 0}])
    bus.publish("test.ping", "store", "hello", {})
    assert seen and bus.actions()[0]["status"] == "done"          # an auto agent, no money: runs on its own


def test_os_page():
    page = (ROOT / "docs/os/index.html").read_text()
    assert "Content-Security-Policy" in page and "../data/os.js" in page and 'src="boot.js"' in page
    t = (ROOT / "docs/data/os.js").read_text(); d = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
    assert d["summary"]["events"] > 0 and d["tables"] and all(e["actions"] for e in d["events"])
    for p in ["index.html", "brain/index.html", "lp/index.html", "launchpad/index.html"]:
        assert 'os/"' in (ROOT / "docs" / p).read_text(), p                     # every page links to Shelly OS


def test_release_dry_run_finds_every_version():
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    import release
    ch = release.bump(release.current(), "9.9.9", dry=True)
    assert "shelly/__init__.py" in ch and "docs/kit/shelly-kit.js" in ch and "docs/os/index.html" in ch
    assert release.current() != "9.9.9"                                         # a dry run writes nothing
