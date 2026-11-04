// Ball Findlay pilot: all the logic, no screens. app.js draws it; tests/engine.test.mjs checks it.
//
// One idea runs through everything: each Findlay lane's carriers are staffed for about
// C trucks a week (the lane's 2026 average). The forecast already uses most of that.
// New orders and transfers claim what's left, first come first served. Whatever doesn't
// fit goes on spot, unless a carrier agrees ahead of time to take extra trucks.
import { LANES } from "./lanes.js";

export const RULES = {
  profitPerTruck: 3100,  // Ball's average operating profit per truckload (FY2025 10-K, see README)
  greenAt: 2000,         // profit per truck colors (illustrative; finance would set these)
  yellowAt: 1000,
  noticeDays: 3,         // carriers need 3+ days; the customer change cutoff is the same 3 days
  freezeDays: 3,         // production runs lock 3 days before they start
  makeLeadDays: 2,       // cans are made about 2 days before they ship
  cansPerTruck: 200000,  // ~one full truckload of 12 oz cans
  flexBand: 0.10,        // customer changes within ±10% of the week's forecast are "inside the band"
  watchAt: 0.10,         // outlook: over ±10% vs. carrier plan = Watch, over ±25% = Act now
  actAt: 0.25,
  weeks: 6,              // outlook horizon
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
    perWeek,                         // carriers' weekly plan: 2026 average trucks a week
    perDay: Math.ceil(perWeek / 7),  // what a carrier can add on any one day
    spotCost: l.contract_cost + l.spot_premium,
  };
});
export const laneOf = (kind, destination) => PILOT_LANES.find((l) => l.kind === kind && l.destination === destination);

