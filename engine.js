// Ball Monticello pilot: all the logic, no screens. app.js draws it; tests/engine.test.mjs checks it.
//
// How a truck gets booked (the case + our deck): every lane has a routing guide of up to 3 contract carriers.
// Each carrier committed to so many loads a week, about 1/7 of that a day. A load goes to the primary first
// (it needs 48+ hours' notice), then backup 1, then backup 2. If none has room that day, a customer gets a
// counteroffer date; if they keep their date, it goes spot and they pay the spot premium as an expedite fee.
// Spot is the last resort.
import { LANES, MONTHLY } from "./lanes.js?v=61";
export { MONTHLY };

export const RULES = {
  profitPerTruck: 3100,  // Ball's average operating profit per truckload (FY2025 10-K ÷ cans shipped; see README)
  noticeDays: 3,         // orders lock 3 days out: a customer order inside 3 days is a late change
  tenderDays: 2,         // carriers are contacted 48+ hours ahead; the primary needs that much notice
  freezeDays: 3,         // production runs lock 3 days before they start
  makeLeadDays: 2,       // cans are made about 2 days before they ship
  cansPerTruck: 200000,  // about one full truckload of 12 oz cans
  canValue: 28010,       // $ per truckload of cans (GW Kent full-truckload price; the deck's holding-cost input)
  carryRate: 0.23,       // inventory carrying cost a year (midpoint of 18–28%)
  onTimeToday: 0.86,     // sales-order on-time delivery today (case: 86–87%)
  pilotGoNoGo: 0.20,     // Monticello pilot: scale up if transfer spot falls below 20%
  flexBand: 0.10,        // a customer's week can run up to 10% over its forecast
  weeks: 6,              // horizon
  weeksOf2026: 30.3,     // Jan 1 – Jul 31, 2026
  spotGoal: 0.08,        // the deck's target
  watchBand: 0.10,       // forecast moved more than 10%: watch it
  actBand: 0.25,         // more than 25%: act on it
  planAheadDays: 14,     // simulated: told 2+ weeks before the week starts, Planning adds line time
  priorityAt: 0.9,       // reliability score that earns Priority
  growth: 0.02,          // long-term baseline: case says 1–3% a year
};

// ---------- Lanes in the pilot (real 2026 numbers from lanes.js, Monticello, IN) ----------
export const laneKey = (kind, destination) => `${kind}|${destination}`;
// Carrier names as the workbook spells them, tidied for the screen.
export const carrierName = (n) => n.replace(/\b(Llc|Inc\.?|Co|Company|Corp)\b\.?/g, "").replace(/,\s*$/, "").replace(/\s+/g, " ").trim()
  .replace(/\b(Hmd|Tsn)\b/g, (m) => m.toUpperCase()).replace(/^Ch Robinson\b/, "C.H. Robinson").replace(/^C\.R\. England,?/, "C.R. England");
// Short name for tight spots: "Dedicated", "C.H. Robinson", "Sage".
const shortName = (n) => (/^[A-Z]\.[A-Z]\./.test(n) || /^(Uber|Road|Ally|Fuel|Big|Hyway|Traffic|Nolan)\b/.test(n) ? n.split(" ").slice(0, 2).join(" ") : n.split(" ")[0]);
export const PILOT_LANES = LANES.map((l) => ({
  ...l,
  key: laneKey(l.kind, l.destination),
  perWeek: Math.round(l.loads_2026 / RULES.weeksOf2026),
  // Routing guide: weekly commitment = the loads the carrier took a week in 2026 (rounded up); daily share ≈ 1/7.
  routing: l.carriers.map((c, tier) => { const weekly = Math.max(1, Math.ceil(c.per_week)); const name = carrierName(c.name);
    return { name, short: shortName(name), weekly, daily: Math.ceil(weekly / 7), tier }; }),
}));
export const laneOf = (kind, destination) => PILOT_LANES.find((l) => l.kind === kind && l.destination === destination);
export const TIERS = ["Primary", "Backup 1", "Backup 2"];

// ---------- Simulated operating data (not in the workbook; stated as assumptions) ----------
// One customer per customer lane. Names are illustrative. forecast = truckloads a week the customer told Ball
// to expect; stock = truckloads of their labeled cans already made; history = orders kept outside the 3-day fence.
export const SIM_CUSTOMERS = {
  "Random Lake, WI": { name: "Coca-Cola",        stock: 1, forecast: [5, 5, 5, 5, 5, 5], history: { kept: 28, total: 30 } },
  "Alsip, IL":       { name: "PepsiCo",          stock: 0, forecast: [5, 5, 5, 5, 5, 5], history: { kept: 27, total: 30 } },
  "Memphis, TN":     { name: "AB InBev",         stock: 1, forecast: [1, 1, 1, 1, 1, 1], history: { kept: 24, total: 30 } },
  "Cold Spring, MN": { name: "Molson Coors",     stock: 0, forecast: [1, 1, 1, 1, 1, 1], history: { kept: 26, total: 30 } },
  "Cincinnati, OH":  { name: "Red Bull",         stock: 0, forecast: [1, 1, 1, 1, 1, 1], history: { kept: 29, total: 30 } },
  "Rockford, IL":    { name: "Keurig Dr Pepper", stock: 0, forecast: [1, 1, 1, 1, 1, 1], history: { kept: 25, total: 30 } },
  "Monroe, WI":      { name: "Constellation",    stock: 0, forecast: [1, 1, 1, 1, 1, 1], history: { kept: 22, total: 30 } },
};
// Open line time at Monticello for these customers, in truckloads of cans, weeks 0–5.
export const SIM_LINE_TIME = [3, 6, 8, 10, 8, 8];

