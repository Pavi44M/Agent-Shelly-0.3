"""Evidence packs, the privacy impact checklist per site, and step 1 of loss prevention: where the loss is
(no camera needed). Everything is synthetic on the public site."""
from __future__ import annotations

import random

POLICE = "Report to NZ Police online or on 105 (non-emergency); 111 if anyone is in danger."


def pack(case: dict, cfg: dict) -> dict:
    """the evidence pack for one REVIEW case: what happened, when, where, the clip window, the value, and the
    blanks the Duty Manager fills in. It identifies nobody: there is no name, no face and no description of a person."""
    pv = cfg["privacy"]
    return {
        "case": case["id"], "site": cfg["sites"][case["site"]]["name"], "rule": case["what"], "where": case["where"], "first_seen": case["at"],
        "steps": [f"{s['at']}  {s['kind']}" + (f" ({s.get('zone')})" if s.get("zone") else "") for s in case["steps"]],
        "incident_confidence": case.get("confidence"), "value_estimate": case["value"],
        "clip": case.get("clip"), "clips": case.get("clips", []), "original_clip": "encrypted; released only to NZ Police on a formal request" if pv.get("original_clip") == "sealed_for_police" else "not kept",
        "reviewer": case["owner"],
        "to_fill": ["Reviewed by (name, time)", "Decision: no issue / assist only / loss confirmed", "What staff did (offered help, asked to pay, stepped back)",
                    "Outcome (paid / left / police called)", "Police report number", "Trespass notice issued? (owner decides)", "Stock adjusted? (SKU, qty)"],
        "rules_for_staff": [f"Never {x}" for x in cfg["human_in_the_loop"]["never"]] + [POLICE],
        "keep_until": case["retention_until"] + " (longer only while a police case is open)",
        "privacy": "No name, no face, no description of a person. Faces are pixelated in every view. Access is logged.",
    }


def pack_markdown(p: dict) -> str:
    L = [f"# Evidence pack {p['case']}", f"**{p['site']}** · {p['rule']} · {p['where']} · first seen {p['first_seen']}", "", "## What happened"]
    L += [f"- {s}" for s in p["steps"]]
    L += ["", f"Incident confidence {p['incident_confidence'] or 'system record'} · value at risk ${p['value_estimate']:.2f}"]
    for c in p.get("clips", []): L += [f"Clip {c['from']}–{c['to']} ({c['seconds']} s), faces pixelated."]
    if p.get("clips"): L += [f"Original: {p['original_clip']}."]
    L += ["", "## To fill in"] + [f"- [ ] {x}" for x in p["to_fill"]] + ["", "## Rules for staff"] + [f"- {x}" for x in p["rules_for_staff"]]
    L += ["", f"Keep until {p['keep_until']}. {p['privacy']}"]
    return "\n".join(L)


PIA = [   # Privacy Commissioner: CCTV guidance + privacy impact assessment toolkit, in plain words
    ("Purpose", "Why the camera is there, written down", "Reduce stock loss and keep staff safe", "shelly"),
    ("Need", "Evidence of the problem before adding cameras", "Shrink numbers by place and category (step 1)", "shelly"),
    ("Less intrusive first", "Layout, tags, cabinets and staff presence tried", "Prevention checklist on this page", "owner"),
    ("Signs", "Clear signs at entrances and where cameras watch", "Sign text provided", "owner"),
    ("Placement", "No toilets, changing rooms or staff break rooms; not pointed at neighbours", "Camera list per site", "owner"),
    ("Staff told", "Written notice to staff about workplace cameras, and a chance to comment", "Staff notice provided", "owner"),
    ("Access", "Only named roles can view; every view is logged", "Duty Manager, Store Manager, Privacy Officer", "shelly"),
    ("Security", "Encrypted storage, strong passwords, no filming screens on phones", "Built in", "shelly"),
    ("Retention", "Deleted on a schedule", "30 days, longer only for an open police case", "shelly"),
    ("Disclosure", "Who footage goes to", "NZ Police on request only; never social media", "shelly"),
    ("Access requests", "People can ask for footage of themselves", "Privacy Officer replies within 20 working days", "owner"),
    ("Accuracy and fairness", "Checks against wrong accusations and bias", "Human review, alert budget, no demographics, no faces", "shelly"),
    ("Review", "Look at it again regularly", "Every 6 months, or when a camera or rule changes", "owner"),
]


def pia(cfg: dict, site: str) -> list[dict]:
    s = cfg["sites"][site]
    rows = []
    for area, ask, answer, who in PIA:
        if area == "Placement": answer = ", ".join(c["name"] for c in s.get("cameras", []))
        rows.append({"area": area, "question": ask, "answer": answer, "status": "done by Shelly" if who == "shelly" else "owner to confirm"})
    return rows


SIGN = "CCTV in use. Cameras here help prevent loss and keep our team safe. Video is deleted after 30 days. We do not use facial recognition. Ask our Privacy Officer about your information."


def shrink(site: str, seed: int = 7) -> dict:
    """step 1, no camera: where the loss is, 13 weeks, by cause and by place (synthetic, seeded)."""
    rnd = random.Random(seed + len(site))
    if site == "store":
        sales = 13 * rnd.uniform(68000, 74000); rate = rnd.uniform(.017, .021)
        causes = {"Customer theft (estimated)": .34, "Process and admin errors": .22, "Damage and out of date": .18, "Supplier short-deliveries": .14, "Staff-related (voids, refunds)": .12}
        places = {"Spirits": .27, "Razors and health": .16, "Infant formula": .12, "Vapes": .11, "Confectionery": .1, "Chilled": .14, "Other": .1}
        base = {"label": "13 weeks · sales", "sales": round(sales)}
    elif site in ("gateway", "totara"):
        sales = 13 * (rnd.uniform(380000, 420000) if site == "gateway" else rnd.uniform(160000, 180000)); rate = rnd.uniform(.003, .006)
        causes = {"Picking and booking errors": .38, "Supplier short-shipments": .24, "Damage in handling": .2, "Unexplained (possible theft)": .18}
        places = {"High-value cage": .22, "Receiving": .3, "Pick faces": .33, "Yard and docks": .15} if site == "gateway" else {"Controlled-drugs cage": .12, "Receiving": .46, "Pick faces": .3, "Cold room": .12}
        base = {"label": "13 weeks · stock handled", "sales": round(sales)}
    else:
        sales = 13 * rnd.uniform(9000, 11000); rate = rnd.uniform(.02, .03)
        causes = {"Assets not returned": .4, "Assets lost in transit": .25, "Unexplained (possible theft)": .2, "Damage": .15}
        places = {"Laptops": .55, "Phones": .25, "AV and meeting rooms": .2}
        base = {"label": "13 weeks · IT assets in use (value)", "sales": round(sales)}
    loss = sales * rate
    j = lambda d: {k: round(loss * v * rnd.uniform(.92, 1.08)) for k, v in d.items()}
    return {**base, "loss": round(loss), "rate": round(rate * 100, 2), "by_cause": j(causes), "by_place": j(places)}
