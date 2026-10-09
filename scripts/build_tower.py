"""Build docs/tower/: Shelly Tower, the group's head office and business complex (module v1.3).

Reads modules/tower/tower.yaml, writes docs/data/tower.js (synthetic, seeded by week) and the page
docs/tower/index.html (template modules/tower/page.html + the business switch).

    python scripts/build_tower.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def main(argv=None):
    from business_switch import switch_html

    from shelly.tower import build, text, write_js
    data = build()
    write_js(data, ROOT / "docs/data/tower.js")
    tpl = (ROOT / "modules/tower/page.html").read_text(encoding="utf-8")
    out = ROOT / "docs/tower"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "tower")), encoding="utf-8")
    k = data["kpis"]
    print(f"Tower: {k['floors']} floors, {k['shelly_floors']} Shelly floors, {k['tenants']} tenants, {k['available']} to let, "
          f"{k['occupancy_pct']}% let -> docs/tower/")
    return text(data)


if __name__ == "__main__":
    main()
