"""Group HQ (v2.3): the Shelly Tower departments, working end to end on the group's synthetic numbers.

  finance      month-end close checklist (business day due, owner, status), P&L by business with intercompany
               eliminations, variances explained against budget, and a 13-week cash-flow forecast with its low point
  people       headcount and weekly pay cost by business and role (roles only, never names), leave owed, and the
               licences and certificates that keep each site legal (Manager's Certificates, forklift, first aid, GDP)
  procurement  categories several businesses buy separately, the spend, and what buying as one group saves
  board pack   one page for the month: results, risks, decisions needed, compliance
  governance   every agent's action limit (what it may do alone, the dollar cap, what always escalates) and an
               audit log of every action and approval; the limits themselves wait for Pavi's approval

Synthetic data only. Monthly figures are for September 2026 (the group closes in October).
"""
from __future__ import annotations

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEEKS = 4.33
MONTH, CLOSE_START = "September 2026", date(2026, 10, 1)
TODAY = date(2026, 10, 14)


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def _r(seed):
    return random.Random(seed)


def load():
    return {"store": _js("docs/data/shelly-data.js"), "floor": _js("docs/data/store-floor.js"), "totara": _js("docs/supply-chain/data.js"),
            "gateway": _js("docs/data/gateway.js"), "tower": _js("docs/data/tower.js"), "brain": _js("docs/data/brain.js"), "approvals": _js("docs/data/approvals.js")}


# ====================================================================== finance
def pnl(D) -> dict:
    s, t, g, w = D["store"], D["totara"], D["gateway"], D["tower"]
    k = s["kpis"]
    st_rev = k["sales"] * WEEKS; st_gm = k["gm"] * WEEKS
    st_hours = sum(r["hours"] for r in s["roster"]); st_wages = st_hours * s["labour"]["wage_rate"] * WEEKS * 1.08      # + KiwiSaver and ACC
    st_dist = round(st_rev * 0.04)                                                                                     # Gateway delivery charge (intercompany)
    store = {"Revenue": st_rev, "Cost of goods": -(st_rev - st_gm), "Wages": -st_wages, "Rent and outgoings": -5800, "Distribution (Gateway)": -st_dist, "Other running costs": -3200}
    to_rev = t["kpi"]["revenue_30d"]; to_wh = next(c["fee_month"] for c in g["clients"] if c["id"] == "TOT")
    totara = {"Revenue": to_rev, "Cost of goods": -to_rev * 0.68, "Wages": -122000, "Warehousing (Gateway)": -to_wh, "Freight, duty and Medsafe": -to_rev * 0.04, "Other running costs": -38000}
    contracts = sum(c["fee_month"] for c in g["clients"])
    courier = g["kpis"]["sorted_today"] * 12.0 * 30 * 0.65                                  # parcels sorted, about 65% billable to customers outside the group
    freight = g["kpis"]["deliveries"] * WEEKS * 380
    gw_wages = people(D)["by_business"]["gateway"]["pay_week"] * WEEKS * 1.08               # the same headcount and pay as the People tab, + KiwiSaver and ACC
    gateway = {"Revenue": contracts + courier + freight, "Wages": -gw_wages, "Site leases": -360000, "Fleet (lease, fuel, EV charging, repairs)": -g["kpis"]["trucks"] * 9200,
               "Other running costs": -210000}
    tw_rev = w["kpis"]["revenue_year"] / 12
    group = {"Revenue": tw_rev, "Building running costs": -tw_rev * 0.31, "Group staff and Shelly platform": -185000, "Other running costs": -42000}
    rows = {"store": store, "totara": totara, "gateway": gateway, "group": group}
    elim = -(to_wh + st_dist)            # Gateway's revenue from Tōtara and the store is their cost: cancel both sides at group level
    out = {}
    for b, r in rows.items():
        r = {k_: round(v) for k_, v in r.items()}
        ebitda = sum(r.values()); out[b] = {"lines": r, "revenue": r["Revenue"], "ebitda": ebitda, "margin_pct": round(ebitda / r["Revenue"] * 100, 1)}
    rev = sum(v["revenue"] for v in out.values()) + elim
    eb = sum(v["ebitda"] for v in out.values())                 # eliminations cancel out in EBITDA (revenue and cost both go)
    return {"month": MONTH, "by_business": out, "eliminations": round(elim),
            "elim_lines": {"Revenue": round(elim), "Warehousing (Gateway)": round(to_wh), "Distribution (Gateway)": round(st_dist)}, "group_revenue": round(rev), "group_ebitda": round(eb), "group_margin_pct": round(eb / rev * 100, 1),
            "notes": {"gateway_revenue": f"Contracts ${contracts:,.0f} + courier and sortation for other customers ${courier:,.0f} + freight runs ${freight:,.0f}",
                      "eliminations": f"Gateway's warehousing for Tōtara (${to_wh:,}) and deliveries to the store (${st_dist:,}) are inside the group, so they come off both revenue and cost"}}


