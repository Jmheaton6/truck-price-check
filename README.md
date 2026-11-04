# Ball Findlay pilot: order to truck

A customer orders. Ball's four departments accept or deny. Logistics books the trucks from a calendar. Transfers get planned so they fit on contract trucks. The executive sees how each department is doing and what the pilot saved. Built for the Ball case competition (Section 1, Team 2).

Live: https://jmheaton6.github.io/truck-price-check/

## Screens
| Screen | Link | What happens |
|---|---|---|
| Customer HQ | `?role=customer` (Order), `&tab=pos` (My POs) | Pick your company (top right): Coca-Cola, PepsiCo, AB InBev or Molson Coors. **Order:** new order (cans in millions, delivery date) and My forecast (next 6 weeks; Share forecast sends Ball a new version). **My POs:** Open POs with status (Checking / Accepted / Booked / Denied) and Change, which opens on the card; Change requests with status; a "Try [date]" button when Ball can't do the date asked |
| Outlook | `?role=outlook` | Forecast early warning. The next 6 weeks per customer: trucks needed, how far the forecast moved (green ≤10%, amber 10–25%, red 25%+), and trucks still open. Logistics pre-books the open trucks (Book +N) 3+ days before the week, or releases trucks when demand drops. Click a week for its forecast versions, orders, and trucks |
| Orders | `?role=orders` | Pick your department (top right). Each department reads one check line and clicks Accept or Deny. One deny stops the order; four accepts send it to Trucks. Logistics can ask the carrier for more trucks before answering |
| Trucks | `?role=calendar` | A week per page: a square per truck (solid = booked, outline = to book, red = spot, dashed = not accepted yet), and "Open" = contract trucks still free that week. To book: one row per order or transfer, with its book-by date, Book and Book all |
| Transfers | `?role=transfers` | Pick a warehouse, truckloads and a ship date; see contract vs. spot and the book-by date; put it on the calendar |
| Executive | `?role=exec` | Saved vs. the old way, spot spent, spot share (old way vs. now vs. the 8% goal), and one scorecard per department |

Old links still work (`?role=review` → Orders, `?role=schedule` → Trucks, `?role=dashboard` → Executive, `?role=sales` → Orders as Sales). QR codes: `Case Comp/QR codes/`.

Flags: `&today=2026-11-05` rehearses a date (the banner's date picker moves it, e.g. to show a late order); `&local` is backup mode (this laptop only, no database).

## The rules (all in `engine.js`)
- **The 3-day rule:** a truck booked 3+ days before it moves is a contract truck, however many there are. Inside 3 days it's spot.
- **Trucks already scheduled:** each lane-week already has some trucks lined up with the carrier: on customer lanes, the customer's planned forecast; on transfer lanes, the 2026 weekly average (Jan–Jul loads ÷ 30.3 weeks) minus Ball's other moves. Pre-bookings from Outlook add to them. Orders and transfers use these first, first come, first served. They stay contract even when booked late, so a late order that was forecast and pre-booked doesn't go spot.
- **Checks:** Sales, the customer's week can run up to 10% over its forecast and must be 3+ days out. Inventory, labeled cans in stock; a cut after the cans are made strands them. Production, line time that week and the 5-day freeze. Logistics, all trucks on contract.
- **Forecast:** the baseline (what the carrier plan is sized for) never changes; each update is a new version and the latest one counts. Orders consume the forecast: a week needs the larger of the two, not the sum. Sales checks against the latest forecast. Told 2+ weeks before the week starts, Production plans the extra line time.
- **Spot cost** = the lane's spot premium per spot truck (2026 data).
- **Saved** = spot cost the old way minus spot cost now, on the pilot's own orders and transfers. The old way: every order accepted as first asked; Logistics hears about orders and transfers 1–3 days before they move (case), so anything past the scheduled trucks goes spot; no pre-booking. "Where it came from" turns the system on one piece at a time (check-off, booked ahead, transfers ahead, early warning), so the pieces add up to the total.
- **Scorecards:** Sales, time to answer customers. Inventory, truckloads stranded. Production, line time used. Logistics, spot share and share booked 3+ days ahead.

**Real** (Ball's 2026 workbook, Findlay, no shuttles): lanes, weekly averages, spot premiums. **Simulated** (stated as assumptions): customer names (illustrative; the case data has no customer names), Ball's other business on each lane, customer forecasts, stock, line time, carrier answers.

## Setup
1. Supabase: `supabase/update-3.sql` (the `items` table and `reset_items`). Nothing newer is needed.
2. `config.js` holds the project URL and publishable key.
3. GitHub Pages serves `main`. Bump `?v=` in `index.html` and the imports at the top of `app.js` after every change.
4. Clear test data: Executive → Clear all data → PIN.

## Tests
- `node --test tests/engine.test.mjs`: the rules.
- `node tests/personas.mjs` (with `python3 -m http.server 8765` running here): a bot plays a customer and each department through a full day using only what's on screen, grades every screen for simplicity, and writes `tests/persona-report.md` and `tests/persona-shots/`.
