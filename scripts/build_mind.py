"""Build docs/ask/: Shelly's mind (v2.4): ask anything, cross-department huddles and agent memory.

    python scripts/build_mind.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/mind.js"


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def build() -> dict:
    from shelly import __version__
    from shelly.mind import ask, huddle, memory
    shift, ops, group, osd = (_js(f"docs/data/{n}.js") for n in ("shift", "ops", "group", "os"))
    M = memory.build(shift, ops, group)
    H = huddle.run(ops, group, shift, M)
    A = ask.build(shift, ops, group, osd, H)
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "answers": A, "huddles": H, "memory": M}


def main(argv=None):
    from business_switch import switch_html
    d = build()
    OUT.write_text("window.SHELLY_MIND = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/ask/page.html").read_text(encoding="utf-8")
    (ROOT / "docs/ask").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/ask/index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "ask")), encoding="utf-8")
    print(f"Mind: {len(d['answers'])} answers, {len(d['huddles'])} huddles, {len(d['memory'])} memories -> docs/ask/")


if __name__ == "__main__":
    main()
