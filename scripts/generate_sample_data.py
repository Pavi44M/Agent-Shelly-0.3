"""
Generate a realistic, fully synthetic dataset for an Auckland neighbourhood
convenience store (Four Square-style format). Safe to publish: no real store data.

Outputs (data/sample/):
  products.csv   - product master (SKU, category, price, cost, shelf life, supplier)
  sales.csv      - daily sales by SKU x channel (in_store / uber_eats / on_demand)
  inventory.csv  - weekly stock counts: SAP system qty vs physical qty
  waste.csv      - daily waste and markdowns by SKU

Patterns built in (so the agent has something real to find):
  * weekday lunch-trade pattern, weekend dip, NZ public holidays
  * summer/winter seasonality by category (ice cream up in summer, soup in winter)
  * delivery channels growing over time
  * promotions (mid-week price cuts that lift volume)
  * injected recent issues: an out-of-stock, an unexplained spike, shrinkage,
    a waste blow-out, and two days of delivery-tablet outage
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

# sku, name, category, price, cost, shelf_life_days, base_daily_units, season(+1 summer,-1 winter,0), supplier
PRODUCTS = [
    ("MLK001", "Milk Standard 2L", "Dairy", 4.89, 3.55, 10, 38, 0, "Dairy Co-op"),
    ("MLK002", "Milk Lite 2L", "Dairy", 4.89, 3.55, 10, 16, 0, "Dairy Co-op"),
    ("MLK003", "Oat Milk 1L", "Dairy", 4.29, 2.70, 60, 7, 0, "Plant Foods NZ"),
    ("DRY010", "Butter 500g", "Dairy", 7.49, 5.60, 60, 6, 0, "Dairy Co-op"),
    ("DRY011", "Greek Yoghurt 1kg", "Dairy", 7.99, 5.10, 21, 5, 1, "Dairy Co-op"),
    ("DRY012", "Cheese Block 1kg", "Dairy", 13.99, 10.40, 90, 5, 0, "Dairy Co-op"),
    ("BAK001", "Toast Bread White", "Bakery", 3.49, 2.20, 5, 20, 0, "Auckland Bakehouse"),
    ("BAK002", "Wholemeal Loaf", "Bakery", 4.29, 2.70, 5, 11, 0, "Auckland Bakehouse"),
    ("BAK003", "Croissant 4pk", "Bakery", 5.99, 3.30, 3, 6, 0, "Auckland Bakehouse"),
    ("FTG001", "Chicken Sandwich", "Food To Go", 7.49, 3.90, 2, 17, 0, "FreshKitchen"),
    ("FTG002", "Sushi Pack 8pc", "Food To Go", 9.99, 5.60, 1, 13, 1, "FreshKitchen"),
    ("FTG003", "Hot Pie Mince & Cheese", "Food To Go", 5.49, 2.40, 2, 15, -1, "FreshKitchen"),
    ("FTG004", "Salad Bowl", "Food To Go", 10.99, 6.20, 2, 6, 1, "FreshKitchen"),
    ("FTG005", "Filled Roll", "Food To Go", 6.49, 3.20, 2, 10, 0, "FreshKitchen"),
    ("BEV001", "Energy Drink 500ml", "Beverages", 4.29, 2.15, 365, 26, 1, "Beverage Dist."),
    ("BEV002", "Cola 1.5L", "Beverages", 4.49, 2.30, 270, 14, 1, "Beverage Dist."),
    ("BEV003", "Sparkling Water 1L", "Beverages", 2.49, 1.10, 365, 12, 1, "Beverage Dist."),
    ("BEV004", "Iced Coffee 500ml", "Beverages", 4.99, 2.70, 30, 13, 1, "Dairy Co-op"),
    ("BEV005", "Kombucha 330ml", "Beverages", 4.79, 2.60, 120, 6, 1, "Plant Foods NZ"),
    ("BEV006", "Bottled Water 750ml", "Beverages", 2.99, 0.95, 365, 19, 1, "Beverage Dist."),
    ("BBT001", "Bubble Tea Kit", "Beverages", 6.99, 3.90, 90, 5, 1, "Asia Imports"),
    ("SNK001", "Potato Chips 150g", "Snacks & Confectionery", 3.99, 2.10, 180, 19, 0, "Snack Foods NZ"),
    ("SNK002", "Chocolate Block 200g", "Snacks & Confectionery", 5.49, 3.20, 270, 15, 0, "Confectionery Ltd"),
    ("SNK003", "Muesli Bar 6pk", "Snacks & Confectionery", 4.29, 2.60, 240, 8, 0, "Snack Foods NZ"),
    ("SNK004", "Corn Chips 230g", "Snacks & Confectionery", 4.49, 2.40, 180, 8, 0, "Latin Pantry"),
    ("SNK005", "Lollies Bag 200g", "Snacks & Confectionery", 3.49, 1.70, 300, 9, 0, "Confectionery Ltd"),
    ("FRZ001", "Ice Cream Tub 2L", "Frozen", 8.99, 5.40, 365, 7, 1, "Frozen Foods NZ"),
    ("FRZ002", "Ice Block Single", "Frozen", 2.99, 1.20, 365, 11, 1, "Frozen Foods NZ"),
    ("FRZ003", "Frozen Pizza", "Frozen", 7.99, 4.70, 365, 5, -1, "Frozen Foods NZ"),
    ("FRZ004", "Frozen Dumplings 1kg", "Frozen", 11.99, 7.10, 365, 4, -1, "Asia Imports"),
    ("GRO001", "Instant Noodles 5pk", "Grocery", 4.49, 2.60, 365, 11, -1, "Asia Imports"),
    ("GRO002", "Canned Soup 500g", "Grocery", 3.29, 1.90, 730, 5, -1, "Pantry Brands"),
    ("GRO003", "Pasta 500g", "Grocery", 2.49, 1.30, 730, 6, 0, "Pantry Brands"),
    ("GRO004", "Simmer Sauce 485g", "Grocery", 3.99, 2.30, 540, 4, -1, "Pantry Brands"),
    ("GRO005", "Salsa 300g", "Grocery", 4.79, 2.90, 365, 3, 1, "Latin Pantry"),
    ("GRO006", "Taco Kit", "Grocery", 6.49, 4.00, 365, 3, 0, "Latin Pantry"),
    ("GRO007", "Eggs Free Range 12pk", "Grocery", 10.99, 8.20, 35, 9, 0, "Farm Fresh"),
    ("GRO008", "Coffee Beans 200g", "Grocery", 11.99, 7.60, 180, 3, 0, "Pantry Brands"),
    ("PRD001", "Bananas (each)", "Produce", 0.69, 0.38, 6, 30, 0, "Produce Market"),
    ("PRD002", "Avocado", "Produce", 2.49, 1.40, 5, 8, 1, "Produce Market"),
    ("PRD003", "Tomatoes 500g", "Produce", 4.49, 2.60, 7, 5, 1, "Produce Market"),
    ("HHD001", "Toilet Paper 6pk", "Household", 8.99, 5.90, 3650, 5, 0, "Home Supplies"),
    ("HHD002", "Dishwash Liquid", "Household", 4.99, 2.90, 1095, 3, 0, "Home Supplies"),
    ("HHD003", "Phone Charger Cable", "Household", 14.99, 5.50, 3650, 1, 0, "Home Supplies"),
    ("PHM001", "Paracetamol 20pk", "Health & Beauty", 3.99, 1.60, 730, 4, -1, "Pharma Dist."),
    ("PHM002", "Sunscreen SPF50", "Health & Beauty", 14.99, 8.20, 730, 2, 1, "Pharma Dist."),
    ("LIQ001", "Craft Beer 6pk", "Beer & Wine", 22.99, 15.30, 180, 6, 1, "Liquor Dist."),
    ("LIQ002", "Sauvignon Blanc 750ml", "Beer & Wine", 15.99, 10.20, 730, 5, 1, "Liquor Dist."),
    ("LIQ003", "RTD 4pk", "Beer & Wine", 17.99, 11.90, 365, 5, 1, "Liquor Dist."),
    ("LIQ004", "Pinot Noir 750ml", "Beer & Wine", 19.99, 12.80, 730, 2, -1, "Liquor Dist."),
]

# NZ public holidays (Auckland) in the window
NZ_HOLIDAYS = pd.to_datetime([
    "2024-10-28", "2024-12-25", "2024-12-26", "2025-01-01", "2025-01-02", "2025-01-27",
    "2025-02-06", "2025-04-18", "2025-04-21", "2025-04-25", "2025-06-02", "2025-06-20",
    "2025-10-27", "2025-12-25", "2025-12-26", "2026-01-01", "2026-01-02", "2026-01-26",
    "2026-02-06", "2026-04-03", "2026-04-06", "2026-04-27", "2026-06-01", "2026-07-10",
])

# Eden Terrace: office-worker lunch trade -> weekdays strong, weekends softer
DOW_FACTOR = {0: 1.08, 1: 1.05, 2: 1.06, 3: 1.08, 4: 1.12, 5: 0.86, 6: 0.75}
CHANNEL_SPLIT_START = {"in_store": 0.90, "uber_eats": 0.07, "on_demand": 0.03}
CHANNEL_SPLIT_END = {"in_store": 0.80, "uber_eats": 0.13, "on_demand": 0.07}


def gtin13(first12: str) -> str:
    """Append the GS1 mod-10 check digit to a 12-digit body."""
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(first12))
    return first12 + str((10 - total % 10) % 10)


def seasonality(day_of_year: np.ndarray, season: int) -> np.ndarray:
    # NZ summer peaks around mid-January (doy ~ 15)
    summer_wave = np.cos(2 * np.pi * (day_of_year - 15) / 365.25)
    return 1 + 0.28 * season * summer_wave


def main(out_dir: Path, end: str, days: int) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    dates = pd.date_range(end=pd.Timestamp(end), periods=days, freq="D")
    n = len(dates)
    doy = dates.dayofyear.values
    dow = np.array([DOW_FACTOR[d] for d in dates.dayofweek])
    hol = np.where(dates.isin(NZ_HOLIDAYS), 0.72, 1.0)
    # December trading bump, quieter mid-Jan when offices are shut
    month_adj = np.where(dates.month == 12, 1.08, 1.0) * np.where(
        (dates.month == 1) & (dates.day < 20), 0.85, 1.0)
    trend = np.linspace(0.97, 1.05, n)  # modest like-for-like growth
    progress = np.linspace(0, 1, n)

    products = pd.DataFrame(PRODUCTS, columns=[
        "sku", "product_name", "category", "unit_price", "unit_cost",
        "shelf_life_days", "base_daily_units", "season", "supplier"])

    sales_rows, waste_rows, inv_rows = [], [], []
    asof = dates[-1]

    for p in products.itertuples(index=False):
        lam = (p.base_daily_units * dow * hol * month_adj * trend
               * seasonality(doy, p.season))
        # promotions: ~6% of weeks, Tue-Thu, 20% off, +45% volume
        promo = np.zeros(n, dtype=bool)
        for wk in np.unique(dates.isocalendar().week.values + 100 * dates.year.values):
            if RNG.random() < 0.06:
                mask = ((dates.isocalendar().week.values + 100 * dates.year.values) == wk) & (
                    dates.dayofweek.isin([1, 2, 3]))
                promo |= mask
        lam = lam * np.where(promo, 1.45, 1.0)

        # ---- injected recent issues (last 3 weeks) ----
        days_ago = (asof - dates).days
        if p.sku == "MLK001":  # out-of-stock: 3 days near zero, 6-8 days ago
            lam = np.where((days_ago >= 6) & (days_ago <= 8), lam * 0.08, lam)
        if p.sku == "BEV001":  # unexplained spike 2-3 days ago (event nearby?)
            lam = np.where((days_ago >= 2) & (days_ago <= 3), lam * 2.6, lam)
        if p.sku == "FTG002":  # sushi sales sagging over last 14 days
            lam = np.where(days_ago <= 13, lam * 0.62, lam)

        units_total = RNG.poisson(np.clip(lam, 0.01, None))
        price = np.where(promo, round(p.unit_price * 0.8, 2), p.unit_price)

        for ch in ["in_store", "uber_eats", "on_demand"]:
            share = (CHANNEL_SPLIT_START[ch]
                     + (CHANNEL_SPLIT_END[ch] - CHANNEL_SPLIT_START[ch]) * progress)
            # food-to-go & beverages skew more to delivery
            if p.category in ("Food To Go", "Beverages", "Snacks & Confectionery") and ch != "in_store":
                share = share * 1.35
            if p.category in ("Beer & Wine",) and ch == "on_demand":
                share = share * 0.2
            ch_units = RNG.binomial(units_total, np.clip(share, 0, 0.95))
            # two-day delivery tablet outage 4-5 days ago -> Uber Eats near zero
            if ch == "uber_eats":
                ch_units = np.where((days_ago >= 4) & (days_ago <= 5),
                                    (ch_units * 0.1).astype(int), ch_units)
            for i in np.nonzero(ch_units)[0]:
                sales_rows.append((dates[i].date(), p.sku, ch, int(ch_units[i]),
                                   round(float(ch_units[i] * price[i]), 2),
                                   round(float(ch_units[i] * p.unit_cost), 2),
                                   int(promo[i])))

        # waste & markdowns: perishables only
        if p.shelf_life_days <= 21:
            waste_rate = {1: 0.10, 2: 0.08, 3: 0.07, 5: 0.05, 6: 0.04, 7: 0.03}.get(
                p.shelf_life_days, 0.02)
            w_lam = lam * waste_rate
            if p.sku == "FTG001":  # sandwich waste blow-out last 7 days (over-ordering)
                w_lam = np.where(days_ago <= 6, w_lam * 3.2, w_lam)
            if p.sku == "FTG002":  # sushi: sales down but order volume unchanged
                w_lam = np.where(days_ago <= 13, w_lam * 2.4, w_lam)
            wasted = RNG.poisson(w_lam)
            marked = RNG.poisson(lam * waste_rate * 0.8)
            for i in np.nonzero(wasted + marked)[0]:
                waste_rows.append((dates[i].date(), p.sku, int(wasted[i]), int(marked[i]),
                                   "expired" if wasted[i] else "markdown"))

        # weekly stock counts (Sundays): SAP vs physical
        for i in np.nonzero(dates.dayofweek == 6)[0]:
            sap = int(max(p.base_daily_units * 9 + RNG.normal(0, 4), 4))
            shrink = RNG.binomial(sap, 0.012)
            if p.sku in ("SNK002", "LIQ003") and days_ago[i] <= 20:  # emerging shrinkage
                shrink += int(sap * 0.22)
            if p.sku == "GRO005" and days_ago[i] <= 10:  # receiving error: extra case unbooked
                shrink -= 6
            inv_rows.append((dates[i].date(), p.sku, sap, sap - shrink))

    sales = pd.DataFrame(sales_rows, columns=[
        "date", "sku", "channel", "units", "net_sales", "cost", "promo_flag"])
    waste = pd.DataFrame(waste_rows, columns=[
        "date", "sku", "units_wasted", "units_marked_down", "reason"])
    inv = pd.DataFrame(inv_rows, columns=["count_date", "sku", "sap_qty", "physical_qty"])

    # realistic data-quality noise for the Data Understanding phase to catch
    dup = sales.sample(12, random_state=1)
    sales = pd.concat([sales, dup], ignore_index=True)
    neg_idx = sales.sample(5, random_state=2).index
    sales.loc[neg_idx, "units"] = -sales.loc[neg_idx, "units"]  # refunds keyed as negatives
    sales.loc[sales.sample(4, random_state=3).index, "net_sales"] = np.nan

    # GS1 GTIN-13 barcodes (942 = GS1 New Zealand prefix) with valid check digits,
    # plus two deliberately broken ones for the GS1 compliance check to catch
    products["gtin"] = [gtin13(f"942{9000000 + i * 137:07d}{i % 100:02d}") for i in range(len(products))]
    products.loc[products["sku"] == "GRO006", "gtin"] = "9429000822055"   # bad check digit
    products.loc[products["sku"] == "HHD003", "gtin"] = "94290008"        # truncated
    products.drop(columns=["base_daily_units", "season"]).to_csv(out_dir / "products.csv", index=False)

    # a supplier product-recall notice affecting a line we stock
    recall_gtin = products.loc[products["sku"] == "GRO004", "gtin"].iloc[0]
    pd.DataFrame([{
        "notice_date": (asof - pd.Timedelta(days=1)).date(), "gtin": recall_gtin,
        "product_description": "Simmer Sauce 485g - batch L2609",
        "reason": "Undeclared allergen (milk)", "action": "Remove from sale and quarantine",
    }]).to_csv(out_dir / "recalls.csv", index=False)
    sales.sort_values(["date", "sku", "channel"]).to_csv(out_dir / "sales.csv", index=False)
    waste.to_csv(out_dir / "waste.csv", index=False)
    inv.to_csv(out_dir / "inventory.csv", index=False)
    print(f"Wrote {len(sales):,} sales rows, {len(waste):,} waste rows, "
          f"{len(inv):,} stock counts for {len(products)} SKUs to {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/sample")
    ap.add_argument("--end", default="2026-09-25", help="last trading day in the data")
    ap.add_argument("--days", type=int, default=730)
    a = ap.parse_args()
    main(Path(a.out), a.end, a.days)
