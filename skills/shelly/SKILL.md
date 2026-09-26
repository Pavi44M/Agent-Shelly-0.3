---
name: shelly
description: Produce a weekly retail sales digest for a convenience/grocery store - KPIs, forecasts, exceptions (stock-outs, shrinkage, waste, delivery outages), reorder list, roster hours and prioritised actions. Use when asked for "weekly sales digest", "how did the store do", "what should I order", "store exceptions" or "sales forecast".
---

# Shelly v0.1: Retail Sales Digest

Runs a CRISP-DM analytics pipeline over store exports and returns prioritised actions.

## When to use
- "Give me this week's sales digest" / "How did the store trade last week?"
- "What needs attention today?" / "Anything wrong with stock or delivery?"
- "What should I order?" / "How many hours should I roster next week?"

## How to run
From the project root:

```bash
python -m shelly.agent --data data/sample            # demo data
python -m shelly.agent --data data/real --llm ollama  # your exports + local LLM summary
```

Optional: `--asof YYYY-MM-DD` to report on a past week.

## Inputs (data folder, CSV or Excel)
- `sales` (required): date, sku, channel, units, net_sales, cost, promo_flag
- `products` (required): sku, product_name, category, unit_price, unit_cost, shelf_life_days, supplier, gtin
- `inventory`: count_date, sku, sap_qty, physical_qty
- `waste`: date, sku, units_wasted, units_marked_down
- `recalls`: notice_date, gtin, product_description, reason, action

Different headers? Map them in `config.yaml > column_map`.

## Outputs (in `outputs/`)
- `digest_<date>.html`: dashboard to share
- `whatsapp_<date>.txt`: team message
- `actions_<date>.json`: machine-readable actions (priority, owner, $ impact)
- `Weekly_Sales_Digest_<date>.xlsx`, `warehouse.db`, `powerbi/`, `tableau/`

## How to answer
1. Run the agent.
2. Read `actions_<date>.json`. Report the P1 items first, compliance (recalls) before everything else.
3. Quote numbers exactly as the files give them. Don't recalculate.
4. Offer the HTML digest and the WhatsApp text.
