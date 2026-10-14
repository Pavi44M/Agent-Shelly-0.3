"""Build docs/group/: Group HQ (v2.3), the Shelly Tower departments at work.

Finance (month-end close, P&L by business with eliminations, variances, 13-week cash flow), People and HR (roles only),
procurement across the group, the monthly board pack, and governance (every agent's action limit + the audit log). Synthetic.

    python scripts/build_group.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/group.js"


def build() -> dict:
    from shelly import __version__
    from shelly.group import hq
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), **hq.run()}


def main(argv=None):
    from business_switch import switch_html
    d = build()
    OUT.write_text("window.SHELLY_GROUP = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/group/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/group").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/group/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "group")), encoding="utf-8")
    P = d["pnl"]
    print(f"Group HQ {P['month']}: revenue ${P['group_revenue']:,}, EBITDA ${P['group_ebitda']:,} ({P['group_margin_pct']}%), cash low ${d['cash']['low']['close']:,}, "
          f"{d['people']['headcount']} people, {len(d['limits'])} agent limits, {len(d['audit'])} audit entries -> docs/group/")


if __name__ == "__main__":
    main()