def variances(D, P) -> list:
    """actual vs budget per business, with the reason in words (budget: store from its plan; others the approved budget)"""
    s = D["store"]; out = []
    st_b = s["kpis"]["budget"] * WEEKS; st_a = P["by_business"]["store"]["revenue"]
    worst = sorted(s["categories"], key=lambda c: c["vs_budget"])[:2]
    out.append({"business": "store", "line": "Revenue", "actual": st_a, "budget": round(st_b), "var": round(st_a - st_b),
                "why": "Behind in " + " and ".join(f"{c['category']} ({c['vs_budget']:+,.0f} a week)" for c in worst) + "; year on year " + f"{s['kpis']['yoy_pct']:+.1f}%."})
    t = D["totara"]["kpi"]
    tb = P["by_business"]["totara"]["revenue"] / (1 + t["revenue_30d_delta"])
    out.append({"business": "totara", "line": "Revenue", "actual": P["by_business"]["totara"]["revenue"], "budget": round(tb), "var": round(P["by_business"]["totara"]["revenue"] - tb),
                "why": f"{t['stockouts']} stock-outs and {t['at_risk_skus']} SKUs at risk cost about ${t['revenue_at_risk']:,.0f}; supplier on-time-in-full {t['otif_90'] * 100:.0f}% over 90 days."})
    g = D["gateway"]["kpis"]; gr = P["by_business"]["gateway"]
    out.append({"business": "gateway", "line": "Wages", "actual": gr["lines"]["Wages"], "budget": round(gr["lines"]["Wages"] * 0.96), "var": round(gr["lines"]["Wages"] * 0.04),
                "why": f"Overtime on day shifts short of pickers (see the labour planner); OTIF held at {g['otif']}%."})
    w = D["tower"]["kpis"]
    out.append({"business": "group", "line": "Revenue", "actual": P["by_business"]["group"]["revenue"], "budget": round(P["by_business"]["group"]["revenue"] / (w["occupancy_pct"] / 85)),
                "var": round(P["by_business"]["group"]["revenue"] - P["by_business"]["group"]["revenue"] / (w["occupancy_pct"] / 85)),
                "why": f"Occupancy {w['occupancy_pct']:.0f}% against an 85% plan: {w['available']} floors ({w['available_m2']:,} m²) still to let."})
    return out


def close_checklist() -> list:
    """September's month-end close, run in October; business days counted from 1 October"""
    T = [("Bank and card reconciliations, all entities", 1, "Finance controller", "fin-head"), ("Payroll journals and leave accruals", 1, "Payroll", "fin-payroll"),
         ("Stock count and valuation: store and Tōtara (FEFO, write-downs)", 2, "Inventory Manager", "totara-stock"), ("Gateway billing as used, invoices out", 2, "Accounts", "gw-accounts"),
         ("Accruals and prepayments", 3, "Finance controller", "fin-head"), ("Intercompany: Gateway charges to Tōtara and the store, eliminated", 3, "Finance controller", "fin-head"),
         ("Fixed assets and depreciation (fleet, racking, tower)", 3, "Finance controller", "fin-head"), ("Revenue recognition and credit notes", 4, "Accounts", "fin-head"),
         ("GST return (two-monthly, Sep–Oct) prepared", 5, "Tax", "fin-head"), ("Management accounts and variance notes", 5, "Finance Manager", "fin-head"),
         ("Board pack signed off", 6, "Pavi (Managing Director)", "mgmt-head")]
    bd, d, days = 0, CLOSE_START, {}
    while bd < 8:
        if d.weekday() < 5: bd += 1; days[bd] = d
        d += timedelta(days=1)
    r = _r(26); out = []
    for i, (task, due, owner, agent) in enumerate(T):
        due_d = days[due]; roll = r.random()
        if agent == "mgmt-head":
            st = "waiting for Pavi"
        elif due_d <= TODAY - timedelta(days=2):
            st = "done" if roll < 0.75 else "done late"
        else:
            st = "in progress" if due_d <= TODAY else "not started"
        out.append({"task": task, "bd": due, "due": due_d.isoformat(), "owner": owner, "agent": agent, "status": st})
    return out


