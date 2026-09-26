---
name: wholesale.customer_profitability
description: Margin and cost-to-serve by customer, with Pareto
---

# wholesale.customer_profitability

Gross margin minus cost-to-serve (orders × $18). Customers with negative contribution get a
terms review proposal (minimum order, delivery fee or price). Always confirmed by you before contacting them.

## When to use
- "which customers make us money?"
- "cost to serve"
- "customer profitability"

## Inputs
- invoices
- customers

## Outputs
- customer P&L
- price/terms review proposals

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill wholesale.customer_profitability
```
