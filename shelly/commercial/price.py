"""Discount depth lab (v2.5.0): how deep should a promo go, and how much supplier funding makes it pay?

From each line's promo history: promo response (elasticity) e = ln(promo units / baseline) / ln(1 - discount).
It mixes price and display (the end-cap, the ticket), so it is a promo response, not a pure price elasticity.
For a discount d the expected units are baseline x (1 - d)^e, and the promo's gross profit is compared with the
baseline at full price, less cannibalisation and the after-promo dip scaled to the extra units.
Break-even funding = the share of the discount a supplier must pay back so the store does not lose margin.
"""
from __future__ import annotations

import math

import pandas as pd

DEPTHS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]


def lab(events: list, products: pd.DataFrame) -> list:
    E = pd.DataFrame(events)
    P = products.set_index("sku")
    out = []
    for sku, g in E.groupby("sku"):
        g = g[(g.baseline > 0) & (g.discount_pct > 0)]
        if len(g) < 2:
            continue
        d = g.discount_pct.mean() / 100
        ratio = g.units.sum() / g.baseline.sum()
        e = math.log(max(ratio, 1.01)) / math.log(1 - d)                 # negative
        base_day = g.baseline.sum() / g.days.sum()
        loss_per_extra = (g.cannibalised.sum() + g.dip.sum()) / max(1.0, g.units.sum() - g.baseline.sum())
        price, cost = float(P.loc[sku, "unit_price"]), float(P.loc[sku, "unit_cost"])
        base_gp = base_day * (price - cost)
        rows = []
        for dd in DEPTHS:
            u = base_day * (1 - dd) ** e
            gp = u * (price * (1 - dd) - cost)
            net = gp - base_gp - max(0.0, u - base_day) * loss_per_extra
            disc_cost = u * price * dd
            fund = max(0.0, -net) / disc_cost if disc_cost else 0
            rows.append({"depth_pct": round(dd * 100), "units_day": round(u, 1), "uplift_pct": round((u / base_day - 1) * 100),
                         "net_gp_day": round(net, 2), "funding_pct": round(min(fund, 1) * 100)})
        best = max(rows, key=lambda r: r["net_gp_day"])
        out.append({"sku": sku, "name": P.loc[sku, "product_name"], "category": P.loc[sku, "category"], "price": price,
                    "margin_pct": round((price - cost) / price * 100, 1), "response": round(e, 2), "events": int(len(g)),
                    "usual_depth_pct": round(d * 100), "baseline_day": round(base_day, 1), "depths": rows,
                    "best_depth_pct": best["depth_pct"] if best["net_gp_day"] > 0 else 0,
                    "funding_at_usual_pct": next(r["funding_pct"] for r in rows if r["depth_pct"] == round(d * 20) * 5)})
    return sorted(out, key=lambda r: r["response"])