// ---------- Dates: local calendar days "YYYY-MM-DD"; weeks run Sunday–Saturday ----------
const DAY_MS = 86400000;
export const isoDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const atNoon = (iso) => new Date(iso + "T12:00:00");
export const addDays = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / DAY_MS);
export const weekKey = (iso) => addDays(iso, -atNoon(iso).getDay());
export const weekIndex = (iso, now) => daysBetween(weekKey(now), weekKey(iso)) / 7;
export const dayOfTs = (ts) => isoDate(new Date(ts));
export const forecastOf = (customer, wk) => { const f = SIM_CUSTOMERS[customer].forecast; return f[wk] ?? f[f.length - 1]; };
export const trucksFromCans = (cans) => Math.max(1, Math.ceil(cans / RULES.cansPerTruck));

// ---------- Items (what the app saves; one table, jsonb data) ----------
// order:    a customer PO (data.kind "po") or a change to one (data.kind "change", parent, trucks ±).
//           data { customer, kind, parent?, trucks, cans, date, placed, signoffs{team:{ok,at}}, denied?{team,why},
//                  retry_of?, counter?{date, at, answer?: "accepted"|"kept"}, asked? (date before a counteroffer),
//                  expedite? (customer kept their date: spot, they pay the premium), days? [{day, n}] (split over
//                  2–3 days after a split counteroffer), tendered{day:ts} (carrier contacted), booked{day:ts} (carrier said yes) }
//           status: waiting (being checked) → confirmed (all four accepted) or declined (a department denied it)
// transfer: a prebuild Ball moves to a warehouse. Planning creates it (status waiting, data { destination, trucks,
//           ready, by }); Logistics schedules it (status booked, data.days [{day, n}]), then contacts the carriers
//           (data.tendered{day:ts}) and records their yes (data.booked{day:ts}).
// Every truck day goes: contact carrier → waiting on carrier → confirmed.
// forecast: a customer's new forecast for one week. data { customer, week (that Sunday), trucks, on }.
export const TEAMS = ["sales", "inventory", "planning", "logistics"];
export const isActive = (it) => it.status !== "declined";
export const itemLane = (it) => it.type === "order" ? laneOf("order", it.data.customer) : laneOf("transfer", it.data.destination);
export const dateOf = (it) => (it.type === "transfer" ? it.data.ready : it.data.date);
// The days an order ships: its date, or the split a customer accepted. n = trucks after accepted cuts (off the last day).
export function orderDays(it, n = it.data.trucks) {
  if (!it.data.days?.length) return [{ day: it.data.date, n }];
  const days = it.data.days.map((d) => ({ ...d }));
  let cut = days.reduce((s, d) => s + d.n, 0) - n;
  for (let i = days.length - 1; i >= 0 && cut > 0; i--) { const k = Math.min(cut, days[i].n); days[i].n -= k; cut -= k; }
  return days.filter((d) => d.n > 0);
}
// When a truck day was handed to carriers (contacted or confirmed), if it was.
const askedOn = (it, day) => it.data.tendered?.[day] || it.data.booked?.[day] || null;
export const byCreated = (a, b) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1
  : String(a.id) === String(b.id) ? 0 : String(a.id) < String(b.id) ? -1 : 1;

// PO numbers: PO-1001, PO-1002… in the order POs arrived. A change shows its PO's number.
export function poNumber(items, it) {
  const pos = items.filter((x) => x.type === "order" && x.data.kind !== "change").sort(byCreated);
  const root = it.data.kind === "change" ? items.find((x) => String(x.id) === String(it.data.parent)) : it;
  const i = pos.findIndex((x) => x === root || String(x.id) === String(root?.id));
  return i < 0 ? "PO-?" : `PO-${1001 + i}`;
}

// ---------- Customers: reliability earns priority ----------
// Score = orders placed and kept outside the 3-day fence ÷ all orders (simulated history + live orders).
export function reliability(items, customer) {
  const h = SIM_CUSTOMERS[customer].history;
  const live = items.filter((x) => x.type === "order" && x.data.customer === customer && !x.data.retry_of);
  const late = live.filter((x) => daysBetween(x.data.placed || dayOfTs(x.created_at), x.data.asked || x.data.date) < RULES.noticeDays).length;
  const total = h.total + live.length, kept = h.kept + live.length - late;
  const score = kept / total;
  return { score, kept, total, late: total - kept, priority: score >= RULES.priorityAt };
}

// ---------- Forecasts ----------
// Version 0 is the baseline. Later versions are what customers shared since; the latest one counts.
export function forecastVersions(items, customer, wk, now) {
  const week = addDays(weekKey(now), wk * 7);
  return [{ trucks: forecastOf(customer, wk), on: null, baseline: true },
    ...items.filter((x) => x.type === "forecast" && x.data.customer === customer && x.data.week === week).sort(byCreated)
      .map((x) => ({ trucks: x.data.trucks, on: x.data.on, id: x.id }))];
}
export const latestForecast = (items, customer, wk, now) => forecastVersions(items, customer, wk, now).at(-1).trucks;
// G steady (≤10%), Y watch (≤25%), R act (>25%), N new demand on a zero baseline.
export function zoneOf(base, latest) {
  if (!base) return latest ? "N" : "G";
  const chg = Math.abs(latest - base) / base;
  return chg <= RULES.watchBand ? "G" : chg <= RULES.actBand ? "Y" : "R";
}
// Extra line time Planning added because a customer warned 2+ weeks ahead (raises only).
export function plannedLine(items, wk, now) {
  const cutoff = addDays(addDays(weekKey(now), wk * 7), -RULES.planAheadDays);
  let extra = 0;
  for (const customer of Object.keys(SIM_CUSTOMERS)) {
    const v = forecastVersions(items, customer, wk, now);
    const early = v.filter((x) => !x.baseline && x.on <= cutoff).at(-1);
    if (early) extra += Math.max(0, Math.min(early.trucks, v.at(-1).trucks) - v[0].trucks);
  }
  return extra;
}
// Long-term view: the plant's real monthly loads, and next year's baseline = same month last year × (1 + growth).
export function longTerm() {
  const keys = Object.keys(MONTHLY);
  const val = (m, y) => MONTHLY[`${m}-${y}`];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months.map((m) => ({ month: m, y2025: val(m, 2025) ?? null, y2026: val(m, 2026) ?? null,
    forecast2026: val(m, 2026) ?? Math.round((val(m, 2025) ?? 0) * (1 + RULES.growth)), actual: val(m, 2026) != null, known: keys.length }));
}

