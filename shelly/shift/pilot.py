"""Shift Pilot (v2.1): the Neighbourhood Store's day, the way a Duty Manager runs it.

  opening brief   the day's forecast and why, staff on vs staff needed by hour, deliveries, recalls,
                  orders waiting for sign-off (from the Shelly OS event bus) and the top three things to do
  live to-do      every task of the day with its time, the role that owns it and where it came from
                  (routine, compliance, forecast, event bus), ticked off through the day
  closing report  takings against the forecast, waste, cash, tasks done / late / open, and handover
                  notes for the next Duty Manager
  Skill Lab       forecasting, reorder and rostering, each examined every day against what really happened

Synthetic store, invented team names (roles are what matter); nothing here is real employer data.

    from shelly.shift.pilot import build
    day = build(date(2026, 9, 25))
"""
from __future__ import annotations

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

from . import sensing as S

ROOT = Path(__file__).resolve().parents[2]


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def _hm(h: float) -> str:
    return f"{int(h):02d}:{int(round((h % 1) * 60)):02d}"


def _h(s: str) -> float:
    a, b = s.split(":"); return int(a) + int(b) / 60


# ---------------------------------------------------------------- people and hours
def team_on(day: date, ops: dict) -> list:
    dn = S.DOW[day.weekday()]
    shifts = {s["id"]: s for s in ops["shifts"]}
    out = []
    for m in ops["team"]:
        if m.get("days") and dn not in m["days"]: continue
        s = shifts[m["shift"]] if "shift" in m else {"name": "Day", "start": m["start"], "hours": m["hours"]}
        st = _h(s["start"])
        out.append({"name": m["name"], "role": m["role"], "shift": s["name"], "from": st, "to": st + s["hours"], "station": m.get("station", "")})
    return out


def hourly(total: float, ops: dict) -> dict:
    fp = {int(k): v for k, v in ops["footfall"].items()}
    tot = sum(fp.values())
    return {h: total * v / tot for h, v in fp.items()}


def staffing(day: date, sales: float, ops: dict, splh: float) -> list:
    """staff needed (from sales per labour hour, never below a Duty Manager + one) vs staff rostered, by hour"""
    team = [t for t in team_on(day, ops) if t["role"] not in ("Cook",)]      # the kitchen is planned separately
    out = []
    for h, v in hourly(sales, ops).items():
        need = max(2, math.ceil(v / splh * 1.0 + 0.35))
        on = sum(1 for t in team if t["from"] <= h + 0.5 < t["to"])
        out.append({"hour": h, "sales": round(v), "need": need, "on": on, "gap": on - need})
    return out


# ---------------------------------------------------------------- the model that runs the roster
def choose_model(rows) -> dict:
    """the incumbent (weekday average) keeps the roster until a challenger beats it on BOTH the 14-day exam and the 8-week check"""
    e14, e56 = S.exam(rows, 14), S.exam(rows, 56)
    live = "weekday"
    for m in ("sensing", "naive"):
        if e14["wape"][m] < e14["wape"]["weekday"] and e56["wape"][m] < e56["wape"]["weekday"]:
            live = m if live == "weekday" or e14["wape"][m] < e14["wape"][live] else live
    why = {"weekday": "the weekday average stays in charge: no challenger beat it on both the last 14 days and the last 8 weeks",
           "sensing": "demand sensing runs the roster: it beat the weekday average on both the last 14 days and the last 8 weeks",
           "naive": "same-day-last-week runs the roster: it beat the weekday average on both checks"}[live]
    return {"live": live, "why": why, "exam14": e14, "exam56": {k: e56[k] for k in ("wape", "champion")}}


def forecast_for(rows, i, model: str) -> float:
    if model == "naive": return S.naive(rows, i)
    if model == "weekday": return S.weekday(rows, i)
    return S.predict(S.fit(rows[:i]), rows[i], i)


