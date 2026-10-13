"""Cases: events about stock and places lined up into patterns. Shelly never labels a person.

Store pattern (unpaid exit), per anonymous visit:
    pick      a reach at a high-risk shelf (spirits, razors, formula, vapes)
    conceal   the concealment gesture (pose.py), same hand, a few seconds later
    unpaid    the visit leaves through the door without a till transaction that includes that shelf's category
pick + conceal          -> ASSIST: a floor staff member offers help (customer service, nothing is saved)
pick + conceal + unpaid -> REVIEW: a 20 s clip (faces pixelated) and a case for the Duty Manager
Any single step on its own (a phone into a pocket, arms crossed, a browser leaving) -> nothing at all.

System and place rules (self-checkout mismatch, till exceptions, after-hours presence, unbooked dock doors,
trucks without a manifest, cage access, count variances, tailgates, tagged assets leaving) open a case directly,
because the event itself, not a person, is what is unusual.
"""
from __future__ import annotations

from datetime import datetime, timedelta

LEVELS = {"assist": 1, "review": 2}


class CaseEngine:
    def __init__(self, cfg: dict, site: str, start: datetime | None = None):
        from .policy import allowed_site, validate
        validate(cfg)
        self.cfg, self.site_id = cfg, site
        self.site = cfg["sites"][site]
        if not allowed_site(cfg, self.site["business"]): raise PermissionError(f"{site}: outside Shelly's locked scope")
        self.pv = cfg["privacy"]
        self.start = start or datetime(2026, 10, 13, 0, 0)
        self.cases, self.assists, self.n = [], [], 0

    def clock(self, t):
        return (self.start + timedelta(seconds=t)).strftime("%H:%M:%S")

    def _new(self, rule, level, steps, value, camera=None, where="", conf=None, truth=None, note=""):
        self.n += 1
        r = self.site["rules"][rule]
        t0, t1 = steps[0]["t"], steps[-1]["t"]
        c = {"id": f"{self.site_id[:2].upper()}-{self.start:%m%d}-{self.n:03d}", "site": self.site_id, "rule": rule, "level": level,
             "what": r.get("what") or RULE_TEXT.get(rule, rule), "where": where, "at": self.clock(t0), "t": round(t0, 1),
             "steps": [{**s, "at": self.clock(s["t"]), "t": round(s["t"], 1)} for s in steps],
             "confidence": conf, "value": round(value, 2), "owner": r.get("owner", self.cfg["human_in_the_loop"]["review_by"]),
             "camera": camera, "status": "waiting for review" if level == "review" else "staff prompted", "note": note,
             "retention_until": (self.start + timedelta(days=self.pv["retention_days"])).strftime("%Y-%m-%d")}
        if camera:   # one short clip per moment (steps more than 30 s apart get their own clip), never the whole visit
            segs, cur = [], [steps[0]]
            for s_ in steps[1:]:
                if s_["t"] - cur[-1]["t"] > 30: segs.append(cur); cur = [s_]
                else: cur.append(s_)
            segs.append(cur)
            clips = [{"from": self.clock(max(0, g[0]["t"] - self.pv["clip_pre_s"])), "to": self.clock(g[-1]["t"] + self.pv["clip_post_s"]),
                      "seconds": round(g[-1]["t"] - g[0]["t"] + self.pv["clip_pre_s"] + self.pv["clip_post_s"]), "faces": "pixelated"} for g in segs]
            c["clips"] = clips
            c["clip"] = {"from": clips[0]["from"], "to": clips[-1]["to"], "seconds": sum(x["seconds"] for x in clips), "count": len(clips), "faces": "pixelated"}
        c["_truth"] = truth
        (self.cases if level == "review" else self.assists).append(c)
        return c

    # ---------------------------------------------------------------- the store pattern
    def visit(self, vid, events, truth=None):
        """events for ONE anonymous visit, in time order: {kind: pick|conceal|till|exit, t, zone?, conf?, cats?}.
        Returns 'review', 'assist' or None. The visit id is random and forgotten afterwards."""
        r = self.site["rules"]["unpaid_exit"]
        pick = conceal = None; prompted = False; paid_cats = set(); level = None
        for e in sorted(events, key=lambda e: e["t"]):
            k = e["kind"]
            if k == "pick": pick = e; conceal = None if conceal and conceal["t"] < e["t"] else conceal
            elif k == "conceal" and pick and e["t"] - pick["t"] <= r["window_s"]:
                conceal = e
                if not prompted and (e.get("conf") or 0) >= r.get("assist_conf", 0):
                    self._new("unpaid_exit", "assist", [pick, conceal], 0, where=pick.get("zone", ""), conf=conceal.get("conf"), truth=truth,
                              note="Offer help in the aisle. Nothing is saved."); prompted = True; level = "assist"
            elif k == "till":
                paid_cats |= set(e.get("cats", [])) if e.get("linked", True) else {"*"}
            elif k == "exit" and pick and conceal:
                cat = pick.get("zone")
                if cat not in paid_cats and "*" not in paid_cats and (conceal.get("conf") or 0) >= r.get("review_conf", 0):
                    val = self.site.get("high_risk", {}).get(cat, 30)
                    conf = round(min(.97, .45 + .5 * (conceal.get("conf") or .6)), 2)
                    self._new("unpaid_exit", "review", [pick, conceal, {"kind": "unpaid exit", "t": e["t"], "zone": "front door"}], val,
                              camera="cam-aisle3 + cam-door", where=f"{cat} shelf → front door", conf=conf, truth=truth)
                    level = "review"
                break
        return level

    # ---------------------------------------------------------------- system and place rules
    def event(self, rule, t, value=0.0, where="", info="", truth=None, camera=None):
        return self._new(rule, "review", [{"kind": rule.replace("_", " "), "t": t, "zone": where}], value, camera=camera, where=where,
                         truth=truth, note=info)

    def public(self):
        """cases without the simulator's truth (what the page and the evidence pack see)."""
        strip = lambda c: {k: v for k, v in c.items() if not k.startswith("_")}
        return [strip(c) for c in self.cases], [strip(c) for c in self.assists]