def cashflow(D, P) -> dict:
    """13 weeks from 12 October: receipts and payments by kind; warns when cash would dip under the buffer"""
    s, t, g, w = D["store"], D["totara"], D["gateway"], D["tower"]
    pb = P["by_business"]
    start, cash, buffer = date(2026, 10, 12), 2_400_000, 600_000
    inbound = {}
    for po in t["inbound"]:
        wk = max(0, (date.fromisoformat(po["planned_eta"]) - start).days // 7)
        if wk < 13: inbound[wk] = inbound.get(wk, 0) + po["value"]
    rows = []
    for i in range(13):
        ws = start + timedelta(days=7 * i)
        rec = {"Store takings": pb["store"]["revenue"] / WEEKS, "Tōtara customers (30-day terms)": pb["totara"]["revenue"] / WEEKS * (0.92 if i < 4 else 1.0),
               "Gateway clients (billed monthly, paid on the 20th)": (pb["gateway"]["revenue"] if any((ws + timedelta(days=d)).day == 20 for d in range(7)) else 0),
               "Tower rent (1st of the month)": (pb["group"]["revenue"] if any((ws + timedelta(days=d)).day == 1 for d in range(7)) else 0)}
        pay = {"Wages (fortnightly)": (-(sum(-v["lines"]["Wages"] for b, v in pb.items() if "Wages" in v["lines"]) + 185000) / WEEKS * 2 if i % 2 == 0 else 0),
               "Store suppliers": pb["store"]["lines"]["Cost of goods"] / WEEKS, "Tōtara imports (as shipments land)": -inbound.get(i, 0) - pb["totara"]["revenue"] * 0.12 / WEEKS,
               "Leases, fleet and running costs": -(360000 + g["kpis"]["trucks"] * 9200 + 210000 + 5800 + 3200 + 38000 + 42000 + pb["group"]["revenue"] * 0.31) / WEEKS,
               "GST (two-monthly, 15 December)": (-310000 if any((ws + timedelta(days=d)) == date(2026, 12, 15) for d in range(7)) else 0)}
        inn, out = sum(rec.values()), sum(pay.values())
        cash += inn + out
        rows.append({"week": ws.isoformat(), "in": round(inn), "out": round(out), "close": round(cash), "receipts": {k: round(v) for k, v in rec.items() if v},
                     "payments": {k: round(v) for k, v in pay.items() if v}})
    low = min(rows, key=lambda r: r["close"])
    return {"opening": 2_400_000, "buffer": buffer, "weeks": rows, "low": low, "warn": low["close"] < buffer,
            "advice": (f"Cash dips to ${low['close']:,} in the week of {low['week']}, under the ${buffer:,} buffer: move the Tōtara import payments a week or draw on the overdraft."
                       if low["close"] < buffer else f"Lowest point ${low['close']:,} in the week of {low['week']}: stays above the ${buffer:,} buffer.")}


# ====================================================================== people (roles only)
def people(D) -> dict:
    g, f = D["gateway"], D["floor"]
    rate_g = g["pay"]["base_hour"]
    rows = [{"business": "gateway", "role": r["role"], "count": r["count"], "pay_week": round(r["count"] * 40 * rate_g * (1.35 if "Manager" in r["role"] or "Supervisor" in r["role"] else 1.0))} for r in g["roles"]]
    store_roles = {}
    for m in f["operations"]["team"]: store_roles[m["role"]] = store_roles.get(m["role"], 0) + 1
    rows += [{"business": "store", "role": r, "count": n, "pay_week": round(n * 32 * (27 if r in ("Store Team", "Café", "Cook") else 31) )} for r, n in store_roles.items()]
    tot = [("Supply Planner", 3, 42), ("Sales Representative", 4, 40), ("Customer Service", 3, 30), ("Regulatory & Quality (GDP)", 2, 48), ("Pharmacist (Responsible)", 1, 58), ("Finance & Admin", 2, 36), ("General Manager", 1, 75)]
    rows += [{"business": "totara", "role": r, "count": n, "pay_week": round(n * 40 * p)} for r, n, p in tot]
    grp = [("Shelly platform engineers", 6, 62), ("Finance team", 4, 45), ("People & HR", 2, 42), ("Facilities & security", 9, 31), ("Front of house", 5, 28)]
    rows += [{"business": "group", "role": r, "count": n, "pay_week": round(n * 40 * p)} for r, n, p in grp]
    by_biz = {}
    for r in rows:
        b = by_biz.setdefault(r["business"], {"headcount": 0, "pay_week": 0}); b["headcount"] += r["count"]; b["pay_week"] += r["pay_week"]
    # licences and certificates: who has to hold what, and what expires soon (roles and counts only)
    ppl = [p for ro in g["rosters"].values() for p in ro["people"]]
    fork = [p for p in ppl if p["role"] == "Forklift Operator"]
    shifts_fa = {}
    for site, ro in g["rosters"].items():
        for sh in ("day", "aft", "night"):
            shifts_fa[(site, sh)] = any(p["first_aid"] for p in ro["people"] if p["shift"] == sh)
    r = _r(7)
    certs = [
        {"what": "Manager's Certificate (liquor) · store Duty Managers", "held": 3, "needed": 3, "expiring_60d": 1, "law": "Sale and Supply of Alcohol Act 2012", "action": "One certificate expires in 41 days: renew with the District Licensing Committee now (renewal takes 4–6 weeks)"},
        {"what": "Forklift operator certificate (F endorsement) · Gateway", "held": sum(p["forklift_licence"] for p in fork), "needed": len(fork), "expiring_60d": r.randint(2, 5), "law": "Health and Safety at Work Act 2015 (competent operators)", "action": "Book refresher training before expiry; unlicensed operators stay off the trucks"},
        {"what": "First aider on every shift · Gateway", "held": sum(shifts_fa.values()), "needed": len(shifts_fa), "expiring_60d": r.randint(1, 3), "law": "Health and Safety at Work (General Risk and Workplace Management) Regulations 2016", "action": "Fill any shift without a first aider before the roster is published"},
        {"what": "GDP (good distribution practice) training · Tōtara and the Gateway cold-chain site", "held": 14, "needed": 15, "expiring_60d": 2, "law": "Medsafe GDP guidance", "action": "One new starter still to train; two annual refreshers due"},
        {"what": "Food safety (food control plan) · store café and kitchen", "held": 4, "needed": 4, "expiring_60d": 0, "law": "Food Act 2014", "action": "Up to date"},
    ]
    leave_weeks = 1.6
    liability = round(sum(b["pay_week"] for b in by_biz.values()) * leave_weeks)
    return {"rows": rows, "by_business": by_biz, "headcount": sum(b["headcount"] for b in by_biz.values()), "pay_week": sum(b["pay_week"] for b in by_biz.values()),
            "certs": certs, "leave_liability": liability, "leave_weeks": leave_weeks, "note": "Roles and counts only: no names, no personal details."}


# ====================================================================== procurement
CATS = [("Packaging and pallet wrap", {"store": ("Bag & Box NZ", 1400), "totara": ("MedPak Cartons", 9200), "gateway": ("WrapRight", 31000)}, 0.09),
        ("Cleaning and hygiene", {"store": ("CleanCo Retail", 900), "totara": ("Hospital Hygiene Ltd", 2100), "gateway": ("Industrial Clean", 6800), "group": ("TowerCare FM", 14500)}, 0.11),
        ("Gloves and PPE", {"store": ("SafetyFirst", 300), "gateway": ("WorkGear NZ", 7400), "group": ("WorkGear NZ", 900)}, 0.0),
        ("Electricity", {"store": ("PowerCo Retail", 3100), "totara": ("PowerCo Business", 2600), "gateway": ("GridOne Commercial", 64000), "group": ("GridOne Commercial", 41000)}, 0.07),
        ("Uniforms and hi-vis", {"store": ("Uniform Hub", 350), "gateway": ("HiVis Direct", 4200), "group": ("Uniform Hub", 600)}, 0.12),
        ("Software and devices", {"store": ("POS Cloud", 650), "totara": ("ERP Online", 5800), "gateway": ("WMS Systems", 18500), "group": ("Office Suite", 9200)}, 0.08),
        ("Security services", {"store": ("SecureWatch", 1200), "gateway": ("GuardForce", 22000), "group": ("TowerGuard", 26000)}, 0.06)]


def procurement() -> list:
    out = []
    for name, by, save in CATS:
        spend = sum(v[1] for v in by.values()); n_sup = len({v[0] for v in by.values()})
        if name == "Gloves and PPE":
            act = "Buy gloves from Tōtara Medical at cost + 5% (Tōtara already imports nitrile gloves): about 18% cheaper and the margin stays in the group"
            saving = round(spend * 0.18)
        else:
            act = f"One group tender across {len(by)} businesses ({n_sup} suppliers today): volume pricing and one contract to manage"
            saving = round(spend * save)
        out.append({"category": name, "monthly_spend": spend, "suppliers": n_sup, "businesses": sorted(by), "by": {b: {"supplier": v[0], "spend": v[1]} for b, v in by.items()},
                    "saving_month": saving, "action": act})
    return sorted(out, key=lambda x: -x["saving_month"])


# ====================================================================== governance
SAFE_AREAS = ("Brief", "Client update", "Delivery booking", "Category review", "Recall", "Service recovery", "Expiry rescue")


def limits(D) -> list:
    dep = {d["id"]: d for d in D["brain"]["departments"]}
    pol = D["brain"]["policy"]
    out = []
    for a in D["brain"]["agents"]:
        cap = min(500, dep[a["department"]]["limit"]) if a["autonomy"] == "auto" else 0
        out.append({"agent": a["id"], "name": a["name"], "business": a["business"], "department": a["department"], "autonomy": a["autonomy"], "cap_nzd": cap,
                    "alone": ("routine work and spend up to $" + f"{cap:,}" if cap else "routine work, no spend") if a["autonomy"] == "auto" else
                             ("prepares and recommends; a person decides" if a["autonomy"] == "suggest" else "every action needs a sign-off"),
                    "always_escalates": pol["always_mgmt"] + pol["always_finance"]})
    return out


def audit_log(D) -> list:
    from ..os.model import build
    from ..os.bus import run_day
    bus = run_day(build())
    ev = {e["id"]: e for e in bus.events()}
    log = [{"when": ev[a["event_id"]]["ts"], "agent": a["agent"], "business": a["business"], "what": a["action"], "status": "done by the agent" if a["status"] == "done" else "waiting: " + a["needs"], "source": "event bus"}
           for a in bus.actions()]
    for it in D["approvals"]["items"]:
        chain = " → ".join(c["role"] for c in it.get("chain", [])) or "department head"
        log.append({"when": D["approvals"].get("store_asof", ""), "agent": it["agent"], "business": it["business"], "what": it["title"], "status": "waiting: " + chain, "source": "approvals queue"})
    return log


# ====================================================================== board pack
def board_pack(D, P, CF, PE, PR) -> dict:
    flags = [f for f in D["gateway"]["flags"] if f["sev"] == "high"] + [f for f in D["tower"]["flags"]]
    risks = [{"area": f["area"], "text": f["text"].split(". ")[0] + "."} for f in flags][:4]
    if CF["warn"]: risks.insert(0, {"area": "Cash", "text": CF["advice"]})
    exp = [c for c in PE["certs"] if c["expiring_60d"]]
    decisions = [{"what": o["name"], "ask": o["ask"], "why": o["why"], "payback_months": o["payback_months"]} for o in D["brain"]["opportunities"]]
    decisions.insert(0, {"what": "Approve the action limits for every agent (v2.3 governance)", "ask": 0, "why": "Agents act alone only inside these limits; anything else comes to a person.", "payback_months": 0})
    return {"month": MONTH, "headline": f"Group revenue ${P['group_revenue']:,} and EBITDA ${P['group_ebitda']:,} ({P['group_margin_pct']}%) for {MONTH}. "
                                         f"Lowest cash in the next 13 weeks: ${CF['low']['close']:,}. Procurement could save ${sum(p['saving_month'] for p in PR):,} a month.",
            "risks": risks, "decisions": decisions, "compliance": [{"what": c["what"], "action": c["action"]} for c in exp]}


def run() -> dict:
    D = load()
    P = pnl(D); CF = cashflow(D, P); PE = people(D); PR = procurement()
    return {"asof": TODAY.isoformat(), "pnl": P, "variances": variances(D, P), "close": close_checklist(), "cash": CF, "people": PE, "procurement": PR,
            "limits": limits(D), "audit": audit_log(D), "board": board_pack(D, P, CF, PE, PR)}
