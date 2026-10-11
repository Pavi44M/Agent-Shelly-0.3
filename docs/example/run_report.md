# Shelly run report 20261011-212046

- Version **1.19.0** · week ending **2026-10-11** · config `98cb77fa102db364`

## Validation checks

| Check | Result | Detail |
|---|---|---|
| Data is fresh | ✅ PASS | latest date 2026-10-11 (0 days old) |
| Data quality ≥ 80/100 | ✅ PASS | score 90 |
| Chosen forecast beats or equals seasonal-naive baseline | ✅ PASS | best WAPE 18.1% vs baseline 24.0% |
| Forecast error acceptable (WAPE < 25%) | ✅ PASS | 18.1% |
| Recalled products blocked from reorder | ✅ PASS | 1 recall(s) |
| Segments stable (Jaccard ≥ 0.6) | ⚠️ WARN | 2 of 5 clusters unstable |
| Category P&L reconciles to total sales | ✅ PASS | 18,766.97 vs 18,766.97 |

## Inputs (SHA-256, first 16)

- `inventory.csv` 9620b91da521deba
- `products.csv` dac4db12cb89cd5d
- `recalls.csv` 4945f9573a44b48f
- `sales.csv` 28bfddfde84203af
- `waste.csv` 026bf7af203f6087

## Forecast models

| Model | WAPE % | MAPE % |
|---|---:|---:|
| SARIMA-X | 18.14 | 27.34 |
| XGBoost | 18.84 | 28.72 |
| Seasonal Naive | 24.01 | 36.01 |
| Naive | 35.87 | 42.26 |
| Drift | 35.93 | 42.33 |

## Decisions: 20 proposed by this run · **27 waiting for your confirmation across all packs**

- `D-2e5a6fb2` · Quality · Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) (impact -4,025)
- `D-1ca318b8` · Markdown · Don't mark TV model 1 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,632)
- `D-86ea731c` · Budget · Recovery plan for the categories furthest behind budget: Food To Go, Beer & Wine (impact -1,141)
- `D-a7ef05ce` · Markdown · Mark down TV model 3 by 20% (154 days old) (impact -1,109)
- `D-bc28d633` · Markdown · Don't mark TV model 6 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,049)
- `D-07180b1e` · Markdown · Mark down TV model 2 by 20% (168 days old) (impact -930)
- `D-ac096281` · Markdown · Don't mark Tablet model 3 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle i (impact -737)
- `D-a10ce1a8` · Slotting · Re-slot 47 A-class SKUs into the golden zone (impact +694)
- `D-2f92fdc9` · Delivery channel · Check the Uber Eats tablet/app on shift start and add it to the opening checklist (impact -421)
- `D-b967a1cd` · Markdown · Mark down Smartphone model 6 by 10% (105 days old) (impact -396)
- `D-2615ef21` · Attach · Lift accessory attach from 11% towards 25% (bundles, till prompts, staff incentive) (impact +390)
- `D-c295c68d` · Demand · Find out what drove the Energy Drink 500ml spike (local event? competitor out?) and hold extra cover if it rep (impact +296)
- `D-1f6c8773` · Category · Investigate Hot Pie Mince & Cheese: price, quality, range position or a new competitor (impact -196)
- `D-60d687f1` · Range & stock · Stop reordering TV model 1 and plan a sell-down (15 weeks cover) (impact -147)
- `D-5efd2aa2` · Customer terms · Review terms for North Grocers: minimum order or delivery fee (avg order $18) (impact +80)
- `D-ff82927a` · Customer terms · Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) (impact +79)
- `D-c0ddf6bb` · Customer terms · Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) (impact +33)
- `D-ae91034c` · Range & stock · Stop reordering Tablet model 6 and plan a sell-down (40 weeks cover) (impact -33)
- `D-91c10c78` · Range & stock · Stop reordering Headphones model 6 and plan a sell-down (12 weeks cover) (impact -12)
- `D-70b4e4a4` · Range & stock · Stop reordering Soundbar model 6 and plan a sell-down (13 weeks cover) (impact -12)
- `D-447f5085` · Range & stock · Stop reordering Accessory model 6 and plan a sell-down (20 weeks cover) (impact -2)
- `D-333c50cc` · Customer terms · Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) (impact +2)
- `D-c9430e4d` · Credit · Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) (impact +0)
- `D-b0a7c6e9` · Credit · Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) (impact +0)
- `D-a83884a1` · Credit · Put Metro Foods on credit hold until 60+ day balance is cleared ($788) (impact +0)
- `D-4f045fcb` · Compliance - recall · Pull Simmer Sauce 485g (GTIN 9429004521334) from shelf and quarantine ~29 units; block the item at POS and fol (impact +0)
- `D-dd70e942` · Range · Range review candidates (C-class and high waste): Avocado (impact +0)

## What Shelly learned this run

- No threshold changes (not enough new feedback yet).
