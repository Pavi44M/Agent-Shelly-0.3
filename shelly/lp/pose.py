"""The concealment gesture, read from body points only (Shelly Intelligence · Loss Prevention).

A pose model (for example YOLO11-pose) gives 17 COCO body points per person per frame. Shelly drops the
face points (nose, eyes, ears) straight away and keeps the skeleton: shoulders, elbows, wrists, hips, knees.

A concealment gesture is a SEQUENCE, never a pose:
    1. a reach: a wrist goes well beyond the shoulder line, towards the shelf (picking something up), then
    2. within a few seconds the same hand goes into the pocket region (front of the body, waist to mid-chest,
       or just beside the hip where trouser pockets are) and stays there for a moment, often hidden.

Arms crossed, a phone going into a pocket, hands resting by the side, or an item going into a basket held
out to the side are NOT the gesture: there is no reach before them, or the hand never enters the region.
Even then the gesture alone means nothing: it is one step of a pattern (see cases.py).
"""
from __future__ import annotations

import math

FACE = (0, 1, 2, 3, 4)          # nose, eyes, ears: removed before analysis
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP = 5, 6, 7, 8, 9, 10, 11, 12

DEFAULT = {"min_conf": .35, "reach_out": .55, "pocket_box": .30, "hold_s": .6, "window_s": 4.0}


def strip_face(kps):
    """the privacy step: face points are zeroed before anything else sees the skeleton."""
    out = [list(p) for p in kps]
    for i in FACE: out[i] = [0.0, 0.0, 0.0]
    return out


def torso(kps):
    """torso box from shoulders and hips: (x0, x1, y_sh, y_hip, width, height) or None if not visible."""
    pts = [kps[i] for i in (L_SH, R_SH, L_HIP, R_HIP)]
    if any(p[2] < .2 for p in pts): return None
    xs = [p[0] for p in pts]; y_sh = (pts[0][1] + pts[1][1]) / 2; y_hip = (pts[2][1] + pts[3][1]) / 2
    h = max(1.0, y_hip - y_sh); w = max(max(xs) - min(xs), .35 * h)
    cx = (min(xs) + max(xs)) / 2
    return cx - w / 2, cx + w / 2, y_sh, y_hip, w, h


def is_reach(wr, T, p):
    x0, x1, y_sh, y_hip, w, h = T
    out = max(x0 - wr[0], wr[0] - x1)                      # how far beyond the body, sideways
    return wr[2] >= p["min_conf"] and out > p["reach_out"] * w and y_sh - .7 * h < wr[1] < y_hip + .2 * h


def in_pocket(wr, T, p):
    x0, x1, y_sh, y_hip, w, h = T
    m = p["pocket_box"] * w
    return x0 - m <= wr[0] <= x1 + m and y_sh + .3 * h <= wr[1] <= y_hip + .3 * h


