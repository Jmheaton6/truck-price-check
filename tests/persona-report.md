# Persona test report

Run: 11/4/2026, 1:38:22 AM · http://localhost:8765/ · backup mode, today = Thu Nov 5

| Persona | Task | Done | Clicks | Issues |
|---|---|---|---|---|
| Pat (customer, Customer A buyer) | Order 2 million cans for Thu Nov 19, then see if Ball accepted. | yes | 2 | 0 |
| Sam (Sales) | Find the new order waiting on me, read my check, and answer it. | yes | 2 | 0 |
| Ivy (Inventory) | Find the new order waiting on me, read my check, and answer it. | yes | 2 | 0 |
| Paolo (Production) | Find the new order waiting on me, read my check, and answer it. | yes | 2 | 0 |
| Lee (Logistics) | Accept the order, then book its trucks on the calendar, then plan 12 truckloads to Mississauga. | yes | 9 | 0 |
| Pat (customer, Customer A buyer) | Promo got bigger: change the order to 2.8 million cans. | yes | 2 | 0 |
| Sam (Sales) | A change came in. Read my check and answer honestly. | yes | 2 | 0 |
| Paolo (Production) | A change came in. Read my check and answer honestly. | yes | 1 | 0 |
| Pat (customer, Customer A buyer) | See what happened to my change, and take Ball's other date. | yes | 1 | 0 |
| Sam (Sales) | Answer the customer's new date. | yes | 2 | 0 |
| Ivy (Inventory) | Answer the customer's new date. | yes | 2 | 0 |
| Paolo (Production) | Answer the customer's new date. | yes | 2 | 0 |
| Lee (Logistics) | Answer the customer's new date. | yes | 2 | 0 |
| Bo (customer, Customer B buyer) | Order 1.2 million cans for Wed Nov 25. | yes | 2 | 0 |
| Sam (Sales) | Answer the new order. | yes | 2 | 0 |
| Ivy (Inventory) | Answer the new order. | yes | 2 | 0 |
| Paolo (Production) | Answer the new order. | yes | 2 | 0 |
| Lee (Logistics) | This order would need a spot truck. Avoid spot before I accept. | yes | 3 | 0 |
| Cy (customer, Customer C buyer) | Rush: order 0.4 million cans for Sat Nov 7 (2 days out). | yes | 2 | 0 |
| Sam (Sales) | Deny the rush order, then change my mind and accept it. | yes | 4 | 0 |
| Cy (customer, Customer C buyer) | Check my rush order. | yes | 0 | 0 |
| Pat (customer, Customer A buyer) | Demand dropped: cut the booked Nov 19 order to 1.6 million cans. | yes | 3 | 0 |
| Sales team | Answer the cut. | yes | 2 | 0 |
| Inventory team | Answer the cut. | yes | 2 | 0 |
| Production team | Answer the cut. | yes | 2 | 0 |
| Logistics team | Answer the cut. | yes | 2 | 0 |
| Lee (Logistics) | Ship 8 to Mississauga all on Fri Nov 20, see the spot, and fix it from the calendar. | yes | 9 | 0 |
| Lee (Logistics) | Changed my mind: remove the Adairsville transfer. | yes | 2 | 0 |
| Sam (Sales) | Try to book trucks even though I'm in Sales. | yes | 1 | 0 |
| Erin (Executive) | See how each department is doing and what we saved vs. the spot we're still paying for. | yes | 1 | 0 |

## Pat (customer, Customer A buyer)
*Order 2 million cans for Thu Nov 19, then see if Ball accepted.*

**What I did:**
- Clicked "Customer HQ"
- Typed 2 in "Million cans"
- Saw the cans turned into truckloads
- Typed 2026-11-19 in "Deliver on"
- Clicked "Send order"
- Saw the order status

**Screens:**
- home: 31 words, longest line 10 words, main button none · `01-customer-home.png`
- customer start: 32 words, longest line 3 words, main button visible · `02-customer-customer-start.png`
- order sent: 37 words, longest line 3 words, main button visible · `03-customer-order-sent.png`

## Sam (Sales)
*Find the new order waiting on me, read my check, and answer it.*

**What I did:**
- Picked "Sales" in "Department"
- Saw the waiting order
- Clicked "Accept"
- Saw an empty queue after answering

**Screens:**
- Sales queue: 55 words, longest line 10 words, main button none · `04-sales-sales-queue.png`

## Ivy (Inventory)
*Find the new order waiting on me, read my check, and answer it.*

**What I did:**
- Picked "Inventory" in "Department"
- Saw the waiting order
- Clicked "Accept"
- Saw an empty queue after answering

**Screens:**
- Inventory queue: 55 words, longest line 10 words, main button none · `05-inventory-inventory-queue.png`

## Paolo (Production)
*Find the new order waiting on me, read my check, and answer it.*

**What I did:**
- Picked "Production" in "Department"
- Saw the waiting order
- Clicked "Accept"
- Saw an empty queue after answering

