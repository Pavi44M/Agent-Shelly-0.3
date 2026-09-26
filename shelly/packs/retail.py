"""Retail / convenience grocery pack: wraps the v0.1-v0.2 pipeline as individual skills."""
from __future__ import annotations

from ..core.skills import skill

TRIG = {
    "retail.weekly_digest": ["weekly sales digest", "how did the store trade?"],
    "retail.forecast": ["forecast next week", "which model is best?"],
    "retail.anomalies": ["anything unusual?", "stock-outs, spikes, shrinkage"],
    "retail.reorder": ["what should I order?", "reorder list"],
    "retail.roster": ["how many hours should I roster?"],
    "retail.compliance": ["any recalls?", "barcode problems"],
    "retail.segments": ["product segments", "k-means"],
    "retail.range_review": ["what should we delist?", "ABC range review"],
}


def _prep(data_dir="data/sample", cfg=None):
    import yaml

    from ..agent import ROOT
    from ..data import load_raw, prepare
    cfg = cfg or yaml.safe_load(open(ROOT / "config.yaml"))
    return prepare(load_raw(data_dir, cfg["column_map"])), cfg


@skill("retail.weekly_digest", pack="retail", summary="Full CRISP-DM weekly run: KPIs, forecasts, exceptions, actions and all outputs",
       inputs=["store exports folder"], outputs=["digest, Excel, SQL, Power BI, Tableau, web data, run report"], confirm=True,
       triggers=TRIG["retail.weekly_digest"])
def weekly_digest(data_dir="data/sample"):
    from ..agent import run
    return run(data_dir)


@skill("retail.forecast", pack="retail", summary="Five-model category forecast with rolling-origin backtest",
       inputs=["sales"], outputs=["7-day forecast", "model leaderboard"], triggers=TRIG["retail.forecast"])
def forecast(data_dir="data/sample"):
    from ..forecasting import run_forecasting
    P, cfg = _prep(data_dir)
    return run_forecasting(P.daily_cat, P.asof, cfg["analysis"]["forecast_horizon_days"], cfg["analysis"]["backtest_days"])


@skill("retail.anomalies", pack="retail", summary="Robust z-score exceptions: stock-outs, spikes, outages, shrinkage, waste",
       inputs=["sales", "inventory", "waste"], outputs=["exceptions table"], triggers=TRIG["retail.anomalies"])
def anomalies(data_dir="data/sample"):
    from .. import insights
    from ..core import learning
    P, cfg = _prep(data_dir)
    return insights.anomalies(P, learning.apply_to_config(cfg))


@skill("retail.reorder", pack="retail", summary="JIT reorder points, safety stock and suggested orders (shelf-life capped)",
       inputs=["sales", "inventory"], outputs=["reorder list"], confirm=True, triggers=TRIG["retail.reorder"])
def reorder(data_dir="data/sample"):
    from .. import insights
    P, cfg = _prep(data_dir)
    return insights.replenishment(P, cfg)


@skill("retail.roster", pack="retail", summary="Labour hours from forecast sales and productivity target",
       inputs=["forecast"], outputs=["roster plan"], triggers=TRIG["retail.roster"])
def roster(data_dir="data/sample"):
    from .. import insights
    fc = forecast(data_dir)
    _, cfg = _prep(data_dir)
    return insights.labour_plan(fc["forecast"], cfg)


@skill("retail.compliance", pack="retail", summary="GS1 check digits, recall matching, liquor-by-delivery watch",
       inputs=["products", "recalls", "sales"], outputs=["compliance findings"], triggers=TRIG["retail.compliance"])
def compliance(data_dir="data/sample"):
    from .. import insights
    P, cfg = _prep(data_dir)
    return insights.compliance(P, cfg, insights.replenishment(P, cfg))


@skill("retail.segments", pack="retail", summary="K-means + PCA product segmentation with bootstrap stability",
       inputs=["sales", "waste"], outputs=["segments"], triggers=TRIG["retail.segments"])
def segments(data_dir="data/sample"):
    from .. import insights
    P, cfg = _prep(data_dir)
    return insights.segmentation(P, cfg)


@skill("retail.range_review", pack="retail", summary="ABC/Pareto × segment range review (delist / protect proposals)",
       inputs=["sales", "segments"], outputs=["range actions"], confirm=True, triggers=TRIG["retail.range_review"])
def range_review(data_dir="data/sample"):
    from .. import insights
    P, cfg = _prep(data_dir)
    return insights.assortment(P, insights.segmentation(P, cfg))
