// Ball Findlay pilot: all the logic, no screens. app.js draws it; tests/engine.test.mjs checks it.
//
// The one rule: each Findlay lane's contract carrier takes about N trucks a week (the lane's
// 2026 average). Most of those are already booked by Ball's other business. A new PO or change
// takes what's left, first come first served. Whatever doesn't fit goes spot, unless Logistics
// gets the carrier to add trucks ahead of time.
import { LANES } from "./lanes.js";

export const RULES = {
  profitPerTruck: 3100,  // Ball's average operating profit per truckload (FY2025 10-K, see README)
  greenAt: 2000,         // profit-per-truck colors (illustrative; finance would set these)
  yellowAt: 1000,
  noticeDays: 3,         // carriers need 3+ days; customer changes inside 3 days need review
  freezeDays: 3,         // production runs lock 3 days before they start
  makeLeadDays: 2,       // cans are made about 2 days before they ship
  cansPerTruck: 200000,  // about one full truckload of 12 oz cans
  flexBand: 0.10,        // a customer's week can be within ±10% of its forecast
  carrierFlexShare: 0.25,      // simulated: with a week's notice a carrier can add up to 25% of its weekly trucks
  carrierFlexNoticeDays: 7,
  watchAt: 0.10,         // outlook colors: over ±10% vs. the carrier plan = Watch, over ±25% = Act now
  actAt: 0.25,
  weeks: 6,              // horizon
  weeksOf2026: 30.3,     // Jan 1 – Jul 31, 2026
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
  return {
    ...l,
    key: laneKey(kind, destination),
    perWeek,                         // contract trucks a week: the lane's 2026 average
    perDay: Math.ceil(perWeek / 7),  // most a carrier can add on any one day
    spotCost: l.contract_cost + l.spot_premium,
  };
});
export const laneOf = (kind, destination) => PILOT_LANES.find((l) => l.kind === kind && l.destination === destination);

// ---------- Simulated operating data (not in the workbook; labeled in the app) ----------
// Trucks already booked on each lane by Ball's other business, as a share of the weekly contract trucks.
export const SIM_BOOKED = {
  "order|Cincinnati, OH":     [0.95, 0.95, 0.9, 0.95, 0.8, 0.95], // a lighter week: room for a counteroffer date
  "order|Columbus, OH":       [0.95, 0.95, 0.9, 0.95, 0.95, 0.9],
  "order|Mertztown, PA":      [0.9, 0.9, 1.0, 0.9, 0.9, 1.0],
  "order|Downey, CA":         [0.9, 0.9, 0.9, 1.0, 0.9, 0.9],
  "transfer|Mississauga, ON": [0.95, 0.6, 0.75, 0.6, 0.95, 0.95],  // a dip: room for a prebuild
  "transfer|Adairsville, GA": [0.95, 0.95, 1.0, 0.95, 0.95, 0.95],
  "transfer|Dorval, QC":      [0.95, 1.0, 0.95, 0.95, 1.0, 0.95],
  "transfer|Columbus, OH":    [0.95, 0.95, 0.9, 0.95, 1.0, 0.95],
};
// One customer filling plant per sales-order lane.
// forecast = truckloads a week the customer told Ball to expect; stock = truckloads of their labeled cans at Findlay.
export const SIM_CUSTOMERS = {
  "Cincinnati, OH": { name: "Customer A", stock: 2, inBand: 0.94, forecast: [8, 8, 10, 8, 8, 8] },
  "Columbus, OH":   { name: "Customer B", stock: 0, inBand: 0.81, forecast: [5, 5, 6, 5, 5, 5] },
  "Mertztown, PA":  { name: "Customer C", stock: 1, inBand: 0.97, forecast: [1, 1, 2, 1, 1, 2] },
  "Downey, CA":     { name: "Customer D", stock: 0, inBand: 0.72, forecast: [1, 1, 1, 2, 1, 1] },
};
export const priorityOf = (c) => (c.inBand >= 0.9 ? "Priority" : "Standard");
// Open line time at Findlay for new orders, in truckloads of cans, weeks 0–5.
export const SIM_LINE_TIME = [3, 6, 8, 10, 8, 8];

