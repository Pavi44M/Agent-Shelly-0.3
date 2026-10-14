"""Shift Pilot · daily demand sensing (v2.1).

Re-forecasts each day of the Neighbourhood Store from what moves a convenience store in Eden Terrace:
the day of the week, rain, a warm day, public holidays, school holidays, a big night at Eden Park, and paydays.

Honesty first: the store's real-shaped history is synthetic, so the TRUE effect of every driver is known.
Each model is marked the same way, one day ahead, on the last 14 days it has never seen:
  naive      same weekday last week
  weekday    average of the last 4 same weekdays
  sensing    a log-linear model of the weekday plus every driver, refitted every day on the days before
The Skill Lab only lets a model run the roster when it beats the simpler ones on those 14 days.

    from shelly.shift.sensing import history, exam, forecast_days
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta

import numpy as np

# 2026 public holidays (Auckland) and approximate 2026 school holidays (term breaks) - synthetic demo calendar
HOLIDAYS = {date(2026, 4, 3), date(2026, 4, 6), date(2026, 4, 27), date(2026, 6, 1), date(2026, 7, 10), date(2026, 10, 26), date(2026, 12, 25), date(2026, 12, 28)}
SCHOOL_BREAKS = [(date(2026, 4, 4), date(2026, 4, 19)), (date(2026, 7, 4), date(2026, 7, 19)), (date(2026, 9, 26), date(2026, 10, 11)), (date(2026, 12, 18), date(2027, 2, 1))]
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
# the TRUE effects built into the synthetic store (the model has to find these from data)
TRUTH = {"rain_10mm": -0.05, "warm_per_c": 0.012, "holiday": -0.14, "school_break": -0.05, "event": 0.22, "payday": 0.06}
DOW_SHAPE = [1.00, 1.03, 1.04, 1.07, 1.12, 0.86, 0.74]      # Mon..Sun
BASE = 2700.0
FEATURES = ["rain_10mm", "warm_per_c", "holiday", "school_break", "event", "payday"]
NAMES = {"rain_10mm": "Rain (per 10 mm)", "warm_per_c": "Warm day (per °C over 18)", "holiday": "Public holiday", "school_break": "School holidays",
         "event": "Big night at Eden Park", "payday": "Payday (fortnightly Thursday)"}


def drivers(d: date, seed: int = 26) -> dict:
    """the day's drivers: deterministic per date (a synthetic weather station, event calendar and pay cycle)"""
    r = random.Random(d.toordinal() * 31 + seed)
    season = 17 + 4.5 * math.sin((d.timetuple().tm_yday - 105) / 365 * 2 * math.pi + math.pi)   # Auckland: warm Jan-Feb, cool Jul
    temp = round(season + r.gauss(0, 2.2), 1)
    rain = round(max(0.0, r.gammavariate(0.6, 7.0) - 2.0) if r.random() < 0.42 else 0.0, 1)
    sat = d.weekday() == 5
    event = (sat and (d.toordinal() // 7) % 3 == 0 and 3 <= d.month <= 10) or (d.weekday() == 4 and d.toordinal() % 23 == 0)
    payday = d.weekday() == 3 and (d.toordinal() // 7) % 2 == 0
    school = any(a <= d <= b for a, b in SCHOOL_BREAKS)
    return {"date": d.isoformat(), "dow": d.weekday(), "temp_c": temp, "rain_mm": rain, "holiday": d in HOLIDAYS, "school_break": school,
            "event": bool(event), "payday": bool(payday)}


def x_of(dr: dict) -> np.ndarray:
    return np.array([dr["rain_mm"] / 10, max(0.0, dr["temp_c"] - 18), float(dr["holiday"]), float(dr["school_break"]), float(dr["event"]), float(dr["payday"])])


def truth_sales(dr: dict, noise: float = 0.055, trend: float = 0.0) -> float:
    eff = sum(TRUTH[f] * v for f, v in zip(FEATURES, x_of(dr)))
    r = random.Random(date.fromisoformat(dr["date"]).toordinal() * 7919 + 7)   # fixed per date: the same history every build
    return round(BASE * (1 + trend) * DOW_SHAPE[dr["dow"]] * math.exp(eff) * math.exp(r.gauss(0, noise)), 0)


def history(end: date, days: int = 182) -> list:
    """the store's synthetic daily takings and drivers up to `end` (a gentle upward trend, noise 5.5%)"""
    out = []
    for i in range(days):
        d = end - timedelta(days=days - 1 - i)
        dr = drivers(d)
        out.append(dr | {"sales": truth_sales(dr, trend=0.0004 * i)})
    return out


# ---------------------------------------------------------------- models
def _design(rows) -> np.ndarray:
    X = []
    for r in rows:
        dow = np.zeros(7); dow[r["dow"]] = 1
        X.append(np.concatenate([dow, x_of(r), [len(X) / 100]]))
    return np.array(X)


def fit(rows, ridge: float = 0.3) -> dict:
    """log-linear ridge fit: log(sales) ~ weekday + drivers + trend"""
    X, y = _design(rows), np.log([r["sales"] for r in rows])
    pen = np.diag([0.0] * 7 + [ridge] * (X.shape[1] - 7))
    beta = np.linalg.solve(X.T @ X + pen, X.T @ y)
    resid = y - X @ beta
    return {"beta": beta, "n": len(rows), "sd": float(np.std(resid))}


def predict(model: dict, row: dict, i: int) -> float:
    dow = np.zeros(7); dow[row["dow"]] = 1
    x = np.concatenate([dow, x_of(row), [i / 100]])
    return float(np.exp(x @ model["beta"]))


def naive(rows, i):
    return rows[i - 7]["sales"]


def weekday(rows, i):
    same = [rows[j]["sales"] for j in range(i - 7, max(-1, i - 29), -7)]
    return sum(same) / len(same)


def wape(actual, pred) -> float:
    return sum(abs(a - p) for a, p in zip(actual, pred)) / max(1e-9, sum(actual))


def exam(rows, days: int = 14) -> dict:
    """one-day-ahead, never seen: each exam day is forecast from the days before it only"""
    out = {"days": [], "naive": [], "weekday": [], "sensing": [], "actual": []}
    n = len(rows)
    for i in range(n - days, n):
        m = fit(rows[:i])
        out["days"].append(rows[i]["date"]); out["actual"].append(rows[i]["sales"])
        out["naive"].append(round(naive(rows, i))); out["weekday"].append(round(weekday(rows, i))); out["sensing"].append(round(predict(m, rows[i], i)))
    out["wape"] = {k: round(wape(out["actual"], out[k]) * 100, 1) for k in ("naive", "weekday", "sensing")}
    out["champion"] = min(out["wape"], key=out["wape"].get)
    return out


def effects(rows) -> list:
    """what the model learned about each driver, next to the truth built into the synthetic store"""
    m = fit(rows); b = m["beta"][7:13]
    return [{"driver": f, "name": NAMES[f], "learned_pct": round((math.exp(v) - 1) * 100, 1), "true_pct": round((math.exp(TRUTH[f]) - 1) * 100, 1)} for f, v in zip(FEATURES, b)]


def forecast_days(rows, start: date, n: int = 7) -> list:
    """the next n days, with each day's drivers, the reasons (from what the model learned) and a range from its own error"""
    m = fit(rows); out = []; eff = {e["driver"]: e["learned_pct"] for e in effects(rows)}
    for k in range(n):
        d = start + timedelta(days=k); dr = drivers(d)
        p = predict(m, dr, len(rows) + k)
        out.append(dr | {"forecast": round(p), "low": round(p * math.exp(-1.28 * m["sd"])), "high": round(p * math.exp(1.28 * m["sd"])),
                         "why": why(dr, eff)})
    return out


def why(dr: dict, eff: dict) -> list:
    """the reasons a day is up or down, in words, with the size the model learned"""
    w, x = [], dict(zip(FEATURES, x_of(dr)))
    for f, label in (("event", "Big night at Eden Park"), ("payday", "Payday"), ("holiday", "Public holiday"), ("school_break", "School holidays")):
        if x[f]: w.append(f"{label} ({eff[f]:+.0f}%)")
    if dr["rain_mm"] >= 5: w.append(f"Rain {dr['rain_mm']:.0f} mm ({eff['rain_10mm'] * dr['rain_mm'] / 10:+.0f}%)")
    if dr["temp_c"] > 20: w.append(f"Warm {dr['temp_c']:.0f}°C ({eff['warm_per_c'] * (dr['temp_c'] - 18):+.0f}%)")
    return w or ["A usual " + DOW[dr["dow"]]]