// Spot cost per spot truck: the lane's premium over contract (2026 data).
export const overspend = (lane, spot) => spot * lane.spot_premium;

// ---------- The tender: who takes each truck ----------
// moves: [{ it, lane, day, n, tenderOn, held }]. Booked moves hold their trucks first; the rest go in line,
// Priority customers first, then first come first served. For each move: primary (if contacted 2+ days ahead),
// then backup 1, then backup 2, each up to its daily share and what's left of its weekly commitment.
function tender(moves, now, extra = new Map()) {
  const usedDay = new Map(), usedWeek = new Map(), usedExtra = new Map();
  const out = new Map();
  for (const m of moves) {
    let left = m.n;
    const got = [];
    // A carrier's room that day: its daily share and what's left of its weekly commitment. The primary needs 48+ hours' notice.
    const keys = (c) => [`${m.lane.key}|${c.tier}|${m.day}`, `${m.lane.key}|${c.tier}|${weekKey(m.day)}`];
    const roomOf = (c) => {
      if (c.tier === 0 && daysBetween(m.tenderOn, m.day) < RULES.tenderDays) return 0;
      const [dk, wk] = keys(c);
      return Math.max(0, Math.min(c.daily - (usedDay.get(dk) || 0), c.weekly - (usedWeek.get(wk) || 0)));
    };
    const give = (c, take) => {
      const [dk, wk] = keys(c);
      usedDay.set(dk, (usedDay.get(dk) || 0) + take);
      usedWeek.set(wk, (usedWeek.get(wk) || 0) + take);
      got.push({ name: c.name, short: c.short, tier: c.tier, n: take });
      left -= take;
    };
    // The whole load goes to the first carrier in the routing guide that can take all of it.
    const whole = m.lane.routing.find((c) => roomOf(c) >= m.n);
    if (whole) give(whole, m.n);
    // No one can: split it down the routing guide.
    else for (const c of m.lane.routing) { const take = Math.min(left, roomOf(c)); if (take) give(c, take); if (!left) break; }
    // Then the extra trucks Logistics lined up for that week (early warning), any day of the week.
    (extra.get(`${m.lane.key}|${weekKey(m.day)}`) || []).forEach((x, i) => {
      const k = `${m.lane.key}|${weekKey(m.day)}|${i}`, take = Math.min(left, x.n - (usedExtra.get(k) || 0));
      if (take <= 0) return;
      usedExtra.set(k, (usedExtra.get(k) || 0) + take);
      got.push({ name: x.carrier, short: shortName(x.carrier), tier: 3, n: take });
      left -= take;
    });
    out.set(m, { carriers: got, contract: m.n - left, short: left });
  }
  return out;
}
const lineUp = (moves, prio) => moves.sort((a, b) => (b.held - a.held) || (prio(b) - prio(a)) || byCreated(a.it, b.it) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

// An accepted cut shrinks the order it cuts (same date), so those trucks are never tendered.
function cutsOf(items) {
  const cut = new Map();
  for (const it of items) {
    if (it.type !== "order" || it.data.trucks >= 0 || it.status !== "confirmed") continue;
    const parent = items.find((x) => String(x.id) === String(it.data.parent));
    if (parent && dateOf(parent) === dateOf(it)) cut.set(String(parent.id), (cut.get(String(parent.id)) || 0) - it.data.trucks);
  }
  return cut;
}

// Now: every active order (checking ones too, as a preview) and every scheduled transfer, tendered as booked
// (or as if booked today). Result per item: { lane, trucks, days[{day, n, carriers, contract, spot, counter, booked}],
// contract, spot (customer pays when expedite), counter (needs a counteroffer), ballSpot, fee, overspend }.
export function allocate(items, now) {
  const cut = cutsOf(items);
  const prio = new Map(Object.keys(SIM_CUSTOMERS).map((c) => [c, reliability(items, c).priority]));
  const moves = [];
  const result = new Map();
  for (const it of items) {
    const lane = itemLane(it);
    if (!lane || !isActive(it)) continue;
    if (it.type === "order") {
      if (it.data.trucks < 0) { result.set(it.id, { lane, trucks: it.data.trucks, cut: -it.data.trucks, days: [], contract: 0, spot: 0, counter: 0, ballSpot: 0, fee: 0, overspend: 0 }); continue; }
      const n = Math.max(0, it.data.trucks - (cut.get(String(it.id)) || 0));
      if (n) for (const d of orderDays(it, n)) {
        const ts = askedOn(it, d.day);
        moves.push({ it, lane, day: d.day, n: d.n, tenderOn: ts ? dayOfTs(ts) : now, held: ts ? 1 : 0 });
      }
    } else if (it.type === "transfer" && it.status === "booked") {
      for (const d of it.data.days || [{ day: it.data.ready, n: it.data.trucks }]) {
        const ts = askedOn(it, d.day);
        moves.push({ it, lane, day: d.day, n: d.n, tenderOn: ts ? dayOfTs(ts) : now, held: ts ? 1 : 0 });
      }
    }
  }
  const got = tender(lineUp(moves, (m) => (m.it.type === "order" && prio.get(m.it.data.customer) ? 1 : 0)), now, extraTrucks(items));
  for (const m of moves) {
    const g = got.get(m);
    const r = result.get(m.it.id) || { lane: m.lane, trucks: 0, days: [], contract: 0, spot: 0, counter: 0, ballSpot: 0, fee: 0, overspend: 0 };
    // Short: a transfer goes spot (Ball pays). A customer order waits on a counteroffer, unless the customer kept
    // their date (expedite): then it's spot and the customer pays the premium.
    const exp = m.it.type === "order" && m.it.data.expedite;
    const spot = m.it.type === "transfer" || exp ? g.short : 0;
    const counter = g.short - spot;
    r.trucks += m.n; r.contract += g.contract; r.spot += spot; r.counter += counter;
    if (exp) r.fee += overspend(m.lane, spot); else r.ballSpot += spot;
    const booked = !!m.it.data.booked?.[m.day], tendered = !booked && !!m.it.data.tendered?.[m.day];
    r.days.push({ day: m.day, n: m.n, carriers: g.carriers, contract: g.contract, spot, counter, booked, tendered });
    r.overspend = overspend(m.lane, r.ballSpot);
    result.set(m.it.id, r);
  }
  for (const r of result.values()) r.days.sort((a, b) => (a.day < b.day ? -1 : 1));
  return result;
}

// ---------- Early warning: each week's trucks vs the routing guide, weeks ahead ----------
// Extra trucks Logistics lined up: type "room", data { lane (key), week (Sunday), carrier, n }. n < 0 = told carriers fewer.
export function extraTrucks(items) {
  const out = new Map();
  for (const x of items) if (x.type === "room" && x.data.n > 0) {
    const k = `${x.data.lane}|${x.data.week}`;
    out.set(k, [...(out.get(k) || []), { carrier: x.data.carrier, n: x.data.n }]);
  }
  return out;
}
// Per lane and week: trucks expected (customer: forecast or orders, whichever is more; warehouse: prebuilds),
// room = the routing guide's weekly commitments, zone G (within 10%) / Y (10–25%) / R (25%+) / C (covered by extra trucks).
// Customer lanes always; a warehouse lane only when it has a prebuild in the 6 weeks. Warehouses flag only increases.
export function earlyWarning(items, now) {
  const weeks = Array.from({ length: RULES.weeks }, (_, wk) => addDays(weekKey(now), wk * 7));
  const alloc = allocate(items, now);
  const rows = [];
  for (const lane of PILOT_LANES) {
    const room = lane.routing.reduce((s, c) => s + c.weekly, 0);
    const t = weeks.map((week, wk) => {
      if (lane.kind === "order") {
        const ordered = items.filter((x) => x.type === "order" && isActive(x) && x.data.customer === lane.destination && weekKey(x.data.date) === week).reduce((s, x) => s + x.data.trucks, 0);
        return Math.max(latestForecast(items, lane.destination, wk, now), ordered);
      }
      return items.filter((x) => x.type === "transfer" && isActive(x) && x.data.destination === lane.destination).reduce((s, x) => {
        const days = x.status === "booked" ? alloc.get(x.id)?.days || [] : [{ day: x.data.ready, n: x.data.trucks }];
        return s + days.filter((d) => weekKey(d.day) === week).reduce((a, d) => a + d.n, 0);
      }, 0);
    });
    if (lane.kind === "transfer" && !t.some((n) => n > 0)) continue;
    rows.push({ lane, room, weeks: weeks.map((week, wk) => {
      const diff = lane.kind === "transfer" ? Math.max(0, t[wk] - room) : t[wk] - room;
      const chg = Math.abs(diff) / room;
      const fixed = items.filter((x) => x.type === "room" && x.data.lane === lane.key && x.data.week === week).reduce((s, x) => s + x.data.n, 0);
      const zone = !diff || chg <= RULES.watchBand ? "G" : chg <= RULES.actBand ? "Y" : "R";
      const open = zone === "G" ? 0 : Math.max(0, Math.abs(diff) - (Math.sign(fixed) === Math.sign(diff) ? Math.abs(fixed) : 0));
      return { week, wk, trucks: t[wk], diff, fixed, zone: zone !== "G" && !open ? "C" : zone, open };
    }) });
  }
  return rows;
}
// Logistics' to-do: every week still yellow or red, soonest first.
export const warnings = (items, now) => earlyWarning(items, now)
  .flatMap((r) => r.weeks.filter((w) => w.open).map((w) => ({ lane: r.lane, room: r.room, ...w })))
  .sort((a, b) => a.wk - b.wk || (b.zone === "R") - (a.zone === "R"));

// ---------- Transfers: one batch vs paced waves ----------
// One batch: every truck tendered for the ready day. Paced: fill each day from the ready day on with whatever the
// routing guide still has room for (after everything already on the lane), up to 3 weeks out.
export function transferOptions(items, it, now) {
  const lane = itemLane(it);
  const n = it.data.trucks;
  const trial = (days) => {
    const t = { ...it, status: "booked", data: { ...it.data, days, booked: {} }, created_at: "￿" };
    const a = allocate([...items.filter((x) => x.id !== it.id), t], now).get(it.id);
    return { days, contract: a.contract, spot: a.spot, overspend: a.overspend };
  };
  const batch = trial([{ day: it.data.ready, n }]);
  // Paced: one day at a time, as many as still fit on contract that day.
  const days = [];
  let left = n;
  const start = daysBetween(now, it.data.ready) >= RULES.tenderDays ? it.data.ready : addDays(now, RULES.tenderDays);
  for (let i = 0; i < 21 && left > 0; i++) {
    const day = addDays(start, i);
    const probe = trial([...days, { day, n: left }]);
    const fit = probe.contract - days.reduce((s, d) => s + d.n, 0);
    if (fit > 0) { days.push({ day, n: Math.min(fit, left) }); left -= Math.min(fit, left); }
  }
  if (left > 0) days.push({ day: addDays(start, 21), n: left });
  return { batch, paced: trial(days) };
}

// ---------- Production and inventory (simulated stock and line time, first come first served) ----------
export function planUse(items, now) {
  const stockLeft = Object.fromEntries(Object.entries(SIM_CUSTOMERS).map(([k, c]) => [k, c.stock]));
  const lineLeft = SIM_LINE_TIME.map((n, wk) => n + plannedLine(items, wk, now));
  const out = new Map();
  for (const it of items.filter((x) => x.type === "order" && isActive(x)).sort(byCreated)) {
    const trucks = it.data.trucks;
    const wk = weekIndex(dateOf(it), now);
    const frozen = daysBetween(now, dateOf(it)) < RULES.makeLeadDays + RULES.freezeDays;
    if (trucks < 0) { out.set(it.id, { wk, frozen, cut: -trucks }); continue; }
    const fromStock = Math.min(trucks, stockLeft[it.data.customer] || 0);
    stockLeft[it.data.customer] -= fromStock;
    const toMake = trucks - fromStock;
    const open = Math.max(0, lineLeft[wk] ?? 0);
    const made = Math.min(toMake, open);
    if (lineLeft[wk] != null) lineLeft[wk] -= made;
    out.set(it.id, { wk, frozen, fromStock, toMake, made, open, short: toMake - made });
  }
  return out;
}

// Cost to serve: profit per truck after any spot premium Ball pays (the customer pays it when they expedite).
export function priceTag(a) {
  if (!a || a.trucks <= 0) return RULES.profitPerTruck;
  return Math.round(RULES.profitPerTruck - (a.overspend + (a.counter ? a.counter * a.lane.spot_premium : 0)) / a.trucks);
}

// ---------- The four department checks ----------
// Each: { ok, verdict } — one short line the department reads before it accepts or denies.
export function checks(items, it, now) {
  const wk = weekIndex(dateOf(it), now);
  const a = allocate(items, now).get(it.id);
  const p = planUse(items, now).get(it.id);
  const cut = it.data.trucks < 0;
  const n = Math.abs(it.data.trucks);

  // Sales: inside the 3-day fence is a late change; the customer's week can run up to 10% over its forecast.
  const fc = latestForecast(items, it.data.customer, wk, now);
  const weekTotal = items
    .filter((x) => x.type === "order" && isActive(x) && x.data.customer === it.data.customer
      && byCreated(x, it) <= 0 && weekIndex(dateOf(x), now) === wk)
    .reduce((sum, x) => sum + x.data.trucks, 0);
  const max = fc + Math.max(1, Math.round(fc * RULES.flexBand));
  const daysOut = daysBetween(now, dateOf(it));
  const sales = daysOut < RULES.noticeDays ? { ok: false, verdict: `Only ${daysOut} ${daysOut === 1 ? "day" : "days"} out` }
    : weekTotal > max ? { ok: false, verdict: `Forecast ${fc}: ${weekTotal} is over` }
    : { ok: true, verdict: `Forecast ${fc}: ${weekTotal} fits` };

  let inventory, planning;
  if (cut) {
    inventory = p.frozen ? { ok: false, verdict: `${n} truckloads of cans stranded` } : { ok: true, verdict: "Nothing stranded" };
    planning = { ok: true, verdict: `${n} fewer to make` };
  } else {
    inventory = { ok: true, verdict: p.fromStock ? `${p.fromStock} from stock` : "All made new" };
    planning = !p.toMake ? { ok: true, verdict: "Nothing to make" }
      : p.frozen ? { ok: false, verdict: "Inside the freeze" }
      : p.short ? { ok: false, verdict: `Short ${p.short} of line time` }
      : { ok: true, verdict: `${p.toMake} to make: fits` };
  }
  const carriers = (a?.days || []).flatMap((d) => d.carriers);
  const names = Object.entries(carriers.reduce((m, c) => ({ ...m, [c.short]: (m[c.short] || 0) + c.n }), {})).map(([k, v]) => `${k} ${v}`).join(" · ");
  const logistics = cut ? { ok: true, verdict: `Frees ${n} trucks` }
    : a.counter ? { ok: false, verdict: `No carrier has room for ${a.counter}`, counter: a.counter }
    : a.spot ? { ok: true, verdict: `${a.spot} spot · customer pays` }
    : { ok: true, verdict: names || "On contract" };
  return { sales, inventory, planning, logistics, alloc: a, plan: p };
}

// ---------- Accept, deny, counteroffer ----------
// stage: checking → offered (Logistics counteroffered; the customer decides) → accepted → booked, or denied.
export const STAGES = { checking: "Checking", offered: "Counteroffer", accepted: "Accepted", tendered: "Carrier asked", booked: "Booked", denied: "Denied" };
export function stageOf(it) {
  if (it.type === "transfer") return it.status === "booked" ? "booked" : "checking";
  if (it.status === "declined") return "denied";
  if (it.data.counter && !it.data.counter.answer) return "offered";
  if (it.status !== "confirmed") return "checking";
  if (it.data.trucks < 0) return "booked"; // an accepted cut frees trucks; nothing to book
  const days = orderDays(it).map((d) => d.day);
  return days.every((d) => it.data.booked?.[d]) ? "booked" : days.every((d) => askedOn(it, d)) ? "tendered" : "accepted";
}
const statusOf = (signoffs) => (TEAMS.find((t) => signoffs[t]?.ok === false) ? "declined" : TEAMS.every((t) => signoffs[t]?.ok === true) ? "confirmed" : "waiting");
// A department's answer. Any deny stops the order; four accepts confirm it. Answers can change until it's booked.
export function decide(items, it, team, ok, at, now) {
  if (stageOf(it) === "booked") return null;
  const signoffs = { ...(it.data.signoffs || {}), [team]: { ok, at } };
  const status = statusOf(signoffs);
  const denyTeam = TEAMS.find((t) => signoffs[t]?.ok === false);
  let denied = null;
  if (denyTeam) {
    const c = checks(items.map((x) => (x.id === it.id ? { ...x, status: "waiting" } : x)), { ...it, status: "waiting" }, now);
    denied = { team: denyTeam, why: c[denyTeam].verdict };
  }
  const decided_at = status === "waiting" ? null : (it.data.decided_at || at);
  return { status, data: { ...it.data, signoffs, denied, decided_at } };
}
// The closest date (within 2 weeks either side, inside the horizon) where every check passes and every truck
// is on contract. Logistics offers it as a counteroffer; a denied order shows it as "Try [date]".
export function betterDate(items, it, now) {
  if (it.data.trucks < 0) return null;
  const orig = it.data.asked || it.data.date;
  const last = addDays(weekKey(now), RULES.weeks * 7 - 1);
  const base = items.map((x) => (x.id === it.id ? { ...x, status: "waiting" } : x));
  for (const off of Array.from({ length: 28 }, (_, i) => (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2))) {
    const date = addDays(orig, off);
    if (daysBetween(now, date) < RULES.noticeDays + RULES.makeLeadDays || date > last) continue;
    const moved = { ...it, status: "waiting", data: { ...it.data, date, expedite: false } };
    const next = base.map((x) => (x.id === it.id ? moved : x));
    const c = checks(next, moved, now);
    if (TEAMS.every((t) => c[t].ok) && !c.alloc.spot) return { date, alloc: c.alloc };
  }
  return null;
}
// Spread an order over its date and up to 2 days after (the deck: "hold or shift up to 2 days"): as many trucks
// as fit on contract each day, starting on the date asked. Only when it needs 2+ days and then every check passes.
export function spreadOffer(items, it, now) {
  if (it.data.trucks <= 0) return null;
  const orig = it.data.asked || it.data.date;
  const last = addDays(weekKey(now), RULES.weeks * 7 - 1);
  const base = items.map((x) => (x.id === it.id ? { ...x, status: "waiting" } : x));
  const trial = (days) => {
    const moved = { ...it, status: "waiting", data: { ...it.data, date: days[0].day, days, expedite: false, tendered: {}, booked: {} } };
    return checks(base.map((x) => (x.id === it.id ? moved : x)), moved, now);
  };
  const days = [];
  let left = it.data.trucks;
  for (let i = 0; i <= 2 && left > 0; i++) {
    const day = addDays(orig, i);
    if (day > last) break;
    const fit = trial([...days, { day, n: left }]).alloc.contract - days.reduce((s, d) => s + d.n, 0);
    if (fit > 0) { const k = Math.min(fit, left); days.push({ day, n: k }); left -= k; }
  }
  if (left > 0 || days.length < 2) return null;
  const c = trial(days);
  return TEAMS.every((t) => c[t].ok) && !c.alloc.spot && !c.alloc.counter ? { date: days[0].day, days, alloc: c.alloc } : null;
}
// What Logistics offers when the routing guide is short: a split (most trucks keep the date), else the nearest
// date that covers it all, else spot on the customer's own date (date: null).
export const counterPlan = (items, it, now) => spreadOffer(items, it, now) || betterDate(items, it, now) || { date: null };
// Logistics sends a counteroffer. If nothing works in 2 weeks, the customer keeps their date and pays, or cancels.
export function counteroffer(items, it, at, now) {
  const plan = counterPlan(items, it, now);
  return { data: { ...it.data, counter: { date: plan.date, ...(plan.days ? { days: plan.days } : {}), at } } };
}
// The customer answers: take the new date (contract), or keep theirs (spot; they pay the premium as an expedite fee).
// Either way Logistics' check is now settled, so it counts as Logistics' accept.
export function answerCounter(it, accept, at, cancel = false) {
  if (cancel) {
    const c = { ...it.data.counter, answer: "cancelled", answered_at: at };
    return { status: "declined", data: { ...it.data, counter: c, denied: { team: "logistics", why: "Customer cancelled" }, decided_at: it.data.decided_at || at } };
  }
  if (accept && !it.data.counter.date) return null;
  const c = { ...it.data.counter, answer: accept ? "accepted" : "kept", answered_at: at };
  const data = accept ? { ...it.data, counter: c, asked: it.data.date, date: c.date, ...(c.days ? { days: c.days } : {}) } : { ...it.data, counter: c, expedite: true };
  data.signoffs = { ...(data.signoffs || {}), logistics: { ok: true, at } };
  const status = statusOf(data.signoffs);
  return { status, data: { ...data, decided_at: status === "waiting" ? null : (data.decided_at || at) } };
}

// ---------- The lane calendar ----------
// One week: per lane, per day, what's moving: contract and spot trucks, counteroffers, checking (not yet accepted)
// trucks, and whether Logistics has booked them. Customer lanes also show forecast trucks not yet ordered.
export function calendar(items, now, wk) {
  const alloc = allocate(items, now);
  const start = addDays(weekKey(now), wk * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return PILOT_LANES.map((lane) => {
    const cells = days.map((day) => ({ day, contract: 0, spot: 0, counter: 0, checking: 0, toBook: 0, tendered: 0, booked: 0, moves: [] }));
    for (const it of items) {
      const a = alloc.get(it.id);
      if (!a || a.lane !== lane) continue;
      const checking = it.type === "order" && it.status !== "confirmed";
      for (const d of a.days) {
        const i = days.indexOf(d.day);
        if (i < 0) continue;
        const c = cells[i];
        c.moves.push({ it, n: d.n, contract: d.contract, spot: d.spot, counter: d.counter, carriers: d.carriers, booked: d.booked, tendered: d.tendered, checking });
        if (checking) { c.checking += d.n; continue; }
        c.contract += d.contract; c.spot += d.spot; c.counter += d.counter;
        if (d.booked) c.booked += d.n; else if (d.tendered) c.tendered += d.n; else c.toBook += d.n;
      }
    }
    let expected = 0;
    if (lane.kind === "order") {
      const ordered = items.filter((x) => x.type === "order" && isActive(x) && x.data.customer === lane.destination && weekIndex(dateOf(x), now) === wk).reduce((s, x) => s + x.data.trucks, 0);
      expected = Math.max(0, latestForecast(items, lane.destination, wk, now) - ordered);
    }
    const perDay = lane.routing.reduce((s, c) => s + c.daily, 0);
    const perWeek = lane.routing.reduce((s, c) => s + c.weekly, 0);
    return { lane, cells, expected, perDay, perWeek, busy: cells.some((c) => c.moves.length) };
  });
}
// Logistics' two to-do lists, one row per order or transfer, soonest first. Contact by = day − 2 (48 hours).
// toBookItems: accepted truck days no carrier has been contacted for. waitingItems: contacted, no answer yet.
export const toBookItems = (items, now) => truckDays(items, now, (d) => !d.booked && !d.tendered);
export const waitingItems = (items, now) => truckDays(items, now, (d) => d.tendered);
function truckDays(items, now, want) {
  const alloc = allocate(items, now);
  const out = [];
  for (const it of items) {
    const ready = it.type === "transfer" ? it.status === "booked" : it.type === "order" && it.status === "confirmed" && it.data.trucks > 0;
    const a = ready && alloc.get(it.id);
    if (!a) continue;
    const days = a.days.filter(want);
    if (!days.length) continue;
    out.push({ it, lane: a.lane, days, first: days[0].day, last: days.at(-1).day,
      trucks: days.reduce((s, d) => s + d.n, 0), contract: days.reduce((s, d) => s + d.contract, 0), spot: days.reduce((s, d) => s + d.spot, 0),
      bookBy: addDays(days[0].day, -RULES.tenderDays), askedOn: days.map((d) => askedOn(it, d.day)).filter(Boolean).sort()[0] || null });
  }
  return out.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}

// ---------- Executive ----------
// Now: accepted orders and scheduled transfers, as tendered. Ball's spot cost excludes what customers paid as
// expedite fees. The old way: the same freight run the case's way, released in Thursday batches and shipped
// Fri–Sun with 1–3 days' notice (so the primary can't take it), orders as first asked, prebuilds in one batch
// the day they're ready. Whatever the routing guide can't cover goes spot, and Ball pays.
export function totals(items, now) {
  const alloc = allocate(items, now);
  const t = { trucks: 0, contract: 0, spot: 0, overspend: 0, fees: 0, byType: { order: 0, transfer: 0 } };
  for (const it of items) {
    const a = alloc.get(it.id);
    if (!a || a.trucks <= 0 || !(it.type === "transfer" ? it.status === "booked" : it.status === "confirmed")) continue;
    t.trucks += a.trucks; t.contract += a.contract; t.spot += a.spot; t.overspend += a.overspend; t.fees += a.fee; t.byType[it.type] += a.overspend;
  }
  t.spotShare = t.trucks ? t.spot / t.trucks : 0;
  return t;
}
const oldCounts = (it) => (it.type === "transfer" ? isActive(it) : it.type === "order" && !it.data.retry_of && it.status !== "waiting" && it.data.trucks > 0);
export function oldWay(items, now) {
  const moves = [];
  for (const it of items) {
    if (!oldCounts(it)) continue;
    const lane = itemLane(it);
    if (!lane) continue;
    const n = it.data.trucks;
    if (it.type === "transfer") { moves.push({ it, lane, day: it.data.ready, n, tenderOn: addDays(it.data.ready, -1), held: 0 }); continue; }
    // Allocated Thursday, shipped Fri, Sat, Sun of the order's week.
    const thu = addDays(weekKey(it.data.asked || it.data.date), 4);
    for (let i = 0; i < 3; i++) {
      const k = Math.round(((i + 1) * n) / 3) - Math.round((i * n) / 3);
      if (k) moves.push({ it, lane, day: addDays(thu, i + 1), n: k, tenderOn: thu, held: 0 });
    }
  }
  const got = tender(lineUp(moves, () => 0), now);
  const t = { trucks: 0, contract: 0, spot: 0, overspend: 0, byType: { order: 0, transfer: 0 }, trucksBy: { order: 0, transfer: 0 }, spotBy: { order: 0, transfer: 0 }, freight: 0 };
  for (const m of moves) {
    const g = got.get(m);
    t.trucks += m.n; t.contract += g.contract; t.spot += g.short;
    t.trucksBy[m.it.type] += m.n; t.spotBy[m.it.type] += g.short; t.freight += m.n * m.lane.contract_cost;
    const cost = overspend(m.lane, g.short);
    t.overspend += cost; t.byType[m.it.type] += cost;
  }
  t.spotShare = t.trucks ? t.spot / t.trucks : 0;
  return t;
}
// Where the savings came from: customer orders and transfers, old way minus now.
export function savingsBy(items, now) {
  const old = oldWay(items, now), cur = totals(items, now);
  return { orders: Math.max(0, old.byType.order - cur.byType.order), transfers: Math.max(0, old.byType.transfer - cur.byType.transfer), fees: cur.fees };
}

// ---------- Marcelo's dashboard: three shared numbers, each team's own number + guardrail, a watch list ----------
// Counts accepted customer orders and scheduled prebuilds. Cost to serve per load = freight at contract rates
// + spot premium (whoever paid it) + holding (prebuild loads waiting for their wave) − expedite fees recovered.
export function dashboard(items, now) {
  const alloc = allocate(items, now);
  const holdPerDay = (RULES.canValue * RULES.carryRate) / 365;
  const isChange = (x) => x.data.kind === "change";
  const won = items.filter((x) => x.type === "order" && x.status === "confirmed" && x.data.trucks > 0);
  // 1. On-time: every truck covered (contract, or spot) on the agreed date; and on the date the customer first asked.
  const covered = won.filter((x) => alloc.get(x.id) && !alloc.get(x.id).counter);
  const firstDate = covered.filter((x) => !x.data.asked || x.data.asked === x.data.date);
  // 2. Change requests resolved: a yes, a counteroffer taken, or a paid expedite (all end confirmed); a deny or cancel doesn't.
  const decided = items.filter((x) => x.type === "order" && isChange(x) && ["confirmed", "declined"].includes(x.status));
  const resolved = decided.filter((x) => x.status === "confirmed");
  // 3. Cost to serve, per customer and for transfers.
  const rows = new Map();
  for (const it of [...won, ...items.filter((x) => x.type === "transfer" && x.status === "booked")]) {
    const a = alloc.get(it.id);
    if (!a || a.trucks <= 0) continue;
    const key = it.type === "order" ? it.data.customer : "transfers";
    const r = rows.get(key) || { key, loads: 0, freight: 0, spot: 0, holding: 0, fees: 0 };
    r.loads += a.trucks;
    r.freight += a.trucks * a.lane.contract_cost;
    r.spot += a.overspend + a.fee;
    r.fees += a.fee;
    if (it.type === "transfer") r.holding += a.days.reduce((h, d) => h + Math.max(0, daysBetween(it.data.ready, d.day)) * d.n * holdPerDay, 0);
    rows.set(key, r);
  }
  const cost = [...rows.values()].map((r) => ({ ...r, total: r.freight + r.spot + r.holding - r.fees }));
  cost.forEach((r) => { r.perLoad = r.total / r.loads; });
  const all = cost.reduce((t, r) => ({ loads: t.loads + r.loads, total: t.total + r.total }), { loads: 0, total: 0 });
  // Teams
  const t = totals(items, now), old = oldWay(items, now);
  const plan = planUse(items, now);
  // Inventory's target range: labeled stock (plus cans stranded by a late cut) no more than next week's forecast.
  const strandedBy = (c) => items.filter((x) => x.type === "order" && x.data.customer === c && x.status === "confirmed" && x.data.trucks < 0 && plan.get(x.id)?.frozen).reduce((s, x) => s - x.data.trucks, 0);
  const inRange = Object.keys(SIM_CUSTOMERS).filter((c) => SIM_CUSTOMERS[c].stock + strandedBy(c) <= latestForecast(items, c, 1, now)).length;
  const flagged = items.filter((x) => x.type === "forecast" && x.data.on && x.data.week).map((x) => daysBetween(x.data.on, x.data.week));
  const changeCost = won.filter(isChange).reduce((s, x) => s + (alloc.get(x.id)?.overspend || 0), 0);
  const tendered = t.trucks;
  // Watch list
  const ew = earlyWarning(items, now).flatMap((r) => r.weeks.filter((w) => w.zone !== "G").map((w) => ({ lane: r.lane, ...w })));
  const denials = items.filter((x) => x.type === "order" && x.status === "declined" && x.data.denied).map((x) => ({ it: x, team: x.data.denied.team, why: x.data.denied.why }));
  const tr = { trucks: 0, spot: 0 };
  for (const it of items) if (it.type === "transfer" && it.status === "booked") { const a = alloc.get(it.id); if (a) { tr.trucks += a.trucks; tr.spot += a.spot; } }
  return {
    onTime: won.length ? covered.length / won.length : null, firstDate: won.length ? firstDate.length / won.length : null, orders: won.length,
    changes: decided.length ? resolved.length / decided.length : null, changesDecided: decided.length, changesResolved: resolved.length,
    costPerLoad: all.loads ? all.total / all.loads : null, cost, oldCostPerLoad: old.trucks ? (old.freight + old.overspend) / old.trucks : null,
    sales: { wins: won.filter((x) => !isChange(x)).length, profit: won.reduce((s, x) => s + x.data.trucks, 0) * RULES.profitPerTruck, changeCost },
    inventory: { inRange, customers: Object.keys(SIM_CUSTOMERS).length },
    planning: { leadDays: flagged.length ? flagged.reduce((a, b) => a + b, 0) / flagged.length : null, flags: flagged.length },
    logistics: { spotShare: t.spotShare, acceptance: tendered ? t.contract / tendered : null, trucks: tendered },
    earlyWarning: ew, denials,
    pilot: { transferSpot: tr.trucks ? tr.spot / tr.trucks : null, oldTransferSpot: old.trucksBy.transfer ? old.spotBy.transfer / old.trucksBy.transfer : null,
      saved: Math.max(0, old.overspend - t.overspend), trucks: tr.trucks },
  };
}

export function scorecards(items, now) {
  const os = items.filter((x) => x.type === "order");
  // Sales: time to answer customers (sent → every department's answer is in, or a deny)
  const answered = os.filter((x) => x.data.decided_at);
  const answerMin = answered.length ? answered.reduce((s, x) => s + (new Date(x.data.decided_at) - new Date(x.created_at)), 0) / answered.length / 60000 : null;
  // Inventory: labeled cans stranded (accepted cuts inside the freeze)
  const plan = planUse(items, now);
  const stranded = os.filter((x) => x.status === "confirmed" && x.data.trucks < 0 && plan.get(x.id)?.frozen).reduce((s, x) => s - x.data.trucks, 0);
  // Planning: share of open line time used by accepted orders
  const used = os.filter((x) => x.status === "confirmed").reduce((s, x) => s + (plan.get(x.id)?.made || 0), 0);
  const open = SIM_LINE_TIME.reduce((a, b) => a + b, 0);
  // Logistics: spot share, and share of truck-days handed to carriers 48+ hours ahead
  const now_ = totals(items, now);
  let days = 0, ahead = 0;
  for (const it of items) {
    if (!(it.type === "transfer" || (it.type === "order" && it.status === "confirmed"))) continue;
    for (const day of Object.keys({ ...it.data.tendered, ...it.data.booked })) { days++; if (daysBetween(dayOfTs(askedOn(it, day)), day) >= RULES.tenderDays) ahead++; }
  }
  return {
    sales: { answerMin, answered: answered.length },
    inventory: { stranded },
    planning: { used, open, share: used / open },
    logistics: { spotShare: now_.spotShare, trucks: now_.trucks, spot: now_.spot, ahead: days ? ahead / days : null, bookedDays: days },
  };
}
