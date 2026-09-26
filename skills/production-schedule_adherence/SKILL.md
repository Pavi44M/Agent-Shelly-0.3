---
name: production.schedule_adherence
description: Actual vs scheduled output
---

# production.schedule_adherence

Actual vs scheduled output

## When to use
- "schedule adherence"
- "are we hitting plan?"

## Inputs
- runs

## Outputs
- adherence by line

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill production.schedule_adherence
```
