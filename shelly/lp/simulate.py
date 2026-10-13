"""Synthetic days for Loss Prevention: no camera, no real people, a known truth.

The store aisle camera sees simulated shoppers as 17-point skeletons (face points dropped) and the pose
gesture reader runs on them for real. Most shoppers are innocent, and many of them LOOK like the gesture
for a moment (own bags, reading a label, a phone into a pocket, arms crossed, hands in pockets); a few
conceal and leave without paying. Other rules (self-checkout, tills, docks, gates, cages, counts, tailgates,
tagged assets) are simulated as system events with a truth label and the everyday reason a false one happens.
"""
from __future__ import annotations

import random
from datetime import datetime

from .cases import CaseEngine
from .pose import Gestures, skeleton, wrist_path

CATS = ["spirits", "razors", "formula", "vapes"]
SHELF_X = {"spirits": 230, "razors": 470, "formula": 760, "vapes": 1030}     # where each shelf bay is on the aisle camera

# shopper behaviour mix at the high-risk aisle (share of visits)
MIX = {"basket": .29, "browse": .21, "read_label": .10, "own_bag": .09, "phone": .09, "arms": .08, "hands_pocket": .06,
       "carry_hand": .043, "thief_pocket": .009, "thief_jacket": .007, "thief_bag": .006, "thief_backpack": .003, "thief_pays_other": .002}
THIEF = {k for k in MIX if k.startswith("thief")}


def rest(rnd):
    return (rnd.uniform(.18, .35), rnd.uniform(.98, 1.1), .9)


def plan(kind, rnd):
    """wrist keyframes for the active hand: [(t, dx, dy, conf)] (dx = torso widths outward from the body edge,
    dy = torso heights down from the shoulders) + whether a reach at the shelf happens."""
    r = rest(rnd); t = 0.0
    K = [(0, *r)]
    def reach():
        nonlocal t
        t += rnd.uniform(.6, 1.2); K.append((t, rnd.uniform(.85, 1.3), rnd.uniform(.0, .6), .9)); t += rnd.uniform(.4, 1.0); K.append((t, rnd.uniform(.8, 1.2), rnd.uniform(.1, .6), .9))
    def to(dx, dy, c, hold, move=(.5, 1.0)):
        nonlocal t
        t += rnd.uniform(*move); K.append((t, dx, dy, c)); t += hold; K.append((t, dx + rnd.uniform(-.03, .03), dy + rnd.uniform(-.03, .03), c))
    if kind == "basket": reach(); to(rnd.uniform(.45, .8), rnd.uniform(.9, 1.05), .9, rnd.uniform(.3, .8))
    elif kind == "browse": reach(); to(*rest(rnd)[:2], .9, rnd.uniform(.5, 1.5))
    elif kind == "read_label": reach(); to(rnd.uniform(-.6, -.15), rnd.uniform(.08, .4), .9, rnd.uniform(1.0, 3.0)); reach(); to(*rest(rnd)[:2], .9, .5)
    elif kind == "own_bag": reach(); to(rnd.uniform(-.3, .05), rnd.uniform(.7, .95), rnd.choice([.9, .25]), rnd.uniform(.6, 1.4))
    elif kind == "phone": to(rnd.uniform(-.05, .12), rnd.uniform(.95, 1.1), .2, rnd.uniform(.8, 2.0))
    elif kind == "arms": to(rnd.uniform(-.7, -.4), rnd.uniform(.4, .6), .5, rnd.uniform(3, 8))
    elif kind == "hands_pocket": reach(); to(*rest(rnd)[:2], .9, rnd.uniform(1.5, 3.5)); to(rnd.uniform(-.05, .12), rnd.uniform(.95, 1.08), .2, rnd.uniform(2, 4))
    elif kind == "carry_hand": reach(); to(rnd.uniform(.12, .3), rnd.uniform(.95, 1.1), .9, rnd.uniform(1.5, 3.0))
    elif kind in ("thief_pocket", "thief_pays_other"): reach(); to(rnd.uniform(-.1, .1), rnd.uniform(.95, 1.1), .15, rnd.uniform(.7, 1.6), (.3, .9))
    elif kind == "thief_jacket": reach(); to(rnd.uniform(-.55, -.25), rnd.uniform(.3, .55), .15, rnd.uniform(.7, 1.5), (.3, .9))
    elif kind == "thief_bag": reach(); to(rnd.uniform(-.45, -.1), rnd.uniform(.78, .95), .2, rnd.uniform(.7, 1.5), (.3, .9))
    elif kind == "thief_backpack": reach(); to(rnd.uniform(-.1, .1), rnd.uniform(.0, .22), .3, rnd.uniform(1.0, 2.0))
    t += rnd.uniform(.6, 1.2); K.append((t, *r))
    return K, t + .4


