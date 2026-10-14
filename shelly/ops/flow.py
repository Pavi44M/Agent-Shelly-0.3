"""One flow, end to end (v2.2): an event in one business, followed through every department that touches it.

  store -> Gateway      a store product drops below lead-time cover: the ordering agent raises the order (signed off by
                        the Inventory Manager), Gateway's transport agent adds it to the next store run, the Wiri dock
                        scheduler gives that truck a slot, and the store's Shift Pilot checks it in at 06:15
  Tōtara -> Gateway     a Tōtara medicine has a gap before its ship arrives: the stock agent expedites, the inbound
                        container is booked into a chilled dock at Gateway's GDP site, then the hospitals that use it are told
Each step names the agent (or person), what they did, when, and whether it waited for a sign-off.
"""
from __future__ import annotations

from ..os.bus import AG, run_day
from ..os.model import build


def _agent(i):
    return AG[i].name if i in AG else i


def run(gw_ops: dict) -> list:
    bus = run_day(build())
    ev = {e["id"]: e for e in bus.events()}
    acts = bus.actions()
    flows = []
    # 1 · store -> Gateway
    e = next(x for x in ev.values() if x["type"] == "store.stock.below_cover")
    a = [x for x in acts if x["event_id"] == e["id"]]
    po = next(x for x in a if x["agent"] == "store-ordering"); run_ = next(x for x in a if x["agent"] == "gw-transport")
    wiri = next(d for d in gw_ops["docks"] if d["site"] == "WH-01")
    truck = next((j for j in wiri["jobs"] if j["kind"] == "out" and "Neighbourhood" in j["client"]), None)
    steps = [
        {"who": "Shelly OS · stock detector", "biz": "store", "what": f"{e['subject']} is below lead-time cover ({e['payload']['cover_days']} days left)", "when": e["ts"], "gate": ""},
        {"who": _agent(po["agent"]), "biz": "store", "what": po["action"], "when": e["ts"], "gate": "waits: " + po["needs"]},
        {"who": _agent(run_["agent"]), "biz": "gateway", "what": run_["action"], "when": e["ts"], "gate": "waits: " + run_["needs"]},
    ]
    if truck:
        steps.append({"who": "Gateway dock scheduler", "biz": "gateway", "what": f"{truck['truck']} loads {truck['pallets']} pallets for the store at Wiri dock {truck['dock']} ({truck['dock_kind']}), {truck['start']}–{truck['end']}", "when": gw_ops["asof"], "gate": "booked"})
    steps.append({"who": "Shift Pilot", "biz": "store", "what": "Delivery check-in when the truck arrives, chilled first; the product goes back on the shelf", "when": "next delivery day", "gate": "on the to-do list"})
    flows.append({"id": "store-gateway", "title": f"Store stock-out to Gateway delivery: {e['subject']}", "steps": steps})
    # 2 · Tōtara -> Gateway
    e2 = next((x for x in ev.values() if x["type"] in ("totara.stock.gap", "totara.stock.out")), None)
    if e2:
        a2 = [x for x in acts if x["event_id"] == e2["id"]]
        gdp = next(d for d in gw_ops["docks"] if d["site"] == "WH-02")
        cold_in = next((j for j in gdp["jobs"] if j["kind"] == "in" and j["cold"]), None)
        steps2 = [{"who": "Shelly OS · stock detector", "biz": "totara", "what": f"{e2['subject']}: {e2['payload']['cover_days']:.0f} days of cover left, and the next shipment lands after that", "when": e2["ts"], "gate": ""}]
        for x in a2:
            steps2.append({"who": _agent(x["agent"]), "biz": x["business"], "what": x["action"], "when": e2["ts"], "gate": "runs on its own" if x["status"] == "done" else "waits: " + x["needs"]})
        if cold_in:
            steps2.append({"who": "Gateway dock scheduler", "biz": "gateway", "what": f"Inbound {cold_in['pallets']} pallets into chilled dock {cold_in['dock']} at the GDP site, {cold_in['start']}–{cold_in['end']}, temperature logged on arrival", "when": gw_ops["asof"], "gate": "booked"})
        steps2.append({"who": "Gateway transport", "biz": "gateway", "what": "Hospital deliveries go out on the next refrigerated run (2–8°C)", "when": "same or next day", "gate": "scheduled"})
        flows.append({"id": "totara-gateway", "title": f"Tōtara stock gap to Gateway inbound and hospital delivery: {e2['subject']}", "steps": steps2})
    return flows
