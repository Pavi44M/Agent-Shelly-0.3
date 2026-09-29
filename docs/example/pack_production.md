# Shelly · Production & manufacturing report
_Generated 29 Sep 2026 · demo data unless stated_

## Actions

| Priority | Area | Action | $/week | Confirm? |
|---|---|---|---:|---|
| P2 | Quality | Line 3: root-cause scrap at 6.7% ($16,101 in 4 weeks) <br><sub>above the 5% threshold; start with changeovers and first-off checks</sub> | -4,025 | ⏳ D-ba7c19db |

## OEE by line (4 weeks, %)  (`production.oee`)

**Site OEE** 75%

| line   |   availability |   performance |   quality |   oee |
|:-------|---------------:|--------------:|----------:|------:|
| Line 1 |           92.1 |          87.1 |      98.1 |  78.7 |
| Line 2 |           85.0 |          87.5 |      96.9 |  72.0 |
| Line 3 |           93.5 |          84.8 |      93.3 |  74.0 |

## Scrap  (`production.scrap`)

**Scrap cost (4 wks)** $23,564

| line   |   units |   good |   scrap_pct |   scrap_cost_4w |
|:-------|--------:|-------:|------------:|----------------:|
| Line 1 |  520285 | 510279 |         1.9 |          3502.1 |
| Line 2 |  361477 | 350158 |         3.1 |          3961.6 |
| Line 3 |  685361 | 639359 |         6.7 |         16100.7 |

_Unit cost assumed $0.35._

## Schedule adherence  (`production.schedule_adherence`)

| line   |   good |   sched |   adherence_pct |
|:-------|-------:|--------:|----------------:|
| Line 1 | 510279 |  518400 |            98.4 |
| Line 2 | 350158 |  388800 |            90.1 |
| Line 3 | 639359 |  691200 |            92.5 |
