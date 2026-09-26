---
name: wholesale.ar_ageing
description: Receivables ageing, DSO and credit-hold proposals
---

# wholesale.ar_ageing

Buckets overdue balances (current, 1-30, 31-60, 60+ days past due). 60+ proposes a credit hold,
a relationship decision that always needs your confirmation.

## When to use
- "who owes us money?"
- "debtors"
- "credit risk"
- "DSO"

## Inputs
- receivables
- invoices

## Outputs
- ageing buckets
- credit proposals

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill wholesale.ar_ageing
```
