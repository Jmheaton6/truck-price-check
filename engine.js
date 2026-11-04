// Ball Findlay pilot: all the logic, no screens. app.js draws it; tests/engine.test.mjs checks it.
//
// One rule runs everything: each Findlay lane's contract carrier takes about N trucks a week (the lane's
// 2026 average). Orders and transfers claim those trucks first come, first served. Whatever doesn't fit
// goes spot, unless Logistics books it in time or asks the carrier for more ahead of time.
import { LANES } from "./lanes.js";

export const RULES = {
  profitPerTruck: 3100,  // Ball's average operating profit per truckload (FY2025 10-K, see README)
  noticeDays: 3,         // carriers need 3+ days: anything not booked by then goes spot
  freezeDays: 3,         // production runs lock 3 days before they start
  makeLeadDays: 2,       // cans are made about 2 days before they ship
  cansPerTruck: 200000,  // about one full truckload of 12 oz cans
  flexBand: 0.10,        // a customer's week can run up to 10% over its forecast
  carrierFlexShare: 0.25,      // simulated: with a week's notice a carrier can add up to 25% of its weekly trucks
  carrierFlexNoticeDays: 7,
  weeks: 6,              // horizon
  weeksOf2026: 30.3,     // Jan 1 – Jul 31, 2026
  spotGoal: 0.08,        // the deck's target
  watchBand: 0.10,       // forecast moved more than 10%: watch it
  actBand: 0.25,         // more than 25%: act on it
  planAheadDays: 14,     // simulated: told 2+ weeks before the week starts, Production can plan extra line time
  spotToday: 0.158,      // 2026 YTD spot share, shuttles excluded
};

// ---------- Lanes in the pilot (real 2026 numbers from lanes.js) ----------
const PILOT = [
  ["order", "Cincinnati, OH"], ["order", "Columbus, OH"], ["order", "Mertztown, PA"], ["order", "Downey, CA"],
  ["transfer", "Mississauga, ON"], ["transfer", "Adairsville, GA"], ["transfer", "Dorval, QC"], ["transfer", "Columbus, OH"],
];
export const laneKey = (kind, destination) => `${kind}|${destination}`;
export const PILOT_LANES = PILOT.map(([kind, destination]) => {
  const l = LANES.find((x) => x.kind === kind && x.destination === destination);
  const perWeek = Math.round(l.loads_2026 / RULES.weeksOf2026);
  return { ...l, key: laneKey(kind, destination), perWeek, perDay: Math.ceil(perWeek / 7) };
});
export const laneOf = (kind, destination) => PILOT_LANES.find((l) => l.kind === kind && l.destination === destination);

// ---------- Simulated operating data (not in the workbook; stated as assumptions) ----------
// Transfer lanes: trucks already booked by Ball's other moves, as a share of the weekly contract trucks.
export const SIM_BOOKED = {
  "transfer|Mississauga, ON": [0.95, 0.6, 0.75, 0.6, 0.95, 0.95],  // a dip: room for a prebuild
  "transfer|Adairsville, GA": [0.95, 0.95, 1.0, 0.95, 0.95, 0.95],
  "transfer|Dorval, QC":      [0.95, 1.0, 0.95, 0.95, 1.0, 0.95],
  "transfer|Columbus, OH":    [0.95, 0.95, 0.9, 0.95, 1.0, 0.95],
};
// One customer filling plant per customer lane. forecast = truckloads a week the customer told Ball to expect;
// stock = truckloads of their labeled cans already at Findlay.
export const SIM_CUSTOMERS = {
  "Cincinnati, OH": { name: "Coca-Cola", stock: 2, forecast: [8, 8, 10, 8, 8, 8] },
  "Columbus, OH":   { name: "PepsiCo", stock: 0, forecast: [5, 5, 6, 5, 5, 5] },
  "Mertztown, PA":  { name: "AB InBev", stock: 1, forecast: [1, 1, 2, 1, 1, 2] },
  "Downey, CA":     { name: "Molson Coors", stock: 0, forecast: [1, 1, 1, 2, 1, 1] },
};
// Open line time at Findlay for these customers, in truckloads of cans, weeks 0–5.
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

