"""v2.6: the Blender-built 3D tower and floors are present, valid and match the floor data."""
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "docs/floors/model"


def _floors():
    t = (ROOT / "docs/data/floors.js").read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])["floors"]


def _glb(path):
    b = path.read_bytes()
    magic, version, length = struct.unpack("<III", b[:12])
    assert magic == 0x46546C67 and version == 2 and length == len(b), path.name
    jl = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + jl])


def test_every_level_has_a_model():
    levels = [f["level"] for f in _floors()]
    idx = json.loads((MODEL / "index.json").read_text())
    assert [f["level"] for f in idx["floors"]] == levels
    for lv in levels:
        p = MODEL / f"L{lv}.glb"
        assert p.exists() and p.stat().st_size < 800_000, lv
        J = _glb(p)
        names = {m["name"] for m in J["materials"]}
        assert {"wall", "core", "stair"} <= names, lv


def test_tower_has_one_pickable_block_per_level():
    J = _glb(MODEL / "tower.glb")
    names = {n.get("name") for n in J["nodes"]}
    for f in _floors():
        assert f"F_{f['level']}" in names


def test_private_rooms_are_closed_and_empty():
    src = (ROOT / "scripts/blender/build_tower_3d.py").read_text()
    for room in ("Guest rooms", "Suites", "Serviced apartments", "Quiet rooms", "Family room"):
        assert re.search(rf'\("{room}", [\d.]+, "\w+", False\)', src), room
    hotel = [f for f in json.loads((MODEL / "index.json").read_text())["floors"] if f["level"] == "17"][0]
    assert hotel["people_drawn"] <= hotel["people_in"]
    assert "door_closed" in {m["name"] for m in _glb(MODEL / "L17.glb")["materials"]}


def test_page_keeps_the_2d_fallback():
    html = (ROOT / "docs/floors/index.html").read_text()
    assert 'type="module" src="view3d.js"' in html and 'id="plan"' in html and 'data-mode="plan"' in html
    js = (ROOT / "docs/floors/view3d.js").read_text()
    assert "no3d" in js and "http" not in js.replace("http-equiv", "")


def test_tower_drawer_uses_the_blender_floor():
    js = (ROOT / "docs/tower/world.js").read_text()
    assert 'from "../kit/glb.js"' in js and "../floors/model/" in js and "buildInteriorDrawn(x)" in js
