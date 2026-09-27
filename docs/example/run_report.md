# Shelly run report 20260927-204125

- Version **0.3.0** · week ending **2026-09-27** · config `98cb77fa102db364`

## Validation checks

| Check | Result | Detail |
|---|---|---|
| Data is fresh | ✅ PASS | latest date 2026-09-27 (0 days old) |
| Data quality ≥ 80/100 | ✅ PASS | score 90 |
| Chosen forecast beats or equals seasonal-naive baseline | ✅ PASS | best WAPE 16.3% vs baseline 22.1% |
| Forecast error acceptable (WAPE < 25%) | ✅ PASS | 16.3% |
| Recalled products blocked from reorder | ✅ PASS | 1 recall(s) |
| Segments stable (Jaccard ≥ 0.6) | ⚠️ WARN | 4 of 5 clusters unstable |
| Category P&L reconciles to total sales | ✅ PASS | 19,439.45 vs 19,439.45 |

## Inputs (SHA-256, first 16)

- `inventory.csv` 751c7cca6b7668ec
- `products.csv` dac4db12cb89cd5d
- `recalls.csv` b0ca3a0eacb5966c
- `sales.csv` 6b691ced661f8912
- `waste.csv` 030de265f28fec35

## Forecast models

| Model | WAPE % | MAPE % |
|---|---:|---:|
| XGBoost | 16.31 | 25.65 |
| SARIMA-X | 16.72 | 26.08 |
| Seasonal Naive | 22.14 | 32.93 |
| Naive | 36.02 | 38.02 |
| Drift | 36.11 | 38.11 |

## Decisions: 15 proposed by this run · **26 waiting for your confirmation across all packs**

- `D-8b0d9301` · Quality · Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) (impact -4,025)
- `D-7e9cd65a` · Markdown · Don't mark TV model 1 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,632)
- `D-ef6243c6` · Markdown · Mark down TV model 3 by 20% (154 days old) (impact -1,109)
- `D-3ebee468` · Markdown · Don't mark TV model 6 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,049)
- `D-b40d8b74` · Markdown · Mark down TV model 2 by 20% (168 days old) (impact -930)
- `D-1ed97f82` · Markdown · Don't mark Tablet model 3 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle i (impact -737)
- `D-8a5e76b4` · Slotting · Re-slot 47 A-class SKUs into the golden zone (impact +694)
- `D-856ad0e8` · Delivery channel · Check the Uber Eats tablet/app on shift start and add it to the opening checklist (impact -458)
- `D-c49fbb0f` · Markdown · Mark down Smartphone model 6 by 10% (105 days old) (impact -396)
- `D-66d654cc` · Attach · Lift accessory attach from 11% towards 25% (bundles, till prompts, staff incentive) (impact +390)
- `D-512f0735` · Demand · Find out what drove the Energy Drink 500ml spike (local event? competitor out?) and hold extra cover if it rep (impact +266)
- `D-1998148a` · Category · Investigate Frozen Dumplings 1kg: price, quality, range position or a new competitor (impact -153)
- `D-6d5be021` · Range & stock · Stop reordering TV model 1 and plan a sell-down (15 weeks cover) (impact -147)
- `D-690d4191` · Customer terms · Review terms for North Grocers: minimum order or delivery fee (avg order $18) (impact +80)
- `D-afb69194` · Customer terms · Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) (impact +79)
- `D-05fe17fe` · Customer terms · Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) (impact +33)
- `D-7a885bd7` · Range & stock · Stop reordering Tablet model 6 and plan a sell-down (40 weeks cover) (impact -33)
- `D-c69d6d4f` · Category · Investigate Pasta 500g: price, quality, range position or a new competitor (impact -33)
- `D-1840a41e` · Range & stock · Stop reordering Soundbar model 6 and plan a sell-down (13 weeks cover) (impact -12)
- `D-1bdb859c` · Range & stock · Stop reordering Headphones model 6 and plan a sell-down (12 weeks cover) (impact -12)
- `D-7e2a792b` · Customer terms · Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) (impact +2)
- `D-1989814f` · Range & stock · Stop reordering Accessory model 6 and plan a sell-down (20 weeks cover) (impact -2)
- `D-5aed3030` · Credit · Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) (impact +0)
- `D-ca9ae7af` · Credit · Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) (impact +0)
- `D-bb225423` · Credit · Put Metro Foods on credit hold until 60+ day balance is cleared ($788) (impact +0)
- `D-3939f56a` · Compliance - recall · Pull Simmer Sauce 485g (GTIN 9429004521334) from shelf and quarantine ~33 units; block the item at POS and fol (impact +0)

## What Shelly learned this run

- No threshold changes (not enough new feedback yet).
