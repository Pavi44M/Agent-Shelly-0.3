"""Build docs/shift/: the Store Shift Pilot (v2.1).

The Neighbourhood Store's day from opening brief to handover, daily demand sensing with its honest 14-day exam,
and the Skill Lab for forecasting, reorder and rostering. Synthetic store, invented team names.

    python scripts/build_shift.py [--day 2026-09-25]
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/shift.js"


def build(day=date(2026, 9, 25)) -> dict:
    from shelly import __version__
    from shelly.shift.pilot import build as build_day
    from shelly.shift import lab, sensing
    d = build_day(day)
    L = lab.run(day)
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), **d, "lab": L,
            "target_fill": lab.TARGET_FILL, "truth_note": "The store's history is synthetic, so the true effect of every driver is known and shown next to what the model learned."}


def main(argv=None):
    from business_switch import switch_html
    argv = argv if argv is not None else sys.argv[1:]
    day = date.fromisoformat(argv[argv.index("--day") + 1]) if "--day" in argv else date(2026, 9, 25)
    d = build(day)
    OUT.write_text("window.SHELLY_SHIFT = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/shift/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/shift").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/shift/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "shift")), encoding="utf-8")
    c, m = d["closing"], d["model"]
    print(f"Shift Pilot {d['day']}: forecast ${d['brief']['forecast']:,} ({m['live']}), actual ${c['actual']:,.0f} ({c['error_pct']:+.1f}%), "
          f"tasks {c['tasks']['done']}/{c['tasks']['total']} done; 14-day WAPE {m['exam14']['wape']} -> docs/shift/")


if __name__ == "__main__":
    main()
