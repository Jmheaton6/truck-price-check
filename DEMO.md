# Short demo (2–2½ minutes, one presenter)

**Before you start:** open the live link, click **Reset demo** (top right) and type the PIN. Each step: **Do** = what you click. **They see** = what's on the screen for the judges. **Say** = your line.

**0. Open (10 sec)**
- **Say:** "Spot isn't a carrier problem, it's a timing problem. Ball sends trucks in bursts. Our app makes every truck fit what the carriers committed to."

**1. Planning sends a prebuild (10 sec)**
- **Do:** Ball HQ → **Planning** → **Short-term** tab → click **Send to Logistics** (the form is already filled in: Findlay, OH · 12 truckloads · Nov 9).
- **They see:** a 6-week table of customer forecasts in trucks, and the prebuild going to Logistics.
- **Say:** "Planning builds 12 truckloads ahead of the summer peak. Today those ship the day they're done."

**2. Logistics spreads it (25 sec)**
- **Do:** **Logistics** → **Transfers** tab. Point at the two options, then click **Schedule**.
- **They see:** **One batch: 3 contract, 9 spot, $4,635** next to **Paced waves: 12 contract, Nov 9–12**, marked Best.
- **Say:** "Same 12 trucks. The carriers committed to 3 a day on this lane. In one batch, 9 go spot. Spread over 4 days, all 12 go on contract. Transfers are 64% of Ball's spot."

**3. Contact the carriers, 48 hours ahead (20 sec)**
- **Do:** **Lanes** tab. Click **Contact** next to Findlay, then **Said yes**.
- **They see:** the calendar with Findlay, 3 a day Nov 9–12. The squares go from outlined (contact carrier) to half-filled (waiting on carrier) to solid (confirmed). The list says "by Nov 7", 48 hours before the first truck.
- **Say:** "Every truck shows whether the carrier has been contacted and whether they've said yes. Carriers hear from us at least 48 hours ahead."

**4. A customer orders (15 sec)**
- **Do:** **Customer HQ** (top right) → **Order** → Million cans **1** → Deliver on **11/19/2026** → **Send order**.
- **They see:** Coca-Cola's portal. 1 million cans becomes **5 truckloads**, and Coca-Cola shows as **Priority** (94% reliable).
- **Say:** "Customers order in cans. The app turns cans into trucks."

**5. Four teams check it on one screen (30 sec)**
- **Do:** **Ball HQ** → **Sales** → **Orders**. Point at the strip, then click **Accept**. Then **Inventory → Accept** and **Planning → Accept**.
- **They see:** one card per team, each with its check: Sales "Forecast 5: 5 fits", Inventory "1 from stock", Planning "4 to make: fits", Logistics "No carrier has room for 2". Above them: **"If all four accept: 3 contract · 2 counteroffer · $2,859 / truck."** Sales' card adds **"If you accept: $14,295 profit."**
- **Say:** "Each team sees its own check, and what its yes means for everyone else. Logistics already sees a problem: only 3 trucks fit that day."

**6. Logistics counteroffers instead of using spot (15 sec)**
- **Do:** **Logistics** → **Orders** → click **Counteroffer: split 3 Nov 19 + 2 Nov 20**.
- **They see:** the Logistics card: "No carrier has room for 2. If you accept: customer gets a counteroffer, not spot."
- **Say:** "Instead of 2 spot trucks, we offer to ship the last 2 the next day."

**7. The customer decides (15 sec)**
- **Do:** **Customer HQ** → **My POs** → click **Take the split**.
- **They see:** "Ball can ship 3 Thu, Nov 19 + 2 Fri, Nov 20, all on contract," next to **Keep Nov 19 · +$1,204**.
- **Say:** "Spot is the last resort. If the customer wants it anyway, they pay the premium."

**8. Marcelo's dashboard (30 sec)**
- **Do:** **Ball HQ** → **Executive**. Point at the top row, then the pilot box, then scroll to the calendar.
- **They see:**
  - Top row: **on-time 100%** (today 86%) and **cost to serve $779 a load** (old way $1,063).
  - Pilot box: **transfer spot 83% → 0%**, under the 20% go/no-go line, **saved $5,150**.
  - Calendar at the bottom: Findlay 3 a day Nov 9–12, and Coca-Cola 3 on Nov 19 and 2 on Nov 20.
- **Say:** "Every team is scored on the same three numbers, so no one wins by pushing cost onto someone else. On the pilot lanes, spot went from 83% to zero."

**Running long?** Skip step 3's clicks (point at the outlined squares) and step 1's line.

---

# Full demo script (about 4 minutes, one presenter)

**Link:** https://jmheaton6.github.io/truck-price-check/ (on Thu Nov 5 the app's date is already right).
**Rehearsal or no Wi-Fi:** http://localhost:8765/?local&today=2026-11-05 (or add `?local&today=2026-11-05` to the live link).

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
    - **Top row, three numbers every team shares:** on-time delivery **100%** (today 86%), change requests resolved, cost to serve **$779 a load** (old way $1,063).
    - **Each team's own number + guardrail:** Logistics 0% spot, judged on on-time too.
    - **Monticello pilot transfer spot: 83% → 0%**, under the 20% go/no-go line, **saved $5,150**.
    - **What's going out:** the calendar at the bottom. Findlay 3 a day Nov 9–12, Coca-Cola 3 + 2, the extra trucks lined up for Nov 29.
    *Say:* "Three shared numbers keep each other honest: cut cost by refusing changes and number two drops; say yes to everything and number three rises."

## If something goes wrong
- Click **Reset demo** and start again from step 1.
- Wi-Fi down: use the localhost link above (needs `python3 -m http.server 8765` running in the app folder).

## Likely judge questions
- **"Is the carrier answer real?"** No. In the pilot it comes back by EDI or email; here Logistics records it. The point is that the status is visible.
- **"Where do 3 a day and 5 a week come from?"** Each carrier's 2026 loads on that lane ÷ 30.3 weeks, rounded up; a day is ÷ 7, rounded up. The workbook is monthly, so the daily share is our assumption.
- **"When are carriers contacted?"** At least 48 hours before pickup; the primary carrier won't take a load with less. Orders lock 3 days out, so a change inside 3 days is a late change.
