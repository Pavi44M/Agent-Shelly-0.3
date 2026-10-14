"""Build docs/ops/: Gateway and Tōtara operations (v2.2).

Gateway: dock scheduler, labour planner, client billing. Tōtara: supplier scorecards, expiry rescue, what-if planner.
And two flows followed end to end across the store, Gateway and Tōtara through the Shelly OS event bus. Synthetic data.

    python scripts/build_ops.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/ops.js"


def build() -> dict:
    from shelly import __version__
    from shelly.ops import gateway_ops, totara_ops, flow
    g = gateway_ops.run(); t = totara_ops.run()
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "gateway": g, "totara": t, "flows": flow.run(g)}


def main(argv=None):
    from business_switch import switch_html
    d = build()
    OUT.write_text("window.SHELLY_OPS = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/ops/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/ops").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/ops/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "ops")), encoding="utf-8")
    g, t = d["gateway"], d["totara"]
    print(f"Ops: {sum(len(x['jobs']) for x in g['docks'])} dock jobs, {sum(len(x['clashes']) for x in g['docks'])} clashes, "
          f"{len(g['billing'])} invoices; {len(t['scorecards'])} suppliers, expiry ${t['expiry_saved']:,} of ${t['expiry_at_risk']:,} rescued; {len(d['flows'])} flows -> docs/ops/")


if __name__ == "__main__":
    main()