// Customer lanes: the carrier plan is sized for Ball's other business plus the customer's forecast,
// so the room left each week is the customer's forecast. Transfer lanes: simulated share above.
export const bookedTrucks = (lane, wk) => lane.kind === "order"
  ? Math.max(0, lane.perWeek - forecastOf(lane.destination, wk))
  : Math.round(lane.perWeek * (SIM_BOOKED[lane.key]?.[wk] ?? 1));
export const trucksFromCans = (cans) => Math.max(1, Math.ceil(cans / RULES.cansPerTruck));

// ---------- Forecast versions ----------
// Version 0 is the baseline the carrier plan is sized for. Later versions are what customers shared since.
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
// Extra line time Production planned because a customer warned 2+ weeks ahead (raises only).
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

// ---------- Items (what the app saves; one table, jsonb data) ----------
// order:    a customer PO (data.kind "po") or a change to one (data.kind "change", parent, trucks ±).
//           data { customer, kind, parent?, trucks, cans, date, signoffs{team:{ok,at}}, denied?{team,why}, retry_of?, booked{day:ts} }
//           status: waiting (being checked) → confirmed (all four accepted) or declined (a department denied it)
// transfer: Ball moving its own cans to a warehouse. data { destination, trucks, date, pattern, booked{day:ts} }; status booked
// forecast: a customer's new forecast for one week. data { customer, week (that Sunday), trucks, on (the day shared) }.
//           Every update is a new version; the baseline (SIM_CUSTOMERS) is never overwritten.
// ask:      Logistics asked a lane's carrier for +N (or released N: trucks and accepted negative). data { kind, destination, week, date, trucks, accepted }; status yes|part|no
export const TEAMS = ["sales", "inventory", "production", "logistics"];
export const isActive = (it) => it.status !== "declined"; // a denied order or a removed transfer moves nothing
const shipsTrucks = (it) => (it.type === "order" || it.type === "transfer") && isActive(it);
export const itemLane = (it) =>
  it.type === "order" ? laneOf("order", it.data.customer)
  : it.type === "transfer" ? laneOf("transfer", it.data.destination)
  : laneOf(it.data.kind, it.data.destination);
export const dateOf = (it) => it.data.date;
export const patternOf = (it) => (it.type === "transfer" ? it.data.pattern || "day" : "day");
export const PATTERNS = {
  day: { label: "All on one day", days: 1 },
  week: { label: "Over 1 week", days: 7 },
  w2: { label: "Over 2 weeks", days: 14 },
  w3: { label: "Over 3 weeks", days: 21 },
};
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

// n trucks spread as evenly as possible over k days starting at `date`.
export function spreadDays(date, n, pattern = "day") {
  const k = PATTERNS[pattern]?.days || 1;
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = Math.round(((i + 1) * n) / k) - Math.round((i * n) / k);
    if (t) out.push({ day: addDays(date, i), n: t });
  }
  return out;
}

// ---------- Carriers ----------
// Extra contract trucks a carrier agreed to, per lane-week.
export function carrierExtras(items, now) {
  const out = new Map();
  for (const it of items) {
    if (it.type !== "ask" || !it.data.trucks || !(it.status === "yes" || it.status === "part")) continue;
    const k = `${itemLane(it).key}|${weekIndex(it.data.week, now)}`;
    out.set(k, (out.get(k) || 0) + (it.data.accepted ?? it.data.trucks));
  }
  return out;
}
// Simulated carrier: with 7+ days' notice it can add up to 25% of its weekly trucks (minus what it already
// added that week). With less notice it can't find drivers.
export function carrierAnswer(items, lane, date, trucks, now) {
  const days = daysBetween(now, date);
  if (days < RULES.carrierFlexNoticeDays) return { status: "no", accepted: 0, why: `No: only ${days} days' notice` };
  const wk = weekIndex(date, now);
  const already = Math.max(0, carrierExtras(items, now).get(`${lane.key}|${wk}`) || 0);
  const cap = Math.ceil(lane.perWeek * RULES.carrierFlexShare);
  const accepted = Math.max(0, Math.min(trucks, cap - already));
  if (accepted === trucks) return { status: "yes", accepted, why: `Yes: +${trucks}` };
  if (accepted > 0) return { status: "part", accepted, why: `Only +${accepted}` };
  return { status: "no", accepted: 0, why: "No: full that week" };
}

// Spot cost. Customer order: freight to the customer is in the $3,100, so a spot truck costs its premium.
// Transfer: Ball pays the whole move, and a spot truck adds the premium on top.
export const overspend = (lane, spot) => spot * lane.spot_premium;

