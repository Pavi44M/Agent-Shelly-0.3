---
name: warehousing.abc_xyz
description: ABC (velocity) × XYZ (variability) classification and slotting moves
---

# warehousing.abc_xyz

A = top 80% of pick lines, B = next 15%, C = last 5%. X/Y/Z = daily coefficient of variation < 0.5 / < 1.0 / ≥ 1.0.
Fast, steady movers (AX, AY) belong in the golden zone. Re-slots move physical stock, so they're proposals.

## When to use
- "slotting"
- "ABC XYZ"
- "which SKUs should be in the golden zone?"

## Inputs
- picks (date, sku, lines, current_zone)

## Outputs
- ABC-XYZ matrix
- re-slot proposals

## Governance
Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.

## Run
```bash
python -m shelly skill warehousing.abc_xyz
```