# ---------------------------------------------------------------- tasks
def tasks_for(day: date, ops: dict, brief: dict, os_actions: list) -> list:
    dn = S.DOW[day.weekday()]
    T = []
    def t(at, role, title, source, why=""):
        T.append({"at": at, "role": role, "title": title, "source": source, "why": why})
    t("06:00", "Duty Manager", "Open up: alarm off, walk the floor, float counted into the tills", "Routine")
    t("06:10", "Duty Manager", "Fridge and freezer temperatures logged (chillers 0–4°C, freezers −18°C or colder)", "Compliance", "Food Act 2014: food control plan records")
    if dn in ops["deliveries"]["days"]:
        t(ops["deliveries"]["arrive"], "Store Team", f"Delivery check-in: {ops['deliveries']['pallets']} pallets from the {ops['deliveries']['from'].lower()}, chilled first", "Routine")
    t("06:45", "Duty Manager", "Team briefing: today's forecast, the reasons, breaks and who's on which till", "Forecast", "; ".join(brief["why"]))
    t("06:50", "Duty Manager", "Liquor: Manager's Certificate holder named for every hour alcohol is sold; ID check reminder", "Compliance", "Sale and Supply of Alcohol Act 2012")
    t("07:00", "Store Team", "Doors open, café open, self-checkouts on", "Routine")
    for a in os_actions:
        if a["agent"] == "store-compliance":
            t("07:15", "Duty Manager", a["action"], "Event bus", "Recall: pull before trading")
    po = [a for a in os_actions if a["agent"] == "store-ordering"]
    if po:
        t("09:30", "Duty Manager", f"Sign off {len(po)} purchase orders below lead-time cover (${sum(a['amount'] for a in po):,.0f})", "Event bus", "Waiting in the approvals queue since the stock check")
    t("10:00", "Store Team", "Fridge temperatures logged", "Compliance")
    t("11:15", "Café", "Lunch prep: hot food cabinet full by 11:45", "Forecast", f"Lunch hour forecast ${brief['peak_lunch']:,.0f}")
    t("13:30", "Duty Manager", "Shift handover: morning to evening Duty Manager (open tasks, cash, issues)", "Routine")
    t("14:00", "Store Team", "Fridge temperatures logged", "Compliance")
    cat = [a for a in os_actions if a["agent"] == "store-category"][:1]
    if cat:
        t("15:00", "Duty Manager", cat[0]["action"], "Event bus", "For the Store Manager's weekly review")
    gaps = [g for g in brief["staffing"] if g["gap"] < 0]
    if gaps:
        h0, h1 = gaps[0]["hour"], gaps[-1]["hour"] + 1
        t(_hm(h0 - 0.25), "Duty Manager", f"Short {-min(g['gap'] for g in gaps)} on the floor {h0}:00–{h1}:00: call in cover or move café staff to a till", "Forecast", "Staff needed from forecast sales per labour hour")
    over = [g for g in brief["staffing"] if g["gap"] >= 2 and g["hour"] < 13]
    if len(over) >= 3:
        t(_hm(over[0]["hour"]), "Duty Manager", f"Quiet {over[0]['hour']}:00–{over[-1]['hour'] + 1}:00 with {max(g['gap'] for g in over)} more on than the forecast needs: shelf filling, facing up and the weekly stock count", "Forecast", "Hours are already paid: use them where they cut waste and stock-outs")
    t("17:00", "Store Team", "Evening rush: second till open, trolleys and baskets back at the door", "Forecast")
    t("19:00", "Store Team", "Markdown short-dated chilled and food-to-go (reduced labels)", "Routine", "Keeps waste under 3% of sales")
    t("20:00", "Store Team", "Fridge temperatures logged", "Compliance")
    t("21:00", "Duty Manager", "Close: tills cashed up and reconciled, safe drop, fridges checked, alarm set", "Routine")
    T.sort(key=lambda x: _h(x["at"]))
    # how the day went (seeded per date): most on time, a few late, one or two left for the handover
    r = random.Random(day.toordinal() * 13 + 1)
    for i, x in enumerate(T):
        due = _h(x["at"]); roll = r.random()
        if x["source"] == "Event bus" and "Sign off" in x["title"] and roll < 0.5 or (roll > 0.93 and due > 12):
            x.update(status="open", done_at=None)
        elif roll > 0.8:
            x.update(status="late", done_at=_hm(due + r.uniform(0.35, 1.1)))
        else:
            x.update(status="done", done_at=_hm(due + r.uniform(0, 0.25)))
        x["id"] = f"T{i + 1:02d}"
    return T


