"""Tōtara Clinic and the Shelly Tower Hotel (v2.5.2): counts only, numbers that add up, honest labels."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _js(n):
    t = (ROOT / f"docs/data/{n}.js").read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def test_clinic_counts_add_up_and_no_records():
    C = _js("clinic")
    assert C["kpis"]["patients"] == sum(s["patients"] for s in C["streams"]) == sum(h["arrivals"] for h in C["hours"])
    assert all(0 <= w["beds_used"] <= w["beds"] for w in C["ward"])
    blob = (ROOT / "docs/data/clinic.js").read_text(encoding="utf-8").lower()
    for bad in ('"nhi', '"patient_name', '"dob', "@"):
        assert bad not in blob, bad
    assert "not medical advice" in (ROOT / "docs/clinic/app.js").read_text(encoding="utf-8")


def test_hotel_revenue_maths():
    H = _js("hotel")
    for n in H["nights"]:
        assert 0 <= n["occ_pct"] <= 100 and abs(n["revpar"] - n["adr"] * n["sold"] / H["kpis"]["rooms"]) <= 1
    assert len(H["rooms"]) == H["kpis"]["rooms"] == sum(H["housekeeping"].values())
    assert len({r["room"] for r in H["rooms"]}) == len(H["rooms"])
    assert {m["class"] for m in H["menu"]} <= {"Star", "Plough-horse", "Puzzle", "Dog"}
    assert "synthetic" in H["note"].lower() and "not real reviews" in H["note"].lower()


def test_tower_floors_point_to_the_new_pages():
    t = (ROOT / "docs/data/tower.js").read_text(encoding="utf-8")
    assert "../clinic/" in t and "../hotel/" in t and "Rimu Health Clinic" not in t.split('"floors"')[1].split("]")[0]
    for k in ("clinic", "hotel"):
        html = (ROOT / f"docs/{k}/index.html").read_text(encoding="utf-8")
        assert f'data-page="{k}"' in html and 'aria-current="page"' in html
