"""Build docs/vision/: Shelly Intelligence · Store Vision (module v1.0).

Writes docs/data/vision.js from a synthetic trading day (no camera, no people: every visitor is simulated)
and the page docs/vision/index.html (template modules/vision/page.html + the business switch):
  · day      the day's numbers: visitors, IN/OUT, hourly, zones, alerts, the time-spent heat grid, truth
  · play     90 s of the 5 pm rush (anonymised boxes) with the engine's live counters, for the live view
  · lab      the Skill Lab's last 14 days from factory settings (cached; rebuild with --lab)

    python scripts/build_vision.py [--lab]
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/vision.js"


def build(lab=False) -> dict:
    import numpy as np
    from shelly.vision.engine import VisionEngine
    from shelly.vision.run import load_cfg
    from shelly.vision.simulate import simulate
    from shelly.vision import skilllab
    cfg = load_cfg(learned=False)
    # the day
    e = VisionEngine(cfg, start=datetime(2026, 10, 13, 7, 0)); simulate(cfg, e, seed=13)
    s = e.summary()
    g = e.heat_day; f = 4                                   # 160x90 cells -> 40x23 for the page
    gh, gw = g.shape[0] // f, g.shape[1] // f
    small = g[:gh * f, :gw * f].reshape(gh, f, gw, f).sum(axis=(1, 3))
    day = {**s, "alerts": s["alerts"][:24], "alert_counts": {k: sum(1 for x in s["alerts"] if x["kind"] == k) for k in ("queue", "restricted")}, "truth": {k: e.truth[k] for k in ("people", "staff", "in", "out", "queued", "restricted")},
           "heat": {"w": gw, "h": gh, "cell": e.cell * f, "s": [round(float(v), 1) for v in small.ravel()]}}
    # the live view: 90 s of the 5 pm rush at 5 fps
    frames = []
    e2 = VisionEngine(cfg, start=datetime(2026, 10, 13, 17, 0))
    def sink(t, agents, dets):
        if t < 600 or len(frames) >= 450: return
        q = next(z for z in cfg["zones"] if z.get("kind") == "queue")
        frames.append({"t": round(t - 600, 1), "b": [[int(d[0]) % 997, *[int(round(v)) for v in d[1:5]]] for d in dets],
                       "c": [e2.visitors, e2.counts["door_in"], e2.counts["door_out"], e2.occupancy(), e2.queue_now(q["id"])]})
    simulate(cfg, e2, hours=(17, 18), fps=5.0, seed=17, sink=sink, until=692)
    hl = e2.heat_live; gh2, gw2 = hl.shape[0] // f, hl.shape[1] // f
    play = {"fps": 5, "frames": frames, "heat": [round(float(v), 2) for v in hl[:gh2 * f, :gw2 * f].reshape(gh2, f, gw2, f).sum(axis=(1, 3)).ravel()]}
    # the Skill Lab (cached unless asked)
    old = {}
    if OUT.exists():
        try: old = json.loads(OUT.read_text()[OUT.read_text().index("{"):OUT.read_text().rstrip().rstrip(";").rindex("}") + 1])
        except Exception: old = {}
    if lab or "lab" not in old:
        st = skilllab.run(days=14, start=date(2026, 9, 30), cfg=cfg, new=True)
        labd = {"skills": st["skills"], "knobs": st["knobs"], "factory": skilllab.FACTORY, "changes": st["changes"][-20:],
                "kept_total": sum(1 for c in st["changes"] if c.get("kept")), "rejected_total": sum(1 for c in st["changes"] if not c.get("kept")), "unlocked": st["unlocked"],
                "proposals": st["proposals"], "days": [{k: d[k] for k in ("day", "difficulty", "scores", "new")} | {"kept": [c for c in d["changes"] if c.get("kept")]} for d in st["days"]],
                "curriculum": skilllab.CURRICULUM, "levels": [[lo, n, nm] for lo, n, nm in skilllab.LEVELS]}
    else:
        labd = old["lab"]
    return {"version": "1.0", "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "camera": cfg["camera"], "zones": cfg["zones"],
            "lines": cfg["counting"]["lines"], "privacy": cfg["privacy"], "day": day, "play": play, "lab": labd}


def main(argv=None):
    from business_switch import switch_html
    argv = argv if argv is not None else sys.argv[1:]
    d = build(lab="--lab" in argv)
    OUT.write_text("window.SHELLY_VISION = " + json.dumps(d, separators=(",", ":")) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/vision/page.html").read_text(encoding="utf-8")
    out = ROOT / "docs/vision"; out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "vision")), encoding="utf-8")
    t = d["day"]
    print(f"Vision: {t['visitors']} visitors (truth {t['truth']['people']}), {len(d['play']['frames'])} live frames, "
          f"{len(d['lab']['skills'])} skills -> docs/vision/ ({OUT.stat().st_size // 1024} KB data)")


if __name__ == "__main__":
    main()