// ---------- Dates: local calendar days "YYYY-MM-DD"; weeks run Sunday–Saturday ----------
const DAY_MS = 86400000;
export const isoDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const atNoon = (iso) => new Date(iso + "T12:00:00");
export const addDays = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / DAY_MS);
export const weekKey = (iso) => addDays(iso, -atNoon(iso).getDay());
export const weekIndex = (iso, now) => daysBetween(weekKey(now), weekKey(iso)) / 7;
const dayOfTs = (ts) => isoDate(new Date(ts));

export const bookedTrucks = (lane, wk) => Math.round(lane.perWeek * (SIM_BOOKED[lane.key]?.[wk] ?? 1));
export const trucksFromCans = (cans) => Math.max(1, Math.ceil(cans / RULES.cansPerTruck));

// ---------- Items (what the app saves) ----------
// order:    a customer PO (data.kind "po", trucks > 0) or a change to one (data.kind "change", parent, trucks ±).
//           data { customer, kind, parent?, trucks, cans, date, reason, signoffs{team:{ok,at}}, answer?, scheduled_at?, spot_reason? }
//           status: waiting (in review) → confirmed (accepted) or offered (counteroffer out) → confirmed | declined
//           Scheduled = data.scheduled_at is set (Logistics booked the trucks).
// transfer: a prebuild move Ball schedules itself. data { destination, trucks, date, pattern, booked_at }; status booked
// ask:      Logistics asked the lane's carrier for ±N. data { kind, destination, week, date, trucks, accepted };
//           status yes | part | no (more trucks) or noted (fewer)
export const TEAMS = ["sales", "inventory", "production", "logistics"];
export const isActive = (it) => !(it.type === "order" && it.status === "declined");
export const isBooked = (it) => (it.type === "order" ? !!it.data.scheduled_at : it.type === "transfer");
const bookedAt = (it) => (it.type === "order" ? it.data.scheduled_at : it.data.booked_at || it.created_at);
export const itemLane = (it) =>
  it.type === "order" ? laneOf("order", it.data.customer)
  : it.type === "transfer" ? laneOf("transfer", it.data.destination)
  : laneOf(it.data.kind, it.data.destination);
// A counteroffered (or accepted) new date replaces the date the customer asked for.
export const dateOf = (it) =>
  it.type === "order" && it.data.answer?.kind === "new_date" && (it.status === "offered" || it.status === "confirmed")
    ? it.data.answer.date : it.data.date;
export const patternOf = (it) => (it.type === "transfer" ? it.data.pattern || "day" : "day");
export const PATTERNS = {
  day: { label: "All on one day", days: 1 },
  week: { label: "Spread over the week", days: 7 },
  w2: { label: "Waves over 2 weeks", days: 14 },
  w3: { label: "Waves over 3 weeks", days: 21 },
};

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
export const byCreated = (a, b) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1
  : String(a.id) === String(b.id) ? 0 : String(a.id) < String(b.id) ? -1 : 1;

// Extra contract trucks a carrier agreed to (+) or gave back after a warning (−), per lane-week.
export function carrierExtras(items, now) {
  const out = new Map();
  for (const it of items) {
    if (it.type !== "ask") continue;
    const k = `${itemLane(it).key}|${weekIndex(it.data.week, now)}`;
    let n = 0;
    if (it.data.trucks > 0 && (it.status === "yes" || it.status === "part")) n = it.data.accepted ?? it.data.trucks;
    if (it.data.trucks < 0 && it.status === "noted") n = it.data.trucks;
    if (n) out.set(k, (out.get(k) || 0) + n);
  }
  return out;
}

