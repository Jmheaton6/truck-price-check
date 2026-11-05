# Ball Monticello pilot: forecast to truck

Customers order and share forecasts. Ball's four teams (Sales, Inventory, Planning, Logistics) each check an order. Logistics tenders every load down the lane's routing guide (primary, then 2 backups). If no carrier has room, the customer gets a counteroffer date, and spot is the last resort: if they keep their date, they pay the spot premium as an expedite fee. Planning's prebuilds go to Logistics, which ships them in paced waves instead of one batch. Built for the Ball case competition (Section 1, Team 2).

Live: https://jmheaton6.github.io/truck-price-check/

## The flow
```
WEEKS AHEAD: the forecast flow
  Customer HQ ──forecast + promos──────────▶ Planning · Short-term (truckloads per week)
  Planning · Long-term ──yearly plan───────▶ Planning · Short-term
  Planning · Short-term ──prebuild─────────▶ Logistics · Transfers
        (warehouse, truckloads, ready date)
  Logistics · Transfers ──paced waves, 48+ hours ahead──▶ Carriers
  Planning · Short-term ──forecast loads───▶ Logistics · Lanes ("N more expected")
  Early warning: each week's trucks vs the routing guide (green ≤10% off · yellow 10–25% · red 25%+)
      yellow/red week ──▶ Logistics · Lanes to-do ──▶ "Line up N more" from a carrier (or "Tell carriers N fewer"); shown as a dashed bar under that week
      the extra trucks are real: the tender uses them after the routing guide, before a counteroffer

ORDERS: a PO or a change
  Customer HQ ──PO / change──▶ the four teams check it at the same time
      Sales ........ forecast fit, 3-day fence, price tag (profit per truck), reliability
      Inventory .... labeled stock, stranded cans on a cut
      Planning ..... line time that week, production freeze
      Logistics .... routing guide: primary (48+ hours' notice) → backup 1 → backup 2
  All 4 accept ──▶ Logistics on Lanes: contact carrier → waiting on carrier → confirmed
  No carrier has room ──▶ Logistics: Counteroffer [date] ──▶ Customer HQ
      Take the date ──▶ contract
      Keep their date ──▶ spot + expedite fee (the lane's spot premium) on their PO
      (no date in 2 weeks works: "Offer spot"; they keep their date and pay, or cancel)
  Sales, Inventory or Planning denies ──▶ customer sees why + "Try [date]"

EXECUTIVE: Saved vs the old weekly batches · spot % vs the 8% goal · what's waiting on each hub
```

## Screens
**Customer HQ** (`?role=customer`): pick your company (top right). **Order:** new order (cans in millions, delivery date), your reliability score, and My forecast (6 weeks; Share forecast). **My POs** (`&tab=pos`): Open POs and Change requests, with status, Change (opens on the card), counteroffers (Take the date / Keep yours + fee), and Try [date] after a deny.

**Ball HQ**: one hub per team across the top; anyone can open any hub, and the hub you're in is the team you answer as. Link: `?hub=<hub>&role=<tab>`.
| Hub | Tabs |
|---|---|
| Sales | Orders (check; price tag; reliability) · Customers (reliability per customer; 90%+ = Priority) |
| Inventory | Orders · Stock (labeled cans per customer) |
| Planning | Orders (line time / freeze) · Short-term (6-week forecasts vs carrier room, colored; Prebuild) · Long-term (12 months: real 2025/2026 loads, 2026 plan = 2025 + 2%) · Line time |
| Logistics | Orders (routing guide; Counteroffer) · Lanes (Early warning to-do; Calendar: six weeks of days, each listing its loads; By destination: one row per lane; click a load for its carriers and routing guide; To book) · Transfers (prebuilds: one batch vs paced waves; Schedule) |
| Executive | Marcelo's dashboard. Top: on-time delivery (vs 86% today), change requests resolved, cost to serve per load (vs the old way). Middle: each team's own number + guardrail (Sales profit / change-order cost; Inventory customers in stock range / changes resolved; Planning days of forecast warning / changes resolved; Logistics spot % and carrier acceptance / on-time). Bottom: early-warning weeks, denials and overrides, Monticello pilot transfer spot vs the 20% go/no-go line + saved. Cost to serve by customer: freight at contract + spot premium + holding − expedite fees. |

