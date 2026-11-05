# Persona test report

Run: 11/4/2026, 11:40:16 PM · http://localhost:8765/ · backup mode, today = Thu Nov 5

| Persona | Task | Done | Clicks | Issues |
|---|---|---|---|---|
| Pat (customer, Coca-Cola buyer) | Our Nov 29 week has a promo: tell Ball it'll be 1.4 million cans. | yes | 2 | 0 |
| Pia (Planning, short-term forecasting) | See what's coming, and send Logistics a prebuild: 12 truckloads to the Findlay warehouse, ready Nov 9. | yes | 4 | 1 |
| Lee (Logistics) | Coca-Cola's promo week needs more trucks than our carriers hold. Line them up now. | yes | 3 | 0 |
| Lee (Logistics) | Schedule the prebuild so it doesn't go spot. | yes | 3 | 0 |
| Pat (customer, Coca-Cola buyer) | Order 0.6 million cans for Thu Nov 19, then see where it stands. | yes | 2 | 0 |
| Sam (Sales) | Find the new order, read my check, answer it. | yes | 2 | 0 |
| Ivy (Inventory) | Find the new order, read my check, answer it. | yes | 2 | 0 |
| Pia (Planning) | Find the new order, read my check, answer it. | yes | 2 | 0 |
| Lee (Logistics) | Find the new order, read my check, answer it. | yes | 2 | 0 |
| Lee (Logistics) | Contact the carriers for the accepted order, then record their yes. | yes | 3 | 0 |
| Pat (customer, Coca-Cola buyer) | The promo grew: change the Nov 19 order to 1 million cans. | yes | 3 | 0 |
| Sam (Sales) | A change came in. Read my check and answer. | yes | 2 | 0 |
| Ivy (Inventory) | A change came in. Read my check and answer. | yes | 2 | 0 |
| Pia (Planning) | A change came in. Read my check and answer. | yes | 2 | 0 |
| Lee (Logistics) | The change doesn't fit the routing guide. Don't go spot: offer the customer another date. | yes | 2 | 0 |
| Pat (customer, Coca-Cola buyer) | Ball offered a new date. Take it. | yes | 2 | 0 |
| Cy (customer, AB InBev buyer) | Order 0.4 million cans for Wed Nov 18 and keep that date even if it costs more. | yes | 2 | 0 |
| Sales team | Answer AB InBev's order. | yes | 2 | 0 |
| Inventory team | Answer AB InBev's order. | yes | 2 | 0 |
| Planning team | Answer AB InBev's order. | yes | 2 | 0 |
| Lee (Logistics) | AB InBev's lane has one carrier taking 1 a week. Offer the customer spot. | yes | 2 | 0 |
| Cy (customer, AB InBev buyer) | Keep my date and pay the fee. | yes | 2 | 0 |
| Bo (customer, PepsiCo buyer) | Rush: order 0.4 million cans for Sat Nov 7 (2 days out). | yes | 2 | 0 |
| Sam (Sales) | Deny the rush order, then change my mind and accept it. | yes | 4 | 0 |
| Ivy (Inventory) | Check how many labeled cans each customer has left. | yes | 2 | 0 |
| Pia (Planning) | Check line time and the yearly baseline. | yes | 3 | 0 |
| Sam (Sales) | Try to contact carriers even though I'm in Sales. | yes | 1 | 0 |
| Erin (Executive) | Check the three shared numbers, each team and its guardrail, what we saved, and what is going out. | yes | 1 | 1 |

## Pat (customer, Coca-Cola buyer)
*Our Nov 29 week has a promo: tell Ball it'll be 1.4 million cans.*

**What I did:**
- Clicked "Customer HQ"
- Typed 1.4 in "week of Nov 29"
- Clicked "Share forecast"

**Screens:**
- home: 35 words, longest line 10 words, main button none · `01-forecast-home.png`
- customer start: 60 words, longest line 3 words, main button visible · `02-forecast-customer-start.png`

## Pia (Planning, short-term forecasting)
*See what's coming, and send Logistics a prebuild: 12 truckloads to the Findlay warehouse, ready Nov 9.*

**Friction:**
- "short-term forecast": 123 words on screen (aim ≤ 120).

