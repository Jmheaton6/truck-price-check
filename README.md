# Truck Price Check: Ball Findlay pilot

One customer change, followed from order to truck. Customers, Ball's four teams and its carriers work from the same numbers weeks before the trucks move. Built for the Ball case competition (Section 1, Team 2).

## Two portals
**Customer HQ** (`?role=customer`): a customer places a PO (cans → truckloads, delivery date), requests changes to it, accepts or declines Ball's counteroffers, and sees each PO's progress. It never shows Ball's costs.

**Ball HQ** (internal):
| Tab | Link | What happens |
|---|---|---|
| 1 · Review POs | `?role=review` | Sales, Inventory, Production and Logistics each answer one question, see the app's check, and click Approve or Can't. Four approvals → accepted. Any "can't" → Sales offers a better date, accepts anyway, or declines |
| 2 · Schedule trucks | `?role=schedule` | Logistics books accepted POs on the contract carrier, asks the carrier for extra trucks if needed, and uses spot only with an emergency reason |
| 6-week outlook | `?role=outlook` | Early warning: trucks needed vs. contract trucks per lane and week, with actions |
| Transfers | `?role=transfers` | Ship a prebuild all at once vs. in waves |
| Dashboard | `?role=dashboard` | Spot share, spot cost, POs waiting on each team, time to answer, the old way vs. the system, emergency spot log |

## How the numbers work (all in `engine.js`)
- **Carrier plan per lane** = the lane's 2026 average trucks a week (Jan–Jul loads ÷ 30.3 weeks). Ball's real carrier commitments aren't in the data, so this stands in for them.
- **Already booked** (simulated) uses most of those trucks each week. New POs and transfers claim what's left, first come, first served.
- **Customer forecast** (simulated) per week: Sales passes a PO when the customer's week stays within ±10% of it.
- **One-day limit:** a carrier can add about 1/7 of a week's trucks on any one day. This is why spreading transfers helps.
- **3-day rule:** anything not booked 3+ days ahead goes spot.
- **Carrier asks** (simulated answer): with 7+ days' notice the carrier adds up to 25% of its weekly trucks; with less notice it says no.
- **Money:** Making = $3,100 × trucks (Ball's average operating profit per truckload, FY2025 10-K). Extra trucking = spot premium per spot truck on customer orders, and the whole move on transfers. Profit left = Making − extra trucking.
- **Outlook colors:** On plan within ±10% of the carrier plan, Watch at 10–25%, Act now over 25%. A spot count is always shown, so a green cell can't hide an uncovered truck.

**Real** (Detail sheet, Findlay, Jan–Jul 2026, no shuttles): lanes, weekly averages, and contract and spot prices.
**Simulated:** trucks already booked, the four customers and their forecasts, stock, line time, reliability scores and the carrier's answers.

## Setup
1. Supabase → SQL Editor: run `supabase/update-3.sql` once. It adds the `items` table and the `reset_items` function and reuses the existing reset PIN.
2. `config.js` already holds the project URL and publishable key.
3. GitHub Pages serves `main` / root. Bump `?v=` in `index.html` after changes.
4. Between rounds: Marcelo's hub → **New round** → PIN.

Tests: `node --test tests/engine.test.mjs`