Old links still work (`?role=review|schedule|dashboard|sales|production|outlook`). Flags: `&today=2026-11-05` rehearses a date (the banner's date picker moves it); `&local` = backup mode (this laptop only).

## The rules (all in `engine.js`)
- **Routing guide** (real, workbook): each Monticello lane's top 3 contract carriers by 2026 contract loads. A carrier's weekly commitment = its 2026 contract loads on the lane ÷ 30.3 weeks, rounded up; daily share = weekly ÷ 7, rounded up. A contract carrier named "Spot Freight" is left out so no one confuses it with spot.
- **Split counteroffer:** when one day has more trucks than the routing guide takes, Logistics first offers to ship the rest over the next 1–2 days (the deck: shift up to 2 days before spot), then a new date, then spot the customer pays for.
- **Carrier states:** every truck day is contact carrier (outline) → waiting on carrier (half) → confirmed (solid), on the calendar and on Executive's read-only calendar.
- **Tender:** the whole load goes to the first carrier in the routing guide that can take all of it (primary only with 48+ hours' notice; each carrier up to its daily share and what's left of its weekly commitment). If none can, it splits down the guide: primary, backup 1, backup 2. Booked loads hold their trucks; the rest go in line with Priority customers first, then first come, first served.
- **Short:** a customer order gets a counteroffer, the nearest date (±2 weeks) where every check passes and every truck is on contract. Kept date = spot, and the customer pays the lane's spot premium per spot truck. A prebuild shipped in one batch goes spot for whatever doesn't fit.
- **Paced waves:** a prebuild is spread day by day from its ready date (48+ hours out, so the primary can take it), as many per day as the routing guide still has room for.
- **Early warning** (the team doc's rule, Eric's spec): per customer, and per warehouse with a prebuild, each of the 6 weeks: trucks (customer: latest forecast or orders, whichever is more; warehouse: prebuild trucks) vs room (the routing guide's weekly commitments). Within 10% green, 10–25% yellow, 25%+ red; warehouses flag increases only. Logistics lines up extra trucks for the week (stored as a noted ask, kind "room"), and the week turns Covered. Extra trucks are tendered after the routing guide, any day that week; the old way doesn't get them.
- **Checks:** Sales: 3+ days out, the week within 10% of the latest forecast. Inventory: labeled stock; a cut inside the freeze strands cans. Planning: line time that week and the freeze (warned 2+ weeks ahead, Planning adds line time). Logistics: the routing guide covers it.
- **Price tag:** profit per truck = $3,100 minus the spot premium Ball would pay, spread over the order's trucks.
- **Reliability:** orders placed and kept outside the 3-day fence ÷ all orders (simulated history + live). 90%+ = Priority.
- **Saved** = spot cost the old way minus spot cost now, on the pilot's accepted orders and scheduled prebuilds. The old way (case): orders released in Thursday batches and shipped Fri–Sun with 1–3 days' notice (so the primary can't take them), orders as first asked, prebuilds in one batch the day they're ready; whatever the routing guide can't cover goes spot, and Ball pays.
- **Spot cost** = the lane's spot premium per spot truck (pure-spot vs pure-contract cost per load on the lane, 2026).

**Real** (Ball's 2026 workbook, Monticello, no shuttles): lanes, routing guides and commitments, spot premiums, monthly loads. **Simulated** (stated as assumptions): customer names (illustrative), forecasts (set to fit each routing guide, so weeks start green), stock, line time, reliability history.

## Setup
1. Supabase: `supabase/update-3.sql` (the `items` table and `reset_items`). Nothing newer is needed.
2. `config.js` holds the project URL and publishable key.
3. Lanes: `python -I scripts/build_lanes.py "<workbook>.xlsx" lanes.js "MONTICELLO, IN"`.
4. GitHub Pages serves `main`. Bump `?v=` in `index.html`, the imports at the top of `app.js` and the `lanes.js` import in `engine.js` after every change (browsers cache each file for 10 minutes).
5. Reset the demo: **Reset demo** (top right, every screen) → PIN on the live site. Clears all data and opens the home page on Nov 5.

## Tests
- `node --test tests/engine.test.mjs`: the rules.
- `node tests/personas.mjs` (with `python3 -m http.server 8765` running here): a bot plays customers and each team through the demo day using only what's on screen, grades every screen for simplicity, and writes `tests/persona-report.md` and `tests/persona-shots/`.
- `node tests/deck-shots.mjs`: 16 clean demo screenshots to `Case Comp/Deck screenshots/`.
