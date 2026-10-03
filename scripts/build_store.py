"""Build docs/store/: the 3D Store Floor (Neighbourhood store plan + this week's results).

Reads the weekly web data (docs/data/shelly-data.js) and the planogram
(modules/store-floor/planogram.yaml), writes docs/data/store-floor.js and the
page shell docs/store/index.html. Runs inside scripts/build_site.py; on its own:

    python scripts/build_store.py
    python scripts/build_store.py --web outputs/web/shelly-data.js
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def main(argv=None):
    from business_switch import switch_html

    from shelly.storefloor import build_floor, floor_text, read_web_data, write_floor_js

    ap = argparse.ArgumentParser()
    ap.add_argument("--web", default=str(ROOT / "docs/data/shelly-data.js"))
    a = ap.parse_args(argv)
    floor = build_floor(read_web_data(a.web))
    write_floor_js(floor, ROOT / "docs/data/store-floor.js")
    tpl = (ROOT / "modules/store-floor/page.html").read_text(encoding="utf-8")
    out = ROOT / "docs/store"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "store")), encoding="utf-8")
    c = floor["counts"]
    print(f"Store floor: {len(floor['fixtures'])} fixtures ({c['alert']} alert, {c['watch']} watch, {c['ok']} on plan) "
          f"-> docs/store/")
    if floor["unplaced"]:
        print("  not placed on the plan:", ", ".join(p["name"] for p in floor["unplaced"]))
    return floor_text(floor)


if __name__ == "__main__":
    main()
