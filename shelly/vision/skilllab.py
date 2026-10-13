"""Shelly Intelligence · Skill Lab: Shelly's vision skills sit an exam every day and get better from the result.

How it works (the same governance as shelly.core.learning: nothing changes silently):

1. **Exam.** Each day a new synthetic trading window is generated (seeded by the date) with camera
   conditions that get harder as the skills get better (more identity switches, missed detections,
   false positives, jitter, busier floors). Because the simulator knows what really happened, every
   skill is marked against the truth: footfall, IN/OUT, dwell, queue, staff-only alerts, heat.
2. **Level.** Score 0-100 -> level 1 Learning · 2 Developing · 3 Competent · 4 Proficient · 5 Expert.
3. **Coach.** A skill below Proficient (or one that slipped) gets a small, bounded tune of its own knobs
   (relink distance, dead band, exit grace...). A change is kept only if it scores better on a second,
   held-out day AND no other skill gets worse; every kept or rejected change is logged with its numbers.
4. **New skills.** One new skill is unlocked per day from the curriculum once its prerequisites are
   Competent. It trains for a week in "suggest only" and goes live only after Pavi approves it.

    python -m shelly vision lab            run today's exam (+ coaching, + a new skill if one is due)
    python -m shelly vision lab --days 14  catch up on a fortnight (used to build the demo history)
"""
from __future__ import annotations

import copy
import json
import os
from datetime import date, timedelta
from pathlib import Path

from .engine import VisionEngine
from .simulate import simulate

ROOT = Path(__file__).resolve().parents[2]
STATE = Path(os.environ.get("SHELLY_STATE_DIR", ROOT / "state")) / "vision_skills.json"
LEVELS = [(97, 5, "Expert"), (93, 4, "Proficient"), (85, 3, "Competent"), (70, 2, "Developing"), (0, 1, "Learning")]

BASE = {
    "vision.footfall": {"name": "Footfall & IN/OUT", "agent": "vision-footfall", "what": "Unique visitors and door IN/OUT, not per-frame counts.",
                        "knobs": ["tracking.relink_px", "tracking.min_life_s"]},
    "vision.dwell": {"name": "Zone dwell", "agent": "vision-floor", "what": "Visits and time spent in each zone of the floor.",
                     "knobs": ["tracking.zone_exit_s", "tracking.smooth"]},
    "vision.queue": {"name": "Checkout queue", "agent": "vision-queue", "what": "Who queued, for how long, and when to open another till.",
                     "knobs": ["tracking.zone_exit_s"]},
    "vision.safety": {"name": "Staff-only areas", "agent": "vision-safety", "what": "An alert when someone is in a staff-only area (a prompt to check, never a judgement).",
                      "knobs": ["tracking.relink_px"]},
    "vision.heat": {"name": "Time-spent heatmap", "agent": "vision-floor", "what": "Seconds spent per spot (live map fades, day map keeps).",
                    "knobs": ["tracking.min_life_s"]},
}
CURRICULUM = [   # unlocked one a day, in this order, when the prerequisites are Competent
    {"id": "vision.conversion", "name": "Floor-to-till conversion", "agent": "vision-footfall", "needs": ["vision.footfall", "vision.queue"],
     "what": "Share of visitors who reach the checkout: the in-store conversion rate."},
    {"id": "vision.staffpattern", "name": "Staff vs shopper (by movement, no faces)", "agent": "vision-safety", "needs": ["vision.safety", "vision.dwell"],
     "what": "Tells team members from shoppers by where they go (stockroom, no queue), so staff don't set off alerts."},
    {"id": "vision.nexthour", "name": "Next-hour footfall", "agent": "vision-footfall", "needs": ["vision.footfall"],
     "what": "Predicts the next hour's visitors from the day so far and the usual shape of the day, for rostering tills."},
    {"id": "vision.hotspot", "name": "Hot-zone finder", "agent": "vision-floor", "needs": ["vision.heat", "vision.dwell"],
     "what": "Names the zone where shoppers spend the most time today, for promotions and layout."},
    {"id": "vision.rushwarn", "name": "Rush early warning", "agent": "vision-queue", "needs": ["vision.queue", "vision.nexthour"],
     "what": "Warns 15 minutes before the queue will pass the alert length."},
]
FACTORY = {"tracking.relink_px": 0, "tracking.min_life_s": .3, "tracking.zone_exit_s": 0.0, "tracking.smooth": 0.0}   # day one: untuned, like any off-the-shelf demo
KNOB_STEPS = {"tracking.relink_px": [35, 70, 110], "tracking.min_life_s": [.6, 1.0, 1.5], "tracking.zone_exit_s": [.5, 1.0, 2.0], "tracking.smooth": [.25, .45, .65]}


