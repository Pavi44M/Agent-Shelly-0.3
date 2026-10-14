"""Build docs/os/: Shelly OS (v2.0), the data model and the event bus every department shares.

Builds the model in memory from the published synthetic data, runs one day of the event bus
(detect -> agents react -> approval check) and writes docs/data/os.js + docs/os/index.html.

    python scripts/build_os.py [--db outputs/shelly.db]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "docs/data/os.js"


def build(db=":memory:") -> dict:
    from shelly import __version__
    from shelly.os.model import TABLES, build as build_model, counts
    from shelly.os.bus import AG, BIZ, run_day, summary
    con = build_model(db)
    bus = run_day(con)
    n = counts(con)
    tables = [{"name": t, "what": d, "rows": n[t], "cols": [c.strip().split(" ")[0] for c in cols.split(",")]} for t, (d, cols) in TABLES.items()]
    ev, ac = bus.events(), bus.actions()
    by_ev = {}
    for a in ac:
        by_ev.setdefault(a["event_id"], []).append({"agent": a["agent"], "agent_name": AG[a["agent"]].name, "business": a["business"], "dept": a["dept"],
                                                    "action": a["action"], "amount": a["amount"], "needs": a["needs"], "status": a["status"]})
    events = [{"id": e["id"], "ts": e["ts"], "type": e["type"], "business": e["business"], "subject": e["subject"], "severity": e["severity"],
               "actions": by_ev.get(e["id"], [])} for e in ev]
    sev, order = {"high": 0, "med": 1, "low": 2}, {b: i for i, b in enumerate(BIZ)}
    events.sort(key=lambda e: (sev.get(e["severity"], 3), order.get(e["business"], 9), e["type"]))
    if db != ":memory:": con.commit()
    return {"version": __version__, "generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "businesses": BIZ, "tables": tables,
            "summary": summary(bus), "events": events,
            "kpis": [dict(r) for r in con.execute("SELECT * FROM kpis")]}


def main(argv=None):
    from business_switch import switch_html
    argv = argv if argv is not None else sys.argv[1:]
    db = argv[argv.index("--db") + 1] if "--db" in argv else ":memory:"
    d = build(db)
    OUT.write_text("window.SHELLY_OS = " + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    tpl = (ROOT / "modules/os/page.html").read_text(encoding="utf-8")
    out = ROOT / "docs/os"; out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(tpl.replace("{{SWITCH}}", switch_html("../", "os")), encoding="utf-8")
    s = d["summary"]
    print(f"Shelly OS: {len(d['tables'])} tables, {sum(t['rows'] for t in d['tables'])} rows, {s['events']} events, {s['actions']} actions "
          f"({s['on_their_own']} on their own, {s['waiting']} waiting, {s['cross_business']} across businesses) -> docs/os/")


if __name__ == "__main__":
    main()