// The simulated carrier's answer: with 7+ days' notice it can add up to 25% of its weekly trucks
// (minus what it already added that week). With less notice it can't find drivers.
export function carrierAnswer(items, lane, date, trucks, now) {
  if (trucks < 0) return { status: "noted", accepted: trucks, why: "Thanks for the heads-up. We'll move those drivers." };
  const days = daysBetween(now, date);
  if (days < RULES.carrierFlexNoticeDays)
    return { status: "no", accepted: 0, why: `Only ${days} days' notice. We can't add drivers that fast.` };
  const wk = weekIndex(date, now);
  const already = Math.max(0, carrierExtras(items, now).get(`${lane.key}|${wk}`) || 0);
  const cap = Math.ceil(lane.perWeek * RULES.carrierFlexShare);
  const accepted = Math.max(0, Math.min(trucks, cap - already));
  if (accepted === trucks) return { status: "yes", accepted, why: `Yes: we can add ${trucks} trucks that week.` };
  if (accepted > 0) return { status: "part", accepted, why: `We can add ${accepted}, not ${trucks}. That's our limit for that week.` };
  return { status: "no", accepted: 0, why: "We're already adding all the trucks we can that week." };
}

// What a contract/spot split costs and earns. Customer order: the $3,100 already includes a contract
// truck, so a spot truck costs only its premium. Transfer: Ball pays the whole move.
export function splitMoney(lane, contract, spot) {
  const move = lane.kind === "transfer" ? lane.contract_cost : 0;
  const cEach = move;
  const sEach = move + lane.spot_premium;
  const loads = contract + spot;
  const extra = contract * cEach + spot * sEach;
  const making = RULES.profitPerTruck * loads;
  const profit = making - extra;
  const perTruck = loads ? Math.round(profit / loads) : 0;
  return { cEach, sEach, contractCost: contract * cEach, spotCost: spot * sEach, extra, making, profit, perTruck,
    overspend: spot * lane.spot_premium, color: colorFor(perTruck) };
}
export const colorFor = (perTruck) => (perTruck >= RULES.greenAt ? "green" : perTruck >= RULES.yellowAt ? "yellow" : "red");

// ---------- Who gets contract trucks ----------
// opts.oldWay: the same orders without the system (no carrier asks, transfers all on one day).
// Returns Map(item id → result).
export function allocate(items, now, opts = {}) {
  const list = items.filter((it) => it.type !== "ask" && isActive(it)).sort(byCreated);
  const extras = opts.oldWay ? new Map() : carrierExtras(items, now);
  const usedWeek = new Map();
  const usedDay = new Map();
  const freed = new Map(); // cuts free their trucks for everyone that week
  for (const it of list) {
    if (it.data.trucks >= 0) continue;
    const k = `${itemLane(it).key}|${weekIndex(dateOf(it), now)}`;
    freed.set(k, (freed.get(k) || 0) - it.data.trucks);
  }
  const out = new Map();
  for (const it of list) {
    const lane = itemLane(it);
    if (!lane) continue;
    const trucks = it.data.trucks;
    const date = opts.oldWay && it.type === "order" ? it.data.date : dateOf(it);
    if (trucks < 0) {
      out.set(it.id, { lane, date, trucks, cut: -trucks, contract: 0, spot: 0, days: [], reasons: [], ...splitMoney(lane, 0, 0) });
      continue;
    }
    const pattern = opts.oldWay ? "day" : patternOf(it);
    const bookedDay = isBooked(it) ? dayOfTs(bookedAt(it)) : null;
    const reasons = new Set();
    const days = spreadDays(date, trucks, pattern).map(({ day, n }) => {
      const wk = weekIndex(day, now);
      const wKey = `${lane.key}|${wk}`;
      const dKey = `${lane.key}|${day}`;
      const extra = extras.get(wKey) || 0;
      const cover = lane.perWeek + extra;
      const booked = bookedTrucks(lane, wk);
      const earlier = usedWeek.get(wKey) || 0;
      const weekRoom = Math.max(0, cover - booked + (freed.get(wKey) || 0) - earlier);
      const dayRoom = Math.max(0, lane.perDay + Math.max(0, extra) - (usedDay.get(dKey) || 0));
      let contract, why = null;
      if (bookedDay && daysBetween(bookedDay, day) < RULES.noticeDays) { contract = 0; why = "notice"; }
      else if (!bookedDay && daysBetween(now, day) < RULES.noticeDays) { contract = 0; why = "late"; }
      else {
        contract = Math.min(n, weekRoom, dayRoom);
        if (contract < n) why = weekRoom <= dayRoom ? "week" : "day";
      }
      if (why) reasons.add(why);
      usedWeek.set(wKey, earlier + contract);
      usedDay.set(dKey, (usedDay.get(dKey) || 0) + contract);
      // capSpot: spot because the carrier had no room (asking early can fix it), not because it was too late
      return { day, wk, n, contract, spot: n - contract, capSpot: why === "week" || why === "day" ? n - contract : 0,
        cover, extra, booked, earlier, weekRoom, dayRoom };
    });
    const contract = days.reduce((s, d) => s + d.contract, 0);
    const spot = trucks - contract;
    const capSpot = days.reduce((s, d) => s + d.capSpot, 0);
    out.set(it.id, { lane, date, trucks, pattern, contract, spot, capSpot, days, reasons: [...reasons], ...splitMoney(lane, contract, spot) });
  }
  return out;
}

