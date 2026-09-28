"""
Shelly v0.1 - retail sales digest agent. Orchestrates the CRISP-DM cycle end to end.

    python -m shelly.agent --data data/sample
    python -m shelly.agent --data data/real --asof 2026-09-28 --llm ollama

Phase 1 Business understanding  config.yaml (objectives, KPI targets, thresholds)
Phase 2 Data understanding      data.profile_quality
Phase 3 Data preparation        data.prepare (column mapping for real exports)
Phase 4 Modelling               forecasting, anomalies, segmentation, replenishment, labour
Phase 5 Evaluation              rolling-origin backtest, silhouette, bootstrap Jaccard
Phase 6 Deployment              HTML / Markdown / WhatsApp digest + Excel, SQL, Power BI, Tableau
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import yaml

from . import __version__, exports, insights, report, strategist
from .data import load_raw, prepare, profile_quality
from .forecasting import run_forecasting

ROOT = Path(__file__).resolve().parent.parent


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def run(data_dir: str, out_dir: str = "outputs", asof: str | None = None, config: str = "config.yaml",
        llm: str | None = None) -> dict:
    t0 = time.time()
    cfg = yaml.safe_load(open(ROOT / config if not Path(config).is_absolute() else config))
    if llm:
        cfg["llm"]["provider"] = llm
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    log(f"Shelly v{__version__} starting"); log("Phase 1  Business understanding: " + "; ".join(cfg["business_objectives"]))
    raw = load_raw(data_dir, cfg["column_map"])
    quality = profile_quality(raw)
    log(f"Phase 2  Data understanding: quality score {quality.score:.0f}/100, {len(quality.issues)} findings")
    P = prepare(raw, asof)
    log(f"Phase 3  Data preparation: {len(P.sales):,} clean rows, as-of {P.asof:%Y-%m-%d}")

    a = cfg["analysis"]
    R: dict = {}
    R["commercial"] = insights.commercial(P, cfg)
    R["forecast"] = run_forecasting(P.daily_cat, P.asof, a["forecast_horizon_days"], a["backtest_days"])
    R["anomalies"] = insights.anomalies(P, cfg)
    R["segments"] = insights.segmentation(P, cfg)
    R["assortment"] = insights.assortment(P, R["segments"])
    R["replenishment"] = insights.replenishment(P, cfg)
    R["labour"] = insights.labour_plan(R["forecast"]["forecast"], cfg)
    R["compliance"] = insights.compliance(P, cfg, R["replenishment"])
    # never reorder a recalled product
    rc = R["compliance"]["recalls"]
    if len(rc):
        blocked = R["replenishment"]["sku"].isin(rc["sku"])
        R["replenishment"].loc[blocked, ["suggested_order", "order_value"]] = 0
        R["replenishment"].loc[blocked, "status"] = "Blocked - product recall"
    log(f"Phase 4  Modelling: 5 forecast models x {P.daily_cat['category'].nunique()} categories, "
        f"{len(R['anomalies'])} exceptions, {R['segments']['k']} segments")
    lb = R["forecast"]["model_leaderboard"].iloc[0]
    log(f"Phase 5  Evaluation: best model {lb['model']} (WAPE {lb['wape']:.1f}%), "
        f"silhouette {max(R['segments']['silhouette'].values()):.2f}")

    acts = strategist.build_actions(R, cfg)
    summary, engine = strategist.llm_summary(R, acts, cfg)
    log(f"Reasoning: {len(acts)} actions ({sum(x['priority'] == 'P1' for x in acts)} for today), summary by {engine}")

    stamp = P.asof.strftime("%Y-%m-%d")
    files = {
        "html": out / f"digest_{stamp}.html",
        "markdown": out / f"digest_{stamp}.md",
        "whatsapp": out / f"whatsapp_{stamp}.txt",
        "actions": out / f"actions_{stamp}.json",
    }
    files["html"].write_text(report.render_html(P, R, cfg, acts, summary, engine, quality))
    files["markdown"].write_text(report.render_markdown(P, R, cfg, acts, summary))
    files["whatsapp"].write_text(report.render_whatsapp(P, R, acts))
    files["actions"].write_text(json.dumps(acts, indent=2, default=str))

    db, sql_res = exports.build_warehouse(P, out)
    files["sqlite"] = db
    files["excel"] = exports.export_excel(P, R, sql_res, out / f"Weekly_Sales_Digest_{stamp}.xlsx")
    files["powerbi"] = exports.export_powerbi(P, R, out)
    files["tableau"] = exports.export_tableau(P, R, out)
    # model artefacts for independent validation in R
    R["segments"]["sku_segments"].to_csv(out / "segment_features.csv", index=False)
    R["forecast"]["backtest_detail"].to_csv(out / "backtest_detail.csv", index=False)
    P.daily_cat.to_csv(out / "daily_category_sales.csv", index=False)
    log(f"Phase 6  Deployment: digest + Excel + SQLite + Power BI + Tableau written to {out}/ "
        f"({time.time() - t0:.0f}s)")
    return {"files": files, "actions": acts, "summary": summary, "results": R, "prepared": P}


def main() -> None:
    ap = argparse.ArgumentParser(description="Shelly v0.1 - retail sales digest agent")
    ap.add_argument("--data", default="data/sample", help="folder with sales/products/inventory/waste/recalls")
    ap.add_argument("--out", default="outputs")
    ap.add_argument("--asof", default=None, help="last day to report on (YYYY-MM-DD); default = latest in data")
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--llm", choices=["rules", "ollama", "anthropic"], default=None)
    a = ap.parse_args()
    res = run(a.data, a.out, a.asof, a.config, a.llm)
    print("\n" + res["summary"])
    print("\n" + Path(res["files"]["whatsapp"]).read_text())


if __name__ == "__main__":
    main()
