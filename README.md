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
- **Profit per truck** = $3,100 − extra trucking cost.
- **Customer order:** extra trucking cost = spot chance × the lane's spot premium.
- **Transfer (prebuild or inventory move):** extra trucking cost = the lane's contract cost + spot chance × spot premium.
- **Spot chance:**
  - "This week" assumes a spot truck (short notice).
  - Later weeks use the lane's 2026 spot share.
- **Colors:** green ≥ $2,000, yellow $1,000–$1,999, red < $1,000. These thresholds are illustrative; finance would set the real ones.
- **About the $3,100:** it's Ball's average operating profit per truckload of cans (FY2025 North & Central America comparable operating earnings ÷ cans sold × ~200k cans per truck). It's an average, not contribution margin.

Lane numbers come from `lanes.js`, which `scripts/build_lanes.py` builds from the case workbook.
- It uses the Detail sheet: 2026 Jan–Jul, shuttles excluded, spot = SM Volume.
- Spot and contract costs come from pure-spot and pure-contract rows only.
- Check totals: 106,062 loads / 16,767 spot / $18,862,624 overspend.

## Setup
1. **Database:** in Supabase, open SQL Editor and run `supabase/schema.sql`. Change the reset PIN on its last line first.
2. **Keys:** paste the Project URL and publishable key into `config.js`.
3. **Hosting:** push to GitHub, then go to Settings → Pages and choose "Deploy from a branch": `main` / root.
4. **Between rounds:** open the Live Hub, tap **New round** and enter the PIN.

Leave `config.js` empty to run in local demo mode: one browser, nothing shared.
