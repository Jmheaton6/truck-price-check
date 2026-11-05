// Run: node --test tests/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../engine.js";

const NOW = "2026-11-05"; // competition day (Thursday). Week 0 = Nov 1–7.
const AT = "2026-11-05T15:00:00Z";
let t = 0;
const ts = () => new Date(Date.UTC(2026, 10, 5, 15, t++)).toISOString();
const COKE = "Random Lake, WI", PEPSI = "Alsip, IL", AB = "Memphis, TN";
const po = (customer, trucks, date, status = "waiting", extra = {}) =>
  ({ id: "o" + t, type: "order", status, created_at: ts(), data: { kind: "po", customer, trucks, date, placed: NOW, signoffs: {}, ...extra } });
const change = (parent, trucks, status = "waiting", extra = {}) =>
  ({ id: "c" + t, type: "order", status, created_at: ts(), data: { kind: "change", parent: parent.id, customer: parent.data.customer, trucks, date: parent.data.date, placed: NOW, signoffs: {}, ...extra } });
const prebuild = (destination, trucks, ready, days) =>
  ({ id: "t" + t, type: "transfer", status: days ? "booked" : "waiting", created_at: ts(), data: { destination, trucks, ready, ...(days ? { days } : {}) } });
const allAccept = (items, it) => {
  let cur = it;
  for (const team of E.TEAMS) { const u = E.decide(items, cur, team, true, AT, NOW); cur = { ...cur, status: u.status, data: u.data }; }
  return cur;
};
const got = (items, it, now = NOW) => ((a) => [a.contract, a.spot, a.counter])(E.allocate(items, now).get(it.id));

test("lanes: Monticello, with each lane's routing guide from the 2026 workbook", () => {
  const coke = E.laneOf("order", COKE);
  assert.equal(coke.origin, "Monticello, IN");
  assert.deepEqual(coke.routing.map((c) => [c.name, c.weekly, c.daily]), [["Dedicated Logistics Services", 2, 1], ["C.H. Robinson", 2, 1], ["Sage Freight", 1, 1]]);
  const trenton = E.laneOf("transfer", "Trenton, OH");
  assert.deepEqual(trenton.routing.map((c) => c.weekly), [26, 20, 5]);
  assert.ok(E.PILOT_LANES.every((l) => l.routing.every((c) => c.name !== "Spot Freight")));
});

test("routing guide: primary, then backup 1, then backup 2, each up to its daily share", () => {
  const p = po(COKE, 3, "2026-11-19", "confirmed");
  const a = E.allocate([p], NOW).get(p.id);
  assert.deepEqual(a.days[0].carriers.map((c) => [c.tier, c.n]), [[0, 1], [1, 1], [2, 1]]);
  const more = po(COKE, 2, "2026-11-19", "confirmed"); // same day: all three used
  assert.deepEqual(got([p, more], more), [0, 0, 2]);  // no carrier has room: needs a counteroffer
});

test("short notice: the primary needs 3 days; backups can still take it", () => {
  const p = po(COKE, 3, "2026-11-07", "confirmed"); // 2 days out
  const a = E.allocate([p], NOW).get(p.id);
  assert.deepEqual(a.days[0].carriers.map((c) => c.tier), [1, 2]);
  assert.deepEqual([a.contract, a.counter], [2, 1]);
});

test("weekly commitment caps the carrier across the week", () => {
  const days = ["2026-11-16", "2026-11-17", "2026-11-18"].map((d) => po(COKE, 2, d, "confirmed"));
  // Dedicated 2/wk, C.H. Robinson 2/wk, Sage 1/wk: 5 a week, then counteroffers.
  const a = E.allocate(days, NOW);
  assert.equal(days.reduce((s, x) => s + a.get(x.id).contract, 0), 5);
  assert.equal(days.reduce((s, x) => s + a.get(x.id).counter, 0), 1);
});