**Screens:**
- Production queue: 55 words, longest line 10 words, main button none · `06-production-production-queue.png`

## Lee (Logistics)
*Accept the order, then book its trucks on the calendar, then plan 12 truckloads to Mississauga.*

**What I did:**
- Picked "Logistics" in "Department"
- Clicked "Accept"
- Clicked "Book trucks"
- Saw a list of what to book
- Clicked "Book"
- Clicked "Transfers"
- Typed 12 in "Truckloads"
- Clicked "Over 3 weeks"
- Saw the best option keeps all 12 on contract
- Clicked "Put on calendar"
- Clicked "Trucks"
- Clicked "Book"

**Screens:**
- order accepted: 59 words, longest line 6 words, main button visible · `07-logistics-order-accepted.png`
- calendar: 72 words, longest line 12 words, main button none · `08-logistics-calendar.png`
- transfers: 57 words, longest line 10 words, main button visible · `09-logistics-transfers.png`
- transfer planned: 70 words, longest line 14 words, main button visible · `10-logistics-transfer-planned.png`
- calendar with transfer: 70 words, longest line 11 words, main button none · `11-logistics-calendar-with-transfer.png`
- after book all: 67 words, longest line 5 words, main button none · `12-logistics-after-book-all.png`

## Pat (customer, Customer A buyer)
*Promo got bigger: change the order to 2.8 million cans.*

**What I did:**
- Clicked "Change"
- Typed 2.8 in "Million cans"
- Saw the change in truckloads
- Clicked "Send change"

**Screens:**
- change form: 37 words, longest line 3 words, main button visible · `13-customer2-change-form.png`

## Sam (Sales)
*A change came in. Read my check and answer honestly.*

**What I did:**
- Picked "Sales" in "Department"
- My check shows a problem, so I deny it
- Clicked "Deny"

**Screens:**
- Sales change: 60 words, longest line 10 words, main button none · `14-sales2-sales-change.png`

## Paolo (Production)
*A change came in. Read my check and answer honestly.*

**What I did:**
- Picked "Production" in "Department"
- Nothing waiting on me: another department already denied it

**Screens:**
- Production change: 30 words, longest line 4 words, main button none · `15-production2-production-change.png`

## Pat (customer, Customer A buyer)
*See what happened to my change, and take Ball's other date.*

**What I did:**
- Saw that the change was denied
- Clicked "Try Sun, Nov 22"

**Screens:**
- change denied: 45 words, longest line 4 words, main button visible · `16-customer3-change-denied.png`
- retry sent: 50 words, longest line 3 words, main button visible · `17-customer3-retry-sent.png`

## Sam (Sales)
*Answer the customer's new date.*

**What I did:**
- Picked "Sales" in "Department"
- Clicked "Accept"

## Ivy (Inventory)
*Answer the customer's new date.*

**What I did:**
- Picked "Inventory" in "Department"
- Clicked "Accept"

## Paolo (Production)
*Answer the customer's new date.*

**What I did:**
- Picked "Production" in "Department"
- Clicked "Accept"

## Lee (Logistics)
*Answer the customer's new date.*

**What I did:**
- Picked "Logistics" in "Department"
- Clicked "Accept"

## Bo (customer, Customer B buyer)
*Order 1.2 million cans for Wed Nov 25.*

**What I did:**
- Picked "Customer B" in "Company"
- Typed 1.2 in "Million cans"
- Typed 2026-11-25 in "Deliver on"
- Clicked "Send order"

## Sam (Sales)
*Answer the new order.*

**What I did:**
- Picked "Sales" in "Department"
- Clicked "Accept"

## Ivy (Inventory)
*Answer the new order.*

**What I did:**
- Picked "Inventory" in "Department"
- Clicked "Accept"

## Paolo (Production)
*Answer the new order.*

**What I did:**
- Picked "Production" in "Department"
- Clicked "Accept"

## Lee (Logistics)
*This order would need a spot truck. Avoid spot before I accept.*

**What I did:**
- Picked "Logistics" in "Department"
- Saw that a truck would go spot
- Clicked "Ask carrier +1"
- Clicked "Accept"

**Screens:**
- order needing spot: 59 words, longest line 10 words, main button visible · `18-logistics4-order-needing-spot.png`
- after asking carrier: 60 words, longest line 10 words, main button none · `19-logistics4-after-asking-carrier.png`

## Cy (customer, Customer C buyer)
*Rush: order 0.4 million cans for Sat Nov 7 (2 days out).*

**What I did:**
- Picked "Customer C" in "Company"
- Typed 0.4 in "Million cans"
- Typed 2026-11-07 in "Deliver on"
- Clicked "Send order"

## Sam (Sales)
*Deny the rush order, then change my mind and accept it.*

**What I did:**
- Picked "Sales" in "Department"
- Saw why the rush is a problem
- Clicked "Deny"
- Clicked "All"
- Saw the order now shows denied
- Clicked "Accept"
- Saw the order back in play

