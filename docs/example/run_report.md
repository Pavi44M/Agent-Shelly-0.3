# Shelly run report 20261105-065104

- Version **2.6.2** · week ending **2026-11-04** · config `98cb77fa102db364`

## Validation checks

| Check | Result | Detail |
|---|---|---|
| Data is fresh | ✅ PASS | latest date 2026-11-04 (1 days old) |
| Data quality ≥ 80/100 | ✅ PASS | score 90 |
| Chosen forecast beats or equals seasonal-naive baseline | ✅ PASS | best WAPE 17.6% vs baseline 23.4% |
| Forecast error acceptable (WAPE < 25%) | ✅ PASS | 17.6% |
| Recalled products blocked from reorder | ✅ PASS | 1 recall(s) |
| Segments stable (Jaccard ≥ 0.6) | ✅ PASS | 0 of 2 clusters unstable |
| Category P&L reconciles to total sales | ✅ PASS | 19,836.00 vs 19,836.00 |

## Inputs (SHA-256, first 16)

- `inventory.csv` b666da857e1f3ce6
- `products.csv` dac4db12cb89cd5d
- `recalls.csv` 1ce4edc85e68a8cb
- `sales.csv` 6526a694dee7173d
- `waste.csv` 9626bb6e0440c248

## Forecast models

| Model | WAPE % | MAPE % |
|---|---:|---:|
| SARIMA-X | 17.61 | 35.3 |
| XGBoost | 17.9 | 36.58 |
| Seasonal Naive | 23.4 | 42.54 |
| Naive | 25.06 | 47.07 |
| Drift | 25.13 | 47.01 |

## Decisions: 16 proposed by this run · **27 waiting for your confirmation across all packs**

- `D-4a77930f` · Quality · Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) (impact -4,025)
- `D-cedc478f` · Markdown · Don't mark TV model 1 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,632)
- `D-95b15dea` · Budget · Recovery plan for the categories furthest behind budget: Beer & Wine, Food To Go (impact -1,376)
- `D-0800c23b` · Markdown · Mark down TV model 3 by 20% (154 days old) (impact -1,109)
- `D-132e8800` · Markdown · Don't mark TV model 6 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,049)
- `D-ff68c3bc` · Markdown · Mark down TV model 2 by 20% (168 days old) (impact -930)
- `D-e73ed7bb` · Markdown · Don't mark Tablet model 3 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle i (impact -737)
- `D-c3b14a5f` · Slotting · Re-slot 47 A-class SKUs into the golden zone (impact +694)
- `D-32cc1b23` · Delivery channel · Check the Uber Eats tablet/app on shift start and add it to the opening checklist (impact -459)
- `D-6b78f53c` · Markdown · Mark down Smartphone model 6 by 10% (105 days old) (impact -396)
- `D-76c0ffcc` · Attach · Lift accessory attach from 11% towards 25% (bundles, till prompts, staff incentive) (impact +390)
- `D-9db2cd51` · Category · Investigate Sushi Pack 8pc: price, quality, range position or a new competitor (impact -371)
- `D-275afe50` · Demand · Find out what drove the Energy Drink 500ml spike (local event? competitor out?) and hold extra cover if it rep (impact +335)
- `D-d1f1784d` · Range & stock · Stop reordering TV model 1 and plan a sell-down (15 weeks cover) (impact -147)
- `D-29d66cfb` · Customer terms · Review terms for North Grocers: minimum order or delivery fee (avg order $18) (impact +80)
- `D-4126529a` · Customer terms · Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) (impact +79)
- `D-13cf34bb` · Customer terms · Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) (impact +33)
- `D-ff75fb90` · Range & stock · Stop reordering Tablet model 6 and plan a sell-down (40 weeks cover) (impact -33)
- `D-72b47853` · Range & stock · Stop reordering Headphones model 6 and plan a sell-down (12 weeks cover) (impact -12)
- `D-16f899ed` · Range & stock · Stop reordering Soundbar model 6 and plan a sell-down (13 weeks cover) (impact -12)
- `D-31297e96` · Range & stock · Stop reordering Accessory model 6 and plan a sell-down (20 weeks cover) (impact -2)
- `D-6042ca41` · Customer terms · Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) (impact +2)
- `D-f73b0789` · Credit · Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) (impact +0)
- `D-aae30b00` · Credit · Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) (impact +0)
- `D-f0941bd5` · Credit · Put Metro Foods on credit hold until 60+ day balance is cleared ($788) (impact +0)
- `D-f7dd06b7` · Compliance - recall · Pull Simmer Sauce 485g (GTIN 9429004521334) from shelf and quarantine ~14 units; block the item at POS and fol (impact +0)
- `D-5f9eed7c` · Replenishment · Place today's order: 1 lines are below lead-time cover ($269 at cost). Top lines: Energy Drink 500ml (impact +0)

## What Shelly learned this run

- No threshold changes (not enough new feedback yet).
