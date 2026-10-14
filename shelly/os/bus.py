"""Shelly OS · the event bus (v2.0): how departments talk to each other.

Sense -> decide -> act -> ask:
  1. detectors read the data model and publish events ("store.stock.below_cover", "gateway.service.below_target" ...)
  2. every agent subscribed to that event type reacts with an action
  3. each action is checked against the agent's autonomy and the Brain's approval chain
     (department head -> Finance funds check -> Pavi): small, routine actions run on their own,
     anything with money, people or customers waits for a person
  4. events and actions are written to the model, so every page and every agent sees the same log

    from shelly.os.model import build
    from shelly.os.bus import Bus, run_day
    con = build(); bus = run_day(con)          # detect + react, everything logged
    bus.subscribe("store.stock.*", my_handler) # handler(event) -> [action dicts]

Nothing here identifies a person, and the public site runs it on synthetic data only.
"""
from __future__ import annotations

import fnmatch
import hashlib
import json

from ..brain.registry import AGENTS, DEPARTMENTS, POLICY, approval_chain

AG = {a.id: a for a in AGENTS}
DEP = {d.id: d for d in DEPARTMENTS}
INFO_AREAS = {"Brief"}          # telling people something: no money, people or customers, so it never waits
BIZ = {"store": "Neighbourhood Store", "totara": "Tōtara Medical", "gateway": "Gateway", "group": "Shelly Group"}


def _id(*parts) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:10]


class Bus:
    def __init__(self, con):
        self.con, self.subs = con, []

    def subscribe(self, pattern: str, handler, agent: str | None = None):
        self.subs.append((pattern, handler, agent))
        return self

    def publish(self, type: str, business: str, subject: str, payload: dict, severity="med", ts="", source="detector") -> dict:
        ev = {"id": "E-" + _id(type, business, subject), "ts": ts, "type": type, "business": business, "source": source,
              "subject": subject, "severity": severity, "payload": payload}
        self.con.execute("INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?,?,?)",
                         (ev["id"], ts, type, business, source, subject, severity, json.dumps(payload)))
        for pattern, handler, _ in self.subs:
            if fnmatch.fnmatch(type, pattern):
                for act in handler(ev) or []:
                    self._record(ev, act)
        return ev

    def _record(self, ev, act):
        a = AG[act["agent"]]
        amount, area = float(act.get("amount") or 0), act.get("area", "Operations")
        chain = approval_chain(a.department, area, amount)
        policy_area = any(k.lower() in area.lower() for k in POLICY["always_mgmt"] + POLICY["always_finance"])
        alone = (a.autonomy == "auto" and amount <= DEP[a.department].limit and not policy_area) or (area in INFO_AREAS and amount == 0)
        needs = "runs on its own" if alone else " → ".join(s["role"] for s in chain)
        status = "done" if alone else "waiting"
        row = {"id": "A-" + _id(ev["id"], a.id, act["action"]), "event_id": ev["id"], "agent": a.id, "business": a.business, "dept": a.department,
               "action": act["action"], "area": area, "amount": amount, "needs": needs, "chain": json.dumps([] if alone else chain), "status": status}
        self.con.execute("INSERT OR REPLACE INTO actions VALUES (:id,:event_id,:agent,:business,:dept,:action,:area,:amount,:needs,:chain,:status)", row)

    def events(self):
        order = {b: i for i, b in enumerate(BIZ)}
        ev = [dict(r) | {"payload": json.loads(r["payload"])} for r in self.con.execute("SELECT * FROM events ORDER BY type, subject")]
        return sorted(ev, key=lambda e: order.get(e["business"], 9))

    def actions(self):
        return [dict(r) | {"chain": json.loads(r["chain"])} for r in self.con.execute("SELECT * FROM actions")]


# ---------------------------------------------------------------- the standard subscribers (agents reacting to events)
def _money(v):
    return f"${v:,.0f}"


