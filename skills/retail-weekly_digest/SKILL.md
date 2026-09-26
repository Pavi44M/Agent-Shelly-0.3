---
name: retail.weekly_digest
description: Full CRISP-DM weekly run: KPIs, forecasts, exceptions, actions and all outputs
---

# retail.weekly_digest

Full CRISP-DM weekly run: KPIs, forecasts, exceptions, actions and all outputs

## When to use
- "weekly sales digest"
- "how did the store trade?"

## Inputs
- store exports folder

## Outputs
- digest, Excel, SQL, Power BI, Tableau, web data, run report

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill retail.weekly_digest
```