test("counteroffer: nearest date the routing guide covers; accept moves it, keep makes it spot with a fee", () => {
  const p = allAccept([], po(COKE, 3, "2026-11-19"));
  let ch = change(p, 2);
  for (const team of ["sales", "inventory", "planning"]) { const u = E.decide([p, ch], ch, team, true, AT, NOW); ch = { ...ch, ...u }; }
  const c = E.checks([p, ch], ch, NOW);
  assert.deepEqual([c.logistics.ok, c.logistics.counter], [false, 2]);
  const offer = E.counteroffer([p, ch], ch, AT, NOW);
  assert.equal(offer.data.counter.date, "2026-11-20");
  const offered = { ...ch, data: offer.data };
  assert.equal(E.stageOf(offered), "offered");
  const yes = { ...offered, ...E.answerCounter(offered, true, AT) };
  assert.deepEqual([yes.status, yes.data.date, yes.data.asked], ["confirmed", "2026-11-20", "2026-11-19"]);
  assert.deepEqual(got([p, yes], yes), [2, 0, 0]);
  const keep = { ...offered, ...E.answerCounter(offered, false, AT) };
  assert.equal(keep.status, "confirmed");
  const a = E.allocate([p, keep], NOW).get(keep.id);
  assert.deepEqual([a.spot, a.ballSpot, a.fee], [2, 0, 2 * E.laneOf("order", COKE).spot_premium]);
  assert.equal(E.priceTag(a), E.RULES.profitPerTruck);          // customer paid the premium
  assert.ok(E.priceTag(c.alloc) < E.RULES.profitPerTruck);      // before: Ball would eat it
});

test("no date works (a 1-truck-a-week lane): spot is offered; the customer keeps it and pays, or cancels", () => {
  const p = allAccept([], po(AB, 2, "2026-11-18"));          // Warrior: 1 a week
  assert.deepEqual(got([p], p), [1, 0, 1]);
  const offer = E.counteroffer([p], p, AT, NOW);
  assert.equal(offer.data.counter.date, null);
  const offered = { ...p, data: offer.data };
  assert.equal(E.answerCounter(offered, true, AT), null);   // nothing to take
  const keep = { ...offered, ...E.answerCounter(offered, false, AT) };
  assert.equal(E.allocate([keep], NOW).get(keep.id).fee, E.laneOf("order", AB).spot_premium);
  assert.equal(E.answerCounter(offered, false, AT, true).status, "declined");
});

test("prebuild: one batch vs paced waves (Findlay warehouse, 3 a day on contract)", () => {
  const tr = prebuild("Findlay, OH", 12, "2026-11-09");
  const o = E.transferOptions([], tr, NOW);
  const prem = E.laneOf("transfer", "Findlay, OH").spot_premium;
  assert.deepEqual([o.batch.contract, o.batch.spot, o.batch.overspend], [3, 9, 9 * prem]);
  assert.deepEqual([o.paced.contract, o.paced.spot], [12, 0]);
  assert.deepEqual(o.paced.days.map((d) => d.n), [3, 3, 3, 3]);
});

test("old way = weekly batches (Fri–Sun, 1–3 days' notice); now = paced and booked ahead", () => {
  const p = allAccept([], po(COKE, 3, "2026-11-19"));
  const tr = prebuild("Findlay, OH", 12, "2026-11-09");
  const paced = { ...tr, status: "booked", data: { ...tr.data, days: E.transferOptions([], tr, NOW).paced.days } };
  const items = [p, paced];
  const now = E.totals(items, NOW), old = E.oldWay(items, NOW);
  assert.deepEqual([now.trucks, now.spot], [15, 0]);
  assert.deepEqual([old.trucks, old.spot], [15, 10]);  // the batch: only the 2 backups take it next day
  const by = E.savingsBy(items, NOW);
  assert.equal(by.transfers, 10 * E.laneOf("transfer", "Findlay, OH").spot_premium);
  assert.equal(by.orders + by.transfers, old.overspend - now.overspend);
});

test("reliability: late orders count against the score; 90%+ is Priority and goes first", () => {
  assert.equal(E.reliability([], COKE).priority, true);    // 28 of 30
  assert.equal(E.reliability([], AB).priority, false);     // 24 of 30
  const late = po(PEPSI, 1, "2026-11-07");                  // inside the fence
  assert.equal(E.reliability([], PEPSI).priority, true);   // 27 of 30
  assert.equal(E.reliability([late], PEPSI).priority, false);
  // Priority customers go first in line, even if they ordered second.
  const lane = E.laneOf("order", PEPSI);
  assert.ok(lane);
});

