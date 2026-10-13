"""Build docs/lp/: Shelly Intelligence · Loss Prevention (module v1.0).

Writes docs/data/lp.js from synthetic days (no camera, no people) and the page docs/lp/index.html
(template modules/lp/page.html + the business switch):
  · policy    the checks that refuse to run (identity, biometrics, scope lock) and the response ladder
  · sites     every Shelly site: cameras, rules, a week of cases scored against the truth, shrink by cause/place,
              and its privacy impact checklist
  · tuning    the concealment pattern from factory settings to tuned (held-out checked, waiting for Pavi)
  · lookalike what innocent shoppers do that LOOKS like concealment, and what Shelly did about it
  · scene     30 s of the high-risk aisle as skeletons (face points dropped) for the live view

    python scripts/build_lp.py [--tune]
"""
from __future__ import annotations

import json
import random
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/lp.js"


def scene(cfg, knobs):
    """the aisle camera, 30 s: four shoppers, skeletons only. Only one of them completes the pattern."""
    from shelly.lp.pose import Gestures, skeleton, wrist_path
    from shelly.lp.simulate import SHELF_X, plan
    from shelly.lp.tune import apply
    _, params = apply(cfg, knobs)
    rnd = random.Random(21)
    cast = [("basket", "spirits", 0.0, -120, "Picks a bottle, into the basket, pays at the till"),
            ("arms", "formula", 1.5, 1400, "Arms crossed, reading prices: no reach, nothing happens"),
            ("own_bag", "razors", 7.0, -120, "Own shopping bag: the hand goes in, then pays at the till (an assist prompt at most)"),
            ("thief_pocket", "vapes", 12.0, 1400, "Picks, the hand and item vanish into a pocket, leaves by the door without paying for it")]
    fps, T = 8, 24.0
    people = []
    for i, (kind, cat, t0, x0, story) in enumerate(cast):
        keys, dur = plan(kind, random.Random(40 + i))
        bay = SHELF_X[cat] + (30 if i % 2 else -30)
        walk = abs(bay - x0) / 160
        people.append({"i": i, "kind": kind, "cat": cat, "t0": t0, "x0": x0, "bay": bay, "walk": walk, "keys": keys, "dur": dur, "story": story,
                       "hand": "R" if x0 < 0 else "L", "foot": 640 - i * 6, "H": 440 - i * 8})
    G = Gestures(params); frames = []
    for n in range(int(T * fps)):
        t = n / fps; row = []
        for p in people:
            u = t - p["t0"]
            if u < 0: continue
            if u < p["walk"]: cx, act = p["x0"] + (p["bay"] - p["x0"]) * u / p["walk"], None
            elif u < p["walk"] + p["dur"]: cx, act = p["bay"], u - p["walk"]
            elif u < 2 * p["walk"] + p["dur"] + .5:
                k = (u - p["walk"] - p["dur"]) / p["walk"]; cx, act = p["bay"] + (p["x0"] - p["bay"]) * k, None
            else: continue
            rest = (.22, 1.04, .9)
            a = wrist_path(p["keys"], act) if act is not None else rest
            other = rest if p["kind"] != "arms" or act is None else (a[0], a[1] + .05, a[2])
            wr = [a, other] if p["hand"] == "L" else [other, a]
            sk = skeleton(cx, p["foot"], p["H"], wr, rnd, .004 * p["H"])
            ev = G.update(t, p["i"], sk) if act is not None else []
            walking = act is None
            row.append([p["i"], round(cx), p["foot"], p["H"], *[round(v) for v in sk[7][:2]], *[round(v) for v in sk[9][:2]], int(sk[9][2] >= .35),
                        *[round(v) for v in sk[8][:2]], *[round(v) for v in sk[10][:2]], int(sk[10][2] >= .35), int(walking)])
        frames.append(row)
    events = [{"t": round(e["t"], 2), "who": e["track"], "kind": e["kind"], "conf": e.get("conf")} for e in G.events]
    cast_out = [{k: p[k] for k in ("i", "kind", "cat", "t0", "story")} | {"leaves": round(p["t0"] + 2 * p["walk"] + p["dur"], 1)} for p in people]
    return {"fps": fps, "frames": frames, "events": events, "cast": cast_out, "shelves": SHELF_X}


