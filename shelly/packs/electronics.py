"""Consumer electronics pack: sell-through, weeks of cover, aged stock and markdowns, price erosion, attach rate.

Built on Pavi's Samsung AV category experience: range, price and mix decisions
for TVs, audio, phones and accessories, where stock loses value every week it sits.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..core.skills import skill
from .common import Finding, SkillResult, register_pack

CATS = {"TV": (1299, 0.78, 6), "Soundbar": (499, 0.70, 4), "Headphones": (249, 0.62, 8), "Smartphone": (1199, 0.84, 10),
        "Tablet": (799, 0.80, 4), "Accessory": (49, 0.40, 3)}


def demo(seed: int = 7) -> dict:
    """26 weeks of weekly sales and current stock for 36 SKUs (synthetic)."""
    rng = np.random.default_rng(seed)
    prods, sales, stock = [], [], []
    weeks = pd.date_range(end=pd.Timestamp("2026-09-20"), periods=26, freq="W-SUN")
    i = 0
    for cat, (rrp, cost_ratio, base) in CATS.items():
        for m in range(6):
            i += 1
            sku = f"{cat[:3].upper()}{m + 1:02d}"
            price = rrp * rng.uniform(0.7, 1.6)
            age_weeks = int(rng.integers(3, 60))
            prods.append((sku, f"{cat} model {m + 1}", cat, round(price, 0), round(price * cost_ratio, 0), age_weeks))
            decay = np.linspace(1.1, 0.8 if age_weeks > 40 else 1.0, 26)
            slow = 0.35 if m == 5 else 1.0                      # one slow line per category
            for w, d in zip(weeks, decay):
                u = rng.poisson(base * d * slow)
                erosion = 1 - (0.004 * (weeks.get_loc(w)) if age_weeks > 30 else 0.0015 * weeks.get_loc(w))
                sales.append((w, sku, u, round(u * price * erosion * rng.uniform(0.93, 1.0), 2)))
            on_hand = int(base * slow * rng.uniform(2, 9) * (3.5 if m == 5 else 1))
            stock.append((sku, on_hand, (weeks[-1] - pd.Timedelta(weeks=int(rng.integers(2, 30 if m != 5 else 40)))).date()))
    return {"products": pd.DataFrame(prods, columns=["sku", "name", "category", "rrp", "unit_cost", "weeks_since_launch"]),
            "sales": pd.DataFrame(sales, columns=["week", "sku", "units", "revenue"]),
            "stock": pd.DataFrame(stock, columns=["sku", "on_hand", "received_date"])}


@skill("electronics.sell_through", pack="electronics", summary="Sell-through %, weeks of cover and stock risk per SKU",
       inputs=["sales (week, sku, units, revenue)", "stock (sku, on_hand)", "products"], outputs=["cover table", "overstock/stock-out findings"],
       triggers=["which TVs are overstocked?", "weeks of cover", "sell-through by model"])
def sell_through(d: dict) -> SkillResult:
    """4-week sell-through = units sold / (units sold + on hand). Weeks of cover = on hand / avg weekly units."""
    s4 = d["sales"][d["sales"]["week"] > d["sales"]["week"].max() - pd.Timedelta(weeks=4)]
    u = s4.groupby("sku")["units"].sum()
    t = d["products"].set_index("sku").join(d["stock"].set_index("sku")).join(u.rename("units_4w")).fillna({"units_4w": 0})
    t["sell_through_pct"] = t["units_4w"] / (t["units_4w"] + t["on_hand"]).replace(0, np.nan) * 100
    t["weeks_cover"] = t["on_hand"] / (t["units_4w"] / 4).replace(0, np.nan)
    t["stock_value"] = t["on_hand"] * t["unit_cost"]
    t["status"] = np.select([t["weeks_cover"] > 12, t["weeks_cover"] < 2], ["Overstock", "Stock-out risk"], "OK")
    f = []
    over = t[t["status"] == "Overstock"].sort_values("stock_value", ascending=False)
    for sku, r in over.head(5).iterrows():
        excess = (r["weeks_cover"] - 8) / r["weeks_cover"] * r["stock_value"]
        f.append(Finding("Range & stock", f"Stop reordering {r['name']} and plan a sell-down ({r['weeks_cover']:.0f} weeks cover)",
                         f"{int(r['on_hand'])} on hand, {int(r['units_4w'])} sold in 4 weeks; ~${excess:,.0f} tied up above an 8-week target (holding cost ~0.5%/week)",
                         -excess * 0.005, "P2", "Category Manager", 0.7, "electronics:overstock"))
    for sku, r in t[t["status"] == "Stock-out risk"].head(3).iterrows():
        f.append(Finding("Availability", f"Expedite stock for {r['name']} ({r['weeks_cover']:.1f} weeks cover)",
                         f"sold {int(r['units_4w'])} in 4 weeks, only {int(r['on_hand'])} left", r["units_4w"] / 4 * r["rrp"] * 0.2,
                         "P1", "Buyer", 0.75, "electronics:stockout"))
    k = {"Stock value": f"${t['stock_value'].sum():,.0f}", "Overstocked SKUs": int((t["status"] == "Overstock").sum()),
         "Median weeks cover": f"{t['weeks_cover'].median():.1f}"}
    cols = ["name", "category", "on_hand", "units_4w", "sell_through_pct", "weeks_cover", "stock_value", "status"]
    return SkillResult("Sell-through & weeks of cover", t.reset_index()[cols].sort_values("weeks_cover", ascending=False), f, k)


@skill("electronics.aged_stock", pack="electronics", summary="Aged-stock ladder and markdown proposals (needs confirmation)",
       inputs=["stock (received_date)", "products"], outputs=["ageing table", "markdown proposals"], confirm=True,
       triggers=["what's aging in stock?", "what should we mark down?"])
def aged_stock(d: dict) -> SkillResult:
    """Ages stock from received date; proposes markdowns: 90-120 days 10%, 120-180 days 20%, 180+ days 30%.
    Markdowns change price, so they're always proposals for your confirmation."""
    asof = pd.Timestamp(d["sales"]["week"].max())
    t = d["stock"].merge(d["products"], on="sku")
    t["age_days"] = (asof - pd.to_datetime(t["received_date"])).dt.days
    t["stock_value"] = t["on_hand"] * t["unit_cost"]
    t["band"] = pd.cut(t["age_days"], [-1, 90, 120, 180, 10_000], labels=["<90", "90-120", "120-180", "180+"])
    md = {"<90": 0, "90-120": 10, "120-180": 20, "180+": 30}
    t["markdown_pct"] = t["band"].astype(str).map(md)
    t["margin_after_md_pct"] = (1 - t["unit_cost"] / (t["rrp"] * (1 - t["markdown_pct"] / 100))) * 100
    f = []
    for r in t[t["markdown_pct"] > 0].sort_values("stock_value", ascending=False).head(6).itertuples():
        weekly = -r.stock_value * r.markdown_pct / 100 / 8
        if r.margin_after_md_pct < 0:
            # critical check: a blanket markdown would sell below cost, so recommend the cheaper route first
            be = (1 - r.unit_cost / r.rrp) * 100
            f.append(Finding("Markdown", f"Don't mark {r.name} down {r.markdown_pct}% yet: ask the supplier for price protection or "
                             f"return-to-vendor, or bundle it; cap any markdown at {max(be - 2, 0):.0f}%",
                             f"${r.stock_value:,.0f} at cost, {r.age_days} days old; a {r.markdown_pct}% markdown sells at "
                             f"{r.margin_after_md_pct:.0f}% margin (below cost). Break-even markdown is {be:.0f}%",
                             -r.stock_value * max(be - 2, 0) / 100 / 8, "P2", "Category Manager", 0.6, "electronics:markdown"))
        else:
            f.append(Finding("Markdown", f"Mark down {r.name} by {r.markdown_pct}% ({r.age_days} days old)",
                             f"${r.stock_value:,.0f} at cost ageing; margin after markdown {r.margin_after_md_pct:.0f}%; "
                             "$/week = margin given up, spread over an 8-week sell-down", weekly, "P2", "Category Manager", 0.65,
                             "electronics:markdown"))
    ladder = t.groupby("band", observed=False)["stock_value"].sum().reset_index()
    k = {"Aged 90+ days": f"${t.loc[t['age_days'] > 90, 'stock_value'].sum():,.0f}",
         "Share of stock": f"{t.loc[t['age_days'] > 90, 'stock_value'].sum() / t['stock_value'].sum() * 100:.0f}%"}
    return SkillResult("Aged stock & markdown ladder", ladder, f, k, "Markdown % bands are configurable; confirm each before changing prices.")


