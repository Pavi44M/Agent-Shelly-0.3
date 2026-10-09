"""Shelly command line.

    python -m shelly run [--data data/sample]         full weekly run (retail pack) + decisions + learning + audit
    python -m shelly skills                            list every skill
    python -m shelly skills export                     write skills/<name>/SKILL.md for OpenJarvis / agentskills.io
    python -m shelly pack electronics|wholesale|warehousing|production   run a pack on demo data -> report
    python -m shelly decisions                         what's waiting for your confirmation
    python -m shelly decisions confirm D-1234abcd --note "done"
    python -m shelly decisions reject  D-1234abcd --note "false alarm, promo week"
    python -m shelly decisions import shelly-decisions.json   (exported from the web app)
    python -m shelly learn                             what Shelly has learned so far
    python -m shelly connectors                        connector health check
    python -m shelly ask "what do I need to order?"    relevance check: which skill, or which agent to connect
    python -m shelly check --data path/to/exports      data check: what Shelly found, how columns were matched
    python -m shelly brain                             the Shelly Brain org: businesses, departments, agents, autonomy
    python -m shelly brain ask "which medical products will run out?"   which department agent takes it
    python -m shelly store [--web docs/data/shelly-data.js]   walk the store floor: every shelf, worst first
    python -m shelly gateway                           Gateway Warehousing & Transport: sites, clients, service and flags
    python -m shelly tower                             Shelly Tower: every floor, tenants, floors to let and flags
    python -m shelly live path/to/pos_export.csv [--watch 60]   live POS feed for the Store Floor (docs/data/live.json, never published)
    python -m shelly report all [--data ...] [--pdf]   every report: Excel (dashboard, model, pivots, raw, lookups) + web page (+ PDF)
    python -m shelly report budget --months 6 --category Dairy --pdf --theme light,present
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def _cfg():
    return yaml.safe_load(open(ROOT / "config.yaml"))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="shelly", description="Shelly: analytics agent with human-in-the-loop governance")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run"); r.add_argument("--data", default="data/sample"); r.add_argument("--asof"); r.add_argument("--llm")
    s = sub.add_parser("skills"); s.add_argument("action", nargs="?", default="list", choices=["list", "export"])
    p = sub.add_parser("pack"); p.add_argument("name", choices=["electronics", "wholesale", "warehousing", "production"])
    d = sub.add_parser("decisions"); d.add_argument("action", nargs="?", default="list", choices=["list", "confirm", "reject", "import", "all"])
    d.add_argument("target", nargs="?"); d.add_argument("--note", default="")
    sub.add_parser("learn"); sub.add_parser("connectors")
    k = sub.add_parser("ask"); k.add_argument("text")
    c = sub.add_parser("check"); c.add_argument("--data", default="data/sample")
    lv = sub.add_parser("live"); lv.add_argument("source"); lv.add_argument("--watch", type=int, default=0); lv.add_argument("--out")
    br = sub.add_parser("brain"); br.add_argument("action", nargs="?", default="org", choices=["org", "ask"]); br.add_argument("text", nargs="?")
    sub.add_parser("gateway")
    sub.add_parser("tower")
    sf = sub.add_parser("store"); sf.add_argument("--web", default=str(ROOT / "docs/data/shelly-data.js"))
    rp = sub.add_parser("report"); rp.add_argument("which", nargs="?", default="all")
    rp.add_argument("--data", default="data/sample"); rp.add_argument("--asof"); rp.add_argument("--out", default="outputs/reports")
    rp.add_argument("--category", default="All"); rp.add_argument("--months", type=int); rp.add_argument("--weeks", type=int)
    rp.add_argument("--pdf", action="store_true"); rp.add_argument("--theme", default="light", help="light,dark,present (comma list)")
    rp.add_argument("--no-values", action="store_true", help="skip LibreOffice cached values (Excel recalculates on open)")
    a = ap.parse_args(argv)

    if a.cmd == "run":
        from .agent import run
        res = run(a.data, str(ROOT / "outputs"), a.asof, llm=a.llm)
        print("\n" + res["summary"])
        print(f"\n{len(res['pending'])} decisions waiting: python -m shelly decisions")

    elif a.cmd == "skills":
        from .core.skills import export_skill_files, load_all
        if a.action == "export":
            paths = export_skill_files(ROOT / "skills")
            print(f"Wrote {len(paths)} SKILL.md files + skills/INDEX.md")
        else:
            for sk in sorted(load_all().values(), key=lambda s: (s.pack, s.name)):
                print(f"{sk.name:38s} {'[confirm] ' if sk.confirm else '          '}{sk.summary}")

    elif a.cmd == "pack":
        from .core.decisions import DecisionLog, propose_from_actions
        from .core.skills import load_all
        from .packs import pack_markdown, run_pack
        load_all()
        res = run_pack(a.name)
        log = DecisionLog()
        decs = propose_from_actions(log, [f.as_action() for f in res["findings"]], date.today().isoformat(),
                                    _cfg().get("governance", {}), pack=a.name)
        out = ROOT / "reports" / "packs"
        out.mkdir(parents=True, exist_ok=True)
        path = out / f"{a.name}_{date.today():%Y-%m-%d}.md"
        path.write_text(pack_markdown(res, decs))
        print(f"{res['title']}: {len(res['findings'])} findings, "
              f"{sum(d.get('status') == 'pending' for d in decs)} need confirmation -> {path}")

    elif a.cmd == "decisions":
        from .core.decisions import DecisionLog
        log = DecisionLog()
        if a.action in ("confirm", "reject"):
            ev = log.decide(a.target, "confirmed" if a.action == "confirm" else "rejected", a.note)
            print(f"{a.target} {ev['status']}. Shelly will learn from this on the next run.")
        elif a.action == "import":
            print(f"Applied {log.import_web_file(a.target)} decisions from {a.target}")
        else:
            df = log.state() if a.action == "all" else log.pending()
            if not len(df):
                print("Nothing waiting for you.")
            for r in df.itertuples():
                print(f"{r.id}  [{r.status:9s}] {r.pack:11s} {r.area:18s} {r.impact_nzd:+9,.0f}  {str(r.statement)[:90]}")

    elif a.cmd == "learn":
        from .core import learning
        s = learning.load()
        print("Thresholds:", json.dumps(s["knobs"]))
        print("Rule precision:", json.dumps(s["rules"], indent=1))
        for m, h in s["model_error"].items():
            print(f"  {m:15s} running WAPE {h['ewma']}  ({len(h['history'])} runs)")
        for c in s["changes"][-10:]:
            print(f"  {c['at']}  {c['knob']}: {c['from']} -> {c['to']}  ({c['reason']})")

    elif a.cmd == "ask":
        from .core.router import route
        r = route(a.text)
        print(f"In scope → skill {r.skill} (match {r.score})" if r.in_scope else f"Out of scope ({r.kind}). {r.advice}")

    elif a.cmd == "tower":
        from .tower import build, text
        print(text(build()))
    elif a.cmd == "gateway":
        from .gateway import build, text
        print(text(build()))
    elif a.cmd == "store":
        from .storefloor import build_floor, floor_text, read_web_data
        web = Path(a.web)
        if not web.exists():
            print(f"No weekly data at {web}. Run: python scripts/build_site.py")
            return
        print(floor_text(build_floor(read_web_data(web))))

    elif a.cmd == "live":
        from .live import OUT, run as live_run
        live_run(a.source, Path(a.out) if a.out else OUT, a.watch)
        print("Open the floor with ?live=1  (cd docs && python -m http.server, then http://localhost:8000/store/?live=1)")
    elif a.cmd == "brain":
        from .brain import AGENTS, BUSINESSES, DEPARTMENTS, ask
        if a.action == "ask":
            r = ask(a.text or "")
            if not r["in_scope"]:
                print("Outside Shelly's skills:", r.get("advice"))
            elif not r.get("agent"):
                print(r["advice"])
            else:
                print(f"→ {r['agent_name']} · {r['department']} · {r['business']} · autonomy: {r['autonomy']} · answers to {r['owner']}"
                      + (f" · skill {r['skill']}" if r.get("skill") else ""))
        else:
            for b in BUSINESSES:
                print(f"\n{b['icon']} {b['name']} — {b['kind']}")
                for d in [d for d in DEPARTMENTS if d.business == b["id"]]:
                    print(f"  {d.name} (head: {d.head})")
                    for ag in [x for x in AGENTS if x.department == d.id]:
                        print(f"    · {ag.name:24s} [{ag.autonomy:7s}] {', '.join(ag.skills)}")

    elif a.cmd == "check":
        from . import ingest
        cfg = _cfg()
        src = Path(a.data)
        tables, maps = ingest.load_folder(src, cfg.get("column_map", {}) if not (src / "sales.csv").exists() else {}, cfg.get("source", {}))
        rep = ingest.check_report(tables, maps)
        out = ROOT / "reports" / "data_check.md"
        out.parent.mkdir(exist_ok=True)
        out.write_text(rep)
        print(rep)
        print(f"Saved: {out}")

    elif a.cmd == "report":
        import contextlib
        import io
        from . import __version__
        from .agent import run
        from .reports import build as B
        from .reports.context import Ctx
        from .reports.pdf import export, stage_viewer
        print(f"Running the pipeline on {a.data} ...")
        with contextlib.redirect_stdout(io.StringIO()):
            res = run(a.data, str(ROOT / "outputs"), a.asof)
        cfg = _cfg()
        ctx = Ctx(res["prepared"], res["results"], cfg, res["actions"], res["summary"], __version__,
                  cfg["store"]["name"], synthetic=Path(a.data).resolve() == (ROOT / "data/sample").resolve())
        types = None if a.which == "all" else [a.which if not a.which in ("electronics", "wholesale", "warehousing", "production") else "pack-" + a.which]
        out = Path(a.out) if Path(a.out).is_absolute() else ROOT / a.out
        (out / "data").mkdir(parents=True, exist_ok=True)
        r = B.build_all(ctx, out / "reports", xlsx=True, with_cache=not a.no_values, only=types)
        B.write_web_bundle(r, out / "data" / "shelly-reports.js")
        stage_viewer(out)
        print(f"Excel: {out / 'reports'}")
        print(f"Report page: {out / 'report.html'}  (open it in a browser; Print / Dark / Present, Save as PDF)")
        if a.pdf:
            t = a.which if a.which != "all" else None
            ids = [sid for sid, sp in r["specs"].items() if (t is None and sp["category"] == "All" and (sp.get("horizon") in (None, 3, 13)))
                   or (t and (sp["type"] == t or sid == "pack-" + t) and sp["category"] == a.category
                       and (sp.get("horizon") is None or sp["horizon"] == (a.months or a.weeks or sp["horizon"])))]
            if a.which == "budget" and a.months:
                ids = [i for i in ids if f"-{a.months}m-" in i] or ids
            pdfs = export(out, ids, themes=tuple(a.theme.split(",")))
            for f in pdfs:
                print("PDF:", f)

    elif a.cmd == "connectors":
        from .core.connectors import build
        for name, c in build(_cfg().get("connectors", [])).items():
            ok, msg = c.health()
            print(f"{'✓' if ok else '✗'} {name:15s} {c.kind:12s} {msg}")


if __name__ == "__main__":
    main()