def frames_for(kind, rnd, cx, foot=600, H=430, fps=5, jitter=.012, miss=.06):
    """the skeleton frames the pose model would report for one visit (time, keypoints)."""
    keys, dur = plan(kind, rnd)
    hand = rnd.choice("LR")
    out = []
    n = int(dur * fps)
    for i in range(n):
        t = i / fps
        if rnd.random() < miss: continue
        a = wrist_path(keys, t)
        other = (rnd.uniform(.18, .32), 1.02, .9) if kind != "arms" else (a[0], a[1] + .05, a[2])
        wr = [a, other] if hand == "L" else [other, a]
        out.append((t, skeleton(cx, foot, H, wr, rnd, jitter * H)))
    return out


def store_day(cfg, seed=1, visits=260, params=None, start=None, keep=None):
    """one trading day at the high-risk aisle + the floor path, the self-checkout and the tills."""
    rnd = random.Random(seed)
    eng = CaseEngine(cfg, "store", start or datetime(2026, 10, 13, 0, 0))
    kinds, w = zip(*MIX.items())
    truth = {"losses": 0, "visits": visits, "by_kind": {}, "losses_by": {}}
    T0 = 7 * 3600.0
    for v in range(visits):
        kind = rnd.choices(kinds, w)[0]
        truth["by_kind"][kind] = truth["by_kind"].get(kind, 0) + 1
        cat = rnd.choice(CATS); cx = SHELF_X[cat] + rnd.uniform(-60, 60)
        T0 += rnd.uniform(60, 355)                              # time of day this visit reaches the aisle
        G = Gestures(params)
        for t, k in frames_for(kind, rnd, cx):
            G.update(T0 + t, v, k)
        ev = []
        reach = next((g for g in G.events if g["kind"] == "reach"), None)
        if reach: ev.append({"kind": "pick", "t": reach["t"], "zone": cat})
        ev += [{"kind": "conceal", "t": g["t"], "conf": g["conf"]} for g in G.events if g["kind"] == "conceal"]
        end = T0 + rnd.uniform(40, 300)
        is_thief = kind in THIEF
        pays_for_cat = kind in ("basket", "own_bag", "carry_hand") or (kind == "read_label" and rnd.random() < .5)
        if is_thief and kind != "thief_pays_other": till = None
        elif kind == "thief_pays_other" or pays_for_cat or rnd.random() < .5:
            cats = ["bread", "milk"] + ([cat] if pays_for_cat else [])
            till = {"kind": "till", "t": end - 25, "cats": cats, "linked": rnd.random() < .96}
        else: till = None
        if till: ev.append(till)
        if rnd.random() > .07: ev.append({"kind": "exit", "t": end})     # 7%: the track from the aisle to the door is lost
        tr = "loss" if is_thief else kind
        if is_thief: truth["losses"] += 1; truth["losses_by"]["unpaid_exit"] = truth["losses_by"].get("unpaid_exit", 0) + 1
        lvl = eng.visit(v, ev, truth=tr)
        if keep is not None: keep.append({"kind": kind, "level": lvl, "events": G.events})
    # the self-checkout: most mismatches are honest mistakes; three or more in one transaction is a pattern
    for i in range(rnd.randint(10, 18)):
        t = rnd.uniform(7 * 3600, 22 * 3600); deliberate = rnd.random() < .12
        n = rnd.randint(3, 5) if deliberate else 1
        eng._new("sco_mismatch", "assist", [{"kind": "item not scanned", "t": t, "zone": "self-checkout"}], 0, where="self-checkout lane 2",
                 truth="loss" if deliberate else "scan error", note="Attendant helps re-scan. Nothing is saved.")
        if deliberate:
            eng._new("sco_mismatch", "review", [{"kind": "item not scanned", "t": t + 20 * j, "zone": "self-checkout"} for j in range(n)],
                     rnd.uniform(25, 90), camera="cam-sco", where="self-checkout lane 2", conf=.8, truth="loss",
                     note=f"{n} unscanned items in one transaction")
            truth["losses"] += 1; truth["losses_by"]["sco_mismatch"] = truth["losses_by"].get("sco_mismatch", 0) + 1
    sys_rules(eng, rnd, truth, {"till_exception": (1.1, .3, (20, 160), ["genuine refund, customer stepped away", "void of a mis-key"], "front till"),
                                "after_hours": (.15, .4, (0, 600), ["cleaner on the roster", "manager doing the banking"], "shop floor")}, cam={"after_hours": "cam-stock"})
    return eng, truth