// ---------- Who gets contract trucks ----------
// Each truck on each day: contract if there's room that week (and, for transfers, that day) and it's booked
// 3+ days ahead; otherwise spot. Booking is per day: data.booked = { "YYYY-MM-DD": timestamp }.
// opts.oldWay: the same freight without the system. It's three levers, which can also be set one at a time:
//   oldOrders (every order accepted as first asked, denied ones too), noAsks (no carrier asks),
//   oldTransfers (transfers all on one day).
const leversOf = (opts) => (opts.oldWay ? { oldOrders: true, noAsks: true, oldTransfers: true } : opts);
const orderCounts = (it, old) => (old ? !it.data.retry_of && it.status !== "waiting" : it.status !== "declined");
export function allocate(items, now, opts = {}) {
  const L = leversOf(opts);
  const list = items.filter((it) => (it.type === "order" && orderCounts(it, L.oldOrders)) || (it.type === "transfer" && isActive(it))).sort(byCreated);
  const extras = L.noAsks ? new Map() : carrierExtras(items, now);
  const usedWeek = new Map();
  const usedDay = new Map();
  // An accepted cut shrinks the order it cuts (same date), so those trucks are never booked.
  const cutOf = new Map();
  for (const it of list) {
    if (it.type !== "order" || it.data.trucks >= 0 || it.status !== "confirmed") continue;
    const parent = list.find((x) => String(x.id) === String(it.data.parent));
    if (parent && dateOf(parent) === dateOf(it)) cutOf.set(parent.id, (cutOf.get(parent.id) || 0) - it.data.trucks);
  }
  const out = new Map();
  for (const it of list) {
    const lane = itemLane(it);
    if (!lane) continue;
    const trucks = it.data.trucks > 0 ? Math.max(0, it.data.trucks - (cutOf.get(it.id) || 0)) : it.data.trucks;
    const date = dateOf(it);
    if (trucks < 0) { out.set(it.id, { lane, date, trucks, cut: -trucks, contract: 0, spot: 0, days: [], overspend: 0 }); continue; }
    const pattern = L.oldTransfers ? "day" : patternOf(it);
    const days = spreadDays(date, trucks, pattern).map(({ day, n }) => {
      const wk = weekIndex(day, now);
      const wKey = `${lane.key}|${wk}`;
      const dKey = `${lane.key}|${day}`;
      const extra = extras.get(wKey) || 0;
      const cover = lane.perWeek + extra;
      const earlier = usedWeek.get(wKey) || 0;
      const weekRoom = Math.max(0, cover - bookedTrucks(lane, wk) - earlier);
      // One-day limit: Ball's own transfers only. Customers set their delivery days; carriers plan those lanes by the week.
      const dayRoom = lane.kind === "order" ? Infinity : Math.max(0, lane.perDay + extra - (usedDay.get(dKey) || 0));
      const bookedOn = it.data.booked?.[day] ? dayOfTs(it.data.booked[day]) : null;
      let contract, why = null;
      if (!opts.oldWay && bookedOn && daysBetween(bookedOn, day) < RULES.noticeDays) { contract = 0; why = "notice"; }
      else if (!opts.oldWay && !bookedOn && daysBetween(now, day) < RULES.noticeDays) { contract = 0; why = "late"; }
      else {
        contract = Math.min(n, weekRoom, dayRoom);
        if (contract < n) why = weekRoom <= dayRoom ? "week" : "day";
      }
      usedWeek.set(wKey, earlier + contract);
      usedDay.set(dKey, (usedDay.get(dKey) || 0) + contract);
      // fixable: spot because the carrier had no room (asking early can fix it), not because it was too late
      return { day, wk, n, contract, spot: n - contract, why, fixable: why === "week" || why === "day" ? n - contract : 0, booked: !!bookedOn };
    });
    const contract = days.reduce((s, d) => s + d.contract, 0);
    const spot = trucks - contract;
    out.set(it.id, { lane, date, trucks, pattern, contract, spot, days, overspend: overspend(lane, spot),
      fixable: days.reduce((s, d) => s + d.fixable, 0) });
  }
  return out;
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

// ---------- The four department checks ----------
// Each: { ok, verdict } — one short line the department reads before it accepts or denies.
export function checks(items, it, now) {
  const wk = weekIndex(dateOf(it), now);
  const a = allocate(items, now).get(it.id);
  const p = planUse(items, now).get(it.id);
  const cut = it.data.trucks < 0;
  const n = Math.abs(it.data.trucks);

  // Sales: the customer's total that week (POs and changes so far) can run up to 10% over its forecast.
  const fc = latestForecast(items, it.data.customer, wk, now);
  const weekTotal = items
    .filter((x) => x.type === "order" && isActive(x) && x.data.customer === it.data.customer
      && byCreated(x, it) <= 0 && weekIndex(dateOf(x), now) === wk)
    .reduce((sum, x) => sum + x.data.trucks, 0);
  const max = fc + Math.max(1, Math.round(fc * RULES.flexBand));
  const daysOut = daysBetween(now, dateOf(it));
  const sales = daysOut < RULES.noticeDays ? { ok: false, verdict: `Only ${daysOut} days out` }
    : weekTotal > max ? { ok: false, verdict: `Forecast ${fc}: ${weekTotal} is over` }
    : { ok: true, verdict: `Forecast ${fc}: ${weekTotal} fits` };

  let inventory, production;
  if (cut) {
    inventory = p.frozen ? { ok: false, verdict: `${n} truckloads of cans stranded` } : { ok: true, verdict: "Nothing stranded" };
    production = { ok: true, verdict: `${n} fewer to make` };
  } else {
    inventory = { ok: true, verdict: p.fromStock ? `${p.fromStock} from stock` : "All made new" };
    production = !p.toMake ? { ok: true, verdict: "Nothing to make" }
      : p.frozen ? { ok: false, verdict: "Inside the freeze" }
      : p.short ? { ok: false, verdict: `Short ${p.short} of line time` }
      : { ok: true, verdict: `${p.toMake} to make: fits` };
  }
  const logistics = cut ? { ok: true, verdict: `Frees ${n} trucks` }
    : a.spot ? { ok: false, verdict: `${a.spot} of ${n} would be spot` }
    : { ok: true, verdict: `All ${n} on contract` };
  return { sales, inventory, production, logistics, alloc: a, plan: p };
}

// ---------- Accept or deny ----------
// stage: checking → accepted (all four accepted) → booked (every truck day booked), or denied (any department).
export const STAGES = { checking: "Checking", accepted: "Accepted", booked: "Booked", denied: "Denied" };
export function stageOf(it) {
  if (it.status === "declined") return "denied";
  if (it.status !== "confirmed") return "checking";
  if (it.data.trucks < 0) return "booked"; // an accepted cut frees trucks; nothing to book
  return it.data.booked?.[dateOf(it)] ? "booked" : "accepted";
}
// A department's answer. Any deny stops the order; four accepts confirm it. Answers can change until it's booked.
export function decide(items, it, team, ok, at, now) {
  if (stageOf(it) === "booked") return null;
  const signoffs = { ...(it.data.signoffs || {}), [team]: { ok, at } };
  const denyTeam = TEAMS.find((t) => signoffs[t]?.ok === false);
  const all = TEAMS.every((t) => signoffs[t]?.ok === true);
  const status = denyTeam ? "declined" : all ? "confirmed" : "waiting";
  let denied = null;
  if (denyTeam) {
    const c = checks(items.map((x) => (x.id === it.id ? { ...x, status: "waiting" } : x)), { ...it, status: "waiting" }, now);
    denied = { team: denyTeam, why: c[denyTeam].verdict };
  }
  const decided_at = status === "waiting" ? null : (it.data.decided_at || at);
  return { status, data: { ...it.data, signoffs, denied, decided_at } };
}

// The closest date (within 2 weeks either side, inside the horizon) where Production can make it and it all
// fits on contract trucks. Shown to the customer when an order is denied.
export function betterDate(items, it, now) {
  if (it.data.trucks < 0) return null;
  const orig = dateOf(it);
  const last = addDays(weekKey(now), RULES.weeks * 7 - 1);
  const base = items.map((x) => (x.id === it.id ? { ...x, status: "waiting" } : x));
  for (const off of Array.from({ length: 28 }, (_, i) => (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2))) {
    const date = addDays(orig, off);
    if (daysBetween(now, date) < RULES.noticeDays + RULES.makeLeadDays || date > last) continue;
    const moved = { ...it, status: "waiting", data: { ...it.data, date } };
    const next = base.map((x) => (x.id === it.id ? moved : x));
    const c = checks(next, moved, now);
    if (TEAMS.every((t) => c[t].ok)) return { date, alloc: c.alloc };
  }
  return null;
}

// ---------- The truck calendar ----------
// One week: per lane, per day, what's moving: contract and spot trucks, checking (not yet accepted) trucks,
// and whether Logistics has booked them. Plus the room left on contract that day.
export function calendar(items, now, wk) {
  const alloc = allocate(items, now);
  const start = addDays(weekKey(now), wk * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const extras = carrierExtras(items, now);
  return PILOT_LANES.map((lane) => {
    const cells = days.map((day) => ({ day, contract: 0, spot: 0, fixable: 0, checking: 0, toBook: 0, booked: 0, moves: [] }));
    for (const it of items) {
      const a = alloc.get(it.id);
      if (!a || a.lane !== lane) continue;
      const checking = it.type === "order" && it.status !== "confirmed";
      for (const d of a.days) {
        const i = days.indexOf(d.day);
        if (i < 0) continue;
        const c = cells[i];
        c.moves.push({ it, n: d.n, contract: d.contract, spot: d.spot, booked: d.booked, checking, why: d.why });
        if (checking) { c.checking += d.n; continue; }
        c.contract += d.contract; c.spot += d.spot; c.fixable += d.fixable;
        if (d.booked) c.booked += d.n; else c.toBook += d.n;
      }
    }
    const extra = extras.get(`${lane.key}|${wk}`) || 0;
    const claimed = cells.reduce((s, c) => s + c.moves.reduce((t, m) => t + m.contract, 0), 0);
    const open = Math.max(0, lane.perWeek + extra - bookedTrucks(lane, wk) - claimed);
    return { lane, extra, open, cells };
  });
}
// Days Logistics still has to book, soonest first: book by (day − 3).
export function toBook(items, now) {
  const out = [];
  for (let wk = 0; wk < RULES.weeks; wk++) for (const row of calendar(items, now, wk)) for (const c of row.cells) {
    if (!c.toBook) continue;
    out.push({ lane: row.lane, day: c.day, bookBy: addDays(c.day, -RULES.noticeDays), contract: c.contract, spot: c.spot, fixable: c.fixable,
      moves: c.moves.filter((m) => !m.checking && !m.booked) });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// ---------- Executive ----------
// Spot and savings on the pilot's own freight (accepted orders and transfers) vs. the same freight the old way.
export function totals(items, now, opts = {}) {
  const alloc = allocate(items, now, opts);
  const L = leversOf(opts);
  const counted = (it) => (it.type === "transfer" && isActive(it)) || (it.type === "order" && (L.oldOrders ? it.status !== "waiting" && !it.data.retry_of : it.status === "confirmed"));
  const t = { trucks: 0, contract: 0, spot: 0, overspend: 0 };
  for (const it of items) {
    const a = alloc.get(it.id);
    if (!a || a.trucks < 0 || !counted(it)) continue;
    t.trucks += a.trucks; t.contract += a.contract; t.spot += a.spot; t.overspend += a.overspend;
  }
  t.spotShare = t.trucks ? t.spot / t.trucks : 0;
  return t;
}

export function scorecards(items, now) {
  const os = items.filter((x) => x.type === "order");
  // Sales: time to answer customers (sent → every department's answer is in, or a deny)
  const answered = os.filter((x) => x.data.decided_at);
  const answerMin = answered.length ? answered.reduce((s, x) => s + (new Date(x.data.decided_at) - new Date(x.created_at)), 0) / answered.length / 60000 : null;
  // Inventory: labeled cans stranded (accepted cuts inside the freeze)
  const plan = planUse(items, now);
  const stranded = os.filter((x) => x.status === "confirmed" && x.data.trucks < 0 && plan.get(x.id)?.frozen).reduce((s, x) => s - x.data.trucks, 0);
  // Production: share of open line time used by accepted orders
  const used = os.filter((x) => x.status === "confirmed").reduce((s, x) => s + (plan.get(x.id)?.made || 0), 0);
  const open = SIM_LINE_TIME.reduce((a, b) => a + b, 0);
  // Logistics: spot share, and share of truck-days booked 3+ days ahead
  const now_ = totals(items, now);
  let days = 0, ahead = 0;
  for (const it of items) {
    if (!(it.type === "transfer" || (it.type === "order" && it.status === "confirmed")) || !it.data.booked) continue;
    for (const [day, ts] of Object.entries(it.data.booked)) { days++; if (daysBetween(dayOfTs(ts), day) >= RULES.noticeDays) ahead++; }
  }
  return {
    sales: { answerMin, answered: answered.length },
    inventory: { stranded },
    production: { used, open, share: used / open },
    logistics: { spotShare: now_.spotShare, trucks: now_.trucks, spot: now_.spot, ahead: days ? ahead / days : null, bookedDays: days },
  };
}

// The same work, one row per order or transfer: every accepted truck day not booked yet, soonest first.
export function toBookItems(items, now) {
  const alloc = allocate(items, now);
  const out = [];
  for (const it of items) {
    const ready = it.type === "transfer" ? isActive(it) : it.type === "order" && it.status === "confirmed" && it.data.trucks > 0;
    const a = ready && alloc.get(it.id);
    if (!a) continue;
    const days = a.days.filter((d) => !d.booked);
    if (!days.length) continue;
    out.push({ it, lane: a.lane, days, first: days[0].day, last: days.at(-1).day,
      trucks: days.reduce((s, d) => s + d.n, 0), contract: days.reduce((s, d) => s + d.contract, 0), spot: days.reduce((s, d) => s + d.spot, 0),
      bookBy: addDays(days[0].day, -RULES.noticeDays) });
  }
  return out.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}

// Where the savings came from: spot cost with one lever set back to the old way, minus spot cost now.
export function savingsBy(items, now) {
  const base = totals(items, now).overspend;
  const one = (k) => Math.max(0, totals(items, now, { [k]: true }).overspend - base);
  return { checkoff: one("oldOrders"), transfers: one("oldTransfers"), carrier: one("noAsks") };
}

// ---------- Forecast early warning ----------
// Per customer, per week: forecast movement (baseline vs. latest) and truck coverage, kept apart, so a steady
// forecast never hides trucks nobody has covered. Orders consume the forecast: the week needs the larger of the two.
export function outlook(items, now) {
  const extras = carrierExtras(items, now);
  return PILOT_LANES.filter((l) => l.kind === "order").map((lane) => {
    const customer = lane.destination;
    const weeks = Array.from({ length: RULES.weeks }, (_, wk) => {
      const week = addDays(weekKey(now), wk * 7);
      const versions = forecastVersions(items, customer, wk, now);
      const base = versions[0].trucks, latest = versions.at(-1).trucks;
      const inWeek = items.filter((x) => x.type === "order" && x.data.customer === customer && weekIndex(dateOf(x), now) === wk);
      const ordered = inWeek.filter((x) => x.status === "confirmed").reduce((s, x) => s + x.data.trucks, 0);
      const pending = inWeek.filter((x) => x.status === "waiting").reduce((s, x) => s + x.data.trucks, 0);
      const need = Math.max(latest, ordered);
      const extra = extras.get(`${lane.key}|${wk}`) || 0;
      const cover = base + extra;
      const daysOut = daysBetween(now, week);
      return { wk, week, versions, base, latest, change: latest - base, zone: zoneOf(base, latest),
        ordered, pending, left: Math.max(0, latest - ordered), need, extra, cover,
        gap: Math.max(0, need - cover), surplus: Math.max(0, cover - need),
        askBy: addDays(week, -RULES.carrierFlexNoticeDays), canAsk: daysOut >= RULES.carrierFlexNoticeDays,
        releaseBy: addDays(week, -RULES.noticeDays), canRelease: daysOut >= RULES.noticeDays };
    });
    return { lane, customer, weeks };
  });
}
// What Logistics should act on: weeks with uncovered trucks or trucks no one will need.
export function warnings(items, now) {
  const out = [];
  for (const row of outlook(items, now)) for (const w of row.weeks) {
    if (w.gap) out.push({ ...w, lane: row.lane, customer: row.customer, kind: "up", n: w.gap });
    else if (w.surplus && w.latest < w.base) out.push({ ...w, lane: row.lane, customer: row.customer, kind: "down", n: w.surplus });
  }
  return out.sort((a, b) => a.wk - b.wk || (b.zone === "R") - (a.zone === "R"));
}
