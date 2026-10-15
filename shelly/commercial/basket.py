"""What sells together (v2.5.0): anonymous baskets, pairs with support, confidence and lift, and shopping missions.

The sample data has daily totals per line, not till receipts, so baskets are SIMULATED: 6 weeks of trading,
each basket drawn from a shopping mission (top-up, dinner tonight, breakfast, treat and drink, lunch on the go,
household run) and filled from that mission's lines, then scaled so line totals track the real daily sales.
The pairs therefore show the method working, not a finding about real shoppers. No person is in any basket:
a basket is a list of lines with a time, never a card, a name or a face.
"""
from __future__ import annotations

import itertools
import random
from collections import Counter

import pandas as pd

MISSIONS = {
    "Top-up": {"share": .34, "size": (1, 3), "cats": ["Dairy", "Dairy", "Bakery", "Bakery", "Produce", "Beverages", "Household", "Health & Beauty"]},
    "Dinner tonight": {"share": .18, "size": (3, 6), "cats": ["Grocery", "Produce", "Dairy", "Frozen", "Beer & Wine"]},
    "Breakfast": {"share": .12, "size": (2, 4), "cats": ["Dairy", "Bakery", "Grocery", "Beverages"]},
    "Treat and drink": {"share": .16, "size": (2, 3), "cats": ["Snacks & Confectionery", "Beverages", "Beer & Wine"]},
    "Lunch on the go": {"share": .13, "size": (1, 3), "cats": ["Food To Go", "Beverages", "Snacks & Confectionery"]},
    "Household run": {"share": .07, "size": (1, 4), "cats": ["Household", "Health & Beauty", "Grocery", "Dairy"]},
}
# lines people buy for the same meal or moment: when the first is in the basket, the second often follows
COMPLEMENTS = {"GRO003": [("GRO004", .55)], "GRO006": [("GRO005", .5), ("PRD002", .3)], "SNK004": [("GRO005", .45)], "MLK001": [("BAK001", .3)],
               "BAK001": [("DRY010", .3)], "GRO008": [("MLK001", .4)], "FTG001": [("BEV006", .35)], "FTG003": [("BEV002", .35)],
               "FRZ003": [("BEV002", .4)], "LIQ001": [("SNK001", .4)], "LIQ002": [("DRY012", .3)], "PRD003": [("GRO003", .25)]}
SEED = 2025


def simulate(products: pd.DataFrame, sales: pd.DataFrame, days: int = 42) -> list:
    rnd = random.Random(SEED)
    s = sales[sales.channel == "in_store"]
    end = s.date.max(); s = s[s.date > end - pd.Timedelta(days=days)]
    w = s.groupby("sku").units.sum()                                   # real sales weight each line within its mission
    bycat = {c: [(sku, max(1, int(w.get(sku, 1)))) for sku in g.sku] for c, g in products.groupby("category")}
    names, shares = list(MISSIONS), [MISSIONS[m]["share"] for m in MISSIONS]
    per_day = max(60, int(s.units.sum() / days / 2.4))                 # ~2.4 items a basket
    B = []
    for d in range(days):
        for i in range(per_day):
            m = rnd.choices(names, shares)[0]; M = MISSIONS[m]
            k = rnd.randint(*M["size"]); items = set()
            for _ in range(k * 3):
                if len(items) >= k: break
                cat = rnd.choice(M["cats"]); pool = bycat.get(cat)
                if pool: items.add(rnd.choices([p for p, _ in pool], [w_ for _, w_ in pool])[0])
            for a in list(items):
                for c, pr in COMPLEMENTS.get(a, []):
                    if rnd.random() < pr: items.add(c)
            if items: B.append({"day": d, "mission": m, "items": sorted(items)})
    return B


def pairs(B: list, names: dict, top: int = 15) -> list:
    n = len(B); one = Counter(); two = Counter()
    for b in B:
        one.update(b["items"]); two.update(itertools.combinations(b["items"], 2))
    out = []
    for (a, c), k in two.items():
        if k / n < .008: continue                                     # at least 0.8% of baskets
        sup = k / n; lift = sup / ((one[a] / n) * (one[c] / n))
        conf = max(k / one[a], k / one[c])
        out.append({"a": a, "b": c, "a_name": names[a], "b_name": names[c], "baskets": k, "support_pct": round(sup * 100, 2),
                    "confidence_pct": round(conf * 100, 1), "lift": round(lift, 2)})
    return sorted(out, key=lambda r: -r["lift"])[:top]


def missions(B: list, cats: dict, prices: dict) -> list:
    df = pd.DataFrame([{"mission": b["mission"], "items": len(b["items"]), "value": sum(prices[i] for i in b["items"])} for b in B])
    g = df.groupby("mission").agg(baskets=("items", "size"), items=("items", "mean"), value=("value", "mean")).reset_index()
    tot = g.baskets.sum()
    return [{"mission": r.mission, "share_pct": round(r.baskets / tot * 100, 1), "items": round(r["items"], 1), "avg_basket": round(r.value, 2),
             "sales_share_pct": round(r.baskets * r.value / (g.baskets * g.value).sum() * 100, 1)} for _, r in g.sort_values("baskets", ascending=False).iterrows()]


def run(products: pd.DataFrame, sales: pd.DataFrame) -> dict:
    B = simulate(products, sales)
    names = dict(zip(products.sku, products.product_name)); cats = dict(zip(products.sku, products.category)); prices = dict(zip(products.sku, products.unit_price))
    P = pairs(B, names)
    ideas = []
    for p in P[:5]:
        ideas.append(f"{p['a_name']} and {p['b_name']} sell together {p['lift']}× more than chance: place them within sight of each other, or bundle them.")
    return {"baskets": len(B), "days": 42, "avg_items": round(sum(len(b["items"]) for b in B) / len(B), 2), "pairs": P,
            "missions": missions(B, cats, prices), "ideas": ideas}
