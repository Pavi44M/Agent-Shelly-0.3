"""
CRISP-DM Phase 4 (Modelling) + Phase 5 (Evaluation) for demand forecasting.

Five competing models per category, the same line-up used in the MAB thesis:
  Naive, Seasonal Naive (weekly), Drift, SARIMA-X (weekly seasonal, holiday exog), XGBoost
Evaluated by rolling-origin backtest (WAPE / MAPE). The best model per category
is chosen on evidence, not assumed - a simple baseline is allowed to win.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

from .calendar_nz import holiday_flags

warnings.filterwarnings("ignore")

MODELS = ["Naive", "Seasonal Naive", "Drift", "SARIMA-X", "XGBoost"]


# ---------------------------------------------------------------- baselines
def _naive(y: pd.Series, h: int) -> np.ndarray:
    return np.repeat(y.iloc[-1], h)


def _snaive(y: pd.Series, h: int, m: int = 7) -> np.ndarray:
    last = y.iloc[-m:].values
    return np.array([last[i % m] for i in range(h)])


def _drift(y: pd.Series, h: int) -> np.ndarray:
    slope = (y.iloc[-1] - y.iloc[0]) / max(len(y) - 1, 1)
    return y.iloc[-1] + slope * np.arange(1, h + 1)


# ---------------------------------------------------------------- SARIMA-X
def _sarimax(y: pd.Series, h: int) -> np.ndarray:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    y = y.iloc[-364:]  # one year keeps it fast and stable
    future = pd.date_range(y.index[-1] + pd.Timedelta(days=1), periods=h, freq="D")
    x_hist, x_fut = holiday_flags(y.index), holiday_flags(future)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = SARIMAX(y.values, exog=x_hist, order=(1, 0, 1), seasonal_order=(1, 1, 1, 7),
                          enforce_stationarity=False,
                          enforce_invertibility=False).fit(disp=False, maxiter=100)
        fc = res.forecast(h, exog=x_fut)
        if not np.all(np.isfinite(fc)):
            raise ValueError("non-finite forecast")
        return np.clip(fc, 0, None)
    except Exception:  # numerical instability -> fall back (a lesson from the thesis)
        return _snaive(y, h)


# ---------------------------------------------------------------- XGBoost
def _features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["dow"] = d["date"].dt.dayofweek
    doy = d["date"].dt.dayofyear
    d["doy_sin"], d["doy_cos"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    d["holiday"] = holiday_flags(pd.DatetimeIndex(d["date"])).ravel()
    g = d.groupby("category")["y"]
    # lags >= 7 so a 7-day horizon needs no recursive predictions
    for lag in (7, 14, 21, 28):
        d[f"lag{lag}"] = g.shift(lag)
    d["roll7_lag7"] = g.transform(lambda s: s.shift(7).rolling(7).mean())
    d["roll28_lag7"] = g.transform(lambda s: s.shift(7).rolling(28).mean())
    d["cat_code"] = d["category"].astype("category").cat.codes
    return d


FEATS = ["dow", "doy_sin", "doy_cos", "holiday", "lag7", "lag14", "lag21", "lag28",
         "roll7_lag7", "roll28_lag7", "cat_code"]


def _xgb_all(panel: pd.DataFrame, cutoff: pd.Timestamp, h: int) -> dict[str, np.ndarray]:
    """One global XGBoost model across categories (pooled learning)."""
    from xgboost import XGBRegressor

    cats = sorted(panel["category"].unique())
    future = pd.date_range(cutoff + pd.Timedelta(days=1), periods=h, freq="D")
    hist = panel[panel["date"] <= cutoff]
    fut = pd.DataFrame([(d, c, np.nan) for c in cats for d in future], columns=["date", "category", "y"])
    full = _features(pd.concat([hist, fut]).sort_values(["category", "date"]))
    train = full[(full["date"] <= cutoff)].dropna(subset=FEATS + ["y"])
    model = XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9,
                         colsample_bytree=0.9, random_state=42, n_jobs=2)
    model.fit(train[FEATS], train["y"])
    test = full[full["date"] > cutoff]
    test = test.assign(pred=np.clip(model.predict(test[FEATS]), 0, None))
    return {c: test[test["category"] == c].sort_values("date")["pred"].values for c in cats}


# ---------------------------------------------------------------- run
def _predict_all(panel: pd.DataFrame, cutoff: pd.Timestamp, h: int) -> dict:
    out: dict[str, dict[str, np.ndarray]] = {}
    xgb = _xgb_all(panel, cutoff, h)
    for cat, g in panel[panel["date"] <= cutoff].groupby("category"):
        y = g.set_index("date")["y"].asfreq("D").fillna(0)
        out[cat] = {"Naive": _naive(y, h), "Seasonal Naive": _snaive(y, h), "Drift": _drift(y, h),
                    "SARIMA-X": _sarimax(y, h), "XGBoost": xgb[cat]}
    return out


def wape(actual, pred) -> float:
    a = np.asarray(actual, float)
    return float(np.abs(a - pred).sum() / max(a.sum(), 1e-9) * 100)


def mape(actual, pred) -> float:
    a = np.asarray(actual, float)
    m = a > 0
    return float(np.mean(np.abs((a[m] - np.asarray(pred)[m]) / a[m])) * 100) if m.any() else np.nan


def run_forecasting(daily_cat: pd.DataFrame, asof: pd.Timestamp, horizon: int = 7,
                    backtest_days: int = 28) -> dict:
    """Rolling-origin backtest, pick best model per category, then forecast forward."""
    panel = daily_cat.rename(columns={"net_sales": "y"})[["date", "category", "y"]]
    folds = backtest_days // horizon
    records = []
    for f in range(folds, 0, -1):
        cutoff = asof - pd.Timedelta(days=horizon * f)
        preds = _predict_all(panel, cutoff, horizon)
        actual_win = panel[(panel["date"] > cutoff) & (panel["date"] <= cutoff + pd.Timedelta(days=horizon))]
        for cat, models in preds.items():
            act = actual_win[actual_win["category"] == cat].sort_values("date")["y"].values
            for name, p in models.items():
                records.append({"fold": folds - f + 1, "category": cat, "model": name,
                                "wape": wape(act, p), "mape": mape(act, p),
                                "actual": act.sum(), "abs_err": np.abs(act - p).sum()})
    bt = pd.DataFrame(records)

    by_cat = bt.groupby(["category", "model"]).agg(abs_err=("abs_err", "sum"), actual=("actual", "sum"),
                                                   mape=("mape", "mean")).reset_index()
    by_cat["wape"] = by_cat["abs_err"] / by_cat["actual"] * 100
    best = by_cat.loc[by_cat.groupby("category")["wape"].idxmin(), ["category", "model", "wape"]]
    overall = by_cat.groupby("model").agg(abs_err=("abs_err", "sum"), actual=("actual", "sum"),
                                          mape=("mape", "mean")).reset_index()
    overall["wape"] = overall["abs_err"] / overall["actual"] * 100
    overall = overall.sort_values("wape")[["model", "wape", "mape"]]

    final = _predict_all(panel, asof, horizon)
    future = pd.date_range(asof + pd.Timedelta(days=1), periods=horizon, freq="D")
    rows = []
    for _, b in best.iterrows():
        vals = final[b["category"]][b["model"]]
        for d, v in zip(future, vals):
            rows.append({"date": d, "category": b["category"], "forecast_sales": float(v),
                         "model": b["model"], "backtest_wape": b["wape"]})
    fc = pd.DataFrame(rows)
    return {"forecast": fc, "best_by_category": best, "model_leaderboard": overall,
            "backtest_detail": by_cat}
