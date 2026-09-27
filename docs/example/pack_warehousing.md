# Shelly · Warehousing & logistics report
_Generated 27 Sep 2026 · demo data unless stated_

## Actions

| Priority | Area | Action | $/week | Confirm? |
|---|---|---|---:|---|
| P2 | Slotting | Re-slot 47 A-class SKUs into the golden zone <br><sub>they're 66% of pick lines but sit in mid/back zones; ~4.6 picker-hours/day saved</sub> | +694 | ⏳ D-8a5e76b4 |
| P2 | Capacity | Plan overflow storage or a range clean-out: 89% full, 95% in ~12 weeks <br><sub>above ~90% utilisation, putaway and picking slow down sharply</sub> | +0 | auto |
| P3 | People | Coaching check-in with P7: pick rate 60/h vs team median 95/h <br><sub>look at training, zone allocation and equipment first; this is a conversation, not a verdict</sub> | +0 | auto |

## ABC-XYZ matrix (SKU counts)  (`warehousing.abc_xyz`)

**A SKUs** 58 · **Misplaced A SKUs** 47

| abc   |   X |   Y |   Z |
|:------|----:|----:|----:|
| A     |  21 |  37 |   0 |
| B     |   0 |  43 |  25 |
| C     |   0 |   0 |  74 |

_Assumes ~6 s travel saved per pick line when A items move to the golden zone and $30/h labour._

## Pick productivity  (`warehousing.productivity`)

**Team median** 95 lines/h

| picker   |   hours |   lines |   lines_per_hour |   vs_median_pct |
|:---------|--------:|--------:|-----------------:|----------------:|
| P1       |   329.2 |   31200 |             94.8 |            -0.3 |
| P2       |   339.7 |   32303 |             95.1 |             0.1 |
| P3       |   334.8 |   32509 |             97.1 |             2.2 |
| P4       |   340.0 |   32058 |             94.3 |            -0.8 |
| P5       |   328.6 |   32053 |             97.5 |             2.6 |
| P6       |   327.8 |   31281 |             95.4 |             0.4 |
| P7       |   332.6 |   19836 |             59.6 |           -37.2 |
| P8       |   333.1 |   31631 |             95.0 |            -0.1 |

## Capacity  (`warehousing.capacity`)

**Utilisation** 89%

|   utilisation_pct |   weeks_to_95pct |
|------------------:|-----------------:|
|              88.7 |             11.5 |
