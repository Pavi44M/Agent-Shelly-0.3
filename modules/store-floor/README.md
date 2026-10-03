# Store Floor

The Neighbourhood store in 3D, built from the printed store plan, with this week's
numbers on every shelf and (v3) the store team at work through a trading day.

Live page: `docs/store/` · built by `scripts/build_store.py` (runs inside `scripts/build_site.py`).

## Files
| File | What it does |
|---|---|
| `planogram.yaml` | Everything you change: fixtures and which SKUs sit on them, back of house, and `operations` (hours, shifts, breaks, deliveries, team, footfall, routines) |
| `page.html` | Page shell (the business switch is filled in at build time) |
| `../../shelly/storefloor.py` | Places SKUs, rolls up KPIs and status per fixture, passes the config to the page |
| `../../docs/store/store.js` | 3D store, colour modes, shelf panel, Overview / Walk |
| `../../docs/store/v3/sim.js` | Day simulation: roster, breaks, Duty Manager, tasks, deliveries, customers |
| `../../docs/store/v3/nav.js` | Walkable grid and A* pathfinding |
| `../../docs/store/v3/people.js` | People in the Shelly HQ style, poses, speech bubbles, name tags |
| `../../docs/store/v3/backroom.js` | Storeroom, chiller, office, staff room, restrooms, dock |
| `../../docs/store/v3/ui.js` | Clock bar, Tasks / Team / Day panels, live card |

## Common changes (no code)
- **Opening hours:** `operations.trading_hours`.
- **Shifts and breaks:** `operations.shifts`, `operations.breaks`, `break_stagger_minutes`.
- **Delivery days and time:** `operations.deliveries`.
- **The team:** `operations.team` (role: Duty Manager / Store Team / Store Manager; `days:` limits a person to some days).
- **Fixed jobs:** `operations.routines` (`where` = a fixture id, `desk`, `entrance`, `dock`, `till`).
- **How busy:** `avg_basket_nzd` (customers a day = average daily sales ÷ basket) and `footfall` (share per hour).
- **New products on a shelf:** add SKUs or categories to a fixture. Run `python -m shelly store` to see anything not placed.

## Ideas for next versions
Real roster import (shift times from the rostering system), hourly POS for customer counts, queue-time and
labour-cost KPIs, shrink hot-spots on the floor, and sending the day's task list to the team's phones.