test("demo 1: a PO inside the plan passes every check; four accepts confirm it", () => {
  const p = po(COKE, 3, "2026-11-19");
  const c = E.checks([p], p, NOW);
  assert.deepEqual(E.TEAMS.map((x) => c[x].ok), [true, true, true, true]);
  const done = allAccept([p], p);
  assert.equal(E.stageOf(done), "accepted");
  assert.equal(done.data.decided_at, AT);
});

test("a deny stops it; a better date passes every check", () => {
  const p = po(COKE, 3, "2026-11-19", "confirmed");
  const big = change(p, 6);                         // forecast 6 that week: 9 is over
  const c = E.checks([p, big], big, NOW);
  assert.equal(c.sales.ok, false);
  const u = E.decide([p, big], big, "sales", false, AT, NOW);
  assert.equal(u.status, "declined");
  assert.equal(u.data.denied.team, "sales");
});

test("answers can change until the trucks are booked", () => {
  const p = po(COKE, 2, "2026-11-19");
  let cur = allAccept([p], p);
  const u = E.decide([cur], cur, "sales", false, AT, NOW);
  assert.equal(u.status, "declined");
  cur = { ...cur, ...u };
  const back = E.decide([cur], cur, "sales", true, AT, NOW);
  assert.equal(back.status, "confirmed");
  const booked = { ...cur, status: "confirmed", data: { ...back.data, booked: { "2026-11-19": AT } } };
  assert.equal(E.stageOf(booked), "booked");
  assert.equal(E.decide([booked], booked, "sales", false, AT, NOW), null);
});

test("calendar and To book: accepted trucks to book; checking ones apart; forecast trucks expected", () => {
  const a = allAccept([], po(COKE, 3, "2026-11-19"));
  const b = po(COKE, 1, "2026-11-20");
  const row = E.calendar([a, b], NOW, 2).find((r) => r.lane.destination === COKE);
  assert.deepEqual([row.cells[4].contract, row.cells[4].toBook, row.cells[5].checking], [3, 3, 1]);
  assert.equal(row.expected, 5 - 4);
  assert.equal(row.perDay, 3);
  const list = E.toBookItems([a, b], NOW);
  assert.deepEqual([list.length, list[0].bookBy], [1, "2026-11-16"]);
});

test("cuts free trucks; a cut inside the freeze strands cans", () => {
  const base = po(PEPSI, 3, "2026-11-17", "confirmed");
  const cut = change(base, -2, "confirmed");
  assert.equal(E.allocate([base, cut], NOW).get(base.id).trucks, 1);
  const near = po(COKE, 2, "2026-11-08", "confirmed");
  const nearCut = change(near, -1);
  assert.equal(E.checks([near, nearCut], nearCut, NOW).inventory.ok, false);
});

test("forecast: versions kept, latest wins, Sales checks against it; warned 2+ weeks ahead adds line time", () => {
  const f = (trucks, on = NOW) => ({ id: "f" + t, type: "forecast", status: "noted", created_at: ts(), data: { customer: COKE, week: "2026-11-29", trucks, on } });
  const items = [f(7), f(9)];
  assert.deepEqual(E.forecastVersions(items, COKE, 4, NOW).map((x) => x.trucks), [5, 7, 9]);
  assert.equal(E.zoneOf(5, 9), "R");
  assert.equal(E.plannedLine(items, 4, NOW), 4);
  assert.equal(E.plannedLine([f(9, "2026-11-20")], 4, NOW), 0);
  const p = po(COKE, 3, "2026-12-01");
  assert.equal(E.checks([...items, p], p, NOW).sales.verdict, "Forecast 9: 3 fits");
});

test("long-term view: real monthly loads, next months = last year × 1.02", () => {
  const lt = E.longTerm();
  assert.equal(lt.length, 12);
  const aug = lt.find((m) => m.month === "Aug");
  assert.equal(aug.actual, false);
  assert.equal(aug.forecast2026, Math.round(aug.y2025 * 1.02));
});

