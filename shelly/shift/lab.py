"""Shift Pilot · Skill Lab (v2.1): forecasting, reorder and rostering, examined every day against what really happened.

Each skill gets a daily score out of 100 and a level from the shared Skill Lab scale (Expert 97+, Proficient 93+,
Competent 85+, Developing 70+, else Learning):
  shift.forecast  100 minus the absolute forecast error, for the model that runs the roster that day
  shift.reorder   fill rate in a stock simulation of the store's top sellers (order-up-to, 2-day lead time),
                  with the safety-stock setting the lab chose: the leanest one that keeps the fill rate at 95% or better
  shift.roster    how well the roster built from the morning forecast covered the hours the day really needed
                  (an hour short counts double an hour over)
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta

import numpy as np

from . import sensing as S
from .pilot import _js, choose_model, forecast_for, staffing
from ..vision.skilllab import level_of

SKILLS = {"shift.forecast": "Daily forecast", "shift.reorder": "Reorder", "shift.roster": "Rostering"}
TARGET_FILL = 95.0                     # on-shelf availability the store aims for
SAFETY = [0.0, 0.5, 1.0, 1.65, 2.33]   # safety-stock settings (standard deviations of lead-time demand)


def _poisson(r: random.Random, lam: float) -> int:
    if lam > 30: return max(0, int(round(r.gauss(lam, math.sqrt(lam)))))
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= L: return k
        k += 1


def reorder_sim(rows, products, k: float, days: int = 14, lead: int = 2, seed: int = 5) -> dict:
    """order-up-to with a 2-day lead time; daily demand follows the store's real-shaped day (busy days sell more)"""
    mean_day = np.mean([r["sales"] for r in rows[-56:]])
    r = random.Random(seed)
    served = demanded = stock_value = 0.0
    daily = []
    state = []
    for p in products:
        mu = p["units_7d"] / 7
        sd = math.sqrt(mu * lead * 1.8)                       # lumpy demand: more spread than a plain Poisson
        s_ = mu * lead + k * sd; S_ = s_ + mu * 3              # top up to three days above the reorder point
        state.append({"p": p, "mu": mu, "s": s_, "S": S_, "on": s_ + mu, "pipe": []})
    for d in rows[-days:]:
        f = d["sales"] / mean_day; sv = dm = 0
        for st in state:
            st["pipe"] = [(t - 1, q) for t, q in st["pipe"]]
            st["on"] += sum(q for t, q in st["pipe"] if t <= 0); st["pipe"] = [(t, q) for t, q in st["pipe"] if t > 0]
            want = _poisson(r, st["mu"] * f * r.gammavariate(1.25, 0.8)); got = min(want, st["on"]); st["on"] -= got
            sv += got; dm += want
            pos = st["on"] + sum(q for _, q in st["pipe"])
            if pos <= st["s"]: st["pipe"].append((lead, round(st["S"] - pos)))
            stock_value += st["on"] * st["p"]["price"] * 0.6
        served += sv; demanded += dm
        daily.append(round(sv / max(1, dm) * 100, 1))
    return {"k": k, "fill": round(served / max(1, demanded) * 100, 1), "avg_stock_value": round(stock_value / days), "daily": daily}


def run(day: date = date(2026, 9, 25), days: int = 14) -> dict:
    floor, store = _js("docs/data/store-floor.js"), _js("docs/data/shelly-data.js")
    ops, splh = floor["operations"], store["labour"]["sales_per_labour_hour"]
    rows = S.history(day)
    n = len(rows)
    # forecasting and rostering: each exam day uses only what was known that morning
    fc, ro = [], []
    for i in range(n - days, n):
        live = choose_model(rows[:i])["live"] if i % 7 == 0 or not fc else live
        f = forecast_for(rows, i, live); a = rows[i]["sales"]
        fc.append({"d": rows[i]["date"], "model": live, "score": round(max(0, 100 - abs(a - f) / a * 100), 1)})
        dd = date.fromisoformat(rows[i]["date"])
        plan = staffing(dd, f, ops, splh); real = staffing(dd, a, ops, splh)
        need = sum(g["need"] for g in real)
        rostered = {g["hour"]: max(g["need"], 0) for g in plan}           # the roster follows the forecast's needs
        short = sum(max(0, g["need"] - rostered[g["hour"]]) for g in real); over = sum(max(0, rostered[g["hour"]] - g["need"]) for g in real)
        ro.append({"d": rows[i]["date"], "score": round(max(0, 100 - (2 * short + over) / need * 100), 1), "short": short, "over": over})
    # reorder: the lab tries each safety setting on the same 14 days and keeps the leanest that holds the target fill rate
    prods = sorted(store["products"], key=lambda p: -p["units_7d"])[:20]
    trials = [reorder_sim(rows, prods, k, days) for k in SAFETY]
    ok = [t for t in trials if t["fill"] >= TARGET_FILL]
    chosen = min(ok, key=lambda t: t["avg_stock_value"]) if ok else max(trials, key=lambda t: t["fill"])
    out = {"days": [x["d"] for x in fc], "skills": {}}
    for key, series in (("shift.forecast", [x["score"] for x in fc]), ("shift.reorder", chosen["daily"]), ("shift.roster", [x["score"] for x in ro])):
        avg = round(sum(series) / len(series), 1); lv, name = level_of(avg)
        out["skills"][key] = {"name": SKILLS[key], "scores": series, "avg": avg, "level": lv, "level_name": name}
    out["skills"]["shift.forecast"]["models"] = [x["model"] for x in fc]
    out["skills"]["shift.roster"]["short_hours"] = sum(x["short"] for x in ro); out["skills"]["shift.roster"]["over_hours"] = sum(x["over"] for x in ro)
    out["reorder_trials"] = [{k: t[k] for k in ("k", "fill", "avg_stock_value")} for t in trials]
    out["reorder_chosen"] = chosen["k"]
    return out
