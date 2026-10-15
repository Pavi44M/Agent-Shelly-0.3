"""Was this promo worth it? (v2.5.0)

Every promotion in the sample data (in-store, a few days at a time) is scored against what the line would have sold
anyway. Baseline = the average units on the same weekday over the 4 weeks before, promo days left out. From that:
  uplift          extra units sold during the promo
  incremental GP  gross profit made minus the gross profit the baseline would have made at full price
  cannibalised    gross profit lost by other lines in the same category over the same days, against their own baseline
  dip             gross profit lost in the 3 days after, when shoppers have stocked up
  net             incremental GP minus cannibalised minus dip: the verdict
Synthetic data; a real store would add supplier funding, which can turn a loss-making promo into a good one.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data/sample"


def load(data: Path = SAMPLE):
    s = pd.read_csv(data / "sales.csv", parse_dates=["date"])
    p = pd.read_csv(data / "products.csv")
    s = s[s.channel == "in_store"].copy()
    s = s.groupby(["sku", "date"], as_index=False).agg(units=("units", "sum"), net_sales=("net_sales", "sum"), cost=("cost", "sum"), promo_flag=("promo_flag", "max"))
    idx = pd.MultiIndex.from_product([sorted(p.sku), pd.date_range(s.date.min(), s.date.max())], names=["sku", "date"])
    full = s.set_index(["sku", "date"]).reindex(idx, fill_value=0).reset_index()          # every sku every day
    full["promo_flag"] = full.promo_flag.astype(int)
    return full.merge(p[["sku", "product_name", "category", "unit_price", "unit_cost"]], on="sku"), p


def _baseline(df: pd.DataFrame) -> pd.Series:
    """same-weekday average of the 4 weeks before, non-promo days only (index-aligned to df)"""
    out = pd.Series(index=df.index, dtype=float)
    for sku, g in df.groupby("sku"):
        g = g.sort_values("date")
        u = g.units.where(g.promo_flag == 0)
        for wd in range(7):
            m = g.date.dt.weekday == wd
            out.loc[g.index[m]] = u[m].shift(1).rolling(4, min_periods=2).mean().values
    return out


def events(df: pd.DataFrame) -> list:
    df = df.sort_values(["sku", "date"]).reset_index(drop=True)
    df["base"] = _baseline(df)
    df["gp"] = df.net_sales - df.units * df.unit_cost          # margin at the list unit cost, the same cost the baseline uses
    df["base_gp"] = df.base * (df.unit_price - df.unit_cost)
    pr = df[df.promo_flag == 1].copy()
    pr["run"] = (pr.groupby("sku").date.diff().dt.days != 1).cumsum()
    by_day = df.set_index(["sku", "date"])
    E = []
    for (sku, _), g in pr.groupby(["sku", "run"]):
        if g.base.isna().any():
            continue
        st, en = g.date.min(), g.date.max(); cat = g.category.iat[0]
        units, base = g.units.sum(), g.base.sum()
        inc_gp = g.gp.sum() - g.base_gp.sum()
        days = pd.date_range(st, en)
        sib = df[(df.category == cat) & (df.sku != sku) & df.date.isin(days) & (df.promo_flag == 0)]
        cann = max(0.0, float((sib.base_gp - sib.gp).sum()))
        post = df[(df.sku == sku) & (df.date > en) & (df.date <= en + pd.Timedelta(days=3)) & (df.promo_flag == 0)]
        dip = max(0.0, float((post.base_gp - post.gp).sum()))
        net = inc_gp - cann - dip
        disc = 1 - (g.net_sales.sum() / max(1, units)) / g.unit_price.iat[0]
        pp = g.net_sales.sum() / max(1, units); pc = g.unit_price.iat[0]; uc = g.unit_cost.iat[0]
        extra_gp = (units - base) * (pp - uc)                 # margin on the extra units
        subsidy = base * (pc - pp)                            # discount given on units that would have sold anyway
        E.append({"sku": sku, "name": g.product_name.iat[0], "category": cat, "start": st.strftime("%Y-%m-%d"), "end": en.strftime("%Y-%m-%d"),
                  "days": len(g), "discount_pct": round(disc * 100), "units": int(units), "baseline": round(float(base), 1),
                  "uplift_pct": round((units / base - 1) * 100, 1) if base else None,
                  "inc_gp": round(float(inc_gp), 2), "extra_gp": round(float(extra_gp), 2), "subsidy": round(float(subsidy), 2), "cannibalised": round(cann, 2), "dip": round(dip, 2), "net": round(float(net), 2),
                  "worth_it": bool(net > 0)})
    return E


def scorecard(E: list) -> list:
    df = pd.DataFrame(E)
    out = []
    for sku, g in df.groupby("sku"):
        n = len(g); win = int(g.worth_it.sum()); net = g.net.sum()
        up = g.uplift_pct.mean()
        if win / n >= .6 and net > 0: act = "Keep: it pays its way"
        elif net > 0: act = "Keep, but check the weeks it lost money"
        elif up >= 40: act = "Shallower discount: shoppers respond, the margin doesn't"
        else: act = "Stop or ask the supplier to fund it"
        out.append({"sku": sku, "name": g.name.iat[0], "category": g.category.iat[0], "events": n, "worth_it": win,
                    "avg_uplift_pct": round(float(up), 1), "net": round(float(net), 2), "net_per_event": round(float(net / n), 2), "action": act})
    return sorted(out, key=lambda r: r["net"])


def by_category(E: list) -> list:
    df = pd.DataFrame(E)
    g = df.groupby("category").agg(events=("sku", "size"), worth=("worth_it", "sum"), inc=("inc_gp", "sum"), cann=("cannibalised", "sum"),
                                   dip=("dip", "sum"), net=("net", "sum"), up=("uplift_pct", "mean")).reset_index()
    return [{"category": r.category, "events": int(r.events), "worth_it": int(r.worth), "inc_gp": round(r.inc, 2), "cannibalised": round(r.cann, 2),
             "dip": round(r.dip, 2), "net": round(r.net, 2), "avg_uplift_pct": round(r.up, 1)} for r in g.sort_values("net").itertuples()]


def run(data: Path = SAMPLE) -> dict:
    df, _ = load(data)
    E = events(df)
    S = scorecard(E)
    tot = {k: round(sum(e[k] for e in E), 2) for k in ("inc_gp", "cannibalised", "dip", "net")}
    return {"events": E, "scorecard": S, "categories": by_category(E), "totals": tot,
            "share_worth_it": round(100 * sum(e["worth_it"] for e in E) / max(1, len(E))),
            "period": [df.date.min().strftime("%Y-%m-%d"), df.date.max().strftime("%Y-%m-%d")]}
