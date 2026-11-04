# Demo script (about 3½ minutes, one presenter)

**Link:** https://jmheaton6.github.io/truck-price-check/ (on Thu Nov 5 the app's date is already right).
**Rehearsal or no Wi-Fi:** http://localhost:8765/?local&today=2026-11-05 (or add `?local&today=2026-11-05` to the live link).

**Before you start:** click **Reset demo** (top right). On the live site, type the PIN. It clears everything and opens the home page on Nov 5.

To move around: **Customer HQ / Ball HQ** switch (top right), then the team names across the top, then the tabs under them.

## 1. Weeks ahead: the customer warns us (≈1 min)
1. **Customer HQ** (Coca-Cola is already picked). Under **My forecast**, type **1.4** in the **Nov 29** box (it shows 7 truckloads). Click **Share forecast**.
   *Say:* "Coca-Cola has a promo. They tell us weeks ahead, in cans; the app turns it into trucks."
2. **Ball HQ → Planning → Short-term.** Coca-Cola's Nov 29 week is **red: 7 trucks, room for 5**.
   *Say:* "Early warning: the forecast needs more trucks than our carriers committed."
3. Same screen, right side: the **Prebuild** form is filled in (Findlay, OH · 12 · Nov 9). Click **Send to Logistics**.
   *Say:* "Planning also decides a prebuild for the summer peak and hands it to Logistics."
4. **Logistics → Lanes.** Under **Early warning**: Coca-Cola, week of Nov 29. Pick **C.H. Robinson**, click **Add 2**.
   *Say:* "Logistics lines up 2 more trucks a month ahead, not 2 days ahead."
5. **Logistics → Transfers.** One batch = **3 contract, 9 spot, $4,635**. Paced waves = **12 contract**, Nov 9–12. Click **Schedule**.
   *Say:* "Same 12 trucks. Spread out, they fit the carriers' daily share, so no spot."

## 2. An order: four teams, one screen (≈1 min)
6. **Customer HQ → Order.** Cans **0.6** (= 3 truckloads), Deliver on **11/19/2026**. Click **Send order**. Point at **93% reliable · Priority**.
7. **Ball HQ → Sales → Orders.** "Forecast 5: 3 fits", **$3,100 profit / truck**. Click **Accept**.
8. **Inventory → Accept. Planning → Accept.**
9. **Logistics → Orders.** "Dedicated 1 · C.H. Robinson 1 · Sage 1" (primary, then backups). Click **Accept**, then **Book trucks** → **Book**.
   *Say:* "Booked 2 weeks out, on contract, down the routing guide."

## 3. A late change: counteroffer before spot (≈1 min)
10. **Customer HQ → My POs → Change.** Million cans **1** (5 truckloads, +2). Click **Send change**.
11. **Ball HQ → Sales** (profit drops to **$2,498 / truck**) **→ Accept. Inventory → Accept. Planning → Accept.**
12. **Logistics → Orders:** "No carrier has room for 2." Click **Counteroffer Nov 20**.
13. **Customer HQ → My POs:** **Take Nov 20** or **Keep Nov 19 · +$1,204** (they pay the spot premium). Click **Take Nov 20**.
    *Say:* "Spot is the last resort, and if the customer wants it, they pay for it."
14. *(Optional)* **Ball HQ → Logistics → Lanes:** the calendar shows Findlay on Nov 9–12 and Coca-Cola on Nov 19 and 20.

## 4. The payoff (≈20 sec)
15. **Ball HQ → Executive.** **Saved $5,150**, old way **59% spot** vs now **0%**, goal 8%.
    *Say:* "Same freight. The old way's weekly batches put 59% on spot. With the system, none."

## If something goes wrong
- Click **Reset demo** and start again from step 1.
- Wi-Fi down: use the localhost link above (needs `python3 -m http.server 8765` running in the app folder).
