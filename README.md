# Ball Findlay pilot: order to truck

A customer orders. Ball's four departments accept or deny. Logistics books the trucks from a calendar. Transfers get planned so they fit on contract trucks. The executive sees how each department is doing and what the pilot saved. Built for the Ball case competition (Section 1, Team 2).

Live: https://jmheaton6.github.io/truck-price-check/

## Screens
**Customer HQ** (`?role=customer`): pick your company (top right): Coca-Cola, PepsiCo, AB InBev or Molson Coors. **Order:** new order (cans in millions, delivery date) and My forecast (next 6 weeks; Share forecast sends Ball a new version). **My POs** (`&tab=pos`): Open POs with status and Change (opens on the card); Change requests with status; "Try [date]" when Ball can't do the date asked.

**Ball HQ**: one hub per department across the top; each hub has its own tabs. Anyone can open any hub; the hub you're in is the department you answer as. Link: `?hub=<hub>&role=<tab>`.
| Hub | Tabs |
|---|---|
| Sales | Orders (accept or deny), Outlook (read only) |
| Inventory | Orders, Stock (labeled cans per customer: in stock, promised, checking, left, stranded) |
| Production | Orders, Line time (next 6 weeks: accepted, checking, open; frozen weeks marked) |
| Logistics | Orders, Outlook (pre-book forecast trucks; Book all; Release), Trucks (calendar + To book), Transfers (warehouse, truckloads, ship date → contract or spot, book-by) |
| Executive | Dashboard: Saved, Spot spent, spot share (old way vs now vs 8% goal), where savings came from, one card per hub with what's waiting (click to open the hub) |

Old links still work (`?role=review` → Orders, `?role=schedule` → Trucks, `?role=dashboard` → Executive, `?role=sales` → Orders as Sales). QR codes: `Case Comp/QR codes/`.

Flags: `&today=2026-11-05` rehearses a date (the banner's date picker moves it, e.g. to show a late order); `&local` is backup mode (this laptop only, no database).

## The rules (all in `engine.js`)
- **The 3-day rule:** a truck booked 3+ days before it moves is a contract truck, however many there are. Inside 3 days it's spot.
- **Pre-booking:** nothing is lined up by default. On Outlook, Logistics books a customer's forecast trucks 3+ days before the week; a late order that week rides those (first come, first served) instead of going spot. Outlook lists weeks whose book-by date is within a week, plus any week whose forecast moved.
- **Forecast:** the baseline (what the carrier plan is sized for) never changes; each update is a new version and the latest one counts. Orders consume the forecast: a week needs the larger of the two, not the sum. Sales checks against the latest forecast. Told 2+ weeks before the week starts, Production plans the extra line time.
- **Spot cost** = the lane's spot premium per spot truck (2026 data).
- **Saved** = spot cost the old way minus spot cost now, on the pilot's own orders and transfers. The old way: the same freight, plus every order accepted as first asked, moving at each lane's actual 2026 spot rate (Ball's workbook). Split into customer orders and transfers.
- **Scorecards:** Sales, time to answer customers. Inventory, truckloads stranded. Production, line time used. Logistics, spot share and share booked 3+ days ahead.

**Real** (Ball's 2026 workbook, Findlay, no shuttles): lanes, weekly averages, spot premiums. **Simulated** (stated as assumptions): customer names (illustrative; the case data has no customer names), Ball's other business on each lane, customer forecasts, stock, line time.

## Setup
1. Supabase: `supabase/update-3.sql` (the `items` table and `reset_items`). Nothing newer is needed.
2. `config.js` holds the project URL and publishable key.
3. GitHub Pages serves `main`. Bump `?v=` in `index.html` and the imports at the top of `app.js` after every change.
4. Clear test data: Executive → Clear all data → PIN.

## Tests
- `node --test tests/engine.test.mjs`: the rules.
- `node tests/personas.mjs` (with `python3 -m http.server 8765` running here): a bot plays a customer and each department through a full day using only what's on screen, grades every screen for simplicity, and writes `tests/persona-report.md` and `tests/persona-shots/`.
