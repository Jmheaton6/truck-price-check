# Back to basics: the plan (written Wed Nov 4, ~1am)

**Deadlines:** slides due 11:59pm Wed Nov 4 (we need app screenshots by about 8pm). Competition Thu Nov 5.

## What it has to do, in your words
1. **Customer:** a place to put in what I want from Ball, and to request a change in demand.
2. **Ball, every department:** check off and agree on each PO. This is how the teams communicate.
3. **Logistics:** a calendar of all our trucks: what's moving, when, where, contract or spot.
4. **Internal transfers:** plan them out easily. They're 64% of spot.
5. **Executive:** how each department is doing, and our savings next to the spot we're still using.

**Rule for every screen:** one job per screen, one main button, big simple visuals, and no number without a label that says what it means.

## The five screens

### 1. Customer HQ: "Order from Ball"
```
┌ New order ─────────────────┐  ┌ My orders ──────────────────────────┐
│ How many cans?  [ 2.0 ] M  │  │ PO-1001  10 trucks · Thu Nov 19      │
│ = 10 truckloads            │  │ ● Ball is reviewing (3 of 4 agreed)  │
│ Deliver on     [Nov 19]    │  │ [Request a change]                   │
│ [ Send order ]             │  │ PO-1002  ...  ✓ Confirmed            │
└────────────────────────────┘  └──────────────────────────────────────┘
```
- Request a change opens on the order itself: new amount (or date) → "Send change." It goes through the same check-off.
- Status words only: Reviewing · Confirmed · Ball offered another date (Accept / Decline) · Not possible.
- **Cut:** outlooks, reliability scores, previews, history.

### 2. Ball HQ: "Orders to agree on" (all departments, one screen)
```
PO-1001 · Customer A · 10 trucks · Thu Nov 19             Reviewing
┌ Sales ──────┐┌ Inventory ──┐┌ Production ─┐┌ Logistics ──┐
│ Within their││ 2 trucks in ││ Line time   ││ 3 contract   │
│ forecast ✓  ││ stock ✓     ││ fits ✓      ││ 7 would be   │
│ [Agree]     ││ [Agree]     ││ [Agree]     ││ spot ✗       │
│             ││             ││             ││ [Agree][Flag]│
└─────────────┘└─────────────┘└─────────────┘└──────────────┘
Flag → note + suggested date → Sales sends it to the customer.
```
- One list of orders down the left, with the four check-offs as four dots. The order you click opens on the right.
- Each department sees **one line** (the app's check) and gives **Agree** or **Flag + a short note**. Four Agrees means Confirmed, and it lands on the truck calendar.
- **Cut:** separate department tabs, Act-as, history log, profit strip. (We keep the per-department view as a filter: "Waiting on me".)

### 3. Logistics: "Truck calendar" (the centerpiece)
```
Week of Nov 15      Sun   Mon   Tue   Wed   Thu   Fri   Sat
Cincinnati (cust)    –    ■■    ■■    ■■   ■■■■■  –     –
Columbus (cust)     ...
Mississauga (xfer)   –    ■■■   ■■■   ■■■   ■■■   –     –
                     ■ contract  ■ spot   capacity line per day
[◀ week]  [week ▶]   click a day → list of trucks: where, what, contract/spot
```
- Rows = destinations (customers and warehouses). Columns = days. Squares = trucks: blue for contract, red for spot.
- Over-capacity days show red, and you see it weeks ahead. That's the early warning, with no separate grid.
- One action per problem day: "Ask carrier for +N" or "Move to another day".

### 4. Logistics: "Plan a transfer"
```
Send [12] truckloads to [Mississauga ▾] starting [Mon Nov 9]
How:  ( ) All on one day   → 3 contract, 9 spot   $X extra
      (•) Spread over 3 wks → 12 contract, 0 spot  ✓ best
[ Put it on the calendar ]
```
- The same calendar shows the transfer as it would land, before you commit.

### 5. Executive: "How we're doing"
```
Spot this pilot: 6%  (was 15.8%)        Saved: $X  vs. spot spent: $Y
┌ Sales ─────┐┌ Inventory ─┐┌ Production ┐┌ Logistics ─┐
│ Orders     ││ Stranded   ││ Line time  ││ Spot %      │
│ answered   ││ cans: 0    ││ used: 82%  ││ Booked 3+   │
│ in 1.2 hr  ││            ││            ││ days ahead  │
└────────────┘└────────────┘└────────────┘└─────────────┘
Bar: spot $ spent vs. $ saved, by week
```

## What we keep vs. throw away
**Keep (it works and is tested):** the Supabase `items` table; the engine's contract-or-spot math per lane and day (that feeds the calendar); the transfer patterns; the real Findlay lane data; the Ball look.
**Throw away:** sign-in with names, Act as, history logs, outlooks, reliability and auto-approve, the 6-week colored grid, the five department tabs, profit per truck on every screen.

## How we build it tomorrow (in order, a working app after each step)
1. Customer HQ (order and change). About 1 hr.
2. Ball HQ check-off board. About 1.5 hr.
3. Truck calendar. About 2 hr.
4. Transfer planner on the calendar. About 1 hr.
5. Executive dashboard. About 1 hr.
6. Screenshots for the deck, by about 8pm. Then demo rehearsal.

Safety: build on a new branch. Today's version stays live until the new one passes a full click-through.

## Joe's answers (Wed ~1:30am)
1. **Accept or Deny.** Each department accepts or denies. All four must accept for an order to go through. One deny means the order doesn't go through, and the customer sees it with a short reason.
2. **The calendar tells Logistics which trucks to book on which days.** The app plans contract first. Each day shows "book N contract trucks to X." Red marks a day that would need spot, with the fix (a different day, or ask the carrier early). Logistics checks a day off when it's booked. Goal: fewer spot trucks.
3. **Savings = the pilot's own orders:** the old way (no planning, transfers in one batch) vs. the new way, in spot trucks and dollars.
4. **Scorecards confirmed.** Sales: time to answer. Inventory: stranded cans. Production: line time used. Logistics: spot % and share booked 3+ days ahead.
5. **No names.** You pick a department and that's it.

## Design rules
- **Back to our regular look** (the earlier version), not the Ball black-and-blue restyle.
- **No word without a purpose.** No lede paragraphs, no explainer text, no "simulated" notes on screens (those go in the README and the assumptions slide). Labels are 1–3 words. Numbers carry the meaning; color carries the status.
- One main button per screen.
