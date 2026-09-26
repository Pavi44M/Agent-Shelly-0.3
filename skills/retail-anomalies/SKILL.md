---
name: retail.anomalies
description: Robust z-score exceptions: stock-outs, spikes, outages, shrinkage, waste
---

# retail.anomalies

Robust z-score exceptions: stock-outs, spikes, outages, shrinkage, waste

## When to use
- "anything unusual?"
- "stock-outs, spikes, shrinkage"

## Inputs
- sales
- inventory
- waste

## Outputs
- exceptions table

## Governance
Informational: no confirmation needed.

## Run
```bash
python -m shelly skill retail.anomalies
```
