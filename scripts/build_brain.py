"""Build Shelly Brain for the website.

    python scripts/build_brain.py

Writes
  docs/data/brain.js       the organisation (core, businesses, departments, agents) with live figures and status
  docs/data/approvals.js   one approvals queue across every business (used by the badge, tray and mascot)
  docs/brain/              the Brain page
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def js_data(path: Path) -> dict:
    s = path.read_text()
    return json.loads(s[s.index("{"):s.rstrip().rstrip(";").rindex("}") + 1])


def money(v):
    return f"${v / 1e6:.2f}M" if abs(v) >= 1e6 else f"${v / 1e3:.1f}k" if abs(v) >= 1e4 else f"${v:,.0f}"


def main():
    from shelly import __version__
    from shelly.brain.registry import AGENTS, AUTONOMY, BUSINESSES, CORE, DEPARTMENTS
    from shelly.core.skills import load_all
    from dataclasses import asdict

    skills = load_all()
    S = js_data(ROOT / "docs/data/shelly-data.js")
    k, m = S["kpis"], S["meta"]
    T = json.loads((ROOT / "modules/medical-supply-chain/dashboard/data.json").read_text())
    tk = T["kpi"]
    R = js_data(ROOT / "docs/data/shelly-reports.js") if (ROOT / "docs/data/shelly-reports.js").exists() else {"specs": {}, "catalog": []}
    b3 = R["specs"].get("budget-3m-All", {})
    b3k = {x["label"]: x["value"] for x in b3.get("kpis", [])}

    live = {
        "store.sales": ("Sales this week", money(k["sales"])),
        "store.p1": ("Actions for today", str(sum(a["priority"] == "P1" for a in S["actions"]))),
        "store.vs_budget": ("vs budget", f"{k['vs_budget_pct']:+.1f}%"),
        "store.wape": ("Best model error (WAPE)", f"{S['models'][0]['wape']}% · {S['models'][0]['model']}"),
        "store.next_week": ("Next 7 days", money(k.get("forecast_7d", 0))),
        "store.segments": ("Product segments", str(len(S["segments"]))),
        "store.order_value": ("Suggested orders", money(sum(r.get("value", 0) for r in S["reorder"]))),
        "store.order_now": ("Below lead-time cover", str(sum(str(r.get("status", "")).startswith("Order now") for r in S["reorder"]))),
        "store.hours": ("Hours next 7 days", f"{sum(r['hours'] for r in S['roster']):.0f}"),
        "store.exceptions": ("Exceptions this week", str(len(S["exceptions"]))),
        "store.waste_pct": ("Waste + markdown", f"{k['waste_pct']}% of sales"),
        "store.recalls": ("Open recalls", str(len(S["recalls"]))),
        "store.delivery_share": ("Delivery share", f"{k['delivery_pct']}%"),
        "store.budget_3m": ("3-month budget", money(b3k.get("Budget", 0))),
        "store.gap_3m": ("Forecast vs budget", money(b3k.get("Gap to budget", 0))),
        "totara.escalations": ("Judgements for a person", str(len(T["escalate"]))),
        "totara.wape": ("Forecast error", f"{tk['fc_wape'] * 100:.0f}% (naive {tk['fc_wape_naive'] * 100:.0f}%)"),
        "totara.at_risk": ("SKUs needing action", f"{tk['at_risk_skus']}/{tk['skus']}"),
        "totara.expiry_risk": ("Unsold by expiry", money(tk["expiry_at_risk_value"])),
        "totara.otif": ("Supplier OTIF 90d", f"{tk['otif_90'] * 100:.0f}%"),
        "totara.inbound": ("Inbound pipeline", f"{money(tk['inbound_value'])} · {tk['inbound_pos']} POs"),
        "totara.holds": ("Clearance holds", str(tk["holds"])),
        "totara.vs_plan": ("Sales vs plan 12 wks", f"{T['vision']['total']['ach'] * 100:.1f}%"),
        "group.reports": ("Report types", str(len(R.get("catalog", [])) or 11)),
        "group.pending": ("Approvals waiting", str(len(S.get("decisions", [])) + len(T["escalate"]))),
    }

    # ---- one approvals queue across the businesses, each item owned by an agent
    def owner(dec):
        if dec.get("pack", "retail") != "retail":
            return "group-" + dec["pack"]
        for a in AGENTS:
            if a.business == "store" and dec["area"] in a.decision_areas:
                return a.id
        return "store-briefing"

    def t_owner(e):
        return {"Stock-out risk": "totara-stock", "Expiry": "totara-stock"}.get(e["kind"], "totara-brief")

    items = []
    for d in S.get("decisions", []):
        biz = "store" if d.get("pack", "retail") == "retail" else "group"
        items.append({"key": "s:" + d["id"], "source": "store", "id": d["id"], "business": biz, "agent": owner(d),
                      "area": d["area"], "title": d["statement"], "text": f"{d.get('pack', 'retail').title()} · confidence {round((d.get('confidence') or 0) * 100)}%",
                      "impact": d.get("impact_nzd"), "link": "index.html#s-dec"})
    for i, e in enumerate(T["escalate"]):
        items.append({"key": f"t:{i}", "source": "totara", "id": i, "business": "totara", "agent": t_owner(e), "area": e["kind"],
                      "title": e["title"], "text": e["text"], "impact": None, "link": "supply-chain/#esc"})
    approvals = {"generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "store_asof": m["asof"], "items": items}

    agents = []
    for a in AGENTS:
        d = asdict(a)
        d["live"] = [{"label": live[x][0], "value": live[x][1]} for x in a.kpis if x in live]
        d["pending"] = sum(1 for it in items if it["agent"] == a.id)
        d["skill_info"] = [{"name": s, "summary": skills[s].summary, "confirm": skills[s].confirm} if s in skills
                           else {"name": s, "summary": "Engine / service (not a registered skill)", "confirm": False} for s in a.skills]
        d["status"] = "waiting" if d["pending"] else ("attention" if a.escalates_when and a.autonomy != "auto" else "ok")
        agents.append(d)
    deps = [asdict(x) for x in DEPARTMENTS]
    stats = {"agents": len(agents), "departments": len(deps), "businesses": len(BUSINESSES), "skills": len(skills),
             "pending": len(items), "auto": sum(a.autonomy == "auto" for a in AGENTS),
             "suggest": sum(a.autonomy == "suggest" for a in AGENTS), "approve": sum(a.autonomy == "approve" for a in AGENTS)}
    brain = {"generated": approvals["generated"], "version": __version__, "autonomy": AUTONOMY, "core": CORE,
             "businesses": BUSINESSES, "departments": deps, "agents": agents, "stats": stats,
             "store_asof": m["asof_label"], "totara_asof": T["generated"]}
    (ROOT / "docs/data").mkdir(exist_ok=True)
    (ROOT / "docs/data/brain.js").write_text("window.SHELLY_BRAIN = " + json.dumps(brain, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (ROOT / "docs/data/approvals.js").write_text("window.SHELLY_APPROVALS = " + json.dumps(approvals, ensure_ascii=False, separators=(",", ":")) + ";\n")

    # ---- page
    from business_switch import switch_html
    out = ROOT / "docs/brain"
    out.mkdir(exist_ok=True)
    tpl = (ROOT / "scripts/brain_page.html").read_text()
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "brain")))
    print(f"Brain: {stats['agents']} agents in {stats['departments']} departments, {stats['pending']} approvals -> docs/brain/")


if __name__ == "__main__":
    main()