SITE_RULES = {
    "gateway": {"dock_unscheduled": (.8, .15, (500, 4000), ["booking entered late", "carrier swap not updated"], "Dock 7"),
                "gate_no_manifest": (.5, .2, (1000, 12000), ["manifest printed after departure", "empty trailer return"], "Yard gate"),
                "cage_after_hours": (.3, .3, (200, 2000), ["night shift pick for an urgent order"], "High-value cage"),
                "count_variance": (2.0, .25, (200, 1500), ["stock in the wrong bin", "unit-of-measure error"], "Aisle 14")},
    "totara": {"cage_after_hours": (.2, .25, (300, 3000), ["pharmacist call-out for a hospital order"], "Controlled-drugs cage"),
               "receipt_shortfall": (1.0, .6, (100, 2500), ["second pallet on the next truck"], "Receiving"),
               "count_variance": (.5, .3, (100, 1200), ["dispensed but not booked out"], "Controlled-drugs cage")},
    "group": {"tailgate": (2.0, .1, (0, 0), ["colleague with their own badge held the door", "visitor escorted by reception"], "Lobby gate 2"),
              "after_hours_floor": (.4, .15, (0, 0), ["approved late work", "cleaning contractor"], "Level 12"),
              "asset_exit": (.3, .3, (1500, 3500), ["sign-out done after leaving", "laptop going for repair"], "Lobby")}}
CAMS = {"dock_unscheduled": "gw-dock", "gate_no_manifest": "gw-gate", "cage_after_hours": "gw-cage", "tailgate": "tw-lobby", "after_hours_floor": "tw-l12"}


def sys_rules(eng, rnd, truth, rules, cam=None):
    cam = {**CAMS, **(cam or {})}
    h0, h1 = eng.site["hours"]
    for rule, (rate, p_true, (lo, hi), why, where) in rules.items():
        n = int(rate) + (1 if rnd.random() < rate - int(rate) else 0)
        for _ in range(n):
            real = rnd.random() < p_true
            after = rule.endswith("after_hours") or rule == "after_hours_floor"
            t = (rnd.uniform(h1, 24 + h0) % 24) * 3600 if after else rnd.uniform(h0, h1) * 3600
            if rule.startswith("cage") and eng.site_id == "totara": cam_id = "tm-cd"
            else: cam_id = cam.get(rule) if rule in cam else None
            eng.event(rule, t, rnd.uniform(lo, hi) if hi else 0, where, "", truth="loss" if real else rnd.choice(why), camera=cam_id)
            if real: truth["losses"] += 1; truth.setdefault("losses_by", {})[rule] = truth.setdefault("losses_by", {}).get(rule, 0) + 1


def site_day(cfg, site, seed=1, start=None):
    if site == "store": return store_day(cfg, seed, start=start)
    rnd = random.Random(seed * 31 + len(site))
    eng = CaseEngine(cfg, site, start or datetime(2026, 10, 13, 0, 0))
    truth = {"losses": 0}
    sys_rules(eng, rnd, truth, SITE_RULES[site])
    return eng, truth