# ---------------------------------------------------------------- the day
def build(day: date = date(2026, 9, 25)) -> dict:
    floor, store = _js("docs/data/store-floor.js"), _js("docs/data/shelly-data.js")
    ops, splh = floor["operations"], store["labour"]["sales_per_labour_hour"]
    rows = S.history(day)                               # up to and including the shift day (its truth is the "actual")
    past = rows[:-1]; i = len(rows) - 1
    choice = choose_model(past)
    live = choice["live"]
    f_live = round(forecast_for(rows, i, live)); f_sens = round(forecast_for(rows, i, "sensing"))
    sd = S.fit(past)["sd"]
    dr = rows[-1]; eff = {e["driver"]: e["learned_pct"] for e in S.effects(past)}
    why = S.why(dr, eff)
    actual = rows[-1]["sales"]
    staff = staffing(day, f_live, ops, splh)
    lunch = sum(v for h, v in hourly(f_live, ops).items() if 11 <= h <= 13)
    # Shelly OS: what the event bus raised for the store
    from ..os.model import build as build_model
    from ..os.bus import run_day
    acts = [a for a in run_day(build_model()).actions() if a["business"] == "store"]
    brief = {"date": day.isoformat(), "dow": S.DOW[day.weekday()], "weather": {"temp_c": dr["temp_c"], "rain_mm": dr["rain_mm"]},
             "forecast": f_live, "forecast_sensing": f_sens, "model": live, "low": round(f_live * math.exp(-1.28 * sd)), "high": round(f_live * math.exp(1.28 * sd)),
             "last_week": rows[i - 7]["sales"], "why": why, "staffing": staff, "peak_lunch": round(lunch),
             "team": team_on(day, ops), "delivery": S.DOW[day.weekday()] in ops["deliveries"]["days"],
             "recalls": store.get("recalls", []), "orders_waiting": sum(a["status"] == "waiting" for a in acts if a["agent"] == "store-ordering"),
             "orders_value": round(sum(a["amount"] for a in acts if a["agent"] == "store-ordering" and a["status"] == "waiting"))}
    tasks = tasks_for(day, ops, brief, acts)
    brief["top3"] = [x["title"] for x in sorted(tasks, key=lambda x: ({"Event bus": 0, "Compliance": 2, "Forecast": 1}.get(x["source"], 3), _h(x["at"])))[:3]]
    # closing
    waste = round(store["kpis"]["waste"] / 7 * (actual / store["kpis"]["sales"] * 7), 0)
    cash_var = round(random.Random(day.toordinal()).uniform(-6, 4), 2)
    done = [x for x in tasks if x["status"] == "done"]; late = [x for x in tasks if x["status"] == "late"]; open_ = [x for x in tasks if x["status"] == "open"]
    nxt = S.forecast_days(rows, day + timedelta(days=1), 1)[0]
    staff_next = staffing(day + timedelta(days=1), nxt["forecast"], ops, splh)
    hand = [f"Takings ${actual:,.0f}: {(actual - f_live) / f_live * 100:+.1f}% against the forecast of ${f_live:,.0f}."]
    hand += [f"Still open: {x['title']} (due {x['at']})." for x in open_ if not x["title"].startswith("Sign off")]
    hand.append(f"Tomorrow ({S.DOW[(day + timedelta(days=1)).weekday()]}): forecast ${nxt['forecast']:,.0f} · {', '.join(nxt['why'])}.")
    if S.DOW[(day + timedelta(days=1)).weekday()] in ops["deliveries"]["days"]:
        hand.append(f"Delivery tomorrow at {ops['deliveries']['arrive']}: {ops['deliveries']['pallets']} pallets, chilled first.")
    g2 = [g for g in staff_next if g["gap"] < 0]
    if g2: hand.append(f"Tomorrow is short {-min(g['gap'] for g in g2)} between {g2[0]['hour']}:00 and {g2[-1]['hour'] + 1}:00: check cover before you leave.")
    so = next((x for x in tasks if x["title"].startswith("Sign off")), None)
    if so and so["status"] == "open": hand.append(f"{brief['orders_waiting']} purchase orders (${brief['orders_value']:,}) still wait for sign-off: do it first thing.")
    elif so: hand.append(f"{brief['orders_waiting']} purchase orders (${brief['orders_value']:,}) signed off at {so['done_at']}; check the confirmations from suppliers.")
    closing = {"actual": actual, "forecast": f_live, "error_pct": round((actual - f_live) / f_live * 100, 1), "sensing_error_pct": round((actual - f_sens) / f_sens * 100, 1),
               "waste": waste, "waste_pct": round(waste / actual * 100, 1), "cash_variance": cash_var,
               "tasks": {"done": len(done), "late": len(late), "open": len(open_), "total": len(tasks)}, "handover": hand,
               "hourly_actual": {h: round(v) for h, v in hourly(actual, ops).items()}}
    return {"day": day.isoformat(), "brief": brief, "tasks": tasks, "closing": closing, "model": choice,
            "history": [{"d": r["date"], "v": r["sales"]} for r in rows[-56:]],
            "effects": S.effects(past), "next7": S.forecast_days(rows, day + timedelta(days=1), 7), "trading": ops["trading_hours"]}