RULE_TEXT = {"unpaid_exit": "Picked from a high-risk shelf, concealed, left without paying for it",
             "sco_mismatch": "Items not scanned at self-checkout (three or more in one transaction)",
             "after_hours": "Movement on the shop floor after closing",
             "cage_after_hours": "Cage opened outside rostered hours",
             "after_hours_floor": "Restricted floor entered after hours with no booking"}


def score(engine: CaseEngine, truth: dict, days: float = 1.0) -> dict:
    """mark the engine against what really happened (simulator truth), per rule and in total.
    For the camera pattern the false alarms per camera per day are what the alert budget is about;
    for system rules a 'false' case is an everyday explanation (a late booking, a genuine refund)."""
    rules = {}
    for c in engine.cases + engine.assists:
        r = rules.setdefault(c["rule"], {"rule": c["rule"], "what": c["what"], "reviews": 0, "true": 0, "false": 0, "assists": 0, "innocent_assists": 0,
                                         "value": 0.0, "explained": {}})
        real = c["_truth"] == "loss"
        if c["level"] == "review":
            r["reviews"] += 1; r["true" if real else "false"] += 1
            if real: r["value"] = round(r["value"] + c["value"], 2)
            else: r["explained"][c["_truth"]] = r["explained"].get(c["_truth"], 0) + 1
        else:
            r["assists"] += 1; r["innocent_assists"] += 0 if real else 1
    for r in rules.values():
        r["precision"] = round(r["true"] / r["reviews"], 3) if r["reviews"] else None
    real = truth.get("losses", 0); by = truth.get("losses_by", {})
    for k, n in by.items():
        if k in rules: rules[k]["losses"] = n; rules[k]["recall"] = round(rules[k]["true"] / n, 3) if n else None
    tp = sum(r["true"] for r in rules.values()); rev = sum(r["reviews"] for r in rules.values())
    pat = rules.get("unpaid_exit", {})
    cams = sum(1 for c in engine.site.get("cameras", []) if c.get("pose")) or 1
    return {"reviews": rev, "true": tp, "false": rev - tp, "losses": real, "recall": round(tp / real, 3) if real else None,
            "precision": round(tp / rev, 3) if rev else None,
            "false_per_camera_day": round(pat.get("false", 0) / cams / days, 2),
            "assists": len(engine.assists), "innocent_assists": sum(r["innocent_assists"] for r in rules.values()),
            "value_flagged": round(sum(r["value"] for r in rules.values()), 2), "rules": rules}