def standard(bus: Bus) -> Bus:
    S = bus.subscribe
    # store stock below lead-time cover: the ordering agent raises the order, and (cross-department) Gateway books the delivery
    S("store.stock.below_cover", lambda e: [
        {"agent": "store-ordering", "action": f"Order {e['payload']['qty']:.0f} × {e['subject']} from {e['payload']['supplier']} ({_money(e['payload']['value'])})", "area": "Purchase order", "amount": e["payload"]["value"]},
        {"agent": "gw-transport", "action": f"Add {e['subject']} to the next store replenishment run from WH-01", "area": "Delivery booking", "amount": 0},
    ])
    S("store.stock.recall", lambda e: [{"agent": "store-compliance", "action": f"Pull {e['subject']} from the shelf and quarantine it (recall)", "area": "Recall", "amount": 0}])
    S("store.sales.off_budget", lambda e: [{"agent": "store-category", "action": f"Review range, price and promotions for {e['subject']} ({e['payload']['gap_pct']:+.1f}% vs budget)", "area": "Category review", "amount": 0}])
    # Tōtara: stock gaps go to the stock agent; the clients agent warns the clients affected
    S("totara.stock.*", lambda e: [
        {"agent": "totara-stock", "action": f"{'Expedite' if e['type'].endswith('gap') else 'Reorder'} {e['subject']} ({_money(e['payload']['revenue_at_risk'])} of revenue at risk)", "area": "Purchase order", "amount": e["payload"]["revenue_at_risk"]},
        {"agent": "totara-clients", "action": f"Warn the clients who buy {e['subject']} and offer an alternative", "area": "Client update", "amount": 0},
    ])
    S("totara.expiry.at_risk", lambda e: [{"agent": "totara-clients", "action": f"Offer batch {e['payload']['batch']} of {e['subject']} to clients who will use it in {e['payload']['days_left']} days", "area": "Expiry rescue", "amount": 0}])
    S("gateway.service.below_target", lambda e: [{"agent": "gw-transport", "action": f"Re-plan the morning run and give {e['subject']} a priority dock slot (OTIF {e['payload']['otif']}% vs {e['payload']['target']}%)", "area": "Service recovery", "amount": 0}])
    S("*.flag.high", lambda e: [{"agent": {"gateway": "gw-warehouse", "group": "mgmt-head", "totara": "totara-brief", "store": "store-briefing"}[e["business"]],
                                 "action": f"Put on today's brief: {e['subject']}", "area": "Brief", "amount": 0}])
    return bus


# ---------------------------------------------------------------- detectors (sense)
def detect(con, bus: Bus):
    q = lambda sql, *a: [dict(r) for r in con.execute(sql, a)]
    asof = {r["business"]: r["asof"] for r in q("SELECT business, MAX(asof) AS asof FROM kpis GROUP BY business")}
    for r in q("SELECT * FROM stock WHERE business='store' AND status LIKE 'Order now%'"):
        bus.publish("store.stock.below_cover", "store", r["name"], {"cover_days": r["cover_days"], "qty": r["order_qty"], "value": r["value"], "supplier": r["supplier"]}, "high", asof["store"])
    for r in q("SELECT * FROM stock WHERE business='store' AND status LIKE 'Blocked%'"):
        bus.publish("store.stock.recall", "store", r["name"], {"on_hand": r["on_hand"]}, "high", asof["store"])
    for r in q("SELECT * FROM sales WHERE budget > 0 AND (sales - budget) / budget < -0.05"):
        bus.publish("store.sales.off_budget", "store", r["category"], {"gap_pct": round((r["sales"] - r["budget"]) / r["budget"] * 100, 1), "sales": r["sales"]}, "med", asof["store"])
    for r in q("SELECT * FROM stock WHERE business='totara' AND status IN ('Stock-out','Gap before ETA','Reorder now')"):
        t = {"Stock-out": "totara.stock.out", "Gap before ETA": "totara.stock.gap", "Reorder now": "totara.stock.reorder"}[r["status"]]
        bus.publish(t, "totara", r["name"], {"cover_days": r["cover_days"], "revenue_at_risk": round(r["value"])}, "high" if r["status"] == "Stock-out" else "med", asof["totara"])
    for r in q("SELECT * FROM expiry WHERE at_risk_value > 0 ORDER BY at_risk_value DESC LIMIT 5"):
        bus.publish("totara.expiry.at_risk", "totara", r["name"], {"batch": r["batch"], "days_left": r["days_left"], "at_risk_value": r["at_risk_value"]}, "med", asof["totara"])
    for r in q("SELECT * FROM service WHERE otif < target"):
        bus.publish("gateway.service.below_target", "gateway", r["name"], {"otif": r["otif"], "target": r["target"], "late": r["late"]}, "high", asof["gateway"])
    for r in q("SELECT * FROM flags WHERE severity='high' AND (client = '' OR client NOT IN (SELECT client FROM service WHERE otif < target))"):
        first = r["text"].split(". ")[0].rstrip(".")      # the headline sentence; the service event already covers a late client
        bus.publish(f"{r['business']}.flag.high", r["business"], first if len(first) <= 160 else first[:157] + "…", {"area": r["area"], "text": r["text"]}, "high", asof.get(r["business"], ""))
    con.commit()
    return bus


def run_day(con) -> Bus:
    return detect(con, standard(Bus(con)))


def summary(bus: Bus) -> dict:
    ev, ac = bus.events(), bus.actions()
    cross = [a for a in ac if a["business"] != next(e["business"] for e in ev if e["id"] == a["event_id"])]
    return {"events": len(ev), "actions": len(ac), "on_their_own": sum(a["status"] == "done" for a in ac),
            "waiting": sum(a["status"] == "waiting" for a in ac), "cross_business": len(cross),
            "by_business": {b: sum(e["business"] == b for e in ev) for b in BIZ}}
