---
name: medical.supply_chain
description: Medical-imports supply chain: stock-out risk, expiry, inbound holds, supplier OTIF, forecasts and the vision board
---

# medical.supply_chain

Run the medical supply-chain module end to end.

Stock-out, expiry and clearance-hold escalations are proposals: each one
waits for Pavi to approve or dismiss before anyone acts on it.

## When to use
- "supply chain"
- "medical imports"
- "which products will run out"
- "expiring stock"
- "supplier OTIF"
- "shipments on hold"
- "sales vs plan by client"
- "vision board"

## Inputs
- suppliers
- products
- customers
- sales_daily
- purchase_orders
- batches

## Outputs
- dashboard (docs/supply-chain/)
- Monday brief
- escalations
- KPIs

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill medical.supply_chain
```
