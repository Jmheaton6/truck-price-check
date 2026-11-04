# Persona test report

Run: 11/4/2026, 1:18:59 AM · http://localhost:8765/ · backup mode, today = Thu Nov 5

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
- calendar: 71 words, longest line 12 words, main button none · `08-logistics-calendar.png`
- transfers: 57 words, longest line 10 words, main button visible · `09-logistics-transfers.png`
- transfer planned: 70 words, longest line 14 words, main button visible · `10-logistics-transfer-planned.png`
- calendar with transfer: 69 words, longest line 11 words, main button none · `11-logistics-calendar-with-transfer.png`
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
- Sales change: 61 words, longest line 10 words, main button none · `14-sales2-sales-change.png`

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
- after asking carrier: 58 words, longest line 10 words, main button none · `19-logistics4-after-asking-carrier.png`

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
- Saved shows $9,334

**Screens:**
- executive: 58 words, longest line 7 words, main button none · `20-exec-executive.png`
