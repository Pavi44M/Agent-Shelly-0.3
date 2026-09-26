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

    elif a.cmd == "connectors":
        from .core.connectors import build
        for name, c in build(_cfg().get("connectors", [])).items():
            ok, msg = c.health()
            print(f"{'✓' if ok else '✗'} {name:15s} {c.kind:12s} {msg}")


if __name__ == "__main__":
    main()
