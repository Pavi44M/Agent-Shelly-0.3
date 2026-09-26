---
name: retail.compliance
description: GS1 check digits, recall matching, liquor-by-delivery watch
---

# retail.compliance

GS1 check digits, recall matching, liquor-by-delivery watch

## When to use
- "any recalls?"
- "barcode problems"

## Inputs
- products
- recalls
- sales

## Outputs
- compliance findings

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill retail.compliance
```
