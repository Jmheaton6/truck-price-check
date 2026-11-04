# Plan of edits: make the app solve the case's problems (Nov 4)

## What the case says (the ground truth for every rule below)
- **Why spot happens.** Each lane has a routing guide of ~3 contract carriers, each with a weekly commitment (e.g. 10/week ≈ 2/day). A tender goes to the primary first. If every contract carrier rejects it, it goes to spot. Dennis: the #1 reason for rejections is daily bunching ("enough over a week for 20, but not 5 on Monday").
- **Timing.** Orders finalize Wednesday, are allocated Thursday and ship by the weekend. Logistics sees them 1–3 days ahead. Everything goes out in weekly batches.
- **Transfers.** Ball moving its own cans from a plant to a warehouse. They exist because lines run near capacity and Ball prebuilds for the summer peak (+15%).
  - Transfers are 64% of 2026 spot, and Ball's own freight overall is ~75%.
  - Ball decides when transfers ship, so it can pace them.
- **Our deck's fix.**
  - Forecast each lane in truckloads.
  - Give carriers a steady daily commitment (≈1/7 of the week per day).
  - Tender 3–5 days ahead.
  - Release prebuilds in waves.
  - Make Sales check the price tag (profit per truck $3,100 minus the spot premium).
  - Reliability earns priority.
  - Get ahead of customer changes.

