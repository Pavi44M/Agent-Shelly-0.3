"""
Validation & audit reports: every run leaves a record you can check.

reports/<run_id>/run_report.md + run_report.json contain:
  - exactly which data (SHA-256 per input file), config and code version were used
  - automated validation checks (PASS / WARN / FAIL) with the numbers behind them
  - model accuracy, decisions proposed and still pending, and learning changes
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def checks(P, R, quality, cfg) -> list[dict]:
    out = []

    def add(name, ok, detail, warn=False):
        out.append({"check": name, "result": "PASS" if ok else ("WARN" if warn else "FAIL"), "detail": detail})

    days_old = (datetime.now() - P.asof.to_pydatetime()).days
    add("Data is fresh", days_old <= 8, f"latest date {P.asof:%Y-%m-%d} ({days_old} days old)", warn=True)
    add("Data quality ≥ 80/100", quality.score >= 80, f"score {quality.score:.0f}", warn=True)
    lb = R["forecast"]["model_leaderboard"].set_index("model")
    best = lb["wape"].min()
    sn = lb.loc["Seasonal Naive", "wape"]
    add("Chosen forecast beats or equals seasonal-naive baseline", best <= sn + 1e-9,
        f"best WAPE {best:.1f}% vs baseline {sn:.1f}%")
    add("Forecast error acceptable (WAPE < 25%)", best < 25, f"{best:.1f}%", warn=True)
    rc = R["compliance"]["recalls"]
    if len(rc):
        rp = R["replenishment"].set_index("sku")
        blocked = all(rp.loc[s, "suggested_order"] == 0 for s in rc["sku"] if s in rp.index)
        add("Recalled products blocked from reorder", blocked, f"{len(rc)} recall(s)")
    seg = R["segments"]["profile"]
    unstable = int((seg["jaccard_stability"] < 0.6).sum())
    add("Segments stable (Jaccard ≥ 0.6)", unstable == 0, f"{unstable} of {len(seg)} clusters unstable", warn=True)
    tot = R["commercial"]["kpis"]["current"]["sales"]
    cat_tot = R["commercial"]["category_pl"]["sales"].sum()
    add("Category P&L reconciles to total sales", abs(tot - cat_tot) < 1, f"{tot:,.2f} vs {cat_tot:,.2f}")
    return out


def write_run_report(*, P, R, quality, cfg, data_dir, files, decisions, pending, learning_changes, version) -> Path:
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    d = ROOT / "reports" / run_id
    d.mkdir(parents=True, exist_ok=True)
    inputs = {p.name: sha(p) for p in sorted(Path(data_dir).glob("*")) if p.suffix in (".csv", ".xlsx", ".xls")}
    cfg_hash = hashlib.sha256(json.dumps(cfg, sort_keys=True, default=str).encode()).hexdigest()[:16]
    ck = checks(P, R, quality, cfg)
    rep = {
        "run_id": run_id, "shelly_version": version, "asof": P.asof.strftime("%Y-%m-%d"),
        "inputs_sha256": inputs, "config_sha256": cfg_hash, "checks": ck,
        "models": R["forecast"]["model_leaderboard"].round(2).to_dict("records"),
        "decisions_proposed": len(decisions), "decisions_pending": len(pending),
        "learning_changes": learning_changes, "outputs": {k: str(v) for k, v in files.items()},
    }
    (d / "run_report.json").write_text(json.dumps(rep, indent=1, default=str))
    icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌"}
    md = [f"# Shelly run report {run_id}", "",
          f"- Version **{version}** · week ending **{rep['asof']}** · config `{cfg_hash}`", "",
          "## Validation checks", "", "| Check | Result | Detail |", "|---|---|---|"]
    md += [f"| {c['check']} | {icon[c['result']]} {c['result']} | {c['detail']} |" for c in ck]
    md += ["", "## Inputs (SHA-256, first 16)", ""] + [f"- `{k}` {v}" for k, v in inputs.items()]
    md += ["", "## Forecast models", "", "| Model | WAPE % | MAPE % |", "|---|---:|---:|"]
    md += [f"| {m['model']} | {m['wape']} | {m['mape']} |" for m in rep["models"]]
    md += ["", f"## Decisions: {len(decisions)} proposed by this run · **{len(pending)} waiting for your confirmation across all packs**", ""]
    md += [f"- `{r.id}` · {r.area} · {r.statement[:110]} (impact {r.impact_nzd:+,.0f})" for r in pending.itertuples()]
    md += ["", "## What Shelly learned this run", ""]
    md += [f"- **{c['knob']}**: {c['from']} → {c['to']}. {c['reason']}" for c in learning_changes] or ["- No threshold changes (not enough new feedback yet)."]
    (d / "run_report.md").write_text("\n".join(md) + "\n")
    return d / "run_report.md"
