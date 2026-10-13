"""Shelly Vision engine: people analytics from tracked detections (no deep-learning dependency here).

Feed it, frame by frame, the tracked people a detector found (track id + box) and the video time; it
keeps the state that turns boxes into business numbers:

* **Unique visitors**, not per-frame counts: a track must live ``min_life_s`` before it counts, and each
  track counts once.
* **IN / OUT across a line** with a dead band either side (no double counts from jitter), the crossing
  must happen inside the segment, once per direction per track, with a cooldown.
* **Occupancy** (in - out, never below what the camera sees) and its peak.
* **Dwell** per zone and visit (enter / exit times, minimum dwell to count as a visit).
* **Queue** length and estimated wait (people in the queue x service time), with an alert.
* **Restricted zones** with a grace period and opening hours (an alert, not a judgement about a person).
* **Heatmaps of time spent**, not "someone was here": every frame adds the seconds a person stood in
  each cell (a Gaussian footprint, additive), a LIVE map that fades with a half-life and a DAY map that
  never fades, both in absolute seconds so days and stores compare.
* **Hourly roll-ups** and an **event log**.

All times come from the video (frame time), so analysing every 2nd frame or a 30 fps file gives the
same answers. Nothing about a person's identity is kept: ids are per visit and only numbers are saved.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np


# ------------------------------------------------------------------ geometry
def point_in_poly(x: float, y: float, poly) -> bool:
    inside, n = False, len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-9) + x1:
            inside = not inside
    return inside


def side_of(a, b, p) -> float:
    """signed distance of p from the line a->b (pixels); >0 on the left of a->b."""
    ax, ay = a; bx, by = b; px, py = p
    L = math.hypot(bx - ax, by - ay) or 1e-9
    return ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / L


def proj_t(a, b, p) -> float:
    """where p projects along a->b (0 at a, 1 at b)."""
    ax, ay = a; bx, by = b; px, py = p
    L2 = (bx - ax) ** 2 + (by - ay) ** 2 or 1e-9
    return ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2


# ------------------------------------------------------------------ state
@dataclass
class Track:
    id: int
    first: float
    last: float
    x: float
    y: float
    hits: int = 1
    counted: bool = False                      # became a visitor
    line_state: dict = field(default_factory=dict)   # line id -> last confirmed side (+1 / -1)
    line_done: dict = field(default_factory=dict)    # (line id, dir) -> time counted
    zones: dict = field(default_factory=dict)        # zone id -> entered at
    alerted: set = field(default_factory=set)
    zone_out: dict = field(default_factory=dict)     # zone id -> first time seen outside (exit needs a moment, not one jittery frame)
    pending: list = field(default_factory=list)      # crossings made before the track was confirmed


class VisionEngine:
    def __init__(self, cfg: dict, start: datetime | None = None):
        self.cfg = cfg
        cam = cfg["camera"]; self.W, self.H = int(cam["width"]), int(cam["height"])
        tr = cfg.get("tracking", {})
        self.relink_s = float(tr.get("relink_s", 1.2)); self.relink_px = float(tr.get("relink_px", 70)); self.exit_s = float(tr.get("zone_exit_s", 1.0)); self.alias = {}
        self.min_life = float(tr.get("min_life_s", .8)); self.lost_after = float(tr.get("lost_after_s", 2.0)); self.smooth = float(tr.get("smooth", .45))
        self.lines = cfg.get("counting", {}).get("lines", [])
        self.zones = cfg.get("zones", [])
        hm = cfg.get("heatmap", {})
        self.cell = int(hm.get("cell_px", 8)); self.sigma = float(hm.get("sigma_px", 22)); self.half_life = float(hm.get("half_life_s", 600))
        self.gw, self.gh = math.ceil(self.W / self.cell), math.ceil(self.H / self.cell)
        self.heat_live = np.zeros((self.gh, self.gw), np.float32)
        self.heat_day = np.zeros((self.gh, self.gw), np.float32)
        r = max(1, int(round(3 * self.sigma / self.cell)))
        yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
        k = np.exp(-(xx ** 2 + yy ** 2) * (self.cell ** 2) / (2 * self.sigma ** 2)).astype(np.float32)
        self.kernel, self.kr = k / k.sum(), r
        self.start = start or datetime(2026, 10, 13, 7, 0)
        self.tracks: dict[int, Track] = {}
        self.t = None
        self.events: list[dict] = []
        self.counts = defaultdict(int)          # line id + "_in"/"_out"
        self.visitors = 0
        self.occ_peak = 0
        self.visits = defaultdict(list)         # zone id -> dwell seconds per visit
        self.queue_max = defaultdict(int)
        self.hourly = defaultdict(lambda: defaultdict(float))
        self._last_q_alert = defaultdict(lambda: -1e9)

    # -------------------------------------------------- helpers
    def clock(self, t: float | None = None) -> datetime:
        return self.start + timedelta(seconds=(self.t or 0) if t is None else t)

    def _hour(self, t: float) -> str:
        return self.clock(t).strftime("%H:00")

    def _event(self, kind: str, t: float, **kw):
        e = {"t": round(t, 2), "time": self.clock(t).strftime("%H:%M:%S"), "kind": kind, **kw}
        self.events.append(e); return e

    def occupancy(self) -> int:
        ins = sum(v for k, v in self.counts.items() if k.endswith("_in")); outs = sum(v for k, v in self.counts.items() if k.endswith("_out"))
        seen = sum(1 for k in self.tracks.values() if k.counted)
        return max(seen, ins - outs)

    def _stamp(self, x: float, y: float, secs: float):
        cx, cy, r = int(x / self.cell), int(y / self.cell), self.kr
        y0, y1, x0, x1 = max(0, cy - r), min(self.gh, cy + r + 1), max(0, cx - r), min(self.gw, cx + r + 1)
        if y0 >= y1 or x0 >= x1: return
        k = self.kernel[y0 - (cy - r):y1 - (cy - r), x0 - (cx - r):x1 - (cx - r)] * secs
        self.heat_live[y0:y1, x0:x1] += k; self.heat_day[y0:y1, x0:x1] += k

    # -------------------------------------------------- main step
    def update(self, t: float, dets) -> list[dict]:
        """dets: iterable of (track_id, x1, y1, x2, y2[, conf]) in pixels at video time t (seconds)."""
        dt = 0.0 if self.t is None else max(0.0, t - self.t)
        self.t = t; new = len(self.events)
        if dt and self.half_life: self.heat_live *= 0.5 ** (dt / self.half_life)
        seen = set()
        for d in dets:
            tid, x1, y1, x2, y2 = int(d[0]), float(d[1]), float(d[2]), float(d[3]), float(d[4])
            fx, fy = (x1 + x2) / 2, y2                     # foot point: where the person stands
            tid = self.alias.get(tid, tid)
            k = self.tracks.get(tid)
            if k is None:
                outside = any(abs(side_of(L["a"], L["b"], (fx, fy))) >= 0 and self._outside(L, fx, fy) for L in self.lines)
                old = None if outside else self._relink(fx, fy, t, seen)
                if old is not None:                         # the tracker changed this person's id: carry on with the same visit
                    self.alias[int(d[0])] = old.id; k = old; tid = old.id; k.last = t
                else:
                    k = self.tracks[tid] = Track(tid, t, t, fx, fy)
                    # first seen just inside a door line: they walked in while the camera missed a frame or two
                    for L in self.lines:
                        d = abs(side_of(L["a"], L["b"], (fx, fy)))
                        if not self._outside(L, fx, fy) and d <= float(L.get("infer_px", 45)) and 0 <= proj_t(L["a"], L["b"], (fx, fy)) <= 1:
                            k.line_done[(L["id"], "in")] = t; k.pending.append((L["id"], "in", t))
            else:
                a = self.smooth; k.x = a * k.x + (1 - a) * fx; k.y = a * k.y + (1 - a) * fy; k.last = t; k.hits += 1
            seen.add(tid)
            self._lines(k, t)
            if not k.counted and t - k.first >= self.min_life:
                k.counted = True; self.visitors += 1; self.hourly[self._hour(t)]["visitors"] += 1
                for (lid, direction, tc) in k.pending: self._count(k, lid, direction, tc)
                k.pending.clear()
            if k.counted:
                if dt: self._stamp(k.x, k.y, dt)
                self._zones(k, t)
        # forget lost tracks (close their zone visits at last seen)
        for tid in [i for i, k in self.tracks.items() if t - k.last > self.lost_after]:
            k = self.tracks.pop(tid)
            for zid, t0 in list(k.zones.items()): self._leave(k, zid, t0, k.last)
        self._queues(t)
        occ = self.occupancy(); self.occ_peak = max(self.occ_peak, occ)
        h = self.hourly[self._hour(t)]; h["occ_peak"] = max(h["occ_peak"], occ)
        return self.events[new:]

    def _lines(self, k: Track, t: float):
        for L in self.lines:
            a, b, band = L["a"], L["b"], float(L.get("band_px", 12))
            s = side_of(a, b, (k.x, k.y)); tt = proj_t(a, b, (k.x, k.y))
            if abs(s) < band or not (-.05 <= tt <= 1.05): continue      # inside the dead band, or beside the line: no decision
            side = 1 if s > 0 else -1
            prev = k.line_state.get(L["id"])
            k.line_state[L["id"]] = side
            if prev is None or prev == side: continue
            # which side is "in"? up = smaller y; for a->b left to right, "left of a->b" is up on screen
            up_side = 1 if side_of(a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 50)) > 0 else -1
            want = {"up": up_side, "down": -up_side}.get(L.get("in_side", "up"), up_side)
            direction = "in" if side == want else "out"
            key = (L["id"], direction)
            if t - k.line_done.get(key, -1e9) < float(L.get("cooldown_s", 4)): continue
            k.line_done[key] = t
            if k.counted: self._count(k, L["id"], direction, t)
            else: k.pending.append((L["id"], direction, t))

    def _count(self, k: Track, lid: str, direction: str, t: float):
        self.counts[f"{lid}_{direction}"] += 1; self.hourly[self._hour(t)][direction] += 1
        self._event("cross", t, line=lid, dir=direction, track=k.id)

    def _outside(self, L, x, y) -> bool:
        """is (x, y) on the street side of a count line (where new people appear)?"""
        a, b = L["a"], L["b"]
        up = 1 if side_of(a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 50)) > 0 else -1
        inside = up if L.get("in_side", "up") == "up" else -up
        s = side_of(a, b, (x, y))
        return s * inside < 0 and -.1 <= proj_t(a, b, (x, y)) <= 1.1

    def _relink(self, x: float, y: float, t: float, seen: set):
        """a new id right where a confirmed person just vanished (within a second, a short step away) is the same person."""
        best, bd = None, self.relink_px
        for k in self.tracks.values():
            if k.id in seen or t - k.last > self.relink_s or t == k.last: continue
            if any(d == "out" and t - tc < 5 for (lid, d), tc in k.line_done.items()): continue   # just walked out: a new face at the door is someone else
            d = math.hypot(k.x - x, k.y - y)
            if d < bd: best, bd = k, d
        return best

    def _zones(self, k: Track, t: float):
        for z in self.zones:
            inside = point_in_poly(k.x, k.y, z["poly"])
            if inside:
                k.zone_out.pop(z["id"], None)
                if z["id"] not in k.zones: k.zones[z["id"]] = t
            elif z["id"] in k.zones:
                t_out = k.zone_out.setdefault(z["id"], t)
                if t - t_out >= self.exit_s: self._leave(k, z["id"], k.zones[z["id"]], t_out)
            if inside and z.get("kind") == "restricted" and z["id"] not in k.alerted:
                lo, hi = (z.get("hours") or [0, 24])
                hr = self.clock(t).hour + self.clock(t).minute / 60
                after_hours = not (lo <= hr < hi)
                if t - k.zones[z["id"]] >= float(z.get("grace_s", 3)) or after_hours:
                    k.alerted.add(z["id"])
                    self._event("restricted", t, zone=z["id"], track=k.id, after_hours=after_hours,
                                note="Someone is in a staff-only area: check it's a team member.")
                    self.hourly[self._hour(t)]["restricted"] += 1

    def _leave(self, k: Track, zid: str, t0: float, t1: float):
        k.zones.pop(zid, None)
        z = next((z for z in self.zones if z["id"] == zid), None)
        if not z: return
        d = t1 - t0
        if z.get("kind") in ("dwell", "queue") and d >= float(z.get("min_dwell_s", 0)):
            self.visits[zid].append(round(d, 1))
            self._event("visit", t1, zone=zid, dwell_s=round(d, 1), track=k.id)

    def _queues(self, t: float):
        for z in self.zones:
            if z.get("kind") != "queue": continue
            n = sum(1 for k in self.tracks.values() if k.counted and z["id"] in k.zones and t - k.last <= .5)
            self.queue_max[z["id"]] = max(self.queue_max[z["id"]], n)
            h = self.hourly[self._hour(t)]; h["queue_max"] = max(h["queue_max"], n)
            if n >= int(z.get("alert_len", 4)) and t - self._last_q_alert[z["id"]] > 120:
                self._last_q_alert[z["id"]] = t
                self._event("queue", t, zone=z["id"], length=n, wait_s=n * float(z.get("service_s", 45)),
                            note=f"{n} waiting at {z['name']}: about {round(n * float(z.get('service_s', 45)) / 60, 1)} min. Open another till?")

    # -------------------------------------------------- results
    def queue_now(self, zid: str) -> int:
        return sum(1 for k in self.tracks.values() if k.counted and zid in k.zones)

    def summary(self) -> dict:
        zs = []
        for z in self.zones:
            v = self.visits.get(z["id"], [])
            zs.append({"id": z["id"], "name": z["name"], "kind": z.get("kind", "dwell"), "visits": len(v),
                       "avg_dwell_s": round(sum(v) / len(v), 1) if v else 0, "median_dwell_s": float(np.median(v)) if v else 0,
                       "heat_s": round(float(self._zone_heat(z)), 1), "queue_max": self.queue_max.get(z["id"], 0),
                       "alerts": sum(1 for e in self.events if e.get("zone") == z["id"] and e["kind"] in ("queue", "restricted"))})
        ins = sum(v for k, v in self.counts.items() if k.endswith("_in")); outs = sum(v for k, v in self.counts.items() if k.endswith("_out"))
        hours = [{"hour": h, **{k: round(v, 1) for k, v in d.items()}} for h, d in sorted(self.hourly.items())]
        return {"visitors": self.visitors, "in": ins, "out": outs, "occupancy_now": self.occupancy(), "occupancy_peak": self.occ_peak,
                "zones": zs, "hours": hours, "alerts": [e for e in self.events if e["kind"] in ("queue", "restricted")],
                "heat_total_s": round(float(self.heat_day.sum()), 1)}

    def _zone_heat(self, z) -> float:
        xs = [p[0] for p in z["poly"]]; ys = [p[1] for p in z["poly"]]
        x0, x1 = int(min(xs) / self.cell), int(math.ceil(max(xs) / self.cell)); y0, y1 = int(min(ys) / self.cell), int(math.ceil(max(ys) / self.cell))
        return self.heat_day[y0:y1, x0:x1].sum()

    def heat_png(self, path, which="day", frame=None):
        """write the heat map (seconds, absolute scale: the colour bar is in minutes)."""
        import cv2
        h = self.heat_day if which == "day" else self.heat_live
        top = max(1e-6, float(np.percentile(h[h > 0], 99)) if (h > 0).any() else 1)
        norm = np.clip(h / top, 0, 1)
        img = cv2.applyColorMap((norm * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
        img = cv2.resize(img, (self.W, self.H), interpolation=cv2.INTER_CUBIC)
        if frame is not None:
            a = cv2.resize((norm * .7).astype(np.float32), (self.W, self.H))[..., None]
            img = (frame * (1 - a) + img * a).astype(np.uint8)
        cv2.imwrite(str(path), img)
        return top

    def write(self, out) -> dict:
        out = Path(out); out.mkdir(parents=True, exist_ok=True)
        s = self.summary()
        (out / "summary.json").write_text(json.dumps(s, indent=2))
        with open(out / "events.jsonl", "w") as f:
            for e in self.events: f.write(json.dumps(e) + "\n")
        keys = ["hour", "visitors", "in", "out", "occ_peak", "queue_max", "restricted"]
        with open(out / "hourly.csv", "w") as f:
            f.write(",".join(keys) + "\n")
            for h in s["hours"]: f.write(",".join(str(h.get(k, 0)) for k in keys) + "\n")
        np.save(out / "heat_day_seconds.npy", self.heat_day)
        return s
