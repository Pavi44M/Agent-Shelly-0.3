---
name: production.oee
description: OEE = availability × performance × quality, by line
---

# production.oee

World-class OEE is ~85%. Shelly points each line at its biggest loss (availability, speed or quality).

## When to use
- "OEE"
- "which line is the bottleneck?"
- "production efficiency"

## Inputs
- runs (date, line, planned_min, downtime_min, ideal rate, units, good_units)

## Outputs
- OEE table
- loss focus

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill production.oee
```