def level_of(score: float):
    for lo, n, name in LEVELS:
        if score >= lo: return n, name
    return 1, "Learning"


def _err(a, b) -> float:
    return abs(a - b) / max(1, abs(b))


def _get(cfg, path):
    d = cfg
    for k in path.split(".")[:-1]: d = d.setdefault(k, {})
    return d.get(path.split(".")[-1])


def _set(cfg, path, v):
    d = cfg
    for k in path.split(".")[:-1]: d = d.setdefault(k, {})
    d[path.split(".")[-1]] = v


def difficulty(days: list) -> dict:
    """the better the skills have done over the last three exams, the harder today's camera (gentle -> rough)."""
    recent = [sum(v for k, v in d["scores"].items() if k in BASE) / max(1, sum(1 for k in d["scores"] if k in BASE)) for d in days[-3:]]
    mean = sum(recent) / len(recent) if recent else 0
    k = max(0.0, min(1.0, (mean - 80) / 17))
    return {"switch": .001 + .006 * k, "miss": .05 + .15 * k, "fp": .004 + .02 * k, "jitter": 3 + 7 * k, "scale": 1 + .6 * k,
            "grade": ["Gentle", "Normal", "Busy", "Hard", "Rough"][min(4, int(round(k * 4)))]}


def exam(cfg: dict, seed: int, scenario: dict, hours=(11, 15)) -> dict:
    """run one marked exam: returns score per skill and the raw numbers behind it."""
    from datetime import datetime
    e = VisionEngine(cfg, start=datetime(2026, 10, 13, hours[0])); simulate(cfg, e, hours=hours, seed=seed, scenario={k: v for k, v in scenario.items() if k != "grade"})
    s, T = e.summary(), e.truth
    Z = {z["id"]: z for z in s["zones"]}
    dwell_ids = [z["id"] for z in cfg["zones"] if z.get("kind") == "dwell"]
    sc = {}
    sc["vision.footfall"] = 100 * (1 - (_err(s["visitors"], T["people"]) + _err(s["in"], T["in"]) + _err(s["out"], T["out"])) / 3)
    ve = [_err(Z[i]["visits"], len(T["visits"][i])) for i in dwell_ids]
    de = [_err(Z[i]["avg_dwell_s"], sum(T["visits"][i]) / max(1, len(T["visits"][i]))) for i in dwell_ids]
    sc["vision.dwell"] = 100 * (1 - (sum(ve) + sum(de)) / (2 * len(dwell_ids)))
    q = next(z["id"] for z in cfg["zones"] if z.get("kind") == "queue")
    sc["vision.queue"] = 100 * (1 - (_err(Z[q]["visits"], T["queued"]) + _err(Z[q]["avg_dwell_s"], sum(T["visits"][q]) / max(1, len(T["visits"][q])))) / 2)
    ra = len([a for a in s["alerts"] if a["kind"] == "restricted"]); rt = T["restricted"]
    sc["vision.safety"] = 100 * (1 - _err(ra, rt)) if rt else (100 if ra == 0 else 60)
    # heat: share of time per zone (from the heat grid) vs the real share of dwell time per zone
    hs = {i: Z[i]["heat_s"] for i in dwell_ids}; ht = {i: sum(T["visits"][i]) for i in dwell_ids}
    th, tt = sum(hs.values()) or 1, sum(ht.values()) or 1
    sc["vision.heat"] = 100 * (1 - sum(abs(hs[i] / th - ht[i] / tt) for i in dwell_ids) / 2)
    # curriculum skills
    customers = max(1, T["people"] - T["staff"])
    est_conv = Z[q]["visits"] / max(1, s["visitors"] - _staff_est(e)); true_conv = T["queued"] / customers
    sc["vision.conversion"] = 100 * (1 - _err(est_conv, true_conv))
    sc["vision.staffpattern"] = 100 * (1 - _err(_staff_est(e), T["staff"])) if T["staff"] else 90
    full = [h for h in s["hours"] if int(h["hour"][:2]) < hours[1]]          # whole hours only
    hours_v = [h.get("visitors", 0) for h in full]
    if len(hours_v) >= 2:
        from .simulate import PROFILE
        hrs = [int(h["hour"][:2]) for h in full]
        errs = []
        for i in range(1, len(hours_v)):
            base = sum(hours_v[:i]) / max(.1, sum(PROFILE.get(x, .5) for x in hrs[:i]))
            errs.append(_err(base * PROFILE.get(hrs[i], .5), hours_v[i]))
        sc["vision.nexthour"] = 100 * (1 - sum(errs) / len(errs))
    top_est = max(dwell_ids, key=lambda i: hs[i]); top_true = max(dwell_ids, key=lambda i: ht[i])
    sc["vision.hotspot"] = 100 if top_est == top_true else 55
    sc["vision.rushwarn"] = min(100, sc["vision.queue"] * .98)
    return {"scores": {k: round(max(0, min(100, v)), 1) for k, v in sc.items()},
            "truth": {k: T[k] for k in ("people", "staff", "in", "out", "queued", "restricted")},
            "seen": {"visitors": s["visitors"], "in": s["in"], "out": s["out"], "queued": Z[q]["visits"], "restricted_alerts": ra}}


