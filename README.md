# Truck Price Check

One price tag every team sees before they decide. Sales, Production, Inventory Planning and Logistics each get a simple screen. Everything they send shows up live on a shared hub with **profit per truck** in green, yellow or red. This is the Findlay pilot from the Ball case competition.

## Links (one per team)
| Team | Link |
|---|---|
| Pick a team | `./` |
| Sales | `./?role=sales` |
| Production | `./?role=production` |
| Inventory Planning | `./?role=planning` |
| Logistics | `./?role=logistics` |
| Live Hub | `./?role=hub` |
| Carrier view | `./?role=carrier` |

## The price tag
- **Contract room decides the split.** Each lane's contract carrier takes about `contract_per_week` trucks a week (2026 contract loads ÷ 30 weeks, a stand-in for Ball's real commitments). Requests claim those trucks first come, first served within each Sunday–Saturday week; the rest go on spot.
- **Under 3 days' notice is all spot**, and so is a request Logistics marks "carrier said no" (its contract trucks pass to the next request in line).
- **Money (same on every screen):** Making = $3,100 × trucks. Extra trucking = for a customer order, the spot premium on each spot truck (a contract truck is already in the $3,100); for a transfer, the whole move at the contract or spot price. Profit left = Making − extra trucking.
- **Spot price:** the lane's 2026 average, until Logistics types in a real quote.
- **Colors (profit per truck):** green ≥ $2,000, yellow $1,000–$1,999, red < $1,000. Illustrative; finance would set the real ones.
- **About the $3,100:** Ball's average operating profit per truckload of cans (FY2025 North & Central America comparable operating earnings ÷ cans sold × ~200k cans per truck). An average, not contribution margin.

Lane numbers come from `lanes.js`, which `scripts/build_lanes.py` builds from the case workbook.
- It uses the Detail sheet: 2026 Jan–Jul, shuttles excluded, spot = SM Volume.
- Spot and contract costs come from pure-spot and pure-contract rows only.
- Check totals: 106,062 loads / 16,767 spot / $18,862,624 overspend.

## Setup
1. **Database:** in Supabase, open SQL Editor and run `supabase/schema.sql` (change the reset PIN on its last line first), then run `supabase/update-2.sql`.
2. **Keys:** paste the Project URL and publishable key into `config.js`.
3. **Hosting:** push to GitHub, then go to Settings → Pages and choose "Deploy from a branch": `main` / root.
4. **Between rounds:** open the Live Hub, tap **New round** and enter the PIN.

Leave `config.js` empty to run in local demo mode: one browser, nothing shared.
