"""Wholesale pack: customer profitability (cost-to-serve), receivables ageing / credit risk, order fill rate."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..core.skills import skill
from .common import Finding, SkillResult, register_pack

COST_PER_ORDER = 18.0     # picking, invoicing and delivery admin per order (configurable)


def demo(seed: int = 11) -> dict:
    rng = np.random.default_rng(seed)
    cust = [f"C{i:03d}" for i in range(1, 41)]
    names = {c: n for c, n in zip(cust, [f"{a} {b}" for a in ["Kiwi", "Harbour", "Metro", "Summit", "Coast", "Valley", "City", "North"]
                                          for b in ["Foods", "Mart", "Cafe", "Superette", "Grocers"]])}
    asof = pd.Timestamp("2026-09-25")
    inv, orders, ar = [], [], []
    for c in cust:
        size = rng.lognormal(7.2, 0.9)
        margin = rng.uniform(0.06, 0.22)
        n_orders = int(rng.integers(4, 40))
        small_frequent = rng.random() < 0.15
        if small_frequent:
            size, n_orders, margin = size * 0.25, n_orders * 2, margin * 0.8
        for k in range(n_orders):
            dt = asof - pd.Timedelta(days=int(rng.integers(0, 90)))
            rev = size / n_orders * 12 * rng.uniform(0.6, 1.4)
            ordered = int(rng.integers(20, 200))
            shipped = ordered - (rng.binomial(ordered, 0.08) if rng.random() < 0.3 else 0)
            oid = f"{c}-{k}"
            inv.append((oid, c, dt, round(rev, 2), round(rev * (1 - margin), 2)))
            orders.append((oid, c, dt, ordered, shipped, rng.random() < 0.9))
            late = rng.random() < (0.35 if c in cust[:5] else 0.1)
            due = dt + pd.Timedelta(days=20)
            paid = (not late and due < asof) or rng.random() < 0.6 and due < asof - pd.Timedelta(days=15)
            if not paid:
                ar.append((oid, c, due, round(rev * 1.15, 2)))
    return {"customers": pd.DataFrame({"customer": cust, "name": [names[c] for c in cust]}),
            "invoices": pd.DataFrame(inv, columns=["order_id", "customer", "date", "revenue", "cost"]),
            "orders": pd.DataFrame(orders, columns=["order_id", "customer", "date", "qty_ordered", "qty_shipped", "on_time"]),
            "receivables": pd.DataFrame(ar, columns=["order_id", "customer", "due_date", "amount_incl_gst"]),
            "asof": asof}


@skill("wholesale.customer_profitability", pack="wholesale", summary="Margin and cost-to-serve by customer, with Pareto",
       inputs=["invoices", "customers"], outputs=["customer P&L", "price/terms review proposals"], confirm=True,
       triggers=["which customers make us money?", "cost to serve", "customer profitability"])
def customer_profitability(d: dict) -> SkillResult:
    """Gross margin minus cost-to-serve (orders × $18). Customers with negative contribution get a
    terms review proposal (minimum order, delivery fee or price). Always confirmed by you before contacting them."""
    g = d["invoices"].groupby("customer").agg(revenue=("revenue", "sum"), cost=("cost", "sum"), orders=("order_id", "count"))
    g["gross_margin"] = g["revenue"] - g["cost"]
    g["cost_to_serve"] = g["orders"] * COST_PER_ORDER
    g["contribution"] = g["gross_margin"] - g["cost_to_serve"]
    g["gm_pct"] = g["gross_margin"] / g["revenue"] * 100
    g["avg_order"] = g["revenue"] / g["orders"]
    g = g.sort_values("revenue", ascending=False)
    g["cum_rev_pct"] = g["revenue"].cumsum() / g["revenue"].sum() * 100
    g = g.join(d["customers"].set_index("customer"))
    f = [Finding("Customer terms", f"Review terms for {r.name}: minimum order or delivery fee (avg order ${r.avg_order:,.0f})",
                 f"{r.orders} orders in 90 days, margin ${r.gross_margin:,.0f} < cost-to-serve ${r.cost_to_serve:,.0f}",
                 -r.contribution / 13, "P2", "Sales Manager", 0.7, "wholesale:cost_to_serve")
         for r in g[g["contribution"] < 0].itertuples()]
    top20 = g["cum_rev_pct"].le(80).sum()
    k = {"Customers": len(g), "80% of revenue from": f"{top20} customers", "Loss-making after cost-to-serve": int((g['contribution'] < 0).sum())}
    return SkillResult("Customer profitability (90 days)", g.reset_index()[["name", "revenue", "gm_pct", "orders", "avg_order", "contribution"]].round(1), f, k,
                       f"Cost-to-serve assumed ${COST_PER_ORDER:.0f}/order. Replace with your actual picking/delivery cost.")


@skill("wholesale.ar_ageing", pack="wholesale", summary="Receivables ageing, DSO and credit-hold proposals",
       inputs=["receivables", "invoices"], outputs=["ageing buckets", "credit proposals"], confirm=True,
       triggers=["who owes us money?", "debtors", "credit risk", "DSO"])
def ar_ageing(d: dict) -> SkillResult:
    """Buckets overdue balances (current, 1-30, 31-60, 60+ days past due). 60+ proposes a credit hold,
    a relationship decision that always needs your confirmation."""
    a = d["receivables"].copy()
    a["days_overdue"] = (d["asof"] - pd.to_datetime(a["due_date"])).dt.days
    a["bucket"] = pd.cut(a["days_overdue"], [-10_000, 0, 30, 60, 10_000], labels=["current", "1-30", "31-60", "60+"])
    t = a.pivot_table(index="customer", columns="bucket", values="amount_incl_gst", aggfunc="sum", fill_value=0, observed=False)
    t["total"] = t.sum(axis=1)
    t = t.join(d["customers"].set_index("customer")).sort_values("total", ascending=False)
    rev90 = d["invoices"]["revenue"].sum() * 1.15
    dso = a["amount_incl_gst"].sum() / rev90 * 90
    f = [Finding("Credit", f"Put {r.name} on credit hold until 60+ day balance is cleared (${getattr(r, '_4'):,.0f})",
                 f"total owed ${r.total:,.0f}; ${getattr(r, '_4'):,.0f} is 60+ days overdue (exposure, not a weekly cost)", 0, "P1", "Finance", 0.75, "wholesale:credit")
         for r in t[t["60+"] > 500].itertuples()]
    k = {"DSO": f"{dso:.0f} days", "Overdue 60+": f"${t['60+'].sum():,.0f}", "Total AR": f"${t['total'].sum():,.0f}"}
    return SkillResult("Receivables ageing", t.reset_index()[["name", "current", "1-30", "31-60", "60+", "total"]].round(0), f, k)


@skill("wholesale.fill_rate", pack="wholesale", summary="Order fill rate and on-time-in-full (OTIF)",
       inputs=["orders"], outputs=["fill rate", "OTIF"], triggers=["fill rate", "OTIF", "short shipments"])
def fill_rate(d: dict) -> SkillResult:
    o = d["orders"]
    fill = o["qty_shipped"].sum() / o["qty_ordered"].sum() * 100
    otif = ((o["qty_shipped"] == o["qty_ordered"]) & o["on_time"]).mean() * 100
    f = [] if otif >= 90 else [Finding("Service", f"Lift OTIF from {otif:.0f}% to 90%: find the SKUs causing short shipments",
                                        "short-shipped orders drive credit notes and lost customers", 0, "P2", "Warehouse Manager", 0.6, "wholesale:otif")]
    return SkillResult("Fill rate & OTIF", pd.DataFrame({"fill_rate_pct": [round(fill, 1)], "otif_pct": [round(otif, 1)], "orders": [len(o)]}), f,
                       {"Fill rate": f"{fill:.1f}%", "OTIF": f"{otif:.0f}%"})


register_pack("wholesale", "Wholesale & distribution", demo,
              ["wholesale.customer_profitability", "wholesale.ar_ageing", "wholesale.fill_rate"])
