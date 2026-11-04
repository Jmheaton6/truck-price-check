# Truck Price Check: Ball Findlay pilot

One customer change, followed from order to truck. Customers, Ball's four teams and its carriers work from the same numbers weeks before the trucks move. Built for the Ball case competition (Section 1, Team 2).

## Two portals
**Customer HQ** (`?role=customer`): a customer signs in (name + company), **shares their 6-week outlook** (what they expect to order each week, in cans), places a PO (cans → truckloads, delivery date), requests changes, accepts or declines Ball's counteroffers, and sees each PO's progress and history. Before sending, it shows whether the PO will be **confirmed instantly** or go to Ball's teams, and why. It never shows Ball's costs or spot.

**Reliability earns priority.** Each customer's score = share of their orders within ±10% of their outlook (a simulated quarter of 30 orders, then every PO and change they send). 90%+ = Priority: a PO or change that is within the flex band and passes every team's check is **confirmed instantly**. Everything else goes to the four teams.

**Early warning from customer outlooks.** Customer lanes: carrier plan = Ball's other business + the customer's outlook. When a customer raises their outlook, the 6-week view shows the trucks short weeks ahead, and Logistics asks the carrier then (7+ days' notice → it can add up to 25%). An increase shared 2+ weeks ahead also adds that week's line time (Production plans it in).

**Ball HQ** (`?role=ball` opens your team's tab). Everyone signs in with a name and team. Every answer is stamped with who gave it.
| Tab | Link | What it's for |
|---|---|---|
| All POs | `?role=pos` | Every PO and change with all four teams' answers; filter by stage; open any PO to see its full history |
| Sales | `?role=sales` | POs waiting on Sales; answering the customer when a team says no (offer a better date, accept anyway, decline); orders vs. forecast by customer |
| Inventory | `?role=inventory` | POs waiting on Inventory; labeled cans in stock, promised, left, stranded by cuts |
| Production | `?role=production` | POs waiting on Production; line time open, used, left per week; the freeze date |
| Logistics | `?role=logistics` (+ `&tab=book`, `outlook`, `transfers`) | Sign-offs, booking accepted POs (contract first, spot only with a reason), the 6-week early warning, transfers in waves |
| Dashboard | `?role=dashboard` | The deck's KPIs (spot share vs. the 8% goal, days of warning, share booked 3+ days ahead, time to answer), what's waiting on each team, customer reliability and change-order rate, the old way vs. the system, activity |

Any tab can be viewed by anyone; only the signed-in team can answer for that team ("Act as …" switches team in one click).

**Forwards and backwards.** A PO moves In review → Accepted → Booked (or Counteroffer out ⇄ customer, or Declined). Any team can change its answer until the trucks are booked: a new Reject sends an accepted PO back to In review (the customer sees "Ball is re-checking"), and the fourth Approve accepts it again. Logistics can un-book a PO, which reopens the answers. Every move goes in the PO's history.

## How the numbers work (all in `engine.js`)
- **Carrier plan per lane** = the lane's 2026 average trucks a week (Jan–Jul loads ÷ 30.3 weeks). Ball's real carrier commitments aren't in the data, so this stands in for them.
- **Already booked** (simulated) uses most of those trucks each week. New POs and transfers claim what's left, first come, first served.
- **Customer outlook** per week (simulated starting forecast, replaced by whatever the customer shares): Sales passes a PO when the customer's week stays within ±10% of it.
- **One-day limit (transfers):** a carrier can add about 1/7 of a week's trucks on any one day. This is why spreading Ball's own transfers helps. Customer deliveries are planned by the week.
- **3-day rule:** anything not booked 3+ days ahead goes spot.
- **Carrier asks** (simulated answer): with 7+ days' notice the carrier adds up to 25% of its weekly trucks; with less notice it says no.
- **Money:** Making = $3,100 × trucks (Ball's average operating profit per truckload, FY2025 10-K). Extra trucking = spot premium per spot truck on customer orders, and the whole move on transfers. Profit left = Making − extra trucking.
- **Outlook colors:** On plan within ±10% of the carrier plan, Watch at 10–25%, Act now over 25%. A spot count is always shown, so a green cell can't hide an uncovered truck.

**Real** (Detail sheet, Findlay, Jan–Jul 2026, no shuttles): lanes, weekly averages, and contract and spot prices.
**Simulated:** trucks already booked, the four customers and their forecasts, stock, line time, reliability scores and the carrier's answers.

## Setup
1. Supabase → SQL Editor: run `supabase/update-3.sql` once (the `items` table and `reset_items`), then `supabase/update-4.sql` once (lets it hold customer outlooks).
2. `config.js` already holds the project URL and publishable key.
3. GitHub Pages serves `main` / root. Bump `?v=` in `index.html` after changes.
4. To clear test data: Dashboard → **Clear all data (admin)** → PIN.

Tests: `node --test tests/engine.test.mjs`

## Words (use the same ones everywhere)
- **Truckload:** the size of a PO or change (200,000 cans).
- **Contract truck / spot truck:** how a truckload ships. Contract = the lane's contracted carrier at the set rate. Spot = a last-minute truck at market price.
- **Approve / Reject:** a team's answer. Four approvals accept the PO. A team can change its answer until the trucks are booked.
- **Book:** Logistics schedules the trucks for an accepted PO.

Look (v23): Ball's brand cues (black header, Ball blue #1F3FF4 pill buttons, light grays, tight Inter headings, the blue-to-cyan gradient as an accent) built as a tactile token system (raised white surfaces, soft elevation levels, sunken inputs and segmented controls, one focus ring). Still follows the Impeccable rules for working tools: drawn icons, tabular numbers, visible hover and focus, no colored side bars.
