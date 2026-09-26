"""
CRISP-DM Phase 4 - analytical modules beyond forecasting.

commercial()      KPIs, category P&L, week-on-week and year-on-year variance,
                  price/volume/mix bridge, budget vs actual
anomalies()       robust z-score detection: SKU drops/spikes, channel outages,
                  sustained declines, waste blow-outs, SAP vs physical count variance
segmentation()    K-means + PCA on SKU behaviour, k chosen by silhouette,
                  bootstrap Jaccard stability (as in the Catchment Mission Fit study)
assortment()      ABC / Pareto range review
replenishment()   JIT reorder point, safety stock, suggested order quantities
labour_plan()     rostered hours from forecast sales (capacity & workload planning)
compliance()      GS1 GTIN check digits, product-recall match, liquor via delivery
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

DELIVERY = ("uber_eats", "on_demand")


def _window(df: pd.DataFrame, col: str, end: pd.Timestamp, days: int, offset: int = 0):
    hi = end - pd.Timedelta(days=offset)
    lo = hi - pd.Timedelta(days=days)
    return df[(df[col] > lo) & (df[col] <= hi)]


# ======================================================== commercial
def commercial(P, cfg) -> dict:
    n = cfg["analysis"]["digest_period_days"]
    s = P.sales
    cur, prev = _window(s, "date", P.asof, n), _window(s, "date", P.asof, n, n)
    ly = _window(s, "date", P.asof, n, 364)  # same weekdays last year

    def kpis(df, w=None):
        sales, cost = df["net_sales"].sum(), df["cost"].sum()
        waste_val = 0.0
        if w is not None and len(w):
            waste_val = w["waste_value"].sum() + w["markdown_value"].sum()
        return {
            "sales": sales, "units": df["units"].sum(), "gross_margin": sales - cost,
            "gm_pct": (sales - cost) / sales * 100 if sales else 0,
            "baskets_proxy": df.groupby(["date", "channel"]).ngroups,
            "delivery_share_pct": df[df["channel"].isin(DELIVERY)]["net_sales"].sum() / sales * 100 if sales else 0,
            "waste_value": waste_val,
            "waste_pct": waste_val / sales * 100 if sales else 0,
            "promo_share_pct": df[df["promo_flag"] == 1]["net_sales"].sum() / sales * 100 if sales else 0,
        }

    wcur = _window(P.waste, "date", P.asof, n) if P.waste is not None else None
    wprev = _window(P.waste, "date", P.asof, n, n) if P.waste is not None else None
    k = {"current": kpis(cur, wcur), "previous": kpis(prev, wprev), "last_year": kpis(ly)}
    k["wow_pct"] = (k["current"]["sales"] / k["previous"]["sales"] - 1) * 100
    k["yoy_pct"] = (k["current"]["sales"] / k["last_year"]["sales"] - 1) * 100
    budget = k["last_year"]["sales"] * (1 + cfg["budget"]["growth_vs_last_year_pct"] / 100)
    k["budget"] = budget
    k["vs_budget_pct"] = (k["current"]["sales"] / budget - 1) * 100

    # ---- category P&L
    def cat_pl(df, w):
        pl = df.groupby("category").agg(sales=("net_sales", "sum"), cogs=("cost", "sum"),
                                        units=("units", "sum"))
        if w is not None and len(w):
            ww = w.groupby("category")[["waste_value", "markdown_value"]].sum()
            pl = pl.join(ww, how="left")
        pl = pl.fillna(0)
        for c in ("waste_value", "markdown_value"):
            if c not in pl:
                pl[c] = 0.0
        pl["gross_margin"] = pl["sales"] - pl["cogs"]
        pl["gm_pct"] = pl["gross_margin"] / pl["sales"] * 100
        pl["contribution"] = pl["gross_margin"] - pl["waste_value"] - pl["markdown_value"]
        return pl

    pl = cat_pl(cur, wcur)
    pl_prev = cat_pl(prev, wprev)
    pl_ly = ly.groupby("category")["net_sales"].sum()
    pl["sales_prev"] = pl_prev["sales"]
    pl["wow_pct"] = (pl["sales"] / pl["sales_prev"] - 1) * 100
    pl["sales_ly"] = pl_ly
    pl["yoy_pct"] = (pl["sales"] / pl["sales_ly"] - 1) * 100
    pl["budget"] = pl["sales_ly"] * (1 + cfg["budget"]["growth_vs_last_year_pct"] / 100)
    pl["vs_budget"] = pl["sales"] - pl["budget"]
    pl = pl.sort_values("sales", ascending=False)

    # ---- price / volume / mix bridge (vs previous week)
    def sku_view(df):
        g = df.groupby("sku").agg(units=("units", "sum"), sales=("net_sales", "sum"))
        g["price"] = g["sales"] / g["units"]
        return g

    a, b = sku_view(cur), sku_view(prev)
    j = a.join(b, lsuffix="_c", rsuffix="_p", how="outer").fillna(0)
    tot_u_c, tot_u_p = j["units_c"].sum(), j["units_p"].sum()
    avg_p_p = j["sales_p"].sum() / tot_u_p
    volume = (tot_u_c - tot_u_p) * avg_p_p
    mix_c = j["units_c"] / tot_u_c
    price_p = j["price_p"].where(j["price_p"] > 0, j["price_c"])
    mix = ((mix_c * price_p).sum() - avg_p_p) * tot_u_c
    price = ((j["price_c"] - price_p) * j["units_c"]).sum()
    bridge = {"previous": j["sales_p"].sum(), "volume": volume, "mix": mix, "price": price,
              "current": j["sales_c"].sum()}

    # channel view
    ch = cur.groupby("channel")["net_sales"].sum()
    ch_prev = prev.groupby("channel")["net_sales"].sum()
    channels = pd.DataFrame({"sales": ch, "prev": ch_prev})
    channels["wow_pct"] = (channels["sales"] / channels["prev"] - 1) * 100

    daily = P.sales.groupby("date")["net_sales"].sum()
    return {"kpis": k, "category_pl": pl, "bridge": bridge, "channels": channels,
            "daily_sales": daily}


# ======================================================== anomalies
def _robust_z(x: float, hist: np.ndarray) -> float:
    med = np.median(hist)
    mad = np.median(np.abs(hist - med)) * 1.4826
    return (x - med) / max(mad, np.sqrt(max(med, 1)) * 0.5, 1e-6)


def anomalies(P, cfg) -> pd.DataFrame:
    a = cfg["analysis"]
    zt, min_u = a["anomaly_z_threshold"], a["min_units_for_anomaly"]
    spike_z, drop_z = a.get("spike_z", zt), a.get("drop_z", zt)          # tuned by the learning loop
    waste_mult, decline_ratio = a.get("waste_mult", 2.0), a.get("decline_ratio", 0.75)
    n = a["digest_period_days"]
    out = []
    ds = P.daily_sku.set_index("date")
    names = P.products.set_index("sku")
    price = names["unit_price"]

    # 1. SKU-day drops / spikes vs the same weekday over the previous 8 weeks
    for sku, g in ds.groupby("sku"):
        u = g["units"]
        for d in pd.date_range(P.asof - pd.Timedelta(days=n - 1), P.asof):
            hist = np.array([u.get(d - pd.Timedelta(weeks=w), np.nan) for w in range(1, 9)])
            hist = hist[~np.isnan(hist)]
            if len(hist) < 6 or np.median(hist) < min_u:
                continue
            z = _robust_z(u.get(d, 0), hist)
            gap_units = u.get(d, 0) - np.median(hist)
            if (z >= spike_z or z <= -drop_z) and abs(gap_units * price[sku]) >= a.get("min_impact_nzd", 0):
                kind = "Sales spike" if z > 0 else "Sales drop / possible stock-out"
                gap = (u.get(d, 0) - np.median(hist)) * price[sku]
                out.append({"date": d.date(), "type": kind, "item": names.loc[sku, "product_name"],
                            "sku": sku, "detail": f"{int(u.get(d, 0))} units vs usual {np.median(hist):.0f}",
                            "z": round(z, 1), "impact_nzd": round(gap, 0)})

    # 2. channel outages
    ch = P.sales.groupby(["date", "channel"])["net_sales"].sum().unstack(fill_value=0)
    for c in ch.columns:
        for d in pd.date_range(P.asof - pd.Timedelta(days=n - 1), P.asof):
            hist = np.array([ch[c].get(d - pd.Timedelta(weeks=w), np.nan) for w in range(1, 9)])
            hist = hist[~np.isnan(hist)]
            if len(hist) < 6:
                continue
            z = _robust_z(ch[c].get(d, 0), hist)
            if z <= -zt:
                out.append({"date": d.date(), "type": "Channel outage / drop", "item": c,
                            "sku": "", "detail": f"${ch[c].get(d, 0):,.0f} vs usual ${np.median(hist):,.0f}",
                            "z": round(z, 1), "impact_nzd": round(ch[c].get(d, 0) - np.median(hist), 0)})

    # 3. sustained decline: last 14 days vs the 8 weeks before
    for sku, g in ds.groupby("sku"):
        recent = g["units"].loc[P.asof - pd.Timedelta(days=13):].mean()
        base = g["units"].loc[P.asof - pd.Timedelta(days=69):P.asof - pd.Timedelta(days=14)].mean()
        if base >= min_u and recent < base * decline_ratio:
            # same windows last year: is this just seasonality?
            ly_end = P.asof - pd.Timedelta(days=364)
            ly_recent = g["units"].loc[ly_end - pd.Timedelta(days=13):ly_end].mean()
            ly_base = g["units"].loc[ly_end - pd.Timedelta(days=69):ly_end - pd.Timedelta(days=14)].mean()
            seasonal = bool(ly_base > 0 and ly_recent / ly_base < 0.85)
            out.append({"date": P.asof.date(),
                        "type": "Seasonal decline (also fell last year)" if seasonal else "Sustained decline (14 days)",
                        "item": names.loc[sku, "product_name"], "sku": sku,
                        "detail": f"{recent:.1f}/day vs {base:.1f}/day ({(recent / base - 1) * 100:+.0f}%)",
                        "z": np.nan, "impact_nzd": round((recent - base) * 7 * price[sku], 0)})

    # 4. waste blow-outs
    if P.waste is not None:
        w = P.waste
        cur = _window(w, "date", P.asof, n).groupby("sku")["units_wasted"].sum()
        base = _window(w, "date", P.asof, 56, n).groupby("sku")["units_wasted"].sum() / 8
        for sku, v in cur.items():
            b = base.get(sku, 0)
            if v >= 5 and v > max(b * waste_mult, b + 4):
                out.append({"date": P.asof.date(), "type": "Waste blow-out",
                            "item": names.loc[sku, "product_name"], "sku": sku,
                            "detail": f"{int(v)} units wasted vs usual {b:.0f}/week",
                            "z": np.nan, "impact_nzd": round(-(v - b) * names.loc[sku, "unit_cost"], 0)})

    # 5. SAP vs physical count variance (shrinkage or receiving errors)
    if P.inventory is not None:
        tol = cfg["kpi_targets"]["count_variance_units"]
        inv = P.inventory.sort_values("count_date")
        last = inv[inv["count_date"] == inv["count_date"].max()]
        for r in last.itertuples():
            if abs(r.variance_units) > tol:
                hist = inv[(inv["sku"] == r.sku)].tail(3)["variance_units"]
                trend = "repeat" if (hist.abs() > tol).sum() >= 2 else "first time"
                kind = "Shrinkage (physical < SAP)" if r.variance_units < 0 else "Count gain (physical > SAP) - check receiving / GR"
                out.append({"date": r.count_date.date(), "type": kind, "item": r.product_name,
                            "sku": r.sku, "detail": f"SAP {r.sap_qty} vs shelf {r.physical_qty} ({trend})",
                            "z": np.nan, "impact_nzd": round(r.variance_value, 0)})

    df = pd.DataFrame(out)
    if df.empty:
        return df
    df["abs_impact"] = df["impact_nzd"].abs()
    # keep the strongest signal per item/type
    return (df.sort_values("abs_impact", ascending=False)
              .drop_duplicates(["type", "item"]).drop(columns="abs_impact").reset_index(drop=True))


# ======================================================== segmentation
SEG_FEATURES = ["avg_daily_units", "gm_pct", "demand_cv", "waste_rate_pct", "delivery_share_pct", "promo_uplift"]


def _features(P, days=91) -> pd.DataFrame:
    s = _window(P.sales, "date", P.asof, days)
    ds = _window(P.daily_sku, "date", P.asof, days)
    f = pd.DataFrame(index=P.products["sku"])
    f["avg_daily_units"] = ds.groupby("sku")["units"].mean()
    g = s.groupby("sku").agg(sales=("net_sales", "sum"), cost=("cost", "sum"))
    f["gm_pct"] = (g["sales"] - g["cost"]) / g["sales"] * 100
    f["demand_cv"] = ds.groupby("sku")["units"].std() / f["avg_daily_units"]
    if P.waste is not None:
        wz = _window(P.waste, "date", P.asof, days).groupby("sku")["units_wasted"].sum()
        f["waste_rate_pct"] = wz / ds.groupby("sku")["units"].sum() * 100
    else:
        f["waste_rate_pct"] = 0
    f["delivery_share_pct"] = (s[s["channel"].isin(DELIVERY)].groupby("sku")["net_sales"].sum()
                               / g["sales"] * 100)
    per_day = s.groupby(["sku", "date", "promo_flag"])["units"].sum().reset_index()
    pm = per_day.groupby(["sku", "promo_flag"])["units"].mean().unstack()
    f["promo_uplift"] = (pm.get(1) / pm.get(0) - 1).fillna(0) * 100 if 1 in pm else 0
    return f.fillna(0).replace([np.inf, -np.inf], 0)


SEGMENT_LABELS = {  # label -> (feature, direction)
    "Traffic drivers (high velocity)": ("avg_daily_units", 1),
    "Waste-exposed perishables": ("waste_rate_pct", 1),
    "Margin builders": ("gm_pct", 1),
    "Delivery favourites": ("delivery_share_pct", 1),
    "Promo-responsive": ("promo_uplift", 1),
    "Volatile / irregular demand": ("demand_cv", 1),
    "Long tail / slow movers": ("avg_daily_units", -1),
}


def _name_segments(prof: pd.DataFrame, f: pd.DataFrame) -> dict:
    """Greedy unique labelling: each cluster gets the label its centroid is most extreme on."""
    z = (prof[SEG_FEATURES] - f[SEG_FEATURES].mean()) / f[SEG_FEATURES].std().replace(0, 1)
    pairs = sorted(((z.loc[c, feat] * sign, c, lab) for c in z.index
                    for lab, (feat, sign) in SEGMENT_LABELS.items()), reverse=True)
    names, used = {}, set()
    for _, c, lab in pairs:
        if c not in names and lab not in used:
            names[c] = lab
            used.add(lab)
    return names


def segmentation(P, cfg, n_boot: int = 100) -> dict:
    f = _features(P)
    X = StandardScaler().fit_transform(f[SEG_FEATURES])
    lo, hi = cfg["analysis"]["segmentation_k_range"]
    sil = {}
    for k in range(lo, hi + 1):
        lab = KMeans(k, n_init=20, random_state=42).fit_predict(X)
        sil[k] = silhouette_score(X, lab)
    k_best = max(sil, key=sil.get)
    km = KMeans(k_best, n_init=20, random_state=42).fit(X)
    f["cluster"] = km.labels_

    # bootstrap Jaccard stability (Hennig 2007) - is each cluster real or noise?
    rng = np.random.default_rng(42)
    jac = {c: [] for c in range(k_best)}
    for _ in range(n_boot):
        idx = rng.choice(len(X), len(X), replace=True)
        lab_b = KMeans(k_best, n_init=5, random_state=int(rng.integers(1e6))).fit(X[idx])
        pred = lab_b.predict(X)
        for c in range(k_best):
            A = set(np.where(km.labels_ == c)[0])
            best = max((len(A & set(np.where(pred == d)[0])) / len(A | set(np.where(pred == d)[0]))
                        for d in range(k_best)), default=0)
            jac[c].append(best)
    stability = {c: float(np.mean(v)) for c, v in jac.items()}

    pcs = PCA(2, random_state=42).fit(X)
    xy = pcs.transform(X)
    f["pc1"], f["pc2"] = xy[:, 0], xy[:, 1]
    prof = f.groupby("cluster")[SEG_FEATURES].mean()
    names = _name_segments(prof, f)
    f["segment"] = f["cluster"].map(names)
    prof["segment"] = prof.index.map(names)
    prof["n_skus"] = f.groupby("cluster").size()
    prof["jaccard_stability"] = prof.index.map(stability)
    # Hennig: < 0.6 dissolved, 0.6-0.75 patterns, > 0.85 highly stable
    prof["stability_verdict"] = pd.cut(prof["jaccard_stability"], [0, 0.6, 0.75, 0.85, 1.01],
                                       labels=["Unstable", "Pattern", "Stable", "Highly stable"])
    f = f.join(P.products.set_index("sku")[["product_name", "category"]])
    return {"sku_segments": f.reset_index(), "profile": prof.reset_index(), "silhouette": sil,
            "k": k_best, "pca_var": pcs.explained_variance_ratio_.tolist()}


# ======================================================== assortment
def assortment(P, seg: dict) -> pd.DataFrame:
    s = _window(P.sales, "date", P.asof, 91)
    g = s.groupby(["sku", "product_name", "category"]).agg(
        sales=("net_sales", "sum"), cost=("cost", "sum")).reset_index()
    g["gm"] = g["sales"] - g["cost"]
    g = g.sort_values("sales", ascending=False)
    g["cum_share"] = g["sales"].cumsum() / g["sales"].sum() * 100
    g["abc"] = np.where(g["cum_share"] <= 80, "A", np.where(g["cum_share"] <= 95, "B", "C"))
    g = g.merge(seg["sku_segments"][["sku", "segment", "waste_rate_pct"]], on="sku", how="left")
    g["range_action"] = np.select(
        [(g["abc"] == "C") & (g["waste_rate_pct"] > 5),
         (g["abc"] == "C"),
         (g["abc"] == "A")],
        ["Review / delist - low sales, high waste", "Review facings", "Protect availability"],
        default="Maintain")
    return g


# ======================================================== replenishment (JIT)
def replenishment(P, cfg) -> pd.DataFrame:
    r = cfg["replenishment"]
    L, R, z = r["lead_time_days"], r["review_period_days"], r["service_level_z"]
    ds = _window(P.daily_sku, "date", P.asof, 28)
    stats = ds.groupby("sku")["units"].agg(mu="mean", sigma="std")
    out = stats.join(P.products.set_index("sku")[["product_name", "category", "supplier",
                                                  "unit_cost", "shelf_life_days"]])
    out["safety_stock"] = z * out["sigma"] * np.sqrt(L + R)
    out["reorder_point"] = out["mu"] * (L + R) + out["safety_stock"]
    out["order_up_to"] = out["reorder_point"] + out["mu"] * R
    # cap by shelf life so JIT does not create waste on short-life lines
    life_cap = out["mu"] * out["shelf_life_days"].clip(lower=1)
    out["order_up_to"] = np.minimum(out["order_up_to"], life_cap)
    out["reorder_point"] = np.minimum(out["reorder_point"], out["order_up_to"])
    if P.inventory is not None:
        last = P.inventory.sort_values("count_date").groupby("sku").tail(1).set_index("sku")
        sold_since = [P.daily_sku[(P.daily_sku["sku"] == s) & (P.daily_sku["date"] > last.loc[s, "count_date"])]["units"].sum()
                      if s in last.index else 0 for s in out.index]
        out["est_on_hand"] = (last["physical_qty"].reindex(out.index).fillna(0) - np.array(sold_since)).clip(lower=0)
    else:
        out["est_on_hand"] = np.nan
    out["days_cover"] = out["est_on_hand"] / out["mu"].replace(0, np.nan)
    out["suggested_order"] = np.ceil((out["order_up_to"] - out["est_on_hand"]).clip(lower=0))
    out.loc[out["est_on_hand"] > out["reorder_point"], "suggested_order"] = 0
    out["order_value"] = out["suggested_order"] * out["unit_cost"]
    out["status"] = np.where(out["days_cover"] < L, "Order now - below lead time",
                             np.where(out["suggested_order"] > 0, "Order", "OK"))
    rank = {"Order now - below lead time": 0, "Order": 1, "OK": 2}
    return (out.reset_index().assign(_r=lambda d: d["status"].map(rank))
               .sort_values(["_r", "order_value"], ascending=[True, False]).drop(columns="_r"))


# ======================================================== labour
def labour_plan(forecast: pd.DataFrame, cfg) -> pd.DataFrame:
    lab = cfg["labour"]
    d = forecast.groupby("date")["forecast_sales"].sum().reset_index()
    d["day"] = d["date"].dt.strftime("%a %d %b")
    d["hours_needed"] = np.maximum(d["forecast_sales"] / lab["sales_per_labour_hour"],
                                   lab["min_hours_per_day"]).round(1)
    d["wage_cost"] = d["hours_needed"] * lab["wage_rate"]
    d["wage_pct_sales"] = d["wage_cost"] / d["forecast_sales"] * 100
    return d


# ======================================================== compliance
def gtin_valid(code: str) -> bool:
    code = str(code).strip()
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    body, check = code[:-1], int(code[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def compliance(P, cfg, repl: pd.DataFrame) -> dict:
    res = {"gs1_invalid": pd.DataFrame(), "recalls": pd.DataFrame(), "liquor_delivery_units": 0}
    if "gtin" in P.products and cfg["compliance"].get("check_gs1", True):
        bad = P.products[~P.products["gtin"].apply(gtin_valid)]
        res["gs1_invalid"] = bad[["sku", "product_name", "gtin"]]
    if P.recalls is not None and "gtin" in P.products:
        m = P.recalls.merge(P.products[["sku", "product_name", "gtin"]], on="gtin", how="inner")
        if len(m):
            sold7 = _window(P.sales, "date", P.asof, 7).groupby("sku")["units"].sum()
            m["units_sold_last_7d"] = m["sku"].map(sold7).fillna(0).astype(int)
            m["est_on_hand"] = m["sku"].map(repl.set_index("sku")["est_on_hand"]).fillna(0).round()
        res["recalls"] = m
    liq = cfg["compliance"]["liquor_categories"]
    cur = _window(P.sales, "date", P.asof, cfg["analysis"]["digest_period_days"])
    res["liquor_delivery_units"] = int(cur[cur["category"].isin(liq) & cur["channel"].isin(DELIVERY)]["units"].sum())
    return res
