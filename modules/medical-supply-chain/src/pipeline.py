"""
Shelly · Supply Chain module — analytics pipeline (CRISP-DM: data prep -> modelling -> evaluation)
Reads data/*.csv, computes inventory / expiry / inbound / supplier / customer
KPIs and a SARIMA-X weekly demand forecast per SKU, writes dashboard/data.json.

Run:  python src/pipeline.py
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data"
TODAY = pd.Timestamp("2026-09-30")
Z = 1.65                     # 95% cycle service level
H = 12                       # forecast horizon (weeks)

sup = pd.read_csv(D / "suppliers.csv")
prod = pd.read_csv(D / "products.csv")
cust = pd.read_csv(D / "customers.csv")
sales = pd.read_csv(D / "sales_daily.csv", parse_dates=["date"])
po = pd.read_csv(D / "purchase_orders.csv",
                 parse_dates=["order_date", "planned_eta", "actual_arrival", "forecast_arrival"])
lots = pd.read_csv(D / "batches.csv", parse_dates=["received_date", "expiry_date"])
lots["note"] = lots["note"].fillna("")

P = prod.set_index("sku")
S = sup.set_index("supplier_id")

# ============================================================ demand stats
last28 = sales[sales.date > TODAY - pd.Timedelta(days=28)]
d28 = last28.groupby("sku").qty.sum() / 28
daily_sku = sales.groupby(["sku", "date"]).qty.sum().unstack(0).reindex(
    pd.date_range(sales.date.min(), TODAY - pd.Timedelta(days=1)), fill_value=0).fillna(0)
sd_daily = daily_sku.tail(90).std()

# ============================================================ supplier performance (received POs)
rec = po[po.status == "Received"].copy()
rec["delay_days"] = (rec.actual_arrival - rec.planned_eta).dt.days
rec["lead_days"] = (rec.actual_arrival - rec.order_date).dt.days
rec["on_time"] = rec.delay_days <= 2
rec["in_full"] = rec.qty_received >= rec.qty_ordered
rec["otif"] = rec.on_time & rec.in_full
rec["value"] = rec.qty_ordered * rec.unit_cost_nzd + rec.freight_nzd
lt_sku = rec.groupby("sku").agg(lt_mean=("lead_days", "mean"), lt_sd=("lead_days", "std"))

r12 = rec[rec.order_date > TODAY - pd.Timedelta(days=365)]
supp = r12.groupby("supplier_id").agg(
    pos=("po_id", "count"), otif=("otif", "mean"), on_time=("on_time", "mean"),
    in_full=("in_full", "mean"), avg_lead=("lead_days", "mean"), lead_sd=("lead_days", "std"),
    avg_delay=("delay_days", "mean"), max_delay=("delay_days", "max"), spend=("value", "sum")).reset_index()
supp = supp.merge(sup, on="supplier_id")
# short-dated deliveries: % of shelf life remaining on arrival
lots_po = lots[lots.po_id.fillna("") != ""].merge(po[["po_id", "supplier_id"]], on="po_id")
lots_po = lots_po.merge(prod[["sku", "shelf_life_days"]], on="sku")
lots_po["life_left_pct"] = ((lots_po.expiry_date - lots_po.received_date).dt.days / lots_po.shelf_life_days)
supp = supp.merge(lots_po.groupby("supplier_id").life_left_pct.mean().rename("life_left_pct"),
                  on="supplier_id", how="left")
supp["life_left_pct"] = supp.life_left_pct.fillna(1.0)
# risk score 0-100: OTIF gap, lead-time volatility, short-dating, single-source dependency
dep = prod.groupby("primary_supplier_id").sku.count().rename("skus_single_sourced")
supp = supp.merge(dep, left_on="supplier_id", right_index=True, how="left").fillna({"skus_single_sourced": 0})
supp["risk"] = (45 * (1 - supp.otif) + 25 * (supp.lead_sd / supp.avg_lead).clip(0, 1)
                + 20 * (1 - supp.life_left_pct).clip(0, 1) / 0.5 + 3 * supp.skus_single_sourced).clip(0, 100).round(0)
supp["verdict"] = np.where(supp.risk >= 35, "Threat", np.where(supp.risk >= 22, "Watch", "Reliable"))

# ============================================================ inventory & reorder
onhand = lots.groupby("sku").qty_on_hand.sum()
open_po = po[po.status.isin(["Booked", "In transit", "Arrived port", "Customs / Medsafe hold"])]
inv = prod[["sku", "product_name", "category", "subcategory", "unit_cost_nzd",
            "primary_supplier_id", "cold_chain"]].copy()
inv["on_hand"] = inv.sku.map(onhand).fillna(0).astype(int)
inv["avg_daily"] = inv.sku.map(d28).fillna(0)
inv["cover_days"] = np.where(inv.avg_daily > 0, inv.on_hand / inv.avg_daily, 999)
inv["lead_mean"] = inv.sku.map(lt_sku.lt_mean)
inv["lead_sd"] = inv.sku.map(lt_sku.lt_sd).fillna(3)
inv["sd_daily"] = inv.sku.map(sd_daily).fillna(0)
inv["safety_stock"] = Z * np.sqrt(inv.lead_mean * inv.sd_daily ** 2 + (inv.avg_daily * inv.lead_sd) ** 2)
inv["reorder_point"] = inv.avg_daily * inv.lead_mean + inv.safety_stock
inv["stock_value"] = inv.on_hand * inv.unit_cost_nzd
nxt = open_po.sort_values("forecast_arrival").groupby("sku").first()
inv["next_eta"] = inv.sku.map(nxt.forecast_arrival)
inv["next_qty"] = inv.sku.map(nxt.qty_ordered).fillna(0).astype(int)
inv["next_status"] = inv.sku.map(nxt.status).fillna("None open")
inv["days_to_eta"] = (inv.next_eta - TODAY).dt.days
inv["inbound_units"] = inv.sku.map(open_po.groupby("sku").qty_ordered.sum()).fillna(0)

def status(r):
    if r.on_hand <= 0:
        return "Stock-out"
    if pd.notna(r.days_to_eta) and r.cover_days < r.days_to_eta:
        return "Gap before ETA"
    if r.on_hand + r.inbound_units < r.reorder_point:
        return "Reorder now"
    if r.cover_days > 180:
        return "Overstock"
    return "Healthy"
inv["status"] = inv.apply(status, axis=1)
inv["gap_days"] = np.where(inv.status.isin(["Stock-out", "Gap before ETA"]),
                           (inv.days_to_eta.fillna(inv.lead_mean) - inv.cover_days).clip(lower=0), 0)
inv["revenue_at_risk"] = inv.gap_days * inv.avg_daily * inv.sku.map(P.unit_price_nzd)

# ============================================================ expiry (FEFO projection)
exp = lots[(lots.qty_on_hand > 0) & lots.expiry_date.notna()].copy()
exp["days_left"] = (exp.expiry_date - TODAY).dt.days
exp = exp.sort_values(["sku", "expiry_date"])
exp["avg_daily"] = exp.sku.map(d28).fillna(0)
# FEFO: stock ahead of this lot must be consumed first
exp["ahead"] = exp.groupby("sku").qty_on_hand.cumsum() - exp.qty_on_hand
exp["can_sell"] = (exp.avg_daily * exp.days_left - exp.ahead).clip(lower=0)
exp["at_risk_qty"] = (exp.qty_on_hand - exp.can_sell).clip(lower=0).round()
exp["unit_cost"] = exp.sku.map(P.unit_cost_nzd)
exp["at_risk_value"] = exp.at_risk_qty * exp.unit_cost
exp["value"] = exp.qty_on_hand * exp.unit_cost
exp["product_name"] = exp.sku.map(P.product_name)
exp["band"] = pd.cut(exp.days_left, [-1, 30, 90, 180, 365, 99999],
                     labels=["≤30d", "31–90d", "91–180d", "181–365d", ">1y"])
exp_band = exp.groupby("band", observed=False).value.sum().round(0)

# ============================================================ inbound pipeline
ib = open_po.copy()
ib["product_name"] = ib.sku.map(P.product_name)
ib["supplier_name"] = ib.supplier_id.map(S.supplier_name)
ib["country"] = ib.supplier_id.map(S.country)
ib["delay_days"] = (ib.forecast_arrival - ib.planned_eta).dt.days
ib["value"] = ib.qty_ordered * ib.unit_cost_nzd
ib["eta_in_days"] = (ib.forecast_arrival - TODAY).dt.days

# ============================================================ customers
s12 = sales[sales.date > TODAY - pd.Timedelta(days=365)]
sp12 = sales[(sales.date <= TODAY - pd.Timedelta(days=365)) & (sales.date > TODAY - pd.Timedelta(days=730))]
cr = s12.groupby("customer_id").revenue_nzd.sum().rename("rev12")
cp = sp12.groupby("customer_id").revenue_nzd.sum().rename("rev_prev")
cu = cust.merge(cr, on="customer_id").merge(cp, on="customer_id")
cu["growth"] = cu.rev12 / cu.rev_prev - 1
s12c = s12.merge(prod[["sku", "category", "subcategory"]], on="sku")
mix = s12c.pivot_table(index="customer_id", columns="category", values="revenue_nzd", aggfunc="sum").fillna(0)
cu = cu.merge(mix, left_on="customer_id", right_index=True)
seg = cu.groupby("segment").agg(rev=("rev12", "sum"), prev=("rev_prev", "sum"), n=("customer_id", "count")).reset_index()
seg["growth"] = seg.rev / seg.prev - 1
seg_sub = s12c.merge(cust[["customer_id", "segment"]], on="customer_id") \
    .pivot_table(index="segment", columns="category", values="revenue_nzd", aggfunc="sum").fillna(0)

# ============================================================ SARIMA-X weekly forecast per SKU
wk = sales.set_index("date").groupby("sku").qty.resample("W-SUN").sum().unstack(0).fillna(0)
wk = wk.iloc[1:-1]                                   # drop partial first/last weeks
n = len(wk)
def fourier(idx_len, start, K=2, period=52.18):
    t = np.arange(start, start + idx_len)
    return np.column_stack([f(2 * np.pi * k * t / period) for k in range(1, K + 1) for f in (np.sin, np.cos)])
X_all = fourier(n + H, 0)
fc = {}
metrics = []
for sku in wk.columns:
    y = wk[sku].values.astype(float)
    try:
        # holdout evaluation: last 8 weeks
        m = SARIMAX(y[:-8], exog=X_all[:n - 8], order=(1, 0, 1), trend="c").fit(disp=False)
        pred = m.forecast(8, exog=X_all[n - 8:n])
        actual = y[-8:]
        wape = np.abs(actual - pred).sum() / max(actual.sum(), 1)
        naive = np.repeat(y[-16:-8].mean(), 8)
        wape_naive = np.abs(actual - naive).sum() / max(actual.sum(), 1)
        m = SARIMAX(y, exog=X_all[:n], order=(1, 0, 1), trend="c").fit(disp=False)
        f = m.get_forecast(H, exog=X_all[n:n + H])
        mean = np.clip(f.predicted_mean, 0, None)
        ci = np.clip(f.conf_int(alpha=0.2), 0, None)
    except Exception:
        mean = np.repeat(y[-8:].mean(), H); ci = np.column_stack([mean * 0.8, mean * 1.2])
        wape = wape_naive = np.nan
    fc[sku] = dict(hist=[round(v, 1) for v in y[-52:]],
                   mean=[round(v, 1) for v in mean], lo=[round(v, 1) for v in ci[:, 0]],
                   hi=[round(v, 1) for v in ci[:, 1]])
    metrics.append(dict(sku=sku, wape=wape, wape_naive=wape_naive,
                        next12=float(mean.sum()), last12=float(y[-12:].sum())))
met = pd.DataFrame(metrics)
hist_weeks = [d.strftime("%Y-%m-%d") for d in wk.index[-52:]]
fc_weeks = [(wk.index[-1] + pd.Timedelta(weeks=i + 1)).strftime("%Y-%m-%d") for i in range(H)]
inv = inv.merge(met[["sku", "wape", "next12", "last12"]], on="sku")
inv["fc_trend"] = inv.next12 / inv.last12 - 1
# weeks of cover versus forecast (more forward-looking than 28d average)
inv["fc_cover_days"] = np.where(inv.next12 > 0, inv.on_hand / (inv.next12 / 84), 999)

# ============================================================ KPIs
rev30 = sales[sales.date > TODAY - pd.Timedelta(days=30)].revenue_nzd.sum()
rev30p = sales[(sales.date <= TODAY - pd.Timedelta(days=30)) & (sales.date > TODAY - pd.Timedelta(days=60))].revenue_nzd.sum()
r90 = rec[rec.actual_arrival > TODAY - pd.Timedelta(days=90)]
kpi = dict(
    revenue_30d=round(rev30), revenue_30d_delta=round(rev30 / rev30p - 1, 3),
    stock_value=round(inv.stock_value.sum()),
    median_cover=round(float(inv[inv.cover_days < 999].cover_days.median()), 1),
    skus=len(inv), at_risk_skus=int(inv.status.isin(["Stock-out", "Gap before ETA", "Reorder now"]).sum()),
    stockouts=int((inv.status == "Stock-out").sum()),
    revenue_at_risk=round(inv.revenue_at_risk.sum()),
    expiry_value_180=round(exp[exp.days_left <= 180].value.sum()),
    expiry_at_risk_value=round(exp.at_risk_value.sum()),
    otif_90=round(float(r90.otif.mean()), 3), otif_12m=round(float(r12.otif.mean()), 3),
    inbound_value=round(ib.value.sum()), inbound_pos=len(ib),
    holds=int((ib.status == "Customs / Medsafe hold").sum()),
    customers=len(cust), suppliers=len(sup),
    fc_wape=round(float(met.wape.median()), 3), fc_wape_naive=round(float(met.wape_naive.median()), 3),
)

# ============================================================ weekly brief (rules -> human-checkable statements)
brief, escalate = [], []
for _, r in inv[inv.status.isin(["Stock-out", "Gap before ETA"])].sort_values("revenue_at_risk", ascending=False).iterrows():
    eta = r.next_eta.strftime("%d %b") if pd.notna(r.next_eta) else "no open PO"
    escalate.append(dict(title=f"{r.product_name}", kind="Stock-out risk",
        text=f"{r.cover_days:.0f} days cover vs next arrival {eta} ({r.next_status}). "
             f"~NZ${r.revenue_at_risk:,.0f} sales at risk. Consider air-freight top-up or substitute SKU."))
for _, r in exp[exp.at_risk_value > 500].sort_values("days_left").iterrows():
    escalate.append(dict(title=f"{r.product_name} · {r.batch_id}", kind="Expiry",
        text=f"{int(r.qty_on_hand):,} units expire in {r.days_left} days; ~{int(r.at_risk_qty):,} "
             f"(NZ${r.at_risk_value:,.0f}) won't sell at current run-rate. Offer to high-volume customers or return to supplier."))
for _, r in ib[ib.status == "Customs / Medsafe hold"].iterrows():
    escalate.append(dict(title=f"{r.po_id} · {r.product_name}", kind="Clearance hold",
        text=f"Held at {r.port}. Check import documentation / Medsafe notification before ETA slips further."))
worst = supp.sort_values("risk", ascending=False).iloc[0]
best = supp.sort_values("otif", ascending=False).iloc[0]
top_seg = seg.sort_values("growth", ascending=False).iloc[0]
big = inv[inv.last12 >= 300]
up = big.loc[big.fc_trend.abs().idxmax()]
dn_share = (big.fc_trend < 0).mean()
brief = [
    f"{kpi['at_risk_skus']} of {kpi['skus']} SKUs need action (stock-out, gap before ETA or reorder).",
    f"Supplier to watch: {worst.supplier_name} ({worst.country}) — OTIF {worst.otif:.0%}, "
    f"avg delay {worst.avg_delay:.1f} days, arrives with {worst.life_left_pct:.0%} shelf life left.",
    f"Most reliable: {best.supplier_name} — OTIF {best.otif:.0%}.",
    f"Fastest-growing segment: {top_seg.segment} ({top_seg.growth:+.0%} YoY).",
    f"Forecast: biggest mover is {up.product_name} ({up.fc_trend:+.0%} next 12 weeks vs last 12); "
    f"{dn_share:.0%} of volume SKUs ease as winter demand fades — trim sea-freight order sizes accordingly.",
    f"NZ${kpi['expiry_at_risk_value']:,} of stock projected to expire unsold (FEFO at current run-rate).",
    f"Forecast accuracy (WAPE, 8-wk holdout): SARIMA-X {kpi['fc_wape']:.0%} vs naive {kpi['fc_wape_naive']:.0%}.",
]

# ============================================================ network graph (supplier -> category -> segment)
nodes, links = [], []
for _, r in supp.iterrows():
    nodes.append(dict(id=r.supplier_id, label=r.supplier_name, group="supplier", country=r.country,
                      size=float(r.spend), risk=float(r.risk), verdict=r.verdict,
                      otif=float(r.otif), mode=r.default_mode))
for sc in prod.subcategory.unique():
    nodes.append(dict(id="SC_" + sc, label=sc, group="subcategory",
                      size=float(s12c[s12c.subcategory == sc].revenue_nzd.sum())))
for sg in seg.segment:
    nodes.append(dict(id="SG_" + sg, label=sg, group="segment", size=float(seg.set_index("segment").rev[sg])))
for (sid, sc), v in r12.merge(prod[["sku", "subcategory"]], on="sku").groupby(["supplier_id", "subcategory"]).value.sum().items():
    links.append(dict(source=sid, target="SC_" + sc, value=float(v)))
for (sg, sc), v in s12c.merge(cust[["customer_id", "segment"]], on="customer_id").groupby(["segment", "subcategory"]).revenue_nzd.sum().items():
    links.append(dict(source="SC_" + sc, target="SG_" + sg, value=float(v)))

# ============================================================ timeseries
dr = sales[sales.date > TODAY - pd.Timedelta(days=90)].merge(prod[["sku", "category"]], on="sku") \
    .pivot_table(index="date", columns="category", values="revenue_nzd", aggfunc="sum").fillna(0)
arrivals = pd.concat([
    rec[rec.actual_arrival > TODAY - pd.Timedelta(days=90)].assign(d=lambda x: x.actual_arrival, kind="received"),
    ib.assign(d=lambda x: x.forecast_arrival, kind="due")])
arr = arrivals.groupby(["d", "kind"]).value.sum().unstack(fill_value=0) if len(arrivals) else pd.DataFrame()

def rec_(df, cols):
    out = df[cols].copy()
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]):
            out[c] = out[c].dt.strftime("%Y-%m-%d")
    return json.loads(out.replace({np.nan: None}).to_json(orient="records"))

data = dict(
    generated=TODAY.strftime("%Y-%m-%d"), company="Tōtara Medical Imports (fictional demo)",
    kpi=kpi, brief=brief, escalate=escalate[:8],
    inventory=rec_(inv.sort_values(["status", "cover_days"]).round(2),
                   ["sku", "product_name", "category", "subcategory", "cold_chain", "on_hand", "avg_daily",
                    "cover_days", "fc_cover_days", "reorder_point", "safety_stock", "stock_value", "next_eta",
                    "next_qty", "next_status", "status", "revenue_at_risk", "wape", "fc_trend", "primary_supplier_id"]),
    status_counts=inv.status.value_counts().to_dict(),
    expiry=rec_(exp[exp.days_left <= 365].sort_values("days_left").round(0),
                ["batch_id", "sku", "product_name", "expiry_date", "days_left", "qty_on_hand",
                 "at_risk_qty", "value", "at_risk_value", "note"]),
    expiry_bands={str(k): float(v) for k, v in exp_band.items()},
    inbound=rec_(ib.sort_values("forecast_arrival"),
                 ["po_id", "sku", "product_name", "supplier_name", "country", "mode", "port", "status",
                  "order_date", "planned_eta", "forecast_arrival", "delay_days", "eta_in_days", "qty_ordered", "value"]),
    suppliers=rec_(supp.sort_values("risk", ascending=False).round(3),
                   ["supplier_id", "supplier_name", "country", "default_mode", "pos", "otif", "on_time", "in_full",
                    "avg_lead", "lead_sd", "avg_delay", "max_delay", "spend", "life_left_pct", "skus_single_sourced",
                    "risk", "verdict"]),
    customers=rec_(cu.sort_values("rev12", ascending=False).round(3),
                   ["customer_id", "customer_name", "segment", "region", "rev12", "rev_prev", "growth",
                    "Medicine", "Consumable", "Equipment"]),
    segments=rec_(seg.merge(seg_sub, left_on="segment", right_index=True).sort_values("rev", ascending=False).round(3),
                  ["segment", "rev", "prev", "growth", "n", "Medicine", "Consumable", "Equipment"]),
    network=dict(nodes=nodes, links=links),
    forecast=dict(hist_weeks=hist_weeks, fc_weeks=fc_weeks, series=fc),
    daily_revenue=dict(dates=[d.strftime("%Y-%m-%d") for d in dr.index],
                       **{c: [round(v) for v in dr[c]] for c in dr.columns}),
    arrivals=dict(dates=[d.strftime("%Y-%m-%d") for d in arr.index],
                  received=[round(v) for v in arr.get("received", pd.Series(0, index=arr.index))],
                  due=[round(v) for v in arr.get("due", pd.Series(0, index=arr.index))]),
)
out = ROOT / "dashboard" / "data.json"
out.write_text(json.dumps(data, default=str))
print(json.dumps(kpi, indent=1))
print("\n".join(brief))
print(f"escalations: {len(escalate)} -> {out}")