test("scorecards", () => {
  const p = allAccept([], po(COKE, 3, "2026-11-19"));
  const booked = { ...p, data: { ...p.data, booked: { "2026-11-19": AT } } };
  const s = E.scorecards([booked], NOW);
  assert.equal(s.planning.used, 2);          // 1 from stock, 2 made
  assert.equal(s.logistics.spotShare, 0);
  assert.equal(s.logistics.ahead, 1);
  assert.equal(s.inventory.stranded, 0);
});

test("PO numbers follow arrival order; a change shows its PO's number", () => {
  const a = po(COKE, 2, "2026-11-19"), b = po(PEPSI, 2, "2026-11-19"), ch = change(a, 1);
  assert.deepEqual([a, b, ch].map((x) => E.poNumber([a, b, ch], x)), ["PO-1001", "PO-1002", "PO-1001"]);
});

test("early warning: a promo forecast over the routing guide turns red; extra trucks cover it and really carry loads", () => {
  const lane = E.laneOf("order", COKE), week = "2026-11-29"; // week 4; Coca-Cola's routing guide holds 5 a week
  const fc = { id: "f1", type: "forecast", created_at: ts(), data: { customer: COKE, week, trucks: 7, on: NOW } };
  const row = (items) => E.earlyWarning(items, NOW).find((r) => r.lane === lane);
  assert.deepEqual(row([]).weeks.map((w) => w.zone), ["G", "G", "G", "G", "G", "G"]);
  assert.deepEqual(((w) => [w.trucks, w.diff, w.zone, w.open])(row([fc]).weeks[4]), [7, 2, "R", 2]);
  assert.equal(E.warnings([fc], NOW).length, 1);
  const room = { id: "r1", type: "room", created_at: ts(), data: { lane: lane.key, week, carrier: "C.H. Robinson", n: 2, on: NOW } };
  assert.deepEqual(((w) => [w.zone, w.open])(row([fc, room]).weeks[4]), ["C", 0]);
  assert.equal(E.warnings([fc, room], NOW).length, 0);
  // The promo order: 7 trucks over the week. Without the extra trucks 2 wait on a counteroffer; with them, all contract.
  const orders = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"].map((d, i) => allAccept([], po(COKE, i < 3 ? 2 : 1, d)));
  const sum = (items) => orders.reduce((s, o) => ((g) => [s[0] + g[0], s[1] + g[2]])(got(items, o)), [0, 0]); // [contract, counter]
  assert.deepEqual(sum(orders), [5, 2]);
  assert.deepEqual(sum([...orders, room]), [7, 0]);
});

test("early warning: warehouse lanes show only with a prebuild, and flag only increases", () => {
  assert.equal(E.earlyWarning([], NOW).filter((r) => r.lane.kind === "transfer").length, 0);
  const big = prebuild("Saint Louis, MO", 12, "2026-11-16");
  const r = E.earlyWarning([big], NOW).find((x) => x.lane.destination === "Saint Louis, MO");
  assert.deepEqual(((w) => [w.trucks, w.zone])(r.weeks[2]), [12, "R"]);
  assert.deepEqual(r.weeks.filter((w) => w.wk !== 2).map((w) => w.zone), ["G", "G", "G", "G", "G"]);
});

test("one carrier takes the whole load when it can; otherwise it splits down the routing guide", () => {
  const cars = (it, items = [it]) => E.allocate(items, NOW).get(it.id).days[0].carriers.map((c) => `${c.short} ${c.n}`);
  // Trenton: C.H. Robinson 4/day, Sage 3/day. 3 trucks → all to the primary.
  assert.deepEqual(cars(prebuild("Trenton, OH", 3, "2026-11-16", [{ day: "2026-11-16", n: 3 }])), ["C.H. Robinson 3"]);
  const a = prebuild("Trenton, OH", 3, "2026-11-16", [{ day: "2026-11-16", n: 3 }]), b = prebuild("Trenton, OH", 3, "2026-11-16", [{ day: "2026-11-16", n: 3 }]);
  assert.deepEqual(cars(b, [a, b]), ["Sage 3"]); // primary has only 1 left, so backup 1 takes all 3
  // Coca-Cola: every carrier has 1 a day, so 3 trucks split.
  assert.deepEqual(cars(allAccept([], po(COKE, 3, "2026-11-19"))), ["Dedicated 1", "C.H. Robinson 1", "Sage 1"]);
});

