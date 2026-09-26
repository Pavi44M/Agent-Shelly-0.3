---
name: electronics.aged_stock
description: Aged-stock ladder and markdown proposals (needs confirmation)
---

# electronics.aged_stock

Ages stock from received date; proposes markdowns: 90-120 days 10%, 120-180 days 20%, 180+ days 30%.
Markdowns change price, so they're always proposals for your confirmation.

## When to use
- "what's aging in stock?"
- "what should we mark down?"

## Inputs
- stock (received_date)
- products

## Outputs
- ageing table
- markdown proposals

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill electronics.aged_stock
```
