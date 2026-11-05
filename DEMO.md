# Demo (about 2 minutes, one presenter)

**0. Before you start:** click **Reset demo** (top right) and type the PIN. Reset leaves one order in: **Coca-Cola's PO-1001, 0.6M cans (3 truckloads) for Thu Nov 19, accepted by all four teams and booked with carriers.** You only change it. **Do** = what you click. **Shows** = what the judges see. **Say** = your line.

**Open (10 sec).** *Say:* "Spot isn't a carrier problem, it's a timing problem. Ball sends trucks in bursts. Our app gets every team on one truck plan."

## Part 1: Weeks ahead (about 50 sec)
1. **Do:** Customer HQ → My forecast: type **1.4** in **Nov 29** → **Share forecast**. **Shows:** 1.4M cans = 7 truckloads. **Say:** "Coca-Cola warns us weeks ahead, in cans. The app turns it into trucks."
2. **Do:** Ball HQ → **Planning** → **Short-term**. **Shows:** Coca-Cola's Nov 29 week flagged 7, +2 over the carriers' 5. **Say:** "That's the early warning."
3. **Do:** Same screen → **Send to Logistics** (the prebuild is filled in: Findlay, 12, Nov 9). **Say:** "Planning also sends a 12-truck prebuild for the summer peak."
4. **Do:** **Logistics** → **Transfers** → **Schedule**. **Shows:** one batch = 9 spot, $4,635 vs. paced = 12 contract, Nov 9–12. **Say:** "Same 12 trucks, spread 3 a day, all on contract. Transfers are 64% of Ball's spot."
5. **Do:** **Lanes** → **Line up 2 more**, then **Contact** → **Said yes**. **Shows:** a dashed "Extra trucks lined up" bar under Nov 29; Findlay's squares go outlined → half-filled → solid. **Say:** "We warn carriers a month ahead, and every truck shows if the carrier was contacted and said yes."

## Part 2: A late change (about 40 sec)
6. **Do:** Customer HQ → **My POs** → **Change** on PO-1001: **1** million cans (+2 trucks) → **Send change**.
7. **Do:** Ball HQ → **Sales** → **Orders** → **Accept**, then **Inventory → Accept** and **Planning → Accept**. **Shows:** profit drops to $2,498 / truck; "If all four accept: 0 contract · 2 counteroffer." **Say:** "Four teams, one screen. Each sees what its yes does for the others."
8. **Do:** **Logistics** → **Orders** → **Counteroffer Nov 20**. **Shows:** "No carrier has room for 2." **Say:** "Nov 19 is full. Instead of 2 spot trucks, we offer the next day."
9. **Do:** Customer HQ → **My POs** → **Take Nov 20**. **Shows:** Take Nov 20 vs. Keep Nov 19 · +$1,204. **Say:** "Spot is the last resort, and if the customer wants it, they pay for it."

## Part 3: Payoff (about 25 sec)
10. **Do:** Ball HQ → **Executive**. Point at the top row. **Shows:** on-time 100% (today 86%), changes resolved 100%, cost to serve $779 a load vs. $1,063 the old way, saved $5,150.
11. **Do:** Point at the **Logistics** card. **Shows:** 0% spot.
12. **Do:** Scroll to the calendar. **Shows:** Findlay 3 a day Nov 9–12, Coca-Cola 3 on Nov 19 and 2 on Nov 20, extra trucks for Nov 29.
13. **Say:** "Every team is scored on the same three numbers, so no one wins by pushing cost onto someone else."

**Running long?** Skip the Contact / Said yes clicks in step 5 and the scroll in step 12.

---

# Full demo script (about 4 minutes, one presenter)

**Link:** https://jmheaton6.github.io/truck-price-check/ (on Thu Nov 5 the app's date is already right).
**No Wi-Fi:** http://localhost:8765/?local (needs the local server). The app always runs on today's date, Mountain time.

**Before you start:** click **Reset demo** (top right). On the live site, type the PIN. It clears everything and opens the home page on Nov 5.

To move around: **Customer HQ / Ball HQ** switch (top right), then the team names across the top, then the tabs under them.

**The story in one line:** spot isn't a carrier problem, it's a timing problem. Ball sends trucks in bursts. The app makes every truck fit the carriers' daily commitment, warns them weeks ahead, and turns late changes into a choice instead of a spot load.