export const REASON_TEXT = {
  week: "the contract trucks left that week run out",
  day: "a carrier can only add about 1/7 of its weekly trucks on one day",
  late: `it's under ${RULES.noticeDays} days away and not booked yet`,
  notice: `it was booked with under ${RULES.noticeDays} days' notice`,
};

// ---------- Production and inventory (simulated stock and line time, first come first served) ----------
export function planUse(items, now) {
  const stockLeft = Object.fromEntries(Object.entries(SIM_CUSTOMERS).map(([k, c]) => [k, c.stock]));
  const lineLeft = [...SIM_LINE_TIME];
  const out = new Map();
  for (const it of items.filter((x) => x.type === "order" && isActive(x)).sort(byCreated)) {
    const trucks = it.data.trucks;
    const date = dateOf(it);
    const wk = weekIndex(date, now);
    const daysOut = daysBetween(now, date);
    const frozen = daysOut < RULES.makeLeadDays + RULES.freezeDays;
    if (trucks < 0) { out.set(it.id, { wk, daysOut, frozen, cut: -trucks }); continue; }
    const fromStock = Math.min(trucks, stockLeft[it.data.customer] || 0);
    stockLeft[it.data.customer] -= fromStock;
    const toMake = trucks - fromStock;
    const open = Math.max(0, lineLeft[wk] ?? 0);
    const made = Math.min(toMake, open);
    if (lineLeft[wk] != null) lineLeft[wk] -= made;
    out.set(it.id, { wk, daysOut, frozen, fromStock, toMake, open, short: toMake - made, lineTotal: SIM_LINE_TIME[wk] ?? 0 });
  }
  return out;
}

// ---------- The four team checks ----------
// Each check: { ok, question, facts: [lines], verdict }. The app pre-checks; the team confirms or overrides.
export const QUESTIONS = {
  sales: "Is it within what the customer told us to expect?",
  inventory: "Do we have their labeled cans?",
  production: "Can Findlay make it in time?",
  logistics: "Can we ship it on contract trucks?",
};

