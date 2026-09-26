---
name: warehousing.productivity
description: Pick productivity (lines/hour) by picker, with coaching flags
---

# warehousing.productivity

Lines per hour over the period. Pickers under 70% of the median get a coaching check (training, equipment,
zone allocation), never an automatic performance judgement.

## When to use
- "pick rate"
- "lines per hour"

## Inputs
- labour (date, picker, hours, lines_picked)

## Outputs
- productivity table

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill warehousing.productivity
```
