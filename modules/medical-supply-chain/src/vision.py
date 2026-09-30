"""
Shelly · Supply Chain module — vision-board data
Adds a `vision` block to dashboard/data.json: a supplier -> product -> client
network where every node and link carries 12 weeks of plan vs actual.

Plan = same week last year x (1 + growth target), 3-week smoothed.
(Swap in a real sales budget when you have one.)

Run after pipeline.py:  python src/vision.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data"
OUT = ROOT / "dashboard" / "data.json"
TODAY = pd.Timestamp("2026-09-30")
GROWTH_TARGET = 0.12
WEEKS = 12
TOP_CLIENTS_PER_PRODUCT = 4

prod = pd.read_csv(D / "products.csv")
cust = pd.read_csv(D / "customers.csv")
sup = pd.read_csv(D / "suppliers.csv")
sales = pd.read_csv(D / "sales_daily.csv", parse_dates=["date"])
po = pd.read_csv(D / "purchase_orders.csv", parse_dates=["order_date", "planned_eta", "actual_arrival", "forecast_arrival"])
data = json.loads(OUT.read_text())
inv = {r["sku"]: r for r in data["inventory"]}
supp_score = {r["supplier_id"]: r for r in data["suppliers"]}

last_sun = TODAY - pd.Timedelta(days=(TODAY.dayofweek + 1) % 7)       # last complete week ends Sunday
if last_sun >= TODAY:
    last_sun -= pd.Timedelta(days=7)
week_ends = pd.date_range(end=last_sun, periods=WEEKS, freq="W-SUN")
week_labels = [d.strftime("%d %b") for d in week_ends]

sales["wk"] = sales.date + pd.to_timedelta((6 - sales.date.dt.dayofweek) % 7, unit="D")


def series(df):
    """weekly actual revenue for the 12 weeks and the plan built from last year"""
    w = df.groupby("wk").revenue_nzd.sum()
    actual = w.reindex(week_ends, fill_value=0.0)
    ly_idx = week_ends - pd.Timedelta(days=364)
    ly_full = w.reindex(pd.date_range(ly_idx[0] - pd.Timedelta(days=7), ly_idx[-1] + pd.Timedelta(days=7), freq="W-SUN"), fill_value=0.0)
    ly = ly_full.rolling(3, center=True, min_periods=1).mean().reindex(ly_idx).fillna(0)
    plan = ly.values * (1 + GROWTH_TARGET)
    a, p = actual.values, plan
    return dict(actual=[round(float(x)) for x in a], plan=[round(float(x)) for x in p],
                ach=round(float(a.sum() / p.sum()), 3) if p.sum() else None)


nodes, links = [], []
rev12 = sales[sales.date > TODAY - pd.Timedelta(days=365)]

# ---- clients
cr = rev12.groupby("customer_id").revenue_nzd.sum()
for _, c in cust.iterrows():
    s = series(sales[sales.customer_id == c.customer_id])
    top = (rev12[rev12.customer_id == c.customer_id].groupby("sku").revenue_nzd.sum()
           .sort_values(ascending=False).head(5))
    nodes.append(dict(id=c.customer_id, type="client", label=c.customer_name, segment=c.segment,
                      region=c.region, value=round(float(cr.get(c.customer_id, 0))), **s,
                      top=[dict(sku=k, rev=round(float(v))) for k, v in top.items()]))

# ---- products
pr = rev12.groupby("sku").revenue_nzd.sum()
for _, p in prod.iterrows():
    s = series(sales[sales.sku == p.sku])
    i = inv[p.sku]
    nodes.append(dict(id=p.sku, type="product", label=p.product_name, category=p.category,
                      subcategory=p.subcategory, value=round(float(pr.get(p.sku, 0))), **s,
                      on_hand=i["on_hand"], cover_days=i["cover_days"], status=i["status"],
                      next_eta=i["next_eta"], next_qty=i["next_qty"], reorder_point=i["reorder_point"],
                      cold_chain=bool(p.cold_chain), supplier=p.primary_supplier_id))

# ---- suppliers: ring = last 12 deliveries
rec = po[po.status == "Received"].copy()
rec["delay"] = (rec.actual_arrival - rec.planned_eta).dt.days
rec["value"] = rec.qty_ordered * rec.unit_cost_nzd
for _, s_ in sup.iterrows():
    r = rec[rec.supplier_id == s_.supplier_id].sort_values("actual_arrival").tail(WEEKS)
    sc = supp_score.get(s_.supplier_id, {})
    deliveries = [dict(po=x.po_id, sku=x.sku, date=x.actual_arrival.strftime("%d %b"), delay=int(x.delay),
                       fill=round(float(x.qty_received / x.qty_ordered), 3),
                       plan=round(float(x.value)), actual=round(float(x.qty_received * x.unit_cost_nzd)))
                  for x in r.itertuples()]
    nodes.append(dict(id=s_.supplier_id, type="supplier", label=s_.supplier_name, country=s_.country,
                      mode=s_.default_mode, value=round(float(sc.get("spend", 0))),
                      otif=sc.get("otif"), risk=sc.get("risk"), verdict=sc.get("verdict", "Watch"),
                      avg_lead=sc.get("avg_lead"), life_left=sc.get("life_left_pct"),
                      deliveries=deliveries,
                      ach=round(sum(d["actual"] for d in deliveries) / max(1, sum(d["plan"] for d in deliveries)), 3)))

# ---- links supplier -> product
r12 = rec[rec.order_date > TODAY - pd.Timedelta(days=365)]
for _, p in prod.iterrows():
    rr = r12[r12.sku == p.sku]
    ontime = ((rr.delay <= 2) & (rr.qty_received >= rr.qty_ordered)).mean() if len(rr) else None
    links.append(dict(source=p.primary_supplier_id, target=p.sku, kind="supply",
                      value=round(float((rr.qty_ordered * rr.unit_cost_nzd).sum())), pos=int(len(rr)),
                      otif=None if ontime is None or np.isnan(ontime) else round(float(ontime), 3),
                      avg_lead=None if rr.empty else round(float((rr.actual_arrival - rr.order_date).dt.days.mean()), 1)))

# ---- links product -> client (top clients per product)
pc = rev12.groupby(["sku", "customer_id"]).revenue_nzd.sum()
for sku in prod.sku:
    for cid, v in pc.loc[sku].sort_values(ascending=False).head(TOP_CLIENTS_PER_PRODUCT).items():
        s = series(sales[(sales.sku == sku) & (sales.customer_id == cid)])
        links.append(dict(source=sku, target=cid, kind="sale", value=round(float(v)), **s))

tot_a = sum(sum(n["actual"]) for n in nodes if n["type"] == "client")
tot_p = sum(sum(n["plan"]) for n in nodes if n["type"] == "client")
data["vision"] = dict(weeks=week_labels, growth_target=GROWTH_TARGET, nodes=nodes, links=links,
                      total=dict(actual=tot_a, plan=tot_p, ach=round(tot_a / tot_p, 3)))
OUT.write_text(json.dumps(data, default=str))
print(f"vision: {len(nodes)} nodes, {len(links)} links, weeks {week_labels[0]}–{week_labels[-1]}, "
      f"sales vs plan {tot_a / tot_p:.1%}")
achs = sorted([(n["ach"], n["label"]) for n in nodes if n["type"] == "client"])
print(achs[:3], achs[-3:])
