"""v0.3.1: security hardening and relevance-router tests."""
import json

import pandas as pd
import pytest


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    monkeypatch.setenv("SHELLY_STATE_DIR", str(tmp_path))
    import importlib
    import shelly.core.decisions as d
    importlib.reload(d)
    yield


def test_sql_injection_blocked(tmp_path):
    from shelly.core.connectors import build
    db = tmp_path / "x.db"
    import sqlite3
    with sqlite3.connect(db) as c:
        pd.DataFrame({"a": [1]}).to_sql("sales", c, index=False)
    con = build([{"name": "w", "kind": "sqlite", "path": str(db)}])["w"]
    assert con.read("sales").shape == (1, 1)
    with pytest.raises(ValueError):
        con.read("sales; DROP TABLE sales")
    with pytest.raises(PermissionError):
        con.read("SELECT * FROM sales")            # raw SQL off by default
    raw = build([{"name": "w", "kind": "sqlite", "path": str(db), "allow_raw_sql": True}])["w"]
    assert raw.read("SELECT a FROM sales").shape == (1, 1)
    with pytest.raises(ValueError):
        raw.read("SELECT 1; DELETE FROM sales")


def test_path_traversal_blocked(tmp_path):
    from shelly.core.connectors import build
    con = build([{"name": "f", "kind": "folder", "path": str(tmp_path)}])["f"]
    with pytest.raises(ValueError):
        con.read("../etc/passwd")
    with pytest.raises(PermissionError):
        con.write("../../evil.txt", "x")


def test_http_connector_requires_https():
    from shelly.core.connectors import build
    c = build([{"name": "h", "kind": "http_json", "endpoints": {"t": "http://example.com/data"}}])["h"]
    with pytest.raises(PermissionError):
        c.read("t")


def test_decision_import_rejects_bad_input(tmp_path):
    from shelly.core.decisions import DecisionLog
    log = DecisionLog(tmp_path / "d.jsonl")
    ev = log.propose(asof="2026-09-25", pack="retail", area="Credit", rule="x", statement="Hold A", evidence={})
    f = tmp_path / "in.json"
    f.write_text(json.dumps({"decisions": [
        {"id": ev["id"], "status": "confirmed", "note": "ok" * 1000},
        {"id": "D-zzzzzzzz", "status": "confirmed"},          # bad id format
        {"id": "D-12345678", "status": "confirmed"},          # unknown id
        {"id": ev["id"], "status": "delete_everything"},       # bad status
        "garbage"]}))
    assert log.import_web_file(f) == 1
    assert len(log.state().set_index("id").loc[ev["id"], "note"]) == 500
    f.write_text("[1,2,3]")
    with pytest.raises(ValueError):
        log.import_web_file(f)


@pytest.mark.parametrize("text,inside", [
    ("what do I need to order?", True), ("how is OEE on line 3", True), ("debtor ageing for wholesale customers", True),
    ("book me a flight to Colombo", False), ("which shares should I buy", False), ("write me a poem", False),
    ("what's the weather tomorrow", False), ("tell me about quantum physics", False)])
def test_router(text, inside):
    from shelly.core.router import route
    r = route(text)
    assert r.in_scope is inside
    if not inside:
        assert "Settings" in r.advice
