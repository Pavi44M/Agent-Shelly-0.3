"""Tuning the concealment pattern safely (Shelly Intelligence · Loss Prevention · Skill Lab).

Starts from factory settings and changes one knob at a time on TRAINING days. A change is kept only when
HELD-OUT days (never used for training) also get better AND the false alarms stay inside the alert budget.
The result is a proposal: the tuned settings go live only when Pavi approves them in the Brain.

Goal, per day: catch real losses, keep false review cases under the budget (1 per camera per day), and
do not pester innocent shoppers with too many "can I help?" prompts.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

from .cases import score
from .simulate import store_day

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "state" / "lp_tuning.json"
FACTORY = {"pose.pocket_box": .30, "pose.window_s": 4.0, "pose.hold_s": .6, "rule.review_conf": 0.0, "rule.assist_conf": 0.0}
STEPS = {"pose.pocket_box": [.06, .1, .15, .2, .3], "pose.window_s": [1.5, 2.0, 3.0, 4.0], "pose.hold_s": [.4, .6, .8, 1.0, 1.2],
         "rule.review_conf": [0.0, .6, .65, .7, .75, .8], "rule.assist_conf": [0.0, .55, .6, .65, .7, .75]}
TRAIN, HELD = (101, 102, 103, 104), (201, 202, 203, 204)
NAMES = {"pose.pocket_box": "pocket region size", "pose.window_s": "reach-to-pocket window", "pose.hold_s": "hand-hidden hold",
         "rule.review_conf": "confidence for a review case", "rule.assist_conf": "confidence for an assist prompt"}


def apply(cfg, knobs):
    c = copy.deepcopy(cfg); params = {}
    for k, v in knobs.items():
        a, b = k.split(".")
        if a == "pose": params[b] = v
        else: c["sites"]["store"]["rules"]["unpaid_exit"][b] = v
    return c, params


def measure(cfg, knobs, seeds):
    c, params = apply(cfg, knobs)
    tp = L = fp = ia = 0
    for s in seeds:
        eng, truth = store_day(c, s, params=params)
        r = score(eng, truth)["rules"].get("unpaid_exit", {})
        tp += r.get("true", 0); L += truth["losses_by"].get("unpaid_exit", 0); fp += r.get("false", 0); ia += r.get("innocent_assists", 0)
    n = len(seeds); budget = cfg["human_in_the_loop"]["alert_budget_per_camera_day"]
    rec = tp / L if L else 0; fpd = fp / n; iad = ia / n
    return {"recall": round(rec, 3), "false_per_day": round(fpd, 2), "innocent_assists_per_day": round(iad, 1),
            "J": round(100 * rec - 15 * max(0, fpd - budget) - .5 * iad, 2), "caught": tp, "losses": L}


def run(cfg, rounds=3):
    knobs = dict(FACTORY)
    log = []
    tr, ho = measure(cfg, knobs, TRAIN), measure(cfg, knobs, HELD)
    start = {"train": tr, "held": ho}
    budget = cfg["human_in_the_loop"]["alert_budget_per_camera_day"]
    for rnd in range(rounds):
        improved = False
        for k, opts in STEPS.items():
            i = opts.index(knobs[k])
            best = None
            for j in (i - 1, i + 1, i - 2, i + 2):
                if not 0 <= j < len(opts): continue
                trial = {**knobs, k: opts[j]}
                m = measure(cfg, trial, TRAIN)
                if m["J"] > tr["J"] + .5 and (best is None or m["J"] > best[1]["J"]): best = (opts[j], m)
            if not best: continue
            trial = {**knobs, k: best[0]}
            h = measure(cfg, trial, HELD)
            gain = round(h["J"] - ho["J"], 2)
            keep = gain >= 1 and (h["false_per_day"] <= max(budget, ho["false_per_day"])) and h["recall"] >= ho["recall"] - .05
            log.append({"round": rnd + 1, "knob": k, "name": NAMES[k], "from": knobs[k], "to": best[0], "train_J": best[1]["J"], "held_J": h["J"],
                        "gain": gain, "held": h, "kept": keep,
                        "why": "held-out days agree" if keep else ("recall fell on held-out days" if h["recall"] < ho["recall"] - .05 else
                                                                  "false alarms over budget on held-out days" if h["false_per_day"] > max(budget, ho["false_per_day"]) else
                                                                  "no real gain on held-out days")})
            if keep: knobs, tr, ho, improved = trial, best[1], h, True
        if not improved: break
    return {"factory": FACTORY, "knobs": knobs, "start": start, "final": {"train": tr, "held": ho}, "log": log,
            "within_budget": ho["false_per_day"] <= budget, "budget": budget, "status": "waiting for Pavi"}


def save(st):
    STATE.parent.mkdir(exist_ok=True); STATE.write_text(json.dumps(st, indent=1))


def load():
    return json.loads(STATE.read_text()) if STATE.exists() else None