export function checks(items, it, now) {
  const lane = itemLane(it);
  const date = dateOf(it);
  const wk = weekIndex(date, now);
  const cust = SIM_CUSTOMERS[it.data.customer];
  const a = allocate(items, now).get(it.id);
  const p = planUse(items, now).get(it.id);
  const cut = it.data.trucks < 0;
  const n = Math.abs(it.data.trucks);
  const s = (k) => (k === 1 ? "" : "s");

  // Sales: the customer's total for that week (POs and changes so far) vs. its forecast, ±10%.
  const fc = cust.forecast[wk] ?? cust.forecast[cust.forecast.length - 1];
  const weekTotal = items
    .filter((x) => x.type === "order" && isActive(x) && x.data.customer === it.data.customer
      && byCreated(x, it) <= 0 && weekIndex(dateOf(x), now) === wk)
    .reduce((sum, x) => sum + x.data.trucks, 0);
  const band = Math.max(1, Math.round(fc * RULES.flexBand));
  const inBand = Math.abs(weekTotal - fc) <= band;
  const daysOut = daysBetween(now, date);
  const inCutoff = daysOut < RULES.noticeDays;
  const sales = {
    ok: inBand && !inCutoff,
    facts: [
      `Their forecast for that week: ${fc} truckload${s(fc)}.`,
      `With this ${it.data.kind === "change" ? "change" : "PO"}: ${weekTotal}. Allowed: ${fc - band} to ${fc + band} (±10%).`,
      `${daysOut} days before delivery${inCutoff ? `: inside the ${RULES.noticeDays}-day cutoff.` : "."}`,
    ],
    verdict: inCutoff ? "Too close to delivery" : inBand ? "Within the forecast" : weekTotal > fc ? "Above the forecast band" : "Below the forecast band",
  };

  let inventory, production;
  if (cut) {
    inventory = p.frozen
      ? { ok: false, facts: [`Their cans are already made for that date.`, `${n} truckload${s(n)} of labeled cans would be left over. Only this customer can use them.`], verdict: "Cans would be stranded" }
      : { ok: true, facts: ["The cut comes before the cans are made.", "Nothing is left over."], verdict: "Nothing stranded" };
    production = { ok: true, facts: [p.frozen ? "The run is already locked. No change." : `${n} fewer truckload${s(n)} to make.`, "That line time opens up for other orders."], verdict: "Run gets smaller" };
  } else {
    inventory = { ok: true,
      facts: [`Their labeled cans in stock at Findlay cover ${p.fromStock} of ${n} truckload${s(n)}.`,
        p.toMake ? `${p.toMake} more must be made (Production).` : "No new cans need to be made."],
      verdict: p.fromStock ? `${p.fromStock} from stock` : "Nothing in stock: all made new" };
    if (!p.toMake) production = { ok: true, facts: ["It ships from cans already made.", "No change to the schedule."], verdict: "No production change" };
    else if (p.frozen) production = { ok: false, facts: [`Needs ${p.toMake} truckload${s(p.toMake)} made.`, `Runs lock ${RULES.freezeDays} days before they start. This is inside the freeze.`], verdict: "Inside the production freeze" };
    else production = { ok: !p.short,
      facts: [`Needs ${p.toMake} truckload${s(p.toMake)} made that week.`, `Open line time that week: ${p.open} of ${p.lineTotal} (the rest is taken by earlier orders).`],
      verdict: p.short ? `Short ${p.short} truckload${s(p.short)} of line time` : "Fits in open line time" };
  }

  let logistics;
  if (cut) logistics = { ok: true, facts: [`Frees ${n} contract truck${s(n)} that week.`, "Warn the carrier so it can move those drivers."], verdict: "Frees contract trucks" };
  else {
    const d = a.days[0];
    const late = a.reasons.includes("late");
    logistics = {
      ok: a.spot === 0,
      facts: late ? [`It's under ${RULES.noticeDays} days away: contract carriers can't take it.`, `All ${n} would go spot (${moneyStr(a.overspend)} more).`] : [
        `Contract trucks that week: ${d.cover}${d.extra > 0 ? ` (incl. ${d.extra} extra the carrier agreed to)` : ""}.`,
        `Already booked: ${d.booked}${d.earlier ? ` + ${d.earlier} for earlier POs` : ""}. Left: ${d.weekRoom}.`,
        a.spot ? `This needs ${n}: ${a.contract} on contract, ${a.spot} would go spot (${moneyStr(a.overspend)} more).` : `This needs ${n}: all fit on contract.`,
      ],
      verdict: a.spot ? `${a.spot} of ${n} would go spot` : "All on contract",
    };
  }
  return { sales, inventory, production, logistics, alloc: a, plan: p, inBand, fc, band, weekTotal };
}
const moneyStr = (n) => "$" + Math.round(n).toLocaleString("en-US");

