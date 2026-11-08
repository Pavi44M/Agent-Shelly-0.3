# Shelly run report 20261108-213238

- Version **2.6.2** · week ending **2026-11-08** · config `98cb77fa102db364`

## Validation checks

| Check | Result | Detail |
|---|---|---|
| Data is fresh | ✅ PASS | latest date 2026-11-08 (0 days old) |
| Data quality ≥ 80/100 | ✅ PASS | score 90 |
| Chosen forecast beats or equals seasonal-naive baseline | ✅ PASS | best WAPE 17.5% vs baseline 22.3% |
| Forecast error acceptable (WAPE < 25%) | ✅ PASS | 17.5% |
| Recalled products blocked from reorder | ✅ PASS | 1 recall(s) |
| Segments stable (Jaccard ≥ 0.6) | ✅ PASS | 0 of 5 clusters unstable |
| Category P&L reconciles to total sales | ✅ PASS | 20,620.71 vs 20,620.71 |

## Inputs (SHA-256, first 16)

- `inventory.csv` 4153bca29d111b12
- `products.csv` dac4db12cb89cd5d
- `recalls.csv` f718d1182aecdd5a
- `sales.csv` 4dbd61ba315faf99
- `waste.csv` b4fe92cf245cbd20

## Forecast models

| Model | WAPE % | MAPE % |
|---|---:|---:|
| SARIMA-X | 17.53 | 23.69 |
| XGBoost | 17.9 | 24.95 |
| Seasonal Naive | 22.31 | 32.12 |
| Naive | 35.04 | 35.34 |
| Drift | 35.16 | 35.48 |

## Decisions: 17 proposed by this run · **25 waiting for your confirmation across all packs**

- `D-f4ed6ec7` · Quality · Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) (impact -4,025)
- `D-ee8b5ae4` · Markdown · Don't mark TV model 1 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,632)
- `D-54973fd9` · Markdown · Mark down TV model 3 by 20% (154 days old) (impact -1,109)
- `D-24639545` · Markdown · Don't mark TV model 6 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,049)
- `D-e2ca11a6` · Markdown · Mark down TV model 2 by 20% (168 days old) (impact -930)
- `D-fb58657c` · Markdown · Don't mark Tablet model 3 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle i (impact -737)
- `D-764ff5b0` · Slotting · Re-slot 47 A-class SKUs into the golden zone (impact +694)
- `D-ddc0a828` · Delivery channel · Check the Uber Eats tablet/app on shift start and add it to the opening checklist (impact -438)
- `D-d759501b` · Markdown · Mark down Smartphone model 6 by 10% (105 days old) (impact -396)
- `D-b0b2d2c5` · Attach · Lift accessory attach from 11% towards 25% (bundles, till prompts, staff incentive) (impact +390)
- `D-2ffabcc1` · Demand · Find out what drove the Energy Drink 500ml spike (local event? competitor out?) and hold extra cover if it rep (impact +296)
- `D-72e7ef08` · Range & stock · Stop reordering TV model 1 and plan a sell-down (15 weeks cover) (impact -147)
- `D-a8ddf081` · Customer terms · Review terms for North Grocers: minimum order or delivery fee (avg order $18) (impact +80)
- `D-c746ccfd` · Category · Investigate Corn Chips 230g: price, quality, range position or a new competitor (impact -80)
- `D-467f4fd3` · Customer terms · Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) (impact +79)
- `D-df53d8f2` · Customer terms · Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) (impact +33)
- `D-7e312925` · Range & stock · Stop reordering Tablet model 6 and plan a sell-down (40 weeks cover) (impact -33)
- `D-18a2ca58` · Range & stock · Stop reordering Headphones model 6 and plan a sell-down (12 weeks cover) (impact -12)
- `D-d28a7ded` · Range & stock · Stop reordering Soundbar model 6 and plan a sell-down (13 weeks cover) (impact -12)
- `D-c30a50ea` · Customer terms · Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) (impact +2)
- `D-68d91908` · Range & stock · Stop reordering Accessory model 6 and plan a sell-down (20 weeks cover) (impact -2)
- `D-3a9b96c4` · Credit · Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) (impact +0)
- `D-0aaffd12` · Credit · Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) (impact +0)
- `D-3dd2849b` · Credit · Put Metro Foods on credit hold until 60+ day balance is cleared ($788) (impact +0)
- `D-33220edf` · Compliance - recall · Pull Simmer Sauce 485g (GTIN 9429004521334) from shelf and quarantine ~32 units; block the item at POS and fol (impact +0)

## What Shelly learned this run

- No threshold changes (not enough new feedback yet).
