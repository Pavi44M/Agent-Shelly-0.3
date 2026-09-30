# Plugging in real data (safely)

Use this checklist with your USL Medical internship files **only to learn the shape** of real medical-import data. Don't copy real supplier names, customer names, prices or volumes into this repo.

## 1. Note the structure, not the values
For each file you have (stock reports, PO trackers, shipment schedules, sales exports), write down:
- the columns it has and what they mean
- the grain (one row per what?)
- typical ranges: lead times by country/mode, shelf life on arrival, order sizes, how many SKUs and customers
- the recurring problems (short-dated stock, customs holds, late sea freight, stock-outs on specific lines)

## 2. Tune the generator
Put those ranges into `src/generate_data.py`:

| Real-world observation | Where to change it |
|---|---|
| Lead times by supplier/country | `SUPPLIERS` → `base_lead_days`, `default_mode` |
| How often suppliers are late / short | `SUPPLIERS` → `reliability` |
| Product range and shelf lives | `PRODUCTS` |
| Customer mix | `CUSTOMERS` → `segment`, `size`, category `mix` |
| Seasonality (flu season, sports season) | `seasonal()` |
| Short-dated suppliers | `hi = 0.75 if po.supplier_id in (...)` |

## 3. If you ever use real data (with permission)
- Get written permission from the data owner first.
- Replace names with codes (`SUP01`, `CUS01`), scale all quantities and money by a hidden factor, shift dates.
- Keep the real files out of git (`data/real/` is already in `.gitignore`).
- Match column names to the tables in the README; the pipeline runs unchanged.
