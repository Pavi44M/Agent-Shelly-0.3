"""Shelly Commercial lab (v2.5.0): promotions, price and baskets for the Neighbourhood Store. Synthetic data."""


def run():
    """Everything the Commercial lab page shows, from the sample store data."""
    import pandas as pd
    from . import basket, price, promo
    df, products = promo.load()
    E = promo.events(df)
    S = promo.scorecard(E)
    sales = pd.read_csv(promo.SAMPLE / "sales.csv", parse_dates=["date"])
    L = price.lab(E, products)
    B = basket.run(products, sales)
    tot = {k: round(sum(e[k] for e in E), 2) for k in ("inc_gp", "extra_gp", "subsidy", "cannibalised", "dip", "net")}
    worst = S[:3]; best = [s for s in reversed(S) if s["net"] > 0][:3]
    days = (df.date.max() - df.date.min()).days + 1
    din = next((m for m in B["missions"] if m["mission"] == "Dinner tonight"), None)
    fund = {x["sku"]: x["funding_at_usual_pct"] for x in L}
    actions = [f"{w['name']}: {w['events']} promos lost ${-w['net']:,.0f} of margin. {w['action']}; to break even, a supplier must fund "
               f"{'all' if fund.get(w['sku'], 100) >= 100 else str(fund.get(w['sku'])) + '%'} of the discount." for w in worst[:2]]
    if B["pairs"]:
        p = B["pairs"][0]; actions.append(f"Put {p['a_name']} beside {p['b_name']}: they sell together {p['lift']}× more than chance.")
    if din:
        actions.append(f"Dinner-tonight shoppers are {din['share_pct']}% of baskets but {din['sales_share_pct']}% of sales: make the meal bay the first thing they see after 4 pm.")
    return {"events": E, "scorecard": S, "categories": promo.by_category(E), "totals": tot,
            "share_worth_it": round(100 * sum(e["worth_it"] for e in E) / max(1, len(E))), "years": round(days / 365, 1),
            "period": [df.date.min().strftime("%Y-%m-%d"), df.date.max().strftime("%Y-%m-%d")],
            "best": best, "price_lab": L, "basket": B, "actions": actions}
