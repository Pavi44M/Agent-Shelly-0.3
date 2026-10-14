"""Shelly's mind · ask anything (v2.4): plain questions over all four businesses, answered with today's numbers.

Every answer is computed here from the same data the pages show (no AI writes a number), with the words people use
for it and a link to where the full picture lives. The page matches a typed or spoken question to the closest answer
(forgiving typos and other words for the same thing), and says so plainly when it doesn't know.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def m(v):
    return ("−$" if v < 0 else "$") + f"{abs(round(v)):,}"


def build(shift, ops, group, osd, huddles) -> list:
    S = _js("docs/data/shelly-data.js"); V = _js("docs/data/vision.js"); LP = _js("docs/data/lp.js"); AP = _js("docs/data/approvals.js")
    T = _js("docs/supply-chain/data.js"); G = _js("docs/data/gateway.js"); W = _js("docs/data/tower.js")
    k = S["kpis"]; cats = sorted(S["categories"], key=lambda c: c["vs_budget"]); best = max(S["categories"], key=lambda c: c["wow_pct"])
    b, c = shift["brief"], shift["closing"]; P = group["pnl"]; CF = group["cash"]; PE = group["people"]
    order_now = [r for r in S["reorder"] if r["status"].startswith("Order now")]
    tot_short = [i for i in T["inventory"] if i["status"] in ("Stock-out", "Gap before ETA", "Reorder now")]
    worst = ops["totara"]["scorecards"][0]; clashes = [x for d in ops["gateway"]["docks"] for x in d["clashes"]]
    short_shifts = [(l["site"], s["shift"], s["advice"]) for l in ops["gateway"]["labour"] for s in l["shifts"] if any(v < 0 for v in s["gaps"].values())]
    certs = [x for x in PE["certs"] if x["expiring_60d"]]
    lp_cases = sum(s["week"]["cases"] for s in LP["sites"].values())
    ch = S["channels"][-7:]; ue = sum(x.get("uber_eats", 0) for x in ch); od = sum(x.get("on_demand", 0) for x in ch)
    by = lambda bz: sum(1 for i in AP["items"] if i["business"] == bz)
    fri = shift["day"]
    I = [
        # ---------------- store
        ("store-sales", "How did the store trade this week?", "sales week trading takings revenue how did we do store", f"The store took {m(k['sales'])} in the week to {S['meta']['asof']}: {k['wow_pct']:+.1f}% on last week, {k['yoy_pct']:+.1f}% on last year and {k['vs_budget_pct']:+.1f}% against budget.", "../#s-kpi"),
        ("store-budget", "Are we on budget?", "budget behind ahead target plan", f"{k['vs_budget_pct']:+.1f}% against budget this week ({m(k['sales'])} vs {m(k['budget'])}). Furthest behind: {cats[0]['category']} ({m(cats[0]['vs_budget'])}) and {cats[1]['category']} ({m(cats[1]['vs_budget'])}).", "../#s-cat"),
        ("store-margin", "What's our margin?", "margin gross profit gm percent", f"Gross margin {k['gm_pct']}% ({m(k['gm'])}) this week; target {S['targets']['gross_margin_pct']}%.", "../#s-kpi"),
        ("store-waste", "How much are we wasting?", "waste markdown shrink thrown out spoil", f"Waste and markdowns {m(k['waste'])}, {k['waste_pct']}% of sales (target under {S['targets']['waste_pct_of_sales']}%).", "../#s-ops"),
        ("store-friday", "Why was Friday down?", "why friday down up yesterday miss forecast lower than", f"{fri}: takings {m(c['actual'])}, {c['error_pct']:+.1f}% against the forecast of {m(c['forecast'])}. It was {b['weather']['temp_c']}°C and {'dry' if not b['weather']['rain_mm'] else str(b['weather']['rain_mm']) + ' mm of rain'}, no event and no payday ({', '.join(b['why'])}). Same day last week was {m(b['last_week'])}, so it was a normal Friday a little under the forecast.", "../shift/#s-close"),
        ("store-tomorrow", "What's the forecast for tomorrow?", "forecast tomorrow next week expect busy", f"Tomorrow ({shift['next7'][0]['date']}): {m(shift['next7'][0]['forecast'])} ({m(shift['next7'][0]['low'])}–{m(shift['next7'][0]['high'])}) because of {', '.join(shift['next7'][0]['why'])}. The busiest of the next 7 days is {max(shift['next7'], key=lambda d: d['forecast'])['date']}.", "../shift/#s-sense"),
        ("store-best", "Which category is doing best?", "best category growing top strongest", f"{best['category']} grew most: {best['wow_pct']:+.1f}% on last week ({m(best['sales'])}).", "../#s-cat"),
        ("store-order", "What do I need to order?", "order reorder stock running out low below buy", f"{len(order_now)} lines are below lead-time cover, led by {order_now[0]['name']} ({order_now[0]['days_cover']} days left). Orders worth {m(sum(r['value'] for r in order_now))} wait for the Inventory Manager.", "../#s-ops"),
        ("store-recall", "Is there a recall?", "recall allergen pull product unsafe", "; ".join(f"{r['product']}: {r['reason']}, {r['on_hand']} on hand, pull before trading" for r in S["recalls"]) or "No recalls today.", "../shift/#s-open"),
        ("store-staff", "Are we short of staff?", "short staff roster enough people cover hours who is on working rostered shift today", f"Today {sum(g['on'] for g in b['staffing'])} staff-hours are rostered against {sum(g['need'] for g in b['staffing'])} needed. " + (f"Short at {', '.join(str(g['hour']) + ':00' for g in b['staffing'] if g['gap'] < 0)}." if any(g['gap'] < 0 for g in b['staffing']) else "No hour is short; the 9:00–13:00 lull has spare people for shelf filling."), "../shift/#s-open"),
        ("store-handover", "What's in the handover?", "handover notes tomorrow duty manager closing", " ".join(c["handover"]), "../shift/#s-close"),
        ("store-model", "Which forecast runs the roster?", "model forecast accurate accuracy wape sensing exam", f"{shift['model']['why'].capitalize()}. 14-day error: weekday {shift['model']['exam14']['wape']['weekday']}%, sensing {shift['model']['exam14']['wape']['sensing']}%; 8 weeks: sensing {shift['model']['exam56']['wape']['sensing']}%.", "../shift/#s-sense"),
        ("store-apps", "How are the delivery apps doing?", "uber eats delivery apps on demand online channel", f"Last 7 days: Uber Eats {m(ue)}, the store's own on-demand delivery {m(od)}; delivery share {k['delivery_pct']}% of sales.", "../#s-perf"),
        ("store-visitors", "How many people came in?", "visitors footfall people came in door customers count", f"{V['day']['visitors']} visitors on the synthetic camera day ({V['day']['in']} in, {V['day']['out']} out), peak {V['day']['occupancy_peak']} inside at once. Nobody is identified.", "../vision/#s-day"),
        ("store-loss", "Any theft or loss cases?", "theft shoplifting loss prevention cases stolen stealing steal shrink", f"{lp_cases} cases for a person to check across 4 sites in 7 days; aisle false alarms {LP['sites']['store']['week']['false_per_camera_day']} a camera a day. No faces, no names.", "../lp/#s-cases"),
        # ---------------- Tōtara
        ("tot-short", "What's short at Tōtara?", "totara short stock out gap medicine running out", f"{len(tot_short)} SKUs need action: " + "; ".join(f"{i['product_name']} ({i['status'].lower()}, {i['cover_days']:.0f} days cover)" for i in tot_short[:4]) + ".", "../supply-chain/"),
        ("tot-expiry", "What's about to expire?", "expiry expire short dated batch waste medicine", f"{m(ops['totara']['expiry_at_risk'])} of short-dated stock is at risk; {m(ops['totara']['expiry_saved'])} of it has a home with hospitals and clinics before it expires.", "../ops/#s-exp"),
        ("tot-supplier", "Which supplier is worst?", "worst supplier late short shipping scorecard grade", f"{worst['name']} (grade {worst['grade']}, on time {worst['on_time']}%, in full {worst['in_full']}%): {worst['ask']}.", "../ops/#s-sup"),
        ("tot-revenue", "How is Tōtara selling?", "totara revenue sales medical 30 days", f"{m(T['kpi']['revenue_30d'])} in the last 30 days ({T['kpi']['revenue_30d_delta'] * 100:+.1f}%), {T['kpi']['customers']} clients, {T['kpi']['skus']} SKUs.", "../supply-chain/"),
        ("tot-whatif", "What if a supplier is late?", "what if supplier late delay ship", (lambda w: f"Worst case: {w['supplier']} {w['delay']} days late puts {m(w['revenue'])} of sales at stake across {len(w['skus'])} SKUs. Try any supplier on the Ops page.")(max(ops["totara"]["what_if"].values(), key=lambda x: x["revenue"])), "../ops/#s-whatif"),
        # ---------------- Gateway
        ("gw-otif", "Is Gateway on time?", "gateway otif on time in full late deliveries service", f"On-time-in-full {G['kpis']['otif']}% (last week {G['kpis']['otif_prev']}%). Below target: " + ", ".join(cl["name"] for cl in G["clients"] if cl["otif"] < cl["otif_target"]) + ".", "../gateway/"),
        ("gw-docks", "Any dock clashes?", "dock clash truck slot waiting yard", (f"{len(clashes)} clash{'es' if len(clashes) != 1 else ''}: " + "; ".join(f"{x['truck']} waits {x['wait']} min ({x['fix']})" for x in clashes[:2]) + ".") if clashes else "No clashes: every truck gets a dock within 30 minutes.", "../ops/#s-docks"),
        ("gw-staff", "Is Gateway short of people?", "gateway pickers forklift short staff shift labour", "Short: " + "; ".join(f"{s} {sh} ({a})" for s, sh, a in short_shifts[:3]) + "." if short_shifts else "Every shift has enough people.", "../ops/#s-labour"),
        ("gw-billing", "What did we bill clients?", "billing invoice clients contract charge", f"{m(sum(x['total'] for x in ops['gateway']['billing']))} as used this month against {m(sum(x['contract'] for x in ops['gateway']['billing']))} of contracts.", "../ops/#s-bill"),
        # ---------------- group
        ("grp-profit", "Are we making money?", "profit ebitda making money loss earnings group", f"{P['month']}: group revenue {m(P['group_revenue'])}, EBITDA {m(P['group_ebitda'])} ({P['group_margin_pct']}%). " + "EBITDA margin by business: " + ", ".join(f"{ {'store': 'Store', 'totara': 'Tōtara', 'gateway': 'Gateway', 'group': 'Tower and HQ'}.get(bz, bz)} {v['margin_pct']}%" for bz, v in P["by_business"].items()) + ".", "../group/#s-pnl"),
        ("grp-cash", "How is cash?", "cash bank flow money low point overdraft", group["cash"]["advice"], "../group/#s-cash"),
        ("grp-people", "How many people work here?", "people staff headcount employees how many work", f"{PE['headcount']} people across the group (" + ", ".join(f"{bz} {v['headcount']}" for bz, v in PE["by_business"].items()) + f"), {m(PE['pay_week'])} of pay a week.", "../group/#s-people"),
        ("grp-certs", "Any licences expiring?", "licence certificate expiring manager's certificate forklift first aid compliance", "; ".join(f"{x['what']}: {x['action']}" for x in certs[:2]) + ".", "../group/#s-people"),
        ("grp-save", "Where can we save money?", "save saving cost cut procurement cheaper", f"Buying as one group saves about {m(sum(p['saving_month'] for p in group['procurement']))} a month, most on {group['procurement'][0]['category'].lower()}; gloves from Tōtara are the quick win.", "../group/#s-proc"),
        ("grp-decide", "What do I need to decide?", "decide decisions approve board me pavi", f"{len(group['board']['decisions'])} decisions in the board pack, first: {group['board']['decisions'][0]['what'].lower()}. {len(AP['items'])} requests wait in Approvals ({by('store')} store, {by('totara')} Tōtara, {by('gateway')} Gateway, {by('group')} group).", "../group/#s-board"),
        ("grp-tower", "How full is the tower?", "tower occupancy floors let lease tenants", f"Occupancy {W['kpis']['occupancy_pct']:.0f}%: {W['kpis']['available']} floors ({W['kpis']['available_m2']:,} m²) to let.", "../tower/"),
        # ---------------- Shelly
        ("os-today", "What happened today?", "today events happened what's going on news", f"{osd['summary']['events']} events on the bus, {osd['summary']['actions']} agent actions: {osd['summary']['on_their_own']} ran on their own, {osd['summary']['waiting']} wait for a person, {osd['summary']['cross_business']} crossed between businesses.", "../os/#s-bus"),
        ("os-huddle", "What did the agents agree?", "huddle agree plan agents meeting together", " ".join(f"{h['title']}: {h['plan']}" for h in huddles[:2]), "../ask/#s-huddle"),
        ("shelly-limits", "What can agents do on their own?", "agents alone limits autonomy allowed permission", f"{sum(1 for l in group['limits'] if l['autonomy'] == 'auto')} of {len(group['limits'])} agents act alone on routine work, spend capped at $500; policy, pricing, hiring, credit, budgets and pay always come to a person.", "../group/#s-gov"),
        ("shelly-skills", "How good are your skills?", "skills levels lab how good accurate exam learn learned learning remember memory lessons", "Shift skills: " + ", ".join(f"{v['name'].lower()} {v['avg']}" for v in shift["lab"]["skills"].values()) + f"; Store Vision has {len(V['lab']['skills'])} skills tested daily against a known truth.", "../shift/#s-lab"),
        ("shelly-privacy", "Do you track people?", "privacy faces track people identify data safe", "No. No faces, no names, no scores on people. Cameras count and pixelate; loss prevention watches stock and places; HR shows roles and counts only. The public site uses synthetic data only.", "../lp/#s-law"),
        ("shelly-what", "What can you do?", "what can you do help shelly who are you", "I run four businesses' numbers: the store's shift, Tōtara's stock and suppliers, Gateway's docks and billing, and the group's finance, people and governance. Ask about sales, stock, cash, people, suppliers or what to decide.", "../launchpad/"),
    ]
    return [{"id": i, "q": q, "keys": keys.split(), "a": a, "link": link} for i, q, keys, a, link in I]
