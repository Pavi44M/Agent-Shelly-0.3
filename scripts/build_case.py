"""Build docs/case/: Shelly case-study mode (v2.5.3): the Commercial lab told as a five-minute CRISP-DM story.
The page reads its numbers live from docs/data/commercial.js, so it never drifts from the lab.

    python scripts/build_case.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))


def main(argv=None):
    from business_switch import switch_html
    tpl = (ROOT / "modules/case/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/case").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/case/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "case")), encoding="utf-8")
    print("Case study: 6 steps, numbers live from the Commercial lab -> docs/case/")


if __name__ == "__main__":
    main()
