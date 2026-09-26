---
name: electronics.attach_rate
description: Accessory attach rate vs devices sold
---

# electronics.attach_rate

Accessory units per device sold (TVs, phones, tablets) in the last 4 weeks. Target 25%.

## When to use
- "accessory attach rate"
- "how many accessories per phone?"

## Inputs
- sales
- products

## Outputs
- attach rate

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill electronics.attach_rate
```