def build(do_tune=False) -> dict:
    from shelly.lp import evidence as EV
    from shelly.lp import tune as TU
    from shelly.lp.policy import validate
    from shelly.lp.run import load_cfg, week
    from shelly.lp.simulate import MIX, THIEF, store_day
    from shelly.lp.cases import score
    cfg = load_cfg(live=False)
    checks = validate(cfg)
    old = {}
    if OUT.exists():
        try: t = OUT.read_text(); old = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
        except Exception: old = {}
    if do_tune or "tuning" not in old:
        tun = TU.run(cfg)
    else:
        tun = old["tuning"]
    knobs = tun["knobs"]
    wk = week(cfg, 7, knobs=knobs)
    sites = {}
    for sid, s in cfg["sites"].items():
        w = wk[sid]
        strip = lambda c: {k: v for k, v in c.items() if not k.startswith("_")} | {"truth": c["_truth"]}
        rules = {}
        for sc in w["scores"]:
            for r, v in sc["rules"].items():
                R = rules.setdefault(r, {"rule": r, "what": v["what"], "reviews": 0, "true": 0, "false": 0, "assists": 0, "innocent_assists": 0, "value": 0.0, "explained": Counter(), "losses": 0})
                for k in ("reviews", "true", "false", "assists", "innocent_assists"): R[k] += v[k]
                R["value"] = round(R["value"] + v["value"], 2); R["explained"].update(v["explained"]); R["losses"] += v.get("losses", 0)
        for r in rules.values(): r["explained"] = dict(r["explained"].most_common())
        cases = sorted(w["cases"], key=lambda c: (c["id"]))
        sites[sid] = {"name": s["name"], "business": s["business"], "hours": s["hours"], "cameras": s.get("cameras", []),
                      "rules": [{"id": r, **{k: v for k, v in d.items() if k in ("kind", "what", "owner", "steps")}} for r, d in s["rules"].items()],
                      "week": {"cases": len(cases), "assists": len(w["assists"]), "true": sum(x["true"] for x in w["scores"]), "losses": sum(x["losses"] for x in w["scores"]),
                               "value": round(sum(x["value_flagged"] for x in w["scores"]), 2), "rules": list(rules.values()),
                               "false_per_camera_day": round(sum(x["false_per_camera_day"] for x in w["scores"]) / len(w["scores"]), 2)},
                      "queue": [strip(c) for c in cases[-14:]][::-1], "shrink": EV.shrink(sid), "pia": EV.pia(cfg, sid)}
    first = next((c for c in wk["store"]["cases"] if c["rule"] == "unpaid_exit"), wk["store"]["cases"][0])
    # lookalikes: factory vs tuned, 7 days, by behaviour
    look = {}
    for label, kn in (("factory", TU.FACTORY), ("tuned", knobs)):
        c2, p2 = TU.apply(cfg, kn); cnt = Counter(); vis = Counter()
        for d in range(7):
            keep = []; store_day(c2, 300 + d, params=p2, keep=keep)
            for k in keep: vis[k["kind"]] += 1; cnt[(k["kind"], k["level"])] += 1
        look[label] = {k: {"visits": vis[k], "assist": cnt[(k, "assist")], "review": cnt[(k, "review")]} for k in MIX}
    LOOK = {"basket": "Item into a basket held out to the side", "browse": "Picks up, puts back", "read_label": "Reads the label at chest height",
            "own_bag": "Puts it in their own shopping bag (then pays)", "phone": "Phone into a pocket", "arms": "Arms crossed", "hands_pocket": "Hands in pockets while thinking",
            "carry_hand": "Carries the item low in the hand", "thief_pocket": "Conceals in a trouser pocket", "thief_jacket": "Conceals inside a jacket",
            "thief_bag": "Conceals in a bag", "thief_backpack": "Conceals in a backpack on the back", "thief_pays_other": "Conceals one item, pays for others"}
    return {"version": cfg["module_version"], "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "checks": checks, "scope": cfg["scope"],
            "privacy": cfg["privacy"], "human": cfg["human_in_the_loop"], "ladder": cfg["ladder"], "pose": cfg["pose"], "sites": sites,
            "tuning": tun, "lookalike": {"names": LOOK, "thief": sorted(THIEF), **look}, "scene": scene(cfg, knobs),
            "pack": EV.pack(first, cfg), "sign": EV.SIGN}


def main(argv=None):
    from business_switch import switch_html
    argv = argv if argv is not None else sys.argv[1:]
    d = build("--tune" in argv)
    OUT.write_text("window.SHELLY_LP = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/lp/page.html").read_text(encoding="utf-8")
    out = ROOT / "docs/lp"; out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "lp")), encoding="utf-8")
    s = d["sites"]["store"]["week"]
    print(f"Loss Prevention: store {s['cases']} cases, {s['true']}/{s['losses']} real losses flagged, {s['false_per_camera_day']} false/camera/day; "
          f"{sum(x['week']['cases'] for x in d['sites'].values())} cases across {len(d['sites'])} sites -> docs/lp/ ({OUT.stat().st_size // 1024} KB data)")


if __name__ == "__main__":
    main()
