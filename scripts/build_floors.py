"""Build docs/floors/: Shelly Tower floor by floor (v2.5.1): the lift tour, a plan for every level, people by role,
technology and building systems. Synthetic data.

    python scripts/build_floors.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/floors.js"


def build() -> dict:
    from shelly import __version__, floors
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), **floors.run()}


def main(argv=None):
    from business_switch import switch_html
    d = build()
    OUT.write_text("window.SHELLY_FLOORS = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/floors/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/floors/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "floors")), encoding="utf-8")
    t = d["totals"]
    print(f"Floors: {t['floors']} levels, {t['here_now']} people in now, {t['washrooms']} washrooms, {t['energy_kwh']:,} kWh today -> docs/floors/")


if __name__ == "__main__":
    main()