// ---------- Simulated operating data (not in the workbook; clearly labeled in the app) ----------
// Short-term forecast for the next 6 weeks, as a share of each lane's usual weekly trucks.
export const SIM_FORECAST = {
  "order|Cincinnati, OH":     [0.95, 0.95, 0.9, 0.95, 0.8, 0.95], // a lighter week: room for a "better date"
  "order|Columbus, OH":       [0.95, 0.95, 0.9, 0.95, 0.95, 0.9],
  "order|Mertztown, PA":      [0.9, 0.9, 1.0, 0.9, 0.9, 1.0],
  "order|Downey, CA":         [0.9, 0.9, 0.9, 1.0, 0.9, 0.9],
  "transfer|Mississauga, ON": [0.95, 0.6, 0.75, 0.6, 0.95, 0.95],  // the designed dip: room for a prebuild
  "transfer|Adairsville, GA": [0.95, 0.95, 1.0, 0.95, 0.95, 0.95],
  "transfer|Dorval, QC":      [0.95, 1.0, 0.95, 0.95, 1.0, 0.95],
  "transfer|Columbus, OH":    [0.95, 0.95, 0.9, 0.95, 1.0, 0.95],
};
// One customer filling plant per sales-order lane. Stock = truckloads of their labeled cans at Findlay.
export const SIM_CUSTOMERS = {
  "Cincinnati, OH": { name: "Customer A", stock: 2, inBand: 0.94 },
  "Columbus, OH":   { name: "Customer B", stock: 0, inBand: 0.81 },
  "Mertztown, PA":  { name: "Customer C", stock: 1, inBand: 0.97 },
  "Downey, CA":     { name: "Customer D", stock: 0, inBand: 0.72 },
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

export const forecastTrucks = (lane, wk) => {
  const m = SIM_FORECAST[lane.key]?.[wk];
  return Math.round(lane.perWeek * (m ?? 1));
};
export const trucksFromCans = (cans) => Math.max(1, Math.ceil(cans / RULES.cansPerTruck));

// ---------- Items (what the app saves) ----------
// order:    a customer change. data { customer, trucks (+add / −cut), date, reason, cans, answer?, booked_at? }
//           status waiting → offered → confirmed | declined   (answer "confirm" goes straight to confirmed)
// transfer: a prebuild move Ball schedules itself. data { destination, trucks, date, pattern, booked_at }; status booked
// ask:      Logistics asks the lane's carrier for +N (or warns −N). data { kind, destination, week, trucks, accepted? }
//           status asked → yes | part | no   (a −N warning becomes "noted")
export const isActive = (it) => !(it.type === "order" && it.status === "declined");
export const isBooked = (it) => (it.type === "order" ? it.status === "confirmed" : it.type === "transfer");
export const itemLane = (it) =>
  it.type === "order" ? laneOf("order", it.data.customer)
  : it.type === "transfer" ? laneOf("transfer", it.data.destination)
  : laneOf(it.data.kind, it.data.destination);
// An offered (or accepted) new date replaces the date the customer asked for.
export const dateOf = (it) =>
  it.type === "order" && it.data.answer?.kind === "new_date" && it.status !== "declined" && it.status !== "waiting"
    ? it.data.answer.date : it.data.date;
export const patternOf = (it) => (it.type === "transfer" ? it.data.pattern || "day" : "day");
export const PATTERNS = {
  day: { label: "All on one day", days: 1 },
  week: { label: "Spread over the week", days: 7 },
  w2: { label: "Waves over 2 weeks", days: 14 },
  w3: { label: "Waves over 3 weeks", days: 21 },
};

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
const byCreated = (a, b) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : String(a.id) < String(b.id) ? -1 : 1;

// Extra contract trucks carriers agreed to (+) or released after a warning (−), per lane-week.
export function carrierExtras(items, now) {
  const out = new Map();
  for (const it of items) {
    if (it.type !== "ask") continue;
    const lane = itemLane(it);
    const wk = weekIndex(it.data.week, now);
    let n = 0;
    if (it.data.trucks > 0 && (it.status === "yes" || it.status === "part")) n = it.data.accepted ?? it.data.trucks;
    if (it.data.trucks < 0 && it.status === "noted") n = it.data.trucks;
    if (n) out.set(`${lane.key}|${wk}`, (out.get(`${lane.key}|${wk}`) || 0) + n);
  }
  return out;
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

// ---------- The allocation: who gets contract trucks ----------
// opts.oldWay: the same orders without the system (no carrier asks, transfers all on one day).
// Returns Map(item id → result).
export function allocate(items, now, opts = {}) {
  const list = items.filter((it) => it.type !== "ask" && isActive(it)).sort(byCreated);
  const extras = opts.oldWay ? new Map() : carrierExtras(items, now);
  const usedWeek = new Map();
  const usedDay = new Map();
  // Cuts free their trucks for everyone that week.
  const freed = new Map();
  for (const it of list) {
    if (it.data.trucks >= 0) continue;
    const lane = itemLane(it);
    const k = `${lane.key}|${weekIndex(dateOf(it), now)}`;
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
    const bookedDay = isBooked(it) ? dayOfTs(it.data.booked_at || it.created_at) : null;
    const reasons = new Set();
    const days = spreadDays(date, trucks, pattern).map(({ day, n }) => {
      const wk = weekIndex(day, now);
      const wKey = `${lane.key}|${wk}`;
      const dKey = `${lane.key}|${day}`;
      const extra = extras.get(wKey) || 0;
      const cover = lane.perWeek + extra;
      const weekRoom = Math.max(0, cover - forecastTrucks(lane, wk) + (freed.get(wKey) || 0) - (usedWeek.get(wKey) || 0));
      const dayRoom = Math.max(0, lane.perDay + Math.max(0, extra) - (usedDay.get(dKey) || 0));
      let contract, why = null;
      if (bookedDay && daysBetween(bookedDay, day) < RULES.noticeDays) { contract = 0; why = "notice"; }
      else if (!bookedDay && daysBetween(now, day) < RULES.noticeDays) { contract = 0; why = "late"; }
      else {
        contract = Math.min(n, weekRoom, dayRoom);
        if (contract < n) why = weekRoom <= dayRoom ? "week" : "day";
      }
      if (why) reasons.add(why);
      usedWeek.set(wKey, (usedWeek.get(wKey) || 0) + contract);
      usedDay.set(dKey, (usedDay.get(dKey) || 0) + contract);
      // capSpot: spot because carriers had no room (an early ask can fix it), not because it was too late
      return { day, wk, n, contract, spot: n - contract, capSpot: why === "week" || why === "day" ? n - contract : 0, weekRoom, dayRoom };
    });
    const contract = days.reduce((s, d) => s + d.contract, 0);
    const spot = trucks - contract;
    out.set(it.id, { lane, date, trucks, pattern, contract, spot, days, reasons: [...reasons], ...splitMoney(lane, contract, spot) });
  }
  return out;
}

export const REASON_TEXT = {
  week: "the lane's contract trucks that week are already used by the forecast and earlier orders",
  day: "too many trucks on one day: carriers can add only about 1/7 of a week's trucks on any day",
  late: `not booked in time: under ${RULES.noticeDays} days to go, so contract carriers can't take it`,
  notice: `booked with under ${RULES.noticeDays} days' notice`,
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
    out.set(it.id, { wk, daysOut, frozen, fromStock, toMake, open, short: toMake - made });
  }
  return out;
}

// ---------- The four team checks for one customer order ----------
// Each check: { ok: true | false, title, detail }.
export function checks(items, it, now) {
  const lane = itemLane(it);
  const date = dateOf(it);
  const wk = weekIndex(date, now);
  const fc = forecastTrucks(lane, wk);
  const a = allocate(items, now).get(it.id);
  const p = planUse(items, now).get(it.id);
  const cut = it.data.trucks < 0;
  const n = Math.abs(it.data.trucks);

  // Sales: inside the ±10% band (all of this customer's changes that week count together) and outside the cutoff.
  const weekChange = items
    .filter((x) => x.type === "order" && isActive(x) && x.data.customer === it.data.customer && x.created_at <= it.created_at
      && weekIndex(dateOf(x), now) === wk)
    .reduce((s, x) => s + x.data.trucks, 0);
  const band = Math.max(1, Math.round(fc * RULES.flexBand));
  const inBand = Math.abs(weekChange) <= band;
  const daysOut = daysBetween(now, date);
  const inCutoff = daysOut < RULES.noticeDays;
  const sales = {
    ok: inBand && !inCutoff,
    title: inBand ? "Inside the flex band" : "Outside the flex band",
    detail: `${weekChange > 0 ? "+" : ""}${weekChange} trucks vs. their forecast of ${fc} that week. Band: ±${band} (10%).`
      + (inCutoff ? ` And it's inside the ${RULES.noticeDays}-day cutoff.` : ""),
  };

  let inventory, production;
  if (cut) {
    inventory = p.frozen
      ? { ok: false, title: "Cans already made", detail: `${n} truckloads of their labeled cans are already made. They wait in the warehouse for this customer's next order.` }
      : { ok: true, title: "Nothing stranded", detail: "The cut comes before the run starts, so no labeled cans are left over." };
    production = { ok: true, title: "Run gets smaller", detail: p.frozen ? "Run already locked; no change." : `${n} fewer truckloads to make. That line time opens for other orders.` };
  } else {
    inventory = p.fromStock
      ? { ok: true, title: `${p.fromStock} of ${n} from stock`, detail: `Findlay has their labeled cans for ${p.fromStock} truckload${p.fromStock === 1 ? "" : "s"}.` + (p.toMake ? ` ${p.toMake} more must be made.` : " No new production needed.") }
      : { ok: true, title: "None in stock", detail: `All ${n} truckloads must be made.` };
    if (!p.toMake) production = { ok: true, title: "No production change", detail: "It ships from cans already made." };
    else if (p.frozen) production = { ok: false, title: "Inside the production freeze", detail: `Runs lock ${RULES.freezeDays} days before they start. Making ${p.toMake} truckloads by then means moving another run.` };
    else if (p.short) production = { ok: false, title: "Not enough line time", detail: `Only ${p.open} of ${p.toMake} truckloads of open line time that week. The rest needs overtime or a moved run.` };
    else production = { ok: true, title: "Fits open line time", detail: `${p.toMake} truckload${p.toMake === 1 ? "" : "s"} fit in Findlay's open line time that week.` };
  }

  const logistics = cut
    ? { ok: true, title: `Frees ${n} contract trucks`, detail: "Tell the carrier now so it can move its drivers. That goodwill gets our loads accepted later." }
    : a.spot
      ? { ok: false, title: `${a.spot} of ${n} trucks go spot`, detail: `${a.contract} fit on contract. Spot ones go because ${a.reasons.map((r) => REASON_TEXT[r]).join("; ")}.` }
      : { ok: true, title: "All on contract", detail: `All ${n} fit in the carrier's plan for that week.` };

  return { sales, inventory, production, logistics, alloc: a, plan: p, inBand, fc, band, weekChange };
}

// The best other date (within 2 weeks either side, 3+ days out, inside the horizon) that makes more profit
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

// What Ball should answer. Suggestion only; a person clicks.
export function suggestAnswer(items, it, now) {
  const c = checks(items, it, now);
  if (it.data.trucks < 0) return { kind: "confirm", why: "A cut frees trucks. Confirm it and warn the carrier." };
  const allOk = c.sales.ok && c.inventory.ok && c.production.ok && c.logistics.ok;
  if (allOk) return { kind: "confirm", why: "All four checks pass." };
  const better = betterDate(items, it, now);
  if (better) return { kind: "new_date", date: better.date, gain: better.gain, why: "Another date clears more checks and saves money." };
  if (!c.logistics.ok && !c.inBand) return { kind: "confirm_cost", cost: c.alloc.overspend, why: "Outside the band, so the customer shares the spot cost." };
  if (c.logistics.ok && c.production.ok) return { kind: "confirm", why: "Outside the band, but the trucks and line time are secured." };
  return { kind: "confirm", why: "Inside the band, so Ball absorbs the cost to keep the customer." };
}

// ---------- The 6-week outlook (our version of the early-warning system) ----------
export function outlook(items, now) {
  const alloc = allocate(items, now);
  const extras = carrierExtras(items, now);
  const asks = items.filter((x) => x.type === "ask");
  return PILOT_LANES.map((lane) => ({
    lane,
    weeks: Array.from({ length: RULES.weeks }, (_, wk) => {
      const week = addDays(weekKey(now), wk * 7);
      const forecast = forecastTrucks(lane, wk);
      let adds = 0, cuts = 0, contract = 0, spot = 0, capSpot = 0, waiting = 0;
      for (const it of items) {
        const a = alloc.get(it.id);
        if (!a || itemLane(it) !== lane) continue;
        if (a.trucks < 0) { if (weekIndex(a.date, now) === wk) cuts += a.cut; continue; }
        for (const d of a.days) {
          if (d.wk !== wk) continue;
          adds += d.n; contract += d.contract; spot += d.spot; capSpot += d.capSpot;
          if (!isBooked(it)) waiting += d.n;
        }
      }
      const needed = forecast + adds - cuts;
      const extra = extras.get(`${lane.key}|${wk}`) || 0;
      const cover = lane.perWeek + extra;
      const change = (needed - lane.perWeek) / lane.perWeek;
      const zone = Math.abs(change) <= RULES.watchAt ? "green" : Math.abs(change) <= RULES.actAt ? "yellow" : "red";
      const cellAsks = asks.filter((x) => itemLane(x) === lane && weekIndex(x.data.week, now) === wk);
      const openAsk = cellAsks.find((x) => x.status === "asked");
      const unused = Math.max(0, cover - needed);
      let action = null;
      if (capSpot > 0 && !openAsk) action = { kind: "more", trucks: capSpot };
      else if (zone !== "green" && needed < lane.perWeek && !openAsk && unused > 0) action = { kind: "fewer", trucks: unused };
      return { wk, week, forecast, adds, cuts, needed, extra, cover, contract, spot, capSpot, waiting, change, zone, unused, asks: cellAsks, openAsk, action };
    }),
  }));
}

// ---------- Totals for the hub, and the same items "the old way" ----------
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
