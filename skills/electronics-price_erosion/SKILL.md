---
name: electronics.price_erosion
description: Average selling price vs RRP over time (price erosion)
---

# electronics.price_erosion

Compares the last 4 weeks' average selling price with the first 4 weeks in the window, by category.

## When to use
- "are prices eroding?"
- "ASP trend"

## Inputs
- sales
- products

## Outputs
- erosion by category

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill electronics.price_erosion
```
