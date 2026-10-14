"""Tōtara Medical operations (v2.2): supplier scorecards, expiry rescue and the what-if planner.

  scorecards  every supplier scored 0-100 on on-time, in-full, lead-time reliability and how much rides on them
              (spend, single-sourced SKUs), graded A-D, with the one thing to raise at the quarterly review
  expiry      short-dated batches offered to the clients who use that kind of product fast enough to finish them
              before they expire (2 days to deliver); what can't be placed goes back to the supplier or to donation
  what-if     "supplier X is N days late": which SKUs run out, for how long, the revenue and clients hit, and the best fix

Synthetic Tōtara data only (docs/supply-chain/data.js).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DELIVER_DAYS = 2
DELAYS = [7, 14, 28]
HEALTHCARE = {"Aged care / institution", "Medical centre / GP", "Private hospital", "Public hospital"}
OPEN_TO_ALL = {"Sports/Ortho", "Wound care", "PPE"}        # first-aid items sports clubs and workplaces also buy


def _js(p):
    t = (ROOT / p).read_text(encoding="utf-8")
    return json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])


def scorecards(t: dict) -> list:
    out = []
    single = {s["supplier_id"]: s.get("skus_single_sourced", 0) for s in t["suppliers"]}
    for s in t["suppliers"]:
        rel = max(0.0, 1 - s["lead_sd"] / max(1, s["avg_lead"]) * 4)         # steadier lead times score higher
        score = round(45 * s["on_time"] + 35 * s["in_full"] + 20 * rel, 1)
        grade = "A" if score >= 85 else "B" if score >= 75 else "C" if score >= 65 else "D"
        if s["in_full"] < 0.9: ask = f"short-shipping on {round((1 - s['in_full']) * 100)}% of orders: agree a fill-rate target and credits"
        elif s["on_time"] < 0.85: ask = f"late on {round((1 - s['on_time']) * 100)}% of orders (up to {s['max_delay']} days): agree firm ship dates and earlier booking"
        elif single.get(s["supplier_id"], 0) >= 3: ask = f"{single[s['supplier_id']]} SKUs depend on them alone: qualify a second source"
        elif grade in ("C", "D"): ask = f"lead times swing ±{s['lead_sd']:.0f} days on {s['avg_lead']:.0f}: book earlier and hold {s['lead_sd'] * 1.65:.0f} days of buffer"
        else: ask = "keep: thank them and lock in next year's prices"
        out.append({"id": s["supplier_id"], "name": s["supplier_name"], "country": s["country"], "mode": s["default_mode"], "score": score, "grade": grade,
                    "on_time": round(s["on_time"] * 100, 1), "in_full": round(s["in_full"] * 100, 1), "lead_days": round(s["avg_lead"], 1), "lead_sd": round(s["lead_sd"], 1),
                    "spend": round(s["spend"]), "single_sourced": single.get(s["supplier_id"], 0), "verdict": s.get("verdict", ""), "ask": ask})
    return sorted(out, key=lambda x: x["score"])


def expiry_rescue(t: dict) -> list:
    inv = {i["sku"]: i for i in t["inventory"]}
    custs = t["customers"]
    out = []
    for b in sorted(t["expiry"], key=lambda e: e["days_left"]):
        if b["at_risk_qty"] <= 0: continue
        sku = inv.get(b["sku"]); cat = sku["category"] if sku else "Consumable"
        usable_days = max(0, b["days_left"] - DELIVER_DAYS)
        tot_cat = sum(c.get(cat, 0) for c in custs) or 1
        left = b["at_risk_qty"]; offers = []
        allowed = [c for c in custs if c["segment"] in HEALTHCARE or (sku and sku["subcategory"] in OPEN_TO_ALL)]   # medicines and clinical items to healthcare only
        tot_cat = sum(c.get(cat, 0) for c in allowed) or 1
        for c in sorted(allowed, key=lambda c: -c.get(cat, 0)):
            if left <= 0 or usable_days <= 0: break
            share = c.get(cat, 0) / tot_cat
            can = int((sku["avg_daily"] if sku else 10) * share * usable_days * 0.35)   # a client can switch about a third of its use to short-dated stock
            take = min(left, can)
            if take >= 10:
                offers.append({"client": c["customer_name"], "segment": c["segment"], "qty": int(take)}); left -= take
        unit = b["at_risk_value"] / b["at_risk_qty"]
        saved = round((b["at_risk_qty"] - left) * unit)
        out.append({"batch": b["batch_id"], "sku": b["sku"], "name": b["product_name"], "expires": b["expiry_date"], "days_left": b["days_left"],
                    "at_risk_qty": int(b["at_risk_qty"]), "at_risk_value": round(b["at_risk_value"]), "offers": offers, "saved_value": saved,
                    "left_qty": int(left), "fallback": "none needed" if left <= 0 else ("return to the supplier (ask for credit) or donate through a medical-aid charity before expiry" if b["days_left"] > 7 else "quarantine and write off; record for the Medsafe destruction log")})
    return out


def what_if(t: dict) -> dict:
    """supplier x delay -> SKUs that run out, days short, revenue and clients hit, best fix"""
    inv = t["inventory"]; custs = t["customers"]
    sup = {s["supplier_id"]: s for s in t["suppliers"]}
    alt = {}                                                    # another supplier already buying the same subcategory
    for i in inv:
        alt.setdefault(i["subcategory"], set()).add(i["primary_supplier_id"])
    out = {}
    for sid, s in sup.items():
        skus = [i for i in inv if i["primary_supplier_id"] == sid]
        for d in DELAYS:
            hit = []
            for i in skus:
                cover = i["cover_days"]
                # the next delivery from this supplier arrives d days later than planned: days short = what the cover can't bridge
                gap = max(0.0, d - max(0.0, cover - 3))
                if gap <= 0: continue
                daily_rev = i["avg_daily"] * (i["stock_value"] / max(1, i["on_hand"])) * 1.35      # daily use at selling price (cost + margin)
                others = sorted(alt.get(i["subcategory"], set()) - {sid})
                fix = (f"switch part of the order to {sup[others[0]]['supplier_name']} (already supplies {i['subcategory'].lower()})" if others
                       else "air-freight a bridging order" if s["default_mode"] == "Sea" else "ration to hospitals first and agree substitutes with clients")
                hit.append({"sku": i["sku"], "name": i["product_name"], "cover_days": round(cover, 1), "days_short": round(gap, 1),
                            "revenue": round(daily_rev * gap), "fix": fix})
            cat_clients = sorted({c["customer_name"] for c in custs for i in hit if c.get(next(x["category"] for x in inv if x["sku"] == i["sku"]), 0) > 0})
            out[f"{sid}:{d}"] = {"supplier": s["supplier_name"], "delay": d, "skus": hit, "revenue": sum(h["revenue"] for h in hit), "clients": len(cat_clients)}
    return out


def run() -> dict:
    t = _js("docs/supply-chain/data.js")
    ex = expiry_rescue(t)
    return {"asof": t["generated"], "scorecards": scorecards(t), "expiry": ex, "expiry_saved": sum(e["saved_value"] for e in ex),
            "expiry_at_risk": sum(e["at_risk_value"] for e in ex), "what_if": what_if(t), "delays": DELAYS,
            "suppliers": [{"id": s["supplier_id"], "name": s["supplier_name"]} for s in t["suppliers"]]}