class Gestures:
    """per-track state machine; feed it (t, keypoints) frames, read .events (list of dicts)."""

    def __init__(self, params=None):
        self.p = {**DEFAULT, **(params or {})}
        self.s = {}                                           # (track, hand) -> state
        self.events = []

    def update(self, t, track, kps):
        kps = strip_face(kps); T = torso(kps)
        if T is None: return []
        new = []
        for hand, wi in (("L", L_WR), ("R", R_WR)):
            st = self.s.setdefault((track, hand), {"reach": None, "in": None, "last_in": False, "fired": -1e9})
            wr = kps[wi]
            if is_reach(wr, T, self.p):
                if not st.get("reaching"): new.append({"kind": "reach", "t": t, "track": track, "hand": hand})
                st["reach"], st["in"], st["prev"], st["reaching"] = t, None, wr, True
                continue
            st["reaching"] = False
            seen = wr[2] >= self.p["min_conf"]
            if seen:
                inside = in_pocket(wr, T, self.p)
                prev = st.get("prev"); cx = (T[0] + T[1]) / 2
                # a hand that vanishes while moving in towards the body, already close to it, went in (pocket, jacket, bag)
                st["heading_in"] = bool(prev) and abs(wr[0] - cx) < abs(prev[0] - cx) - .05 * T[4] and in_pocket(wr, T, {**self.p, "pocket_box": self.p["pocket_box"] + .5}) 
                st["prev"] = wr
            else:
                inside = st["last_in"] or st.get("heading_in", False)              # a hidden hand stays where it was going
            st["last_in"] = inside
            if st["reach"] is None or t - st["reach"] > self.p["window_s"] + self.p["hold_s"]:
                st["in"] = None; continue
            if inside:
                if st["in"] is None: st["in"] = t
                if t - st["in"] >= self.p["hold_s"] and st["in"] - st["reach"] <= self.p["window_s"] and t - st["fired"] > 3:
                    hid = not seen
                    conf = round(min(.95, .5 + .08 * min(2.0, t - st["in"]) + (.25 if hid else 0)), 2)   # a hand AND item gone from view counts most
                    new.append({"kind": "conceal", "t": t, "track": track, "hand": hand, "conf": conf, "hidden": hid})
                    st["fired"], st["reach"], st["in"] = t, None, None
            else:
                st["in"] = None
        self.events += new
        return new


def skeleton(cx, foot, H, wrists, rnd=None, jitter=0.0):
    """a 17-point skeleton for a person standing at (cx, foot), height H px, wrists given as
    [(dx, dy, conf), (dx, dy, conf)] in torso-width / torso-height units from the torso box (L, R).
    Used by the simulator and the tests: no real person behind it."""
    g = (lambda: rnd.gauss(0, jitter)) if rnd and jitter else (lambda: 0.0)
    th = .30 * H; tw = .26 * H
    y_sh = foot - .80 * H; y_hip = y_sh + th
    x0, x1 = cx - tw / 2, cx + tw / 2
    P = [[0, 0, 0]] * 17
    P = [list(p) for p in P]
    P[0] = [cx + g(), y_sh - .1 * H, .9]; P[1] = [cx - 4, y_sh - .12 * H, .9]; P[2] = [cx + 4, y_sh - .12 * H, .9]
    P[3] = [cx - 8, y_sh - .11 * H, .6]; P[4] = [cx + 8, y_sh - .11 * H, .6]
    P[L_SH] = [x0 + g(), y_sh + g(), .95]; P[R_SH] = [x1 + g(), y_sh + g(), .95]
    P[L_HIP] = [x0 + .08 * tw + g(), y_hip + g(), .9]; P[R_HIP] = [x1 - .08 * tw + g(), y_hip + g(), .9]
    P[13] = [x0 + .1 * tw, y_hip + .25 * H, .85]; P[14] = [x1 - .1 * tw, y_hip + .25 * H, .85]
    P[15] = [x0 + .1 * tw, foot, .8]; P[16] = [x1 - .1 * tw, foot, .8]
    for side, (dx, dy, c) in zip(("L", "R"), wrists):
        sh = P[L_SH] if side == "L" else P[R_SH]
        edge = x0 if side == "L" else x1
        sgn = -1 if side == "L" else 1
        wx, wy = edge + sgn * dx * tw + g(), y_sh + dy * th + g()
        ex, ey = (sh[0] + wx) / 2 + sgn * .05 * tw, (sh[1] + wy) / 2
        P[L_EL if side == "L" else R_EL] = [ex, ey, .9]
        P[L_WR if side == "L" else R_WR] = [wx, wy, c]
    return P


def lerp(a, b, k):
    return a + (b - a) * k


def wrist_path(keys, t):
    """keyframes [(t, dx, dy, conf)] -> (dx, dy, conf) at time t (linear)."""
    if t <= keys[0][0]: return keys[0][1:]
    for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            k = (t - t0) / max(1e-6, t1 - t0)
            return (lerp(a[0], b[0], k), lerp(a[1], b[1], k), a[2] if k < .8 else b[2])
    return keys[-1][1:]


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])