**What I did:**
- Opened the Planning hub
- Clicked "Short-term"
- Saw Coca-Cola's promo week flagged
- Picked "Findlay, OH" in "Warehouse"
- Typed 12 in "Truckloads"
- Typed 2026-11-09 in "Ready on"
- Clicked "Send to Logistics"

**Screens:**
- short-term forecast: 123 words, longest line 6 words, main button visible · `03-planning-short-term-forecast.png`

## Lee (Logistics)
*Coca-Cola's promo week needs more trucks than our carriers hold. Line them up now.*

**What I did:**
- Opened the Logistics hub
- Clicked "Lanes"
- Saw "Early warning"
- Saw the promo week's trucks vs the room
- Clicked "Line up 2 more"

**Screens:**
- early warning: 90 words, longest line 11 words, main button none · `04-warning-early-warning.png`

## Lee (Logistics)
*Schedule the prebuild so it doesn't go spot.*

**What I did:**
- Opened the Logistics hub
- Clicked "Transfers"
- Saw "One batch"
- Saw "Paced waves"
- Saw what one batch would cost
- Clicked "Schedule"

**Screens:**
- prebuild to schedule: 52 words, longest line 3 words, main button visible · `05-transfers-prebuild-to-schedule.png`

## Pat (customer, Coca-Cola buyer)
*Order 0.6 million cans for Thu Nov 19, then see where it stands.*

**What I did:**
- Saw that we're a Priority customer
- Typed 0.6 in "Million cans"
- Saw the cans turned into truckloads
- Typed 2026-11-19 in "Deliver on"
- Clicked "Send order"
- Clicked "My POs"
- Saw the order status

**Screens:**
- order sent: 47 words, longest line 2 words, main button none · `06-customer-order-sent.png`

## Sam (Sales)
*Find the new order, read my check, answer it.*

**What I did:**
- Opened the Sales hub
- Saw the price tag
- Clicked "Accept"

**Screens:**
- Sales check: 84 words, longest line 10 words, main button none · `07-sales-sales-check.png`

## Ivy (Inventory)
*Find the new order, read my check, answer it.*

**What I did:**
- Opened the Inventory hub
- Clicked "Accept"

**Screens:**
- Inventory check: 85 words, longest line 10 words, main button none · `08-inventory-inventory-check.png`

## Pia (Planning)
*Find the new order, read my check, answer it.*

**What I did:**
- Opened the Planning hub
- Clicked "Accept"

**Screens:**
- Planning check: 90 words, longest line 11 words, main button none · `09-planning-planning-check.png`

## Lee (Logistics)
*Find the new order, read my check, answer it.*

**What I did:**
- Opened the Logistics hub
- Saw which carriers take it
- Clicked "Accept"

**Screens:**
- Logistics check: 85 words, longest line 10 words, main button none · `10-logistics-logistics-check.png`

## Lee (Logistics)
*Contact the carriers for the accepted order, then record their yes.*

**What I did:**
- Clicked "Contact carriers"
- Saw a list of carriers to contact
- Clicked "Contact"
- Saw what's waiting on a carrier's answer
- Clicked "Said yes"

**Screens:**
- lanes: 114 words, longest line 11 words, main button visible · `11-book-lanes.png`

## Pat (customer, Coca-Cola buyer)
*The promo grew: change the Nov 19 order to 1 million cans.*

**What I did:**
- Clicked "My POs"
- Clicked "Change"
- Typed 1 in "Million cans"
- Saw the change in truckloads
- Clicked "Send change"

## Sam (Sales)
*A change came in. Read my check and answer.*

**What I did:**
- Opened the Sales hub
- Clicked "Accept"

## Ivy (Inventory)
*A change came in. Read my check and answer.*

**What I did:**
- Opened the Inventory hub
- Clicked "Accept"

## Pia (Planning)
*A change came in. Read my check and answer.*

**What I did:**
- Opened the Planning hub
- Clicked "Accept"

## Lee (Logistics)
*The change doesn't fit the routing guide. Don't go spot: offer the customer another date.*

**What I did:**
- Opened the Logistics hub
- Saw why it doesn't fit
- Clicked "Counteroffer Nov 20"

**Screens:**
- no carrier has room: 93 words, longest line 13 words, main button visible · `12-counter-no-carrier-has-room.png`

## Pat (customer, Coca-Cola buyer)
*Ball offered a new date. Take it.*

**What I did:**
- Clicked "My POs"
- Saw Ball's new date
- Clicked "Take Nov 20"
- Saw the change accepted

