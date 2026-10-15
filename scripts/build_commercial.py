"""Build docs/commercial/: the Commercial lab (v2.5.0): was each promo worth it, how deep to discount, what sells together.

    python scripts/build_commercial.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/commercial.js"


def build() -> dict:
    from shelly import __version__
    from shelly import commercial
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), **commercial.run()}


def main(argv=None):
    from business_switch import switch_html
    d = build()
    OUT.write_text("window.SHELLY_COMMERCIAL = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/commercial/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/commercial").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/commercial/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "commercial")), encoding="utf-8")
    print(f"Commercial: {len(d['events'])} promos, {d['share_worth_it']}% worth it, net ${d['totals']['net']:,.0f}; "
          f"{len(d['price_lab'])} lines in the depth lab; {d['basket']['baskets']} baskets, {len(d['basket']['pairs'])} pairs -> docs/commercial/")


if __name__ == "__main__":
    main()