def _staff_est(e: VisionEngine) -> int:
    """staff by movement: went into a staff-only zone and never queued (no faces, no identity)."""
    rz = {z["id"] for z in e.zones if z.get("kind") == "restricted"}; qz = {z["id"] for z in e.zones if z.get("kind") == "queue"}
    went = {ev["track"] for ev in e.events if ev["kind"] == "restricted" and ev.get("zone") in rz}
    queued = {ev["track"] for ev in e.events if ev["kind"] == "visit" and ev.get("zone") in qz}
    return len(went - queued)


def fresh() -> dict:
    return {"skills": {k: {**v, "level": 1, "label": "Learning", "status": "live", "history": []} for k, v in BASE.items()},
            "knobs": dict(FACTORY), "changes": [], "unlocked": [], "proposals": [], "days": []}


def load() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else fresh()


def save(st: dict):
    STATE.parent.mkdir(parents=True, exist_ok=True); STATE.write_text(json.dumps(st, indent=1, default=str))


def run_day(cfg: dict, st: dict, day: date, hours=(12, 14)) -> dict:
    """one day in the lab: exam, coaching, maybe a new skill. Returns the day's record."""
    cfg = copy.deepcopy(cfg)
    for path, v in st["knobs"].items(): _set(cfg, path, v)
    live = {k: v for k, v in st["skills"].items()}
    diff = difficulty(st["days"])
    seed = int(day.strftime("%Y%m%d"))
    res = exam(cfg, seed, diff, hours)
    rec = {"day": day.isoformat(), "difficulty": diff["grade"], "scores": {}, "truth": res["truth"], "seen": res["seen"], "changes": [], "new": None}
    for k, sk in st["skills"].items():
        score = res["scores"].get(k)
        if score is None: continue
        n, name = level_of(score)
        prev = sk["history"][-1]["score"] if sk["history"] else None
        sk["history"].append({"day": day.isoformat(), "score": score, "level": n})
        sk["history"] = sk["history"][-30:]
        sk["score"], sk["level"], sk["label"] = score, n, name
        sk["trend"] = None if prev is None else round(score - prev, 1)
        rec["scores"][k] = score
    # coach: tune the weakest live skill below Proficient, keep the change only if a held-out day agrees
    weak = sorted([(v["score"], k) for k, v in st["skills"].items() if v["status"] == "live" and v.get("score", 100) < 98.5 and BASE.get(k, {}).get("knobs")])
    if weak:
        _, k = weak[0]; base_hold = exam(cfg, seed + 1, diff, hours)["scores"]
        best = None
        for knob in BASE[k]["knobs"]:
            cur = _get(cfg, knob)
            for v in KNOB_STEPS.get(knob, []):
                if cur is not None and abs(v - cur) < 1e-9: continue
                if any(c["knob"] == knob and c["to"] == v and not c.get("kept") and (day - date.fromisoformat(c["day"])).days < 4 for c in st["changes"]): continue   # tried lately: give it a rest
                c2 = copy.deepcopy(cfg); _set(c2, knob, v)
                hold = exam(c2, seed + 1, diff, hours)["scores"]
                gain = hold[k] - base_hold[k]
                worse = [o for o in BASE if hold.get(o, 0) < base_hold.get(o, 0) - .5]
                cand = {"skill": k, "knob": knob, "from": cur, "to": v, "gain": round(gain, 1), "held_out": hold[k], "others_worse": worse}
                if gain >= 1 and not worse and (best is None or gain > best["gain"]): best = cand
                elif best is None: rec["changes"].append({**cand, "kept": False, "why": "no gain on the held-out day" if gain < 1 else f"made {', '.join(worse)} worse"})
        if best:
            st["knobs"][best["knob"]] = best["to"]; rec["changes"] = [{**best, "kept": True, "why": f"+{best['gain']} points on a held-out day, nothing else worse"}]
        rec["changes"] = rec["changes"][:4]
        for c in rec["changes"]: st["changes"].append({"day": day.isoformat(), **c})
        st["changes"] = st["changes"][-60:]
    # new skill of the day
    have = set(st["skills"])
    for c in CURRICULUM:
        if c["id"] in have: continue
        if all(st["skills"].get(n, {}).get("level", 0) >= 3 and st["skills"][n]["status"] == "live" for n in c["needs"]):
            st["skills"][c["id"]] = {"name": c["name"], "agent": c["agent"], "what": c["what"], "knobs": [], "level": 1, "label": "Learning",
                                     "status": "training", "since": day.isoformat(), "history": []}
            st["unlocked"].append({"day": day.isoformat(), "id": c["id"], "name": c["name"]}); rec["new"] = c["id"]
            break
    # a skill that trained for 7 days at Competent or better asks to go live (Pavi decides)
    for k, v in st["skills"].items():
        if v["status"] == "training" and v.get("since") and (day - date.fromisoformat(v["since"])).days >= 6 and v.get("level", 1) >= 3 \
                and not any(p["skill"] == k for p in st["proposals"]):
            st["proposals"].append({"skill": k, "name": v["name"], "day": day.isoformat(), "status": "waiting",
                                    "text": f"Put '{v['name']}' live: {v['score']}/100 after a week of exams (level {v['level']} {v['label']})."})
    st["days"].append(rec); st["days"] = st["days"][-30:]
    return rec


def approve(st: dict, skill: str, yes: bool = True, note: str = "") -> dict:
    for p in st["proposals"]:
        if p["skill"] == skill and p["status"] == "waiting":
            p["status"] = "approved" if yes else "rejected"; p["note"] = note
            if yes: st["skills"][skill]["status"] = "live"
    return st


def run(days: int = 1, start: date | None = None, cfg=None, new=False, hours=(12, 14)) -> dict:
    from .run import load_cfg
    cfg = cfg or load_cfg(); st = fresh() if new else load()
    d0 = start or date.today() - timedelta(days=days - 1)
    for i in range(days): run_day(cfg, st, d0 + timedelta(days=i), hours)
    return st
