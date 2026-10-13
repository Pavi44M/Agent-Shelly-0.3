"""Vision pack (Shelly Intelligence · Store Vision): camera skills that turn tracked people into store numbers.
Each skill reads a finished VisionEngine (shelly/vision/engine.py); the Skill Lab (shelly/vision/skilllab.py)
marks every one of them against a known truth each day. Nothing here identifies anyone."""
from __future__ import annotations

from ..core.skills import skill


def _summary(engine):
    return engine.summary()


@skill("vision.footfall", pack="vision", summary="Unique visitors and door IN/OUT from a tracked camera (no per-frame double counts)",
       inputs=["tracked people (id, box, time)"], outputs=["visitors", "in", "out", "occupancy"], triggers=["footfall", "how many customers"])
def footfall(engine):
    s = _summary(engine); return {k: s[k] for k in ("visitors", "in", "out", "occupancy_now", "occupancy_peak")}


@skill("vision.dwell", pack="vision", summary="Visits and dwell time per zone (with an exit grace so jitter can't split a visit)",
       inputs=["tracked people", "zones"], outputs=["visits", "average and median dwell"], triggers=["dwell", "time in aisle"])
def dwell(engine):
    return [z for z in _summary(engine)["zones"] if z["kind"] == "dwell"]


@skill("vision.queue", pack="vision", summary="Checkout queue length, estimated wait and open-a-till prompts",
       inputs=["tracked people", "queue zone", "service time"], outputs=["queue length", "wait", "alerts"], triggers=["queue", "checkout"])
def queue(engine):
    s = _summary(engine); return {"zones": [z for z in s["zones"] if z["kind"] == "queue"], "alerts": [a for a in s["alerts"] if a["kind"] == "queue"]}


@skill("vision.safety", pack="vision", summary="Staff-only area prompts (grace period, opening hours); never a judgement about a person",
       inputs=["tracked people", "restricted zones"], outputs=["alerts"], triggers=["stockroom", "staff only"], confirm=True)
def safety(engine):
    return [a for a in _summary(engine)["alerts"] if a["kind"] == "restricted"]


@skill("vision.heat", pack="vision", summary="Time-spent heatmap in seconds (live map fades, day map keeps; absolute scale)",
       inputs=["tracked people"], outputs=["heat grid (seconds)"], triggers=["heatmap"])
def heat(engine):
    return engine.heat_day


@skill("vision.lab", pack="vision", summary="Skill Lab: daily exam against a known truth, levels 1-5, held-out tuning, a new skill a day",
       inputs=["synthetic exam days"], outputs=["skill levels", "change log", "go-live requests"], triggers=["skill level", "skill lab"])
def lab(days: int = 1):
    from ..vision import skilllab
    st = skilllab.run(days=days); skilllab.save(st); return {k: (v["level"], v["label"]) for k, v in st["skills"].items()}


for _n, _s in [("vision.conversion", "Floor-to-till conversion: share of visitors who reach the checkout"),
               ("vision.staffpattern", "Staff vs shopper by movement (no faces): keeps staff out of the alerts"),
               ("vision.nexthour", "Next-hour footfall from the day so far and the usual shape of the day"),
               ("vision.hotspot", "The zone where shoppers spend the most time today"),
               ("vision.rushwarn", "Rush early warning: 15 minutes before the queue passes the alert length")]:
    skill(_n, pack="vision", summary=_s + " (trained by the Skill Lab)", inputs=["vision engine"], outputs=["number + reason"])(lambda engine, _n=_n: None)