**Screens:**
- counteroffer: 65 words, longest line 14 words, main button visible · `13-take-counteroffer.png`

## Cy (customer, AB InBev buyer)
*Order 0.4 million cans for Wed Nov 18 and keep that date even if it costs more.*

**What I did:**
- Picked "AB InBev" in "Company"
- Typed 0.4 in "Million cans"
- Typed 2026-11-18 in "Deliver on"
- Clicked "Send order"

## Sales team
*Answer AB InBev's order.*

**What I did:**
- Opened the Sales hub
- Clicked "Accept"

## Inventory team
*Answer AB InBev's order.*

**What I did:**
- Opened the Inventory hub
- Clicked "Accept"

## Planning team
*Answer AB InBev's order.*

**What I did:**
- Opened the Planning hub
- Clicked "Accept"

## Lee (Logistics)
*AB InBev's lane has one carrier taking 1 a week. Offer the customer spot.*

**What I did:**
- Opened the Logistics hub
- Clicked "Offer spot to customer"

**Screens:**
- one-carrier lane: 99 words, longest line 13 words, main button visible · `14-edge-spot-one-carrier-lane.png`

## Cy (customer, AB InBev buyer)
*Keep my date and pay the fee.*

**What I did:**
- Clicked "My POs"
- Clicked "Keep Nov 18 · +$799"
- Saw the fee on my PO

**Screens:**
- kept date: 55 words, longest line 3 words, main button none · `15-edge-keep2-kept-date.png`

## Bo (customer, PepsiCo buyer)
*Rush: order 0.4 million cans for Sat Nov 7 (2 days out).*

**What I did:**
- Picked "PepsiCo" in "Company"
- Typed 0.4 in "Million cans"
- Typed 2026-11-07 in "Deliver on"
- Clicked "Send order"

## Sam (Sales)
*Deny the rush order, then change my mind and accept it.*

**What I did:**
- Opened the Sales hub
- Saw why the rush is a problem
- Clicked "Deny"
- Clicked "All"
- Saw the order now shows denied
- Clicked "Accept"
- Saw the order back in play

**Screens:**
- rush order: 85 words, longest line 10 words, main button none · `16-edge-sales-rush-order.png`

## Ivy (Inventory)
*Check how many labeled cans each customer has left.*

**What I did:**
- Opened the Inventory hub
- Clicked "Stock"
- Saw "Coca-Cola"

**Screens:**
- stock: 54 words, longest line 7 words, main button none · `17-edge-stock-stock.png`

## Pia (Planning)
*Check line time and the yearly baseline.*

**What I did:**
- Opened the Planning hub
- Clicked "Line time"
- Clicked "Long-term"
- Saw this year's plan

**Screens:**
- line time: 61 words, longest line 6 words, main button none · `18-edge-line-line-time.png`
- long-term: 117 words, longest line 12 words, main button none · `19-edge-line-long-term.png`

## Sam (Sales)
*Try to contact carriers even though I'm in Sales.*

**What I did:**
- Opened the Sales hub

## Erin (Executive)
*Check the three shared numbers, each team and its guardrail, what we saved, and what is going out.*

**Friction:**
- "executive": 150 words on screen (aim ≤ 120).

**What I did:**
- Opened the Executive hub
- Saw "On-time delivery"
- Saw "Change requests resolved"
- Saw "Cost to serve"
- Saw "Sales"
- Saw "Inventory"
- Saw "Planning"
- Saw "Logistics"
- Saw "What's going out"
- Saved $5,949

**Screens:**
- executive: 150 words, longest line 9 words, main button none · `20-exec-executive.png`

## Final data
| # | Type | Status | What | Date | Booked days |
|---|---|---|---|---|---|
| 1 | ask forecast | noted | Random Lake, WI 7 |  | 0 |
| 2 | transfer | booked | Findlay, OH 12 |  | 4 |
| 3 | ask room | noted |   |  | 0 |
| 4 | order po | confirmed | Random Lake, WI 3 | 2026-11-19 | 0 |
| 5 | order change | confirmed | Random Lake, WI 2 (of #4) | 2026-11-20 | 0 |
| 6 | order po | confirmed | Memphis, TN 2 | 2026-11-18 | 0 |
| 7 | order po | waiting | Alsip, IL 2 | 2026-11-07 | 0 |