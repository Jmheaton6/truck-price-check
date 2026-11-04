# Truck Price Check: Ball Findlay pilot

One customer change, followed from order to truck. Customers, Ball's four teams and its carriers work from the same numbers weeks before the trucks move. Built for the Ball case competition (Section 1, Team 2).

## The five screens (demo order)
| # | Screen | Link | What it shows |
|---|---|---|---|
| 1 | Customer HQ | `?role=customer` | A customer adds or cuts cans (converted to trucks), sees its ±10% flex band and the 3-day cutoff, then accepts Ball's answer |
| 2 | Team check | `?role=team` | Sales, Inventory, Production and Logistics check the change together, with the profit-per-truck price tag. Ask the carrier, then answer: confirm, confirm with a cost, or a better date |
| 3 | Truck plan | `?role=plan` | 6-week early warning: trucks needed vs. what carriers are staffed for, colored ±10% / 25%. Also schedule prebuild transfers in waves |
| 4 | Carrier | `?role=carrier` | Carriers answer "+N trucks?" weeks ahead (yes / some / no) and see the 6-week outlook |
| 5 | Marcelo's hub | `?role=hub` | Spot share, overspend, profit left, and the same orders "the old way" |

Old links still work: `sales` opens Team check; `production`, `planning` and `logistics` open Truck plan.

Add `&local` to any link to run with no database (backup if the room's Wi-Fi fails; everything stays in that browser). Add `&today=2026-11-05` to rehearse as if it were that date.

## How the numbers work (all in `engine.js`)
- **Carrier plan per lane** = the lane's 2026 average trucks a week (Jan–Jul loads ÷ 30.3 weeks). Ball's real carrier commitments aren't in the data, so this stands in for them.
- **Forecast** (simulated) uses most of that plan each week. New orders and transfers claim what's left, first come, first served.
- **One-day limit:** a carrier can add about 1/7 of a week's trucks on any one day. This is why spreading transfers helps.
- **3-day rule:** anything not booked 3+ days ahead goes spot.
- **Carrier asks:** a "yes" adds that many contract trucks to the lane's week. "Some" adds only what was accepted. A warned drop that the carrier noted gives trucks back.
- **Money:** Making = $3,100 × trucks (Ball's average operating profit per truckload, FY2025 10-K). Extra trucking = spot premium per spot truck on customer orders, and the whole move on transfers. Profit left = Making − extra trucking.
- **Outlook colors:** On plan within ±10% of the carrier plan, Watch at 10–25%, Act now over 25%. A spot count is always shown, so a green cell can't hide an uncovered truck.

**Real** (Detail sheet, Findlay, Jan–Jul 2026, no shuttles): lanes, weekly averages, and contract and spot prices.
**Simulated:** the 6-week forecast, the four customers, stock, line time and reliability scores.

## Setup
1. Supabase → SQL Editor: run `supabase/update-3.sql` once. It adds the `items` table and the `reset_items` function and reuses the existing reset PIN.
2. `config.js` already holds the project URL and publishable key.
3. GitHub Pages serves `main` / root. Bump `?v=` in `index.html` after changes.
4. Between rounds: Marcelo's hub → **New round** → PIN.

Tests: `node --test tests/engine.test.mjs`
