# Shelly run report 20261003-053704

- Version **1.4.0** · week ending **2026-09-25** · config `98cb77fa102db364`

## Validation checks

| Check | Result | Detail |
|---|---|---|
| Data is fresh | ✅ PASS | latest date 2026-09-25 (8 days old) |
| Data quality ≥ 80/100 | ✅ PASS | score 90 |
| Chosen forecast beats or equals seasonal-naive baseline | ✅ PASS | best WAPE 16.4% vs baseline 21.6% |
| Forecast error acceptable (WAPE < 25%) | ✅ PASS | 16.4% |
| Recalled products blocked from reorder | ✅ PASS | 1 recall(s) |
| Segments stable (Jaccard ≥ 0.6) | ⚠️ WARN | 2 of 5 clusters unstable |
| Category P&L reconciles to total sales | ✅ PASS | 18,856.83 vs 18,856.83 |

## Inputs (SHA-256, first 16)

- `inventory.csv` d93ce315b51f697d
- `products.csv` dac4db12cb89cd5d
- `recalls.csv` c733a376bffddc29
- `sales.csv` 49e32380e5ca74ee
- `waste.csv` 27233a8430ee47f6

## Forecast models

| Model | WAPE % | MAPE % |
|---|---:|---:|
| SARIMA-X | 16.4 | 23.33 |
| XGBoost | 16.41 | 23.52 |
| Seasonal Naive | 21.63 | 30.12 |
| Naive | 25.27 | 35.67 |
| Drift | 25.33 | 35.76 |

## Decisions: 16 proposed by this run · **28 waiting for your confirmation across all packs**

- `D-4c03dee9` · Quality · Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) (impact -4,025)
- `D-29f7eb66` · Markdown · Don't mark TV model 1 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,632)
- `D-299ec477` · Budget · Recovery plan for the categories furthest behind budget: Beer & Wine, Dairy (impact -1,241)
- `D-cea7a835` · Markdown · Mark down TV model 3 by 20% (154 days old) (impact -1,109)
- `D-a76a5320` · Markdown · Don't mark TV model 6 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,049)
- `D-8ab68d6b` · Markdown · Mark down TV model 2 by 20% (168 days old) (impact -930)
- `D-4e6aa0e8` · Markdown · Don't mark Tablet model 3 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle i (impact -737)
- `D-8c52427b` · Slotting · Re-slot 47 A-class SKUs into the golden zone (impact +694)
- `D-4c976817` · Delivery channel · Check the Uber Eats tablet/app on shift start and add it to the opening checklist (impact -479)
- `D-9761e5c2` · Markdown · Mark down Smartphone model 6 by 10% (105 days old) (impact -396)
- `D-aa163af1` · Attach · Lift accessory attach from 11% towards 25% (bundles, till prompts, staff incentive) (impact +390)
- `D-f57e6edd` · Category · Investigate Sushi Pack 8pc: price, quality, range position or a new competitor (impact -288)
- `D-406cb398` · Category · Investigate Frozen Pizza: price, quality, range position or a new competitor (impact -176)
- `D-d442e7ac` · Range & stock · Stop reordering TV model 1 and plan a sell-down (15 weeks cover) (impact -147)
- `D-0820d8df` · Customer terms · Review terms for North Grocers: minimum order or delivery fee (avg order $18) (impact +80)
- `D-0ac9d9d1` · Customer terms · Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) (impact +79)
- `D-370d54fb` · Customer terms · Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) (impact +33)
- `D-819a67f6` · Range & stock · Stop reordering Tablet model 6 and plan a sell-down (40 weeks cover) (impact -33)
- `D-27ba9ce3` · Range & stock · Stop reordering Soundbar model 6 and plan a sell-down (13 weeks cover) (impact -12)
- `D-240cd493` · Range & stock · Stop reordering Headphones model 6 and plan a sell-down (12 weeks cover) (impact -12)
- `D-f17a0f55` · Customer terms · Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) (impact +2)
- `D-bbf0321b` · Range & stock · Stop reordering Accessory model 6 and plan a sell-down (20 weeks cover) (impact -2)
- `D-c3342795` · Compliance - recall · Pull Simmer Sauce 485g (GTIN 9429004521334) from shelf and quarantine ~9 units; block the item at POS and foll (impact +0)
- `D-2d0891b2` · Replenishment · Place today's order: 15 lines are below lead-time cover ($1,705 at cost). Top lines: Chocolate Block 200g, Ene (impact +0)
- `D-262ce114` · Range · Range review candidates (C-class and high waste): Avocado (impact +0)
- `D-b0cc94b2` · Credit · Put Metro Foods on credit hold until 60+ day balance is cleared ($788) (impact +0)
- `D-5539cf0b` · Credit · Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) (impact +0)
- `D-b6c52560` · Credit · Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) (impact +0)

## What Shelly learned this run

- No threshold changes (not enough new feedback yet).
