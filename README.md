# Ball Findlay pilot: order to truck

A customer orders. Ball's four departments accept or deny. Logistics books the trucks from a calendar. Transfers get planned so they fit on contract trucks. The executive sees how each department is doing and what the pilot saved. Built for the Ball case competition (Section 1, Team 2).

Live: https://jmheaton6.github.io/truck-price-check/

## Screens
| Screen | Link | What happens |
|---|---|---|
| Customer HQ | `?role=customer` | Pick your company (top right). New order: cans (millions) and a delivery date. My orders: status, Change, and a "Try [date]" button when Ball can't do the date asked |
| Orders | `?role=orders` | Pick your department (top right). Each department reads one check line and clicks Accept or Deny. One deny stops the order; four accepts send it to Trucks. Logistics can ask the carrier for more trucks before answering |
| Trucks | `?role=calendar` | A week per page: a square per truck (solid = booked, outline = to book, red = spot, dashed = not accepted yet), and "Open" = contract trucks still free that week. To book: one row per order or transfer, with its book-by date, Book and Book all |
| Transfers | `?role=transfers` | Pick a warehouse, truckloads and a start date; compare shipping it all on one day vs. over 1, 2 or 3 weeks; put the best one on the calendar |
| Executive | `?role=exec` | Saved vs. the old way, spot spent, spot share (old way vs. now vs. the 8% goal), and one scorecard per department |

Old links still work (`?role=review` → Orders, `?role=schedule` → Trucks, `?role=dashboard` → Executive, `?role=sales` → Orders as Sales). QR codes: `Case Comp/QR codes/`.

Flags: `&today=2026-11-05` rehearses a date; `&local` is backup mode (this laptop only, no database).

## The rules (all in `engine.js`)
- **Contract trucks per lane** = the lane's 2026 average a week (Jan–Jul loads ÷ 30.3 weeks). Orders and transfers claim them first come, first served.
- **Customer lanes** are sized for Ball's other business plus the customer's forecast, so the room left each week is the customer's forecast.
- **Transfers:** a carrier adds about 1/7 of its weekly trucks on any one day, so one big day spills to spot and spreading it out doesn't.
- **Booking:** a truck not booked 3+ days before it moves goes spot.
- **Ask the carrier:** with 7+ days' notice it can add up to 25% of its weekly trucks; with less, no.
- **Checks:** Sales, the customer's week can run up to 10% over its forecast and must be 3+ days out. Inventory, labeled cans in stock; a cut after the cans are made strands them. Production, line time that week and the 5-day freeze. Logistics, all trucks on contract.
- **Spot cost** = the lane's spot premium per spot truck (2026 data).
- **Saved** = spot cost the old way (every order accepted as first asked, no carrier asks, transfers all on one day) minus spot cost now, on the pilot's own orders and transfers.
- **Scorecards:** Sales, time to answer customers. Inventory, truckloads stranded. Production, line time used. Logistics, spot share and share booked 3+ days ahead.

**Real** (Ball's 2026 workbook, Findlay, no shuttles): lanes, weekly averages, spot premiums. **Simulated** (stated as assumptions): Ball's other business on each lane, customer forecasts, stock, line time, carrier answers.

## Setup
1. Supabase: `supabase/update-3.sql` (the `items` table and `reset_items`). Nothing newer is needed.
2. `config.js` holds the project URL and publishable key.
3. GitHub Pages serves `main`. Bump `?v=` in `index.html` and the imports at the top of `app.js` after every change.
4. Clear test data: Executive → Clear all data → PIN.

## Tests
- `node --test tests/engine.test.mjs`: the rules.
- `node tests/personas.mjs` (with `python3 -m http.server 8765` running here): a bot plays a customer and each department through a full day using only what's on screen, grades every screen for simplicity, and writes `tests/persona-report.md` and `tests/persona-shots/`.
