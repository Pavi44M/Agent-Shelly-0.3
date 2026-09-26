---
name: warehousing.capacity
description: Storage utilisation and weeks until full
---

# warehousing.capacity

Storage utilisation and weeks until full

## When to use
- "warehouse capacity"
- "how full are we?"

## Inputs
- capacity (locations, occupied, growth)

## Outputs
- utilisation forecast

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill warehousing.capacity
```
