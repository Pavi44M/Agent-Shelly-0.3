# Shelly run report 20261004-204549

- Version **1.6.0** · week ending **2026-10-04** · config `98cb77fa102db364`

## Validation checks

| Check | Result | Detail |
|---|---|---|
| Data is fresh | ✅ PASS | latest date 2026-10-04 (0 days old) |
| Data quality ≥ 80/100 | ✅ PASS | score 90 |
| Chosen forecast beats or equals seasonal-naive baseline | ✅ PASS | best WAPE 16.8% vs baseline 22.2% |
| Forecast error acceptable (WAPE < 25%) | ✅ PASS | 16.8% |
| Recalled products blocked from reorder | ✅ PASS | 1 recall(s) |
| Segments stable (Jaccard ≥ 0.6) | ⚠️ WARN | 1 of 5 clusters unstable |
| Category P&L reconciles to total sales | ✅ PASS | 18,971.93 vs 18,971.93 |

## Inputs (SHA-256, first 16)

- `inventory.csv` a7754a0cc8153678
- `products.csv` dac4db12cb89cd5d
- `recalls.csv` e61374aa6caea79a
- `sales.csv` e23d4d133b7eda9c
- `waste.csv` b02275b621f6a7d1

## Forecast models

| Model | WAPE % | MAPE % |
|---|---:|---:|
| SARIMA-X | 16.78 | 26.72 |
| XGBoost | 17.12 | 26.96 |
| Seasonal Naive | 22.22 | 33.01 |
| Naive | 31.24 | 36.86 |
| Drift | 31.28 | 36.95 |

## Decisions: 14 proposed by this run · **25 waiting for your confirmation across all packs**

- `D-08f6a90f` · Quality · Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) (impact -4,025)
- `D-4009f5be` · Markdown · Don't mark TV model 1 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,632)
- `D-64a82d4b` · Markdown · Mark down TV model 3 by 20% (154 days old) (impact -1,109)
- `D-76910984` · Markdown · Don't mark TV model 6 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle it; c (impact -1,049)
- `D-a0ae5b85` · Budget · Recovery plan for the categories furthest behind budget: Dairy, Food To Go (impact -947)
- `D-1080a028` · Markdown · Mark down TV model 2 by 20% (168 days old) (impact -930)
- `D-d15e489f` · Markdown · Don't mark Tablet model 3 down 30% yet: ask the supplier for price protection or return-to-vendor, or bundle i (impact -737)
- `D-b0a5a294` · Slotting · Re-slot 47 A-class SKUs into the golden zone (impact +694)
- `D-f190fd37` · Delivery channel · Check the Uber Eats tablet/app on shift start and add it to the opening checklist (impact -432)
- `D-3e29b0fd` · Markdown · Mark down Smartphone model 6 by 10% (105 days old) (impact -396)
- `D-df972f57` · Attach · Lift accessory attach from 11% towards 25% (bundles, till prompts, staff incentive) (impact +390)
- `D-b0092b66` · Demand · Find out what drove the Energy Drink 500ml spike (local event? competitor out?) and hold extra cover if it rep (impact +275)
- `D-08588709` · Range & stock · Stop reordering TV model 1 and plan a sell-down (15 weeks cover) (impact -147)
- `D-c45eeb50` · Customer terms · Review terms for North Grocers: minimum order or delivery fee (avg order $18) (impact +80)
- `D-4f47abd4` · Customer terms · Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) (impact +79)
- `D-3393c356` · Customer terms · Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) (impact +33)
- `D-7c5d59f3` · Range & stock · Stop reordering Tablet model 6 and plan a sell-down (40 weeks cover) (impact -33)
- `D-d9d0ca5c` · Range & stock · Stop reordering Headphones model 6 and plan a sell-down (12 weeks cover) (impact -12)
- `D-252db7ac` · Range & stock · Stop reordering Soundbar model 6 and plan a sell-down (13 weeks cover) (impact -12)
- `D-a124224c` · Customer terms · Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) (impact +2)
- `D-567400dd` · Range & stock · Stop reordering Accessory model 6 and plan a sell-down (20 weeks cover) (impact -2)
- `D-bd81e860` · Credit · Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) (impact +0)
- `D-81b81a37` · Credit · Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) (impact +0)
- `D-60fc5c80` · Credit · Put Metro Foods on credit hold until 60+ day balance is cleared ($788) (impact +0)
- `D-f003b63d` · Compliance - recall · Pull Simmer Sauce 485g (GTIN 9429004521334) from shelf and quarantine ~28 units; block the item at POS and fol (impact +0)

## What Shelly learned this run

- No threshold changes (not enough new feedback yet).