@skill("electronics.price_erosion", pack="electronics", summary="Average selling price vs RRP over time (price erosion)",
       inputs=["sales", "products"], outputs=["erosion by category"], triggers=["are prices eroding?", "ASP trend"])
def price_erosion(d: dict) -> SkillResult:
    """Compares the last 4 weeks' average selling price with the first 4 weeks in the window, by category."""
    s = d["sales"].merge(d["products"][["sku", "category", "rrp"]], on="sku")
    w = sorted(s["week"].unique())
    first, last = s[s["week"].isin(w[:4])], s[s["week"].isin(w[-4:])]
    asp = lambda x: (x.groupby("category")["revenue"].sum() / x.groupby("category")["units"].sum())
    t = pd.DataFrame({"asp_then": asp(first), "asp_now": asp(last)})
    t["erosion_pct"] = (t["asp_now"] / t["asp_then"] - 1) * 100
    f = [Finding("Pricing", f"Review {c} pricing and promotion depth (ASP {v:+.1f}% in 26 weeks)",
                 "price erosion beyond 5% squeezes margin unless volume grows faster", 0, "P3", "Category Manager", 0.55,
                 "electronics:erosion") for c, v in t["erosion_pct"].items() if v < -5]
    return SkillResult("Price erosion (ASP)", t.reset_index().round(1), f, {"Worst": f"{t['erosion_pct'].min():.1f}%"})


