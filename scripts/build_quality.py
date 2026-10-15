"""Build docs/quality/: Shelly quality (v2.5.4): forecast league table, anomaly radar, data checks and build health.

    python scripts/build_quality.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/quality.js"


def main(argv=None):
    from business_switch import switch_html
    from shelly import __version__, quality
    d = {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), **quality.run()}
    OUT.write_text("window.SHELLY_QUALITY = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/quality/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/quality").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/quality/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "quality")), encoding="utf-8")
    print(f"Quality: {len(d['league']['overall'])} models, {len(d['anomalies']['flags'])} unusual days, {len(d['data_checks'])} data checks, "
          f"{d['build']['test_functions']} tests -> docs/quality/")


if __name__ == "__main__":
    main()