## Joe's decisions
1. **Contract vs spot, with spot as the last resort.** A tender goes down the lane's **routing guide**:
   1. Primary carrier (needs 3+ days' notice and room in its daily share that week)
   2. Backup 1 (room that day)
   3. Backup 2 (room that day)
   4. **Counteroffer**: offer the customer the nearest date the routing guide can cover
   5. If the customer insists: **spot**, and the customer pays an **expedite fee = the lane's spot premium**

   Transfers have no customer, so step 4 for a transfer is "Logistics moves it to a day with room".
2. **Carrier commitments come from the workbook.** Each carrier's 2026 contract loads on that Findlay lane ÷ 30.3 weeks = its weekly commitment. Daily share = weekly ÷ 7, rounded up. Examples:

   | Lane | Primary | Backup 1 | Backup 2 |
   |---|---|---|---|
   | Cincinnati | Sage 17/wk | Axle 4/wk | Craig 4/wk |
   | Mississauga | TSN 8/wk | Fuel 2/wk | All Routes 2/wk |

   Downey's backups are almost zero, and the app should show that honestly.
3. **Transfers: prebuild, then paced waves.** Short-term forecasting decides a prebuild (warehouse, truckloads, ready date). It arrives in Logistics' Transfers tab, where Logistics schedules it in waves at the lanes' daily shares. The tab shows "one batch: N spot, $X" vs "paced: 0 spot".
4. **The old way is weekly batches.** The same freight tendered the case's way: released Thursday, shipping Fri–Sun, 1–3 days' notice. Its spot comes from the bunching. "Saved" = old-way spot cost minus spot cost now. The 8% goal stays.
5. **Sales sees the price tag.** Sales' card shows profit per truck: $3,100, minus the spot premium for any truck that would go spot, unless the customer pays the expedite fee.
6. **Customer side.**
   - Customers share forecasts and promo/filling schedules (built).
   - Late changes need all four teams (built).
   - **New: reliability score** = share of a customer's orders placed and kept outside the 3-day time fence (simulated history plus live orders). Customers at 90%+ are **Priority**: first in line for backup carriers and counteroffer dates. The score shows in Customer HQ and on Sales' card.
7. **Hubs.** Production becomes **Planning**, with the three planning horizons from the case.
8. **Dunnage round trips and peak planning** stay on the deck only.

## What "Outlook" was, and where it goes
It was Brett's ask: turn forecasts into **trucks per lane per week** early enough for Logistics to line up carriers before the 1–3-day scramble. It confused people as its own tab, so:
- It **becomes Planning → Short-term forecast**: customer forecasts and prebuilds by week, in truckloads.
- Logistics sees that forecast **on its lane calendar** as "expected" loads (dashed squares). Days where expected loads exceed the routing guide's daily shares show up before any order arrives. That is the early warning, with no separate screen.

## Screens after the edits
| Hub | Tabs |
|---|---|
| Sales | Orders (check-off; price tag; reliability) · Customers (reliability score per customer) |
| Inventory | Orders · Stock |
| **Planning** (was Production) | Orders (line time / freeze check) · Long-term (12-month baseline: growth 1–3%, spring ramp, early-summer peak, −10–15% second half; read only) · Short-term (customer forecasts + **Prebuild** form) · Line time |
| Logistics | Orders · **Lanes** (the calendar: each day's loads vs. primary/backup shares; routing-guide result per load; expected loads dashed) · Transfers (prebuilds to schedule: batch vs paced waves) |
| Executive | Saved vs weekly batches · spot % vs 8% · where it came from (transfers paced, routing guide, counteroffers) · one card per hub |

Customer HQ stays as is (Order · My POs), plus:
- the reliability score
- counteroffers ("Accept Nov 22" / "Keep my date: +$1,100 expedite")
- the expedite fee shown on the PO

## Engine changes (engine.js)
- `ROUTING` per pilot lane: [primary, backup1, backup2] with weekly commitments from the workbook (a new `carriers` field in lanes.js).
- `allocate()` rewritten as a **day-by-day tender** in arrival order:
  - primary (≥3 days' notice and room that day and week), then backup 1, then backup 2, else "needs counteroffer".
  - Each load gets `carrier` and `contract` / `spot` / `counter`.
  - The 3-day notice applies to the primary only.
- `counteroffer(items, it)`: nearest date (±7 days, customer-first by Priority) where the routing guide covers everything.
- `oldWay(items)`: re-run the tender with every load batched to Friday–Sunday of its week and 1–3 days' notice.
- `reliability(customer)`: simulated history plus live orders; Priority at ≥90%.
- `priceTag(it)`: $3,100 − premium × spot trucks Ball pays.
- Prebuild item (`type: "transfer"`, `data.prebuild` from Planning; `status: "waiting"` until Logistics schedules it).
- Remove: pre-booking, the Outlook warnings list, the 2026-rate baseline. Keep: forecasts/versions, checks, PO numbers, cuts, stock and line time.

## Demo story (3–4 min, one presenter)
1. **Planning → Short-term:** Coca-Cola's promo forecast is up. Planning decides a prebuild: 12 truckloads to Mississauga, ready Mon Nov 9.
2. **Logistics → Transfers:** one batch on one day ≈ 4 contract / 8 spot (TSN 2 + Fuel 1 + All Routes 1 a day) vs paced over the week = 12 contract. Schedule it.
3. **Customer HQ:** Coca-Cola orders 2M cans for Nov 19. The four teams check it, and Logistics' card shows "Sage (primary) ×3, Axle ×1, Craig ×1…".
4. **Customer HQ:** a late +4 change for Nov 19:
   - Sales sees "profit per truck $3,100 → $X".
   - The routing guide is full that day, so the customer gets a counteroffer for Nov 22.
   - Show both endings: accept (contract) or keep the date (spot plus an expedite fee on the PO).
5. **Executive:** saved vs the weekly batches, spot % vs 8%, and each hub's card.

## Done when
- Engine tests cover the routing order, short notice (primary rejects, backups can still take it), counteroffer, expedite fee, the old-way batch, pacing, reliability and the price tag.
- Persona bot: 0 issues, run through the new demo story.
- New screenshots and QR codes; README rules rewritten.
- Pushed live only when Joe says so. Then clear the live data (PIN).

## Assumptions to state on a slide
- Carrier commitments = 2026 contract loads ÷ 30.3 weeks.
- Daily share = weekly ÷ 7, rounded up.
- Primary needs 3+ days' notice.
- Simulated: customer names, forecasts, stock, line time, reliability history.
- Pilot freight only on these lanes.
