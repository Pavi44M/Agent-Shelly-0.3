# Shelly · Medical supply chain module

**Tōtara Medical Supply Chain Command**: a supply-chain dashboard for a **New Zealand importer of medicines, medical consumables and medical equipment**, built as a skill for [Shelly](https://github.com/Pavi44M) — Pavi's personal analytics agent.

It answers one question every Monday: **what needs my attention in the supply chain this week?**

> All data is synthetic. The company "Tōtara Medical Imports", its suppliers, customers, prices and volumes are fictional. The data *structure* is modelled on a typical NZ medical-distribution business, so real, schema-compatible data can be dropped in later.

## What it does

| View | Question it answers | Method |
|---|---|---|
| Inventory & reorder | Which SKUs will run out before the next shipment lands? | Days of cover, reorder point = d̄·L + safety stock (95% service level, demand + lead-time variance) |
| Expiry (FEFO) | Which lots will expire unsold? | First-expiry-first-out projection at the 28-day run-rate |
| Inbound shipments | What's on the water / in the air / held at the border? | PO status, ETA slip, Medsafe / WAND clearance holds |
| Supplier scorecard | Which suppliers are a threat? | OTIF, lead-time volatility, shelf life on arrival, single-source risk → 0–100 score |
| Demand forecast | What will each SKU sell in the next 12 weeks? | SARIMA-X (1,0,1) with Fourier seasonality; 8-week holdout WAPE vs naive |
| Customers & segments | Who buys what, and who's growing? | Public/private hospitals, medical centres/GPs, sports organisations, high-injury industries, aged care |
| Vision board | How is every supplier, product and client tracking against plan? | Zoomable supplier → product → client network. Each node's dot ring = last 12 weeks (sales vs plan) or last 12 deliveries (suppliers); zoom in and nodes become radial widgets; tap any node or link for a landing widget with weekly plan vs actual, stock, OTIF and connections |
| Monday brief + escalations | What should a person decide? | Rule-based judgements, each needing Pavi's approve/dismiss (Shelly's "human confirms major judgements" principle) |

**Live:** [pavi44m.github.io/Agent-Shelly-0.3/supply-chain/](https://pavi44m.github.io/Agent-Shelly-0.3/supply-chain/) · opened from the [Shelly Launchpad](https://pavi44m.github.io/Agent-Shelly-0.3/launchpad/)

## Run it

As a Shelly skill (from the repo root):

```python
from shelly.core.skills import load_all
load_all()["medical.supply_chain"](regenerate=True)   # data -> pipeline -> vision -> docs/supply-chain/
```

Or step by step (from this folder):

```bash
python src/generate_data.py     # synthetic CSVs  -> data/ (not committed; ~50 s)
python src/pipeline.py          # KPIs + forecast -> dashboard/data.json
python src/vision.py            # weekly plan vs actual for every node and link
python src/build_dashboard.py --site ../../docs/supply-chain   # Shelly website (CSP-safe, no CDNs)
python src/build_dashboard.py   # or a single self-contained dashboard/index.html
```

`vendor/d3.min.js` is d3 v7.9.0 (ISC licence, see `vendor/d3.LICENSE`), served from the site itself so the page runs under Shelly's Content Security Policy.

## Data model (`data/`)

| File | Grain | Key fields |
|---|---|---|
| `suppliers.csv` | supplier | country, default mode (Sea/Air), base lead days, reliability |
| `products.csv` | SKU | category, subcategory, unit cost/price, shelf life, cold chain, regulator, Pharmac listed, primary supplier, MOQ |
| `customers.csv` | customer | segment, region, payment terms |
| `sales_daily.csv` | date × customer × SKU | qty, revenue |
| `purchase_orders.csv` | PO line | order date, mode, port, planned / forecast / actual arrival, qty ordered / received, freight, status |
| `batches.csv` | lot | received date, expiry date, qty received / on hand / written off |

See `docs/real-data-mapping.md` to plug in your own (anonymised) data.

## Skills shown
Python (pandas, statsmodels), inventory theory (safety stock, ROP, FEFO), time-series forecasting (SARIMA-X), supplier KPIs (OTIF), customer segmentation, d3.js data visualisation, CRISP-DM, NZ regulatory context (Medsafe, WAND, Pharmac).

## Roadmap
- v0.2 — Power BI version (star schema from the same CSVs) for PL-300 practice
- v0.3 — XGBoost forecast + K-means customer clustering (from MAB research), compared to SARIMA-X
- v0.4 — Shelly conversational Q&A over the dataset, emailed Monday brief
