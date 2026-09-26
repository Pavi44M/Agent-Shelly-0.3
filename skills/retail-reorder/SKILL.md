---
name: retail.reorder
description: JIT reorder points, safety stock and suggested orders (shelf-life capped)
---

# retail.reorder

JIT reorder points, safety stock and suggested orders (shelf-life capped)

## When to use
- "what should I order?"
- "reorder list"

## Inputs
- sales
- inventory

## Outputs
- reorder list

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill retail.reorder
```