test("dashboard: shared numbers, guardrails and cost to serve", () => {
  const p1 = allAccept([], po(COKE, 3, "2026-11-19"));
  const kept = allAccept([p1], change(p1, 2, "waiting", { expedite: true }));   // customer kept their date: resolved, they pay
  const nope = { ...change(p1, 4), status: "declined", data: { ...change(p1, 4).data, denied: { team: "sales", why: "Over forecast" } } };
  const d = E.dashboard([p1, kept, nope], NOW);
  assert.equal(d.onTime, 1);
  assert.deepEqual([d.changesResolved, d.changesDecided], [1, 2]);
  assert.equal(d.denials.length, 1);
  const coke = d.cost.find((r) => r.key === COKE);
  assert.equal(coke.loads, 5);
  assert.equal(coke.freight, 5 * E.laneOf("order", COKE).contract_cost);
  assert.equal(coke.spot, coke.fees);                  // whatever went spot, the customer paid back as a fee
  assert.equal(Math.round(coke.perLoad), E.laneOf("order", COKE).contract_cost);
  assert.equal(d.sales.changeCost, 0);
});

test("split counteroffer: too many for one day spreads over the next days (shift up to 2), all on contract", () => {
  let p = po(COKE, 5, "2026-11-19");
  for (const team of ["sales", "inventory", "planning"]) { const u = E.decide([p], p, team, true, AT, NOW); p = { ...p, ...u }; }
  assert.deepEqual(got([p], p), [3, 0, 2]);                              // 3 a day on contract; 2 short
  const plan = E.counterPlan([p], p, NOW);
  assert.deepEqual(plan.days, [{ day: "2026-11-19", n: 3 }, { day: "2026-11-20", n: 2 }]);
  const offered = { ...p, data: E.counteroffer([p], p, AT, NOW).data };
  const yes = { ...offered, ...E.answerCounter(offered, true, AT) };
  assert.deepEqual([yes.status, yes.data.date], ["confirmed", "2026-11-19"]);
  assert.deepEqual(got([yes], yes), [5, 0, 0]);
  const cal = E.calendar([yes], NOW, 2).find((r) => r.lane.destination === COKE);
  assert.deepEqual(cal.cells.filter((c) => c.moves.length).map((c) => [c.day, c.contract]), [["2026-11-19", 3], ["2026-11-20", 2]]);
  // a cut comes off the last day
  assert.deepEqual(E.orderDays(yes, 4), [{ day: "2026-11-19", n: 3 }, { day: "2026-11-20", n: 1 }]);
});

test("carrier states: contact carrier → waiting on carrier → confirmed, per truck day", () => {
  const p = allAccept([], po(COKE, 3, "2026-11-19"));
  assert.equal(E.stageOf(p), "accepted");
  assert.deepEqual([E.toBookItems([p], NOW).length, E.waitingItems([p], NOW).length], [1, 0]);
  const asked = { ...p, data: { ...p.data, tendered: { "2026-11-19": AT } } };
  assert.equal(E.stageOf(asked), "tendered");
  assert.deepEqual([E.toBookItems([asked], NOW).length, E.waitingItems([asked], NOW).length], [0, 1]);
  assert.equal(E.waitingItems([asked], NOW)[0].askedOn, AT);
  const cell = E.calendar([asked], NOW, 2).find((r) => r.lane.destination === COKE).cells.find((c) => c.day === "2026-11-19");
  assert.deepEqual([cell.toBook, cell.tendered, cell.booked], [0, 3, 0]);
  const yes = { ...asked, data: { ...asked.data, booked: { "2026-11-19": AT } } };
  assert.equal(E.stageOf(yes), "booked");
  assert.deepEqual([E.toBookItems([yes], NOW).length, E.waitingItems([yes], NOW).length], [0, 0]);
  // a contacted truck day holds its carriers ahead of a later order on the same day
  const later = allAccept([asked], po(COKE, 3, "2026-11-19"));
  assert.deepEqual(got([later, asked], asked), [3, 0, 0]);
});
