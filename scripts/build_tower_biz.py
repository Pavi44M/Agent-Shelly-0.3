"""Build docs/clinic/ and docs/hotel/: the two new businesses inside Shelly Tower (v2.5.2). Synthetic data.

    python scripts/build_tower_biz.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))


def main(argv=None):
    from business_switch import switch_html
    from shelly import __version__
    from shelly.tower_biz import clinic, hotel
    stamp = {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M")}
    for key, var, mod in (("clinic", "SHELLY_CLINIC", clinic), ("hotel", "SHELLY_HOTEL", hotel)):
        d = {**stamp, **mod.run()}
        (ROOT / f"docs/data/{key}.js").write_text(f"window.{var} = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
        tpl = (ROOT / f"modules/{key}/page.html").read_text(encoding="utf-8")
        (ROOT / f"docs/{key}").mkdir(parents=True, exist_ok=True)
        (ROOT / f"docs/{key}/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", key)), encoding="utf-8")
        print(f"{d['name']}: {', '.join(f'{k} {v}' for k, v in list(d['kpis'].items())[:4])} -> docs/{key}/")


if __name__ == "__main__":
    main()
