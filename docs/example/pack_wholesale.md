# Shelly · Wholesale & distribution report
_Generated 04 Oct 2026 · demo data unless stated_

## Actions

| Priority | Area | Action | $/week | Confirm? |
|---|---|---|---:|---|
| P1 | Credit | Put Metro Foods on credit hold until 60+ day balance is cleared ($788) <br><sub>total owed $14,886; $788 is 60+ days overdue (exposure, not a weekly cost)</sub> | +0 | ⏳ D-60fc5c80 |
| P1 | Credit | Put Harbour Superette on credit hold until 60+ day balance is cleared ($1,382) <br><sub>total owed $12,816; $1,382 is 60+ days overdue (exposure, not a weekly cost)</sub> | +0 | ⏳ D-bd81e860 |
| P1 | Credit | Put Coast Mart on credit hold until 60+ day balance is cleared ($1,402) <br><sub>total owed $4,993; $1,402 is 60+ days overdue (exposure, not a weekly cost)</sub> | +0 | ⏳ D-81b81a37 |
| P2 | Customer terms | Review terms for North Grocers: minimum order or delivery fee (avg order $18) <br><sub>66 orders in 90 days, margin $144 < cost-to-serve $1,188</sub> | +80 | ⏳ D-c45eeb50 |
| P2 | Customer terms | Review terms for Kiwi Mart: minimum order or delivery fee (avg order $63) <br><sub>74 orders in 90 days, margin $301 < cost-to-serve $1,332</sub> | +79 | ⏳ D-4f47abd4 |
| P2 | Customer terms | Review terms for Kiwi Foods: minimum order or delivery fee (avg order $83) <br><sub>50 orders in 90 days, margin $465 < cost-to-serve $900</sub> | +33 | ⏳ D-3393c356 |
| P2 | Customer terms | Review terms for Harbour Cafe: minimum order or delivery fee (avg order $219) <br><sub>28 orders in 90 days, margin $477 < cost-to-serve $504</sub> | +2 | ⏳ D-a124224c |
| P2 | Service | Lift OTIF from 63% to 90%: find the SKUs causing short shipments <br><sub>short-shipped orders drive credit notes and lost customers</sub> | +0 | auto |

## Customer profitability (90 days)  (`wholesale.customer_profitability`)

**Customers** 40 · **80% of revenue from** 21 customers · **Loss-making after cost-to-serve** 4

| name              |   revenue |   gm_pct |   orders |   avg_order |   contribution |
|:------------------|----------:|---------:|---------:|------------:|---------------:|
| City Cafe         |   53754.7 |     17.5 |        7 |      7679.2 |         9306.1 |
| Summit Foods      |   46043.8 |     11.4 |        5 |      9208.8 |         5181.0 |
| Valley Cafe       |   39395.9 |     14.0 |       16 |      2462.2 |         5219.9 |
| North Mart        |   34405.0 |     12.8 |        8 |      4300.6 |         4250.2 |
| Valley Foods      |   32663.9 |     13.6 |       20 |      1633.2 |         4090.1 |
| Coast Grocers     |   32253.3 |     13.8 |       34 |       948.6 |         3835.4 |
| Valley Superette  |   31984.0 |     20.4 |       38 |       841.7 |         5849.8 |
| Metro Foods       |   31212.2 |      7.2 |       37 |       843.6 |         1569.4 |
| Metro Cafe        |   30704.1 |     10.7 |       26 |      1180.9 |         2822.0 |
| Harbour Superette |   30483.6 |     18.8 |       26 |      1172.4 |         5267.3 |
| City Foods        |   24942.7 |      9.8 |       21 |      1187.7 |         2069.9 |
| North Foods       |   23033.3 |     18.7 |       28 |       822.6 |         3792.7 |
| Valley Mart       |   22560.6 |     18.4 |       17 |      1327.1 |         3850.9 |
| Summit Grocers    |   20826.5 |      7.8 |       21 |       991.7 |         1239.9 |
| North Superette   |   19851.7 |      8.6 |        5 |      3970.3 |         1623.3 |

_Cost-to-serve assumed $18/order. Replace with your actual picking/delivery cost._

## Receivables ageing  (`wholesale.ar_ageing`)

**DSO** 23 days · **Overdue 60+** $4,548 · **Total AR** $213,690

| name              |   current |   1-30 |   31-60 |    60+ |   total |
|:------------------|----------:|-------:|--------:|-------:|--------:|
| North Mart        |   14231.0 |    0.0 |  4086.0 |    0.0 | 18317.0 |
| Metro Foods       |    9849.0 | 1858.0 |  2391.0 |  788.0 | 14886.0 |
| Valley Cafe       |   10091.0 |    0.0 |  3448.0 |    0.0 | 13539.0 |
| Harbour Superette |   11434.0 |    0.0 |     0.0 | 1382.0 | 12816.0 |
| Metro Cafe        |   11457.0 | 1315.0 |     0.0 |    0.0 | 12772.0 |
| North Foods       |    9869.0 | 1008.0 |     0.0 |    0.0 | 10877.0 |
| Valley Superette  |    9284.0 |    0.0 |  1280.0 |    0.0 | 10564.0 |
| Coast Grocers     |    7106.0 |  757.0 |  1211.0 |    0.0 |  9074.0 |
| City Foods        |    7916.0 |  833.0 |     0.0 |    0.0 |  8749.0 |
| Summit Grocers    |    6424.0 | 1767.0 |     0.0 |    0.0 |  8191.0 |
| Valley Foods      |    8015.0 |    0.0 |     0.0 |    0.0 |  8015.0 |
| City Grocers      |    6566.0 |    0.0 |     0.0 |    0.0 |  6566.0 |
| Valley Mart       |    5868.0 |    0.0 |     0.0 |    0.0 |  5868.0 |
| Harbour Mart      |    4821.0 |  504.0 |     0.0 |    0.0 |  5325.0 |
| Summit Mart       |    3561.0 | 1754.0 |     0.0 |    0.0 |  5314.0 |

## Fill rate & OTIF  (`wholesale.fill_rate`)

**Fill rate** 97.8% · **OTIF** 63%

|   fill_rate_pct |   otif_pct |   orders |
|----------------:|-----------:|---------:|
|            97.8 |       63.2 |    981.0 |
