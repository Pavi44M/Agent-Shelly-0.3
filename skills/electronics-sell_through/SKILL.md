---
name: electronics.sell_through
description: Sell-through %, weeks of cover and stock risk per SKU
---

# electronics.sell_through

4-week sell-through = units sold / (units sold + on hand). Weeks of cover = on hand / avg weekly units.

## When to use
- "which TVs are overstocked?"
- "weeks of cover"
- "sell-through by model"

## Inputs
- sales (week, sku, units, revenue)
- stock (sku, on_hand)
- products

## Outputs
- cover table
- overstock/stock-out findings

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill electronics.sell_through
```
