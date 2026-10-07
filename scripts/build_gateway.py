"""Build docs/gateway/: Gateway Warehousing & Transport (Shelly's third business, module v1.1).

Reads modules/gateway/gateway.yaml, writes docs/data/gateway.js (synthetic, seeded by week) and
the page docs/gateway/index.html (template modules/gateway/page.html + the business switch).

    python scripts/build_gateway.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def main(argv=None):
    from business_switch import switch_html

    from shelly.gateway import build, text, write_js
    data = build()
    write_js(data, ROOT / "docs/data/gateway.js")
    tpl = (ROOT / "modules/gateway/page.html").read_text(encoding="utf-8")
    out = ROOT / "docs/gateway"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "gateway")), encoding="utf-8")
    k = data["kpis"]
    print(f"Gateway: {len(data['sites'])} sites, {len(data['clients'])} clients, {k['trucks']} trucks, {k['forklifts']} forklifts, "
          f"OTIF {k['otif']}% -> docs/gateway/")
    return text(data)


if __name__ == "__main__":
    main()