## 1. Consistent shipments: spread it, don't spot it (≈1½ min) · Pillar 1, $6.2M
1. **Ball HQ → Planning → Short-term.** The **Prebuild** form is filled in (Findlay, OH · 12 · Nov 9). Click **Send to Logistics**.
   *Say:* "Planning decides a prebuild for the summer peak. Today it ships the day it's done."
2. **Logistics → Transfers.** **One batch = 3 contract, 9 spot, $4,635.** **Paced waves = 12 contract, Nov 9–12.** Click **Schedule**.
   *Say:* "Same 12 trucks. The carriers committed to 3 a day on this lane. Spread out, all 12 fit. This is 64% of Ball's spot."
3. **Logistics → Lanes.** Under **Contact carriers**: Findlay, contact by Nov 7 (48 hours ahead). Click **Contact**. The squares go half-filled, and it moves to **Waiting on carrier**. Click **Said yes**. The squares go solid.
   *Say:* "Every truck shows whether we've contacted the carrier and whether they've said yes. Nothing falls through."

## 2. Connected planning: the early warning (≈45 sec) · Pillar 2
4. **Customer HQ** (Coca-Cola is already picked). Under **My forecast**, type **1.4** in the **Nov 29** box (it shows 7 truckloads). Click **Share forecast**.
   *Say:* "Coca-Cola has a promo. They tell us weeks ahead, in cans; the app turns it into trucks."
5. **Ball HQ → Logistics → Lanes.** Under **Early warning**: Coca-Cola, week of Nov 29, "Forecast 7 trucks · carriers committed to 5". Click **Line up 2 more**. A dashed "Extra trucks lined up" bar appears under that week.
   *Say:* "Logistics asks for 2 more trucks a month ahead, not 2 days ahead."

## 3. Controlled changes: four teams, one screen (≈1¼ min) · Pillar 3
6. **Customer HQ → Order.** Million cans **1** (= 5 truckloads), Deliver on **11/19/2026**. Click **Send order**. Point at **Priority**.
7. **Ball HQ → Sales → Orders.** Point at the strip: **"If all four accept: 3 contract · 2 counteroffer."** Sales' card: "Forecast 5: 5 fits", and **If you accept: $14,295 profit**. Click **Accept**.
   *Say:* "Each team sees its check and what its yes does for the others."
8. **Inventory → Accept** ("1 from stock"). **Planning → Accept** ("4 to make: fits").
9. **Logistics → Orders:** "No carrier has room for 2". Click **Counteroffer: split 3 Nov 19 + 2 Nov 20**.
   *Say:* "The carriers take 3 a day. Instead of 2 spot trucks, we offer to ship the last 2 the next day."
10. **Customer HQ → My POs:** "Ball can ship 3 Thu Nov 19 + 2 Fri Nov 20, all on contract." Choose **Take the split** or **Keep Nov 19 · +$1,204** (they pay the spot premium). Click **Take the split**.
11. *(Optional)* **Ball HQ → Logistics → Lanes:** Coca-Cola shows 3 on Nov 19 and 2 on Nov 20. **Contact**, then **Said yes**.

## 4. The payoff: Marcelo's dashboard (≈30 sec)
12. **Ball HQ → Executive.**
    - **Top row, three numbers every team shares:** on-time delivery **100%** (today 86%), change requests resolved, cost to serve **$779 a load** (old way $1,063), **saved $5,150**.
    - **Each team's own number + guardrail:** Logistics 0% spot, judged on on-time too.
    - **What's going out:** the calendar at the bottom. Findlay 3 a day Nov 9–12, Coca-Cola 3 + 2, the extra trucks lined up for Nov 29.
    *Say:* "Three shared numbers keep each other honest: cut cost by refusing changes and number two drops; say yes to everything and number three rises."

## If something goes wrong
- Click **Reset demo** and start again from step 1.
- Wi-Fi down: use the localhost link above (needs `python3 -m http.server 8765` running in the app folder).

## Likely judge questions
- **"Is the carrier answer real?"** No. In the pilot it comes back by EDI or email; here Logistics records it. The point is that the status is visible.
- **"Where do 3 a day and 5 a week come from?"** Each carrier's 2026 loads on that lane ÷ 30.3 weeks, rounded up; a day is ÷ 7, rounded up. The workbook is monthly, so the daily share is our assumption.
- **"When are carriers contacted?"** At least 48 hours before pickup; the primary carrier won't take a load with less. Orders lock 3 days out, so a change inside 3 days is a late change.