// Sign-off progress for one PO or change.
export function review(items, it, now) {
  const c = checks(items, it, now);
  const signed = it.data.signoffs || {};
  const approved = TEAMS.filter((t) => signed[t]?.ok === true).length;
  const refused = TEAMS.filter((t) => signed[t]?.ok === false);
  return { checks: c, signed, approved, refused, allApproved: approved === TEAMS.length };
}

// The best other date (within 2 weeks either side, 5+ days out, inside the horizon) that makes more profit
// and that Production can make. Ties go to the closest date.
export function betterDate(items, it, now) {
  const base = allocate(items, now).get(it.id);
  if (!base || it.data.trucks < 0) return null;
  const orig = it.data.date;
  const last = addDays(weekKey(now), RULES.weeks * 7 - 1);
  let best = null;
  for (let off = -14; off <= 14; off++) {
    const date = addDays(orig, off);
    if (!off || daysBetween(now, date) < RULES.noticeDays + RULES.makeLeadDays || date > last) continue;
    const moved = { ...it, status: "offered", data: { ...it.data, answer: { kind: "new_date", date } } };
    const next = items.map((x) => (x.id === it.id ? moved : x));
    const a = allocate(next, now).get(it.id);
    const p = planUse(next, now).get(it.id);
    if (p.short || (p.toMake && p.frozen)) continue;
    const gain = a.profit - base.profit;
    if (gain <= 0) continue;
    if (!best || gain > best.gain || (gain === best.gain && Math.abs(off) < Math.abs(best.off))) best = { date, off, gain, alloc: a };
  }
  return best;
}

// ---------- The 6-week outlook (early warning) ----------
export function outlook(items, now) {
  const alloc = allocate(items, now);
  const extras = carrierExtras(items, now);
  return PILOT_LANES.map((lane) => ({
    lane,
    weeks: Array.from({ length: RULES.weeks }, (_, wk) => {
      const week = addDays(weekKey(now), wk * 7);
      const booked = bookedTrucks(lane, wk);
      let adds = 0, cuts = 0, contract = 0, spot = 0, capSpot = 0;
      for (const it of items) {
        const a = alloc.get(it.id);
        if (!a || itemLane(it) !== lane) continue;
        if (a.trucks < 0) { if (weekIndex(a.date, now) === wk) cuts += a.cut; continue; }
        for (const d of a.days) if (d.wk === wk) { adds += d.n; contract += d.contract; spot += d.spot; capSpot += d.capSpot; }
      }
      const needed = booked + adds - cuts;
      const extra = extras.get(`${lane.key}|${wk}`) || 0;
      const cover = lane.perWeek + extra;
      const change = (needed - lane.perWeek) / lane.perWeek;
      const zone = Math.abs(change) <= RULES.watchAt ? "green" : Math.abs(change) <= RULES.actAt ? "yellow" : "red";
      const unused = Math.max(0, cover - needed);
      let action = null;
      if (capSpot > 0) action = { kind: "more", trucks: capSpot };
      else if (zone !== "green" && needed < lane.perWeek && unused > 0) action = { kind: "fewer", trucks: unused };
      return { wk, week, booked, adds, cuts, needed, extra, cover, contract, spot, capSpot, change, zone, unused, action };
    }),
  }));
}

// ---------- Totals for the dashboard, and the same items "the old way" ----------
export function totals(items, now, opts) {
  const alloc = allocate(items, now, opts);
  const t = { trucks: 0, contract: 0, spot: 0, overspend: 0, making: 0, extra: 0, profit: 0 };
  for (const a of alloc.values()) {
    if (a.trucks < 0) continue;
    t.trucks += a.trucks; t.contract += a.contract; t.spot += a.spot;
    t.overspend += a.overspend; t.making += a.making; t.extra += a.extra; t.profit += a.profit;
  }
  t.spotShare = t.trucks ? t.spot / t.trucks : 0;
  return t;
}