@skill("electronics.attach_rate", pack="electronics", summary="Accessory attach rate vs devices sold",
       inputs=["sales", "products"], outputs=["attach rate"], triggers=["accessory attach rate", "how many accessories per phone?"])
def attach_rate(d: dict) -> SkillResult:
    """Accessory units per device sold (TVs, phones, tablets) in the last 4 weeks. Target 25%."""
    s = d["sales"][d["sales"]["week"] > d["sales"]["week"].max() - pd.Timedelta(weeks=4)].merge(d["products"], on="sku")
    dev = s[s["category"].isin(["TV", "Smartphone", "Tablet"])]["units"].sum()
    acc = s[s["category"] == "Accessory"]["units"].sum()
    rate = acc / dev * 100 if dev else 0
    f = [] if rate >= 25 else [Finding("Attach", f"Lift accessory attach from {rate:.0f}% towards 25% (bundles, till prompts, staff incentive)",
                                        f"{acc} accessories on {dev} devices in 4 weeks", (0.25 * dev - acc) / 4 * 49 * 0.6, "P3", "Store Manager", 0.6, "electronics:attach")]
    return SkillResult("Accessory attach rate", pd.DataFrame({"devices": [dev], "accessories": [acc], "attach_pct": [round(rate, 1)]}), f,
                       {"Attach rate": f"{rate:.0f}%"})


register_pack("electronics", "Consumer electronics", demo,
              ["electronics.sell_through", "electronics.aged_stock", "electronics.price_erosion", "electronics.attach_rate"])