**Screens:**
- rush order: 57 words, longest line 10 words, main button none · `20-edge-sales-rush-order.png`

## Cy (customer, Customer C buyer)
*Check my rush order.*

**What I did:**
- Saw my rush order is being checked

**Screens:**
- rush status: 35 words, longest line 3 words, main button visible · `21-edge-late2-rush-status.png`

## Pat (customer, Customer A buyer)
*Demand dropped: cut the booked Nov 19 order to 1.6 million cans.*

**What I did:**
- Picked "Customer A" in "Company"
- Typed 1.6 in "Million cans"
- Saw the cut in truckloads
- Clicked "Send change"

## Sales team
*Answer the cut.*

**What I did:**
- Picked "Sales" in "Department"
- Open order: Change: 10 → 8 truckloads · Thu, Nov 19
- Clicked "Accept"

**Screens:**
- cut Sales: 55 words, longest line 10 words, main button none · `22-edge-cut-sales-cut-sales.png`

## Inventory team
*Answer the cut.*

**What I did:**
- Picked "Inventory" in "Department"
- Open order: Change: 10 → 8 truckloads · Thu, Nov 19
- Clicked "Accept"

**Screens:**
- cut Inventory: 61 words, longest line 10 words, main button none · `23-edge-cut-inventory-cut-inventory.png`

## Production team
*Answer the cut.*

**What I did:**
- Picked "Production" in "Department"
- Open order: Change: 10 → 8 truckloads · Thu, Nov 19
- Clicked "Accept"

**Screens:**
- cut Production: 61 words, longest line 10 words, main button none · `24-edge-cut-production-cut-production.png`

## Logistics team
*Answer the cut.*

**What I did:**
- Picked "Logistics" in "Department"
- Open order: Change: 10 → 8 truckloads · Thu, Nov 19
- Clicked "Accept"

**Screens:**
- cut Logistics: 61 words, longest line 10 words, main button none · `25-edge-cut-logistics-cut-logistics.png`

## Lee (Logistics)
*Ship 8 to Mississauga all on Fri Nov 20, see the spot, and fix it from the calendar.*

**What I did:**
- Picked "Logistics" in "Department"
- Picked "Mississauga, ON" in "To"
- Typed 8 in "Truckloads"
- Typed 2026-11-20 in "Start"
- Clicked "All on one day"
- Clicked "Put on calendar"
- Clicked "Trucks"
- Clicked "Mississauga by"
- Clicked "Over 1 week: 5 spot"
- Clicked "Ask carrier for +1"
- Carrier said: Carrier: Yes: +1

**Screens:**
- calendar with spot: 92 words, longest line 14 words, main button visible · `26-edge-transfer-calendar-with-spot.png`
- spot day: 82 words, longest line 7 words, main button visible · `27-edge-transfer-spot-day.png`
- after spreading: 95 words, longest line 13 words, main button visible · `28-edge-transfer-after-spreading.png`
- after ask: 80 words, longest line 7 words, main button visible · `29-edge-transfer-after-ask.png`

## Lee (Logistics)
*Changed my mind: remove the Adairsville transfer.*

**What I did:**
- Clicked "Transfers"
- Clicked "Remove"

## Sam (Sales)
*Try to book trucks even though I'm in Sales.*

**What I did:**
- Picked "Sales" in "Department"
- Saw who books trucks

## Erin (Executive)
*See how each department is doing and what we saved vs. the spot we're still paying for.*

**What I did:**
- Picked "Executive" in "Department"
- Saw "Saved"
- Saw "Spot spent"
- Saw "Sales"
- Saw "Inventory"
- Saw "Production"
- Saw "Logistics"
- Saved shows $8,410

**Screens:**
- executive: 67 words, longest line 7 words, main button none · `30-exec-executive.png`

## Final data
| # | Type | Status | What | Date | Booked days |
|---|---|---|---|---|---|
| 1 | order po | confirmed | Cincinnati, OH 10 | 2026-11-19 | 1 |
| 2 | transfer | booked | Mississauga, ON 12 | 2026-11-09 | 12 |
| 3 | order change | declined | Cincinnati, OH 4 (of #1) | 2026-11-19 | 0 |
| 4 | order change | confirmed | Cincinnati, OH 4 (of #1) | 2026-11-22 | 0 |
| 5 | order po | confirmed | Columbus, OH 6 | 2026-11-25 | 0 |
| 6 | ask order | yes | Columbus, OH 1 | 2026-11-25 | 0 |
| 7 | order po | waiting | Mertztown, PA 2 | 2026-11-07 | 0 |
| 8 | order change | confirmed | Cincinnati, OH -2 (of #1) | 2026-11-19 | 0 |
| 9 | transfer | declined | Mississauga, ON 8 | 2026-11-20 | 0 |
| 10 | ask transfer | yes | Mississauga, ON 1 | 2026-11-20 | 0 |