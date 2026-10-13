"""A synthetic store camera for Shelly Vision: shoppers and staff walking the reference floor plan,
seen the way a real detector + tracker reports them (boxes with perspective, jitter, missed frames,
a few identity switches and false positives). Used by the tests, the demo data on the website and to
try a new zone layout without footage of anyone. Seeded: the same day always gives the same numbers.
"""
from __future__ import annotations

import math
import random

from .engine import point_in_poly

# footfall through the day (people per minute arriving, NZ convenience store shape: breakfast, lunch, 5 pm rush)
PROFILE = {7: .45, 8: .8, 9: .55, 10: .45, 11: .6, 12: 1.0, 13: .8, 14: .5, 15: .55, 16: .75, 17: 1.25, 18: 1.05, 19: .7, 20: .5, 21: .35}


def _centre(poly):
    return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)


def _inside_pt(poly, rnd):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    for _ in range(50):
        x, y = rnd.uniform(min(xs) + 15, max(xs) - 15), rnd.uniform(min(ys) + 15, max(ys) - 15)
        if point_in_poly(x, y, poly): return x, y
    return _centre(poly)


class Agent:
    def __init__(self, aid, plan, rnd, staff=False):
        self.id, self.rnd, self.staff = aid, rnd, staff
        self.x, self.y = rnd.uniform(560, 730), 715.0
        self.v = rnd.uniform(55, 85)            # px / s walking
        door = rnd.uniform(560, 720)            # people come in through the door, straight up, then head off
        self.plan, self.i, self.wait = [("go", self.x, 600, 0)] + plan, 0, 0.0
        self.done = False

    def step(self, dt, queue_slots):
        if self.done or self.i >= len(self.plan): self.done = True; return
        kind, tx, ty, stay = self.plan[self.i]
        if kind == "queue":                     # join the back of the queue and shuffle forward
            pos = queue_slots.index(self) if self in queue_slots else len(queue_slots)
            if self not in queue_slots: queue_slots.append(self); self.queued = True
            tx, ty = 600 + pos * 42, 535
            if pos == 0:
                self.wait += dt
                if self.wait >= stay: queue_slots.remove(self); self.i += 1; self.wait = 0
        dx, dy = tx - self.x, ty - self.y; d = math.hypot(dx, dy)
        if d > 3:
            s = min(d, self.v * dt); self.x += dx / d * s; self.y += dy / d * s
        elif kind != "queue":
            self.wait += dt
            if self.wait >= stay: self.i += 1; self.wait = 0
        if self.i >= len(self.plan): self.done = True

    def box(self, rnd, jitter=3.0):
        h = 70 + self.y * .09; w = h * .38
        jx, jy = rnd.gauss(0, jitter), rnd.gauss(0, jitter)
        return self.x - w / 2 + jx, self.y - h + jy, self.x + w / 2 + jx, self.y + jy


def plan_for(cfg, rnd, staff=False):
    Z = {z["id"]: z for z in cfg["zones"]}
    if staff:   # restock: stockroom then an aisle, then back out
        return [("go", *_inside_pt(Z["stock"]["poly"], rnd), rnd.uniform(20, 60)), ("go", *_inside_pt(Z["grocery"]["poly"], rnd), rnd.uniform(30, 90)),
                ("go", (x := rnd.uniform(560, 720)), 615, 0), ("go", x, 700, 0), ("go", x, 740, 0)]
    stops = rnd.sample(["produce", "grocery", "chillers", "cafe"], k=rnd.choice([1, 1, 2, 2, 3]))
    p = []
    for s in stops:
        stay = rnd.uniform(25, 140) if s == "cafe" else rnd.uniform(6, 55)
        p.append(("go", *_inside_pt(Z[s]["poly"], rnd), stay))
    if rnd.random() < .82: p.append(("queue", 0, 0, rnd.uniform(25, 60)))
    x = rnd.uniform(560, 720)
    p += [("go", x, 615, 0), ("go", x, 690, 0), ("go", x, 740, 0)]
    return p


SCENARIO = {"switch": .0006, "miss": .06, "fp": .004, "jitter": 3.0, "scale": 1.0}


def simulate(cfg, engine, hours=(7, 22), fps=4.0, seed=13, sink=None, scale=None, scenario=None, until=None):
    """run a synthetic trading day through the engine and keep the TRUTH (what really happened) beside it,
    so every skill can be marked: real crossings, real zone visits and dwell, real queue joins, staff in the
    stockroom. scenario: harder or easier camera conditions (identity switches, missed detections, false
    positives, box jitter, footfall scale). sink(t, agents, dets) sees every frame (for playback)."""
    from .engine import side_of, proj_t
    sc = {**SCENARIO, **(scenario or {})}
    if scale is not None: sc["scale"] = scale
    rnd = random.Random(seed)
    t, dt = 0.0, 1 / fps
    agents, queue, nid, tid = [], [], 0, 0
    ids = {}
    end = (hours[1] - hours[0]) * 3600 if until is None else until
    staff_next = 300.0
    Z = cfg["zones"]; L = cfg["counting"]["lines"][0]
    truth = {"people": 0, "staff": 0, "in": 0, "out": 0, "queued": 0, "restricted": 0, "visits": {z["id"]: [] for z in Z}}
    while t < end:
        hr = hours[0] + int(t // 3600)
        rate = PROFILE.get(hr, .3) * sc["scale"] / 60
        if rnd.random() < rate * dt:
            agents.append(Agent(nid, plan_for(cfg, rnd), rnd)); nid += 1
        if t >= staff_next:
            agents.append(Agent(nid, plan_for(cfg, rnd, staff=True), rnd, staff=True)); nid += 1; truth["staff"] += 1; staff_next = t + rnd.uniform(1800, 3600)
        dets = []
        for a in agents:
            px, py = a.x, a.y
            a.step(dt, queue)
            # truth: crossings of the count line and time inside every zone
            s0, s1 = side_of(L["a"], L["b"], (px, py)), side_of(L["a"], L["b"], (a.x, a.y))
            if s0 * s1 < 0 and 0 <= proj_t(L["a"], L["b"], (a.x, a.y)) <= 1: truth["in" if a.y < py else "out"] += 1
            tz = a.__dict__.setdefault("tz", {})
            for z in Z:
                ins = point_in_poly(a.x, a.y, z["poly"])
                if ins and z["id"] not in tz: tz[z["id"]] = t
                elif not ins and z["id"] in tz:
                    d = t - tz.pop(z["id"])
                    if z.get("kind") == "restricted": truth["restricted"] += 1
                    elif d >= float(z.get("min_dwell_s", 0)): truth["visits"][z["id"]].append(round(d, 1))
            if a.done or a.y > 725: continue
            if a not in ids or rnd.random() < sc["switch"]: tid += 1; ids[a] = tid
            if rnd.random() < sc["miss"]: continue
            dets.append((ids[a], *a.box(rnd, sc["jitter"])))
        if rnd.random() < sc["fp"]:
            tid += 1; x, y = rnd.uniform(100, 1100), rnd.uniform(100, 500); dets.append((tid, x, y, x + 30, y + 80))
        truth["queued"] += sum(1 for a in agents if getattr(a, "queued", False) and not getattr(a, "qc", False) and not setattr(a, "qc", True))
        agents = [a for a in agents if not (a.done and a.y >= 735)]
        engine.update(t, dets)
        if sink: sink(t, agents, dets)
        t += dt
    engine.update(t + 10, [])
    truth["people"] = nid
    engine.truth = truth
    return engine
