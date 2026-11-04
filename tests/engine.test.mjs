// Run: node --test tests/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../engine.js";

const NOW = "2026-11-05"; // competition day (Thursday). Week 0 = Nov 1–7.
let t = 0;
const ts = () => new Date(Date.UTC(2026, 10, 5, 15, t++)).toISOString();
const order = (customer, trucks, date, status = "waiting", extra = {}) =>
  ({ id: "o" + t, type: "order", status, created_at: ts(), data: { customer, trucks, date, ...extra } });
const transfer = (destination, trucks, date, pattern) =>
  ({ id: "t" + t, type: "transfer", status: "booked", created_at: ts(), data: { destination, trucks, date, pattern, booked_at: "2026-11-05T15:00:00Z" } });
const ask = (kind, destination, date, trucks, status = "asked", accepted) =>
  ({ id: "a" + t, type: "ask", status, created_at: ts(), data: { kind, destination, week: E.weekKey(date), trucks, accepted } });

test("lane plans come from 2026 averages", () => {
  const cin = E.laneOf("order", "Cincinnati, OH");
  assert.equal(cin.perWeek, 35); // 1,048 loads / 30.3 weeks
  assert.equal(cin.perDay, 5);
  assert.equal(E.forecastTrucks(cin, 2), 32);
});

test("demo: judge orders 2M cans for Thu Nov 19; carrier says yes; all on contract", () => {
  const o = order("Cincinnati, OH", 10, "2026-11-19");
  let items = [o];
  let a = E.allocate(items, NOW).get(o.id);
  assert.deepEqual([a.contract, a.spot], [3, 7]);         // forecast 32 of 35 leaves 3
  const c = E.checks(items, o, NOW);
  assert.equal(c.sales.ok, false);                         // +10 vs band ±3
  assert.equal(c.inventory.ok, true);                      // 2 from stock
  assert.equal(c.production.ok, true);                     // 8 to make, 8 open
  assert.equal(c.logistics.ok, false);
  const cell = E.outlook(items, NOW).find((r) => r.lane.destination === "Cincinnati, OH" && r.lane.kind === "order").weeks[2];
  assert.equal(cell.zone, "yellow");                       // 42 vs 35 = +20%
  assert.deepEqual(cell.action, { kind: "more", trucks: 7 });

  items = [o, ask("order", "Cincinnati, OH", "2026-11-19", 7, "yes", 7)];
  a = E.allocate(items, NOW).get(o.id);
  assert.deepEqual([a.contract, a.spot], [10, 0]);
  assert.equal(E.checks(items, o, NOW).logistics.ok, true);
  assert.equal(E.suggestAnswer(items, o, NOW).kind, "confirm");
});

test("partial carrier answer covers only what it accepted", () => {
  const o = order("Cincinnati, OH", 10, "2026-11-19");
  const a = E.allocate([o, ask("order", "Cincinnati, OH", "2026-11-19", 7, "part", 4)], NOW).get(o.id);
  assert.deepEqual([a.contract, a.spot], [7, 3]);
});

test("an open ask or a 'no' adds nothing", () => {
  const o = order("Cincinnati, OH", 10, "2026-11-19");
  for (const status of ["asked", "no"]) {
    const a = E.allocate([o, ask("order", "Cincinnati, OH", "2026-11-19", 7, status)], NOW).get(o.id);
    assert.equal(a.contract, 3);
  }
});

test("transfer waves: same 12 trucks, all-at-once vs. 3 weeks", () => {
  const got = (pattern) => {
    const tr = transfer("Mississauga, ON", 12, "2026-11-09", pattern);
    const a = E.allocate([tr], NOW).get(tr.id);
    return [a.contract, a.spot];
  };
  assert.deepEqual(got("day"), [3, 9]);  // ~3 a day is all a carrier can add on one day
  assert.deepEqual(got("w3"), [12, 0]);
  const old = E.totals([transfer("Mississauga, ON", 12, "2026-11-09", "w3")], NOW, { oldWay: true });
  assert.equal(old.spot, 9);             // the old way ships it as one batch
});

test("under 3 days and not booked: all spot, and no carrier ask offered", () => {
  const o = order("Columbus, OH", 2, "2026-11-07");
  const a = E.allocate([o], NOW).get(o.id);
  assert.equal(a.spot, 2);
  assert.deepEqual(a.reasons, ["late"]);
  assert.equal(a.days.reduce((s, d) => s + d.capSpot, 0), 0);
});

test("booked with enough notice keeps its contract trucks even close to the date", () => {
  const o = order("Cincinnati, OH", 2, "2026-11-07", "confirmed", { booked_at: "2026-11-01T15:00:00Z" }); // room 2 that week
  const a = E.allocate([o], "2026-11-06").get(o.id);
  assert.equal(a.contract, 2);
});

test("a cut frees trucks for the next order that week", () => {
  // Columbus (customer) week of Nov 15: plan 30, forecast 27, room 3.
  const before = order("Columbus, OH", 5, "2026-11-18");
  assert.equal(E.allocate([before], NOW).get(before.id).contract, 3);
  const cut = order("Columbus, OH", -4, "2026-11-17", "confirmed", { booked_at: "2026-11-05T15:00:00Z" });
  const after = order("Columbus, OH", 5, "2026-11-18");
  assert.equal(E.allocate([cut, after], NOW).get(after.id).contract, 5);
});

test("orders from stock need no production", () => {
  const o = order("Cincinnati, OH", 2, "2026-11-19");
  const c = E.checks([o], o, NOW);
  assert.equal(c.production.title, "No production change");
});

test("repeated small changes add up against the flex band", () => {
  const a1 = order("Cincinnati, OH", 2, "2026-11-18");
  const a2 = order("Cincinnati, OH", 2, "2026-11-19");
  assert.equal(E.checks([a1, a2], a1, NOW).sales.ok, true);  // +2 within ±3
  assert.equal(E.checks([a1, a2], a2, NOW).sales.ok, false); // +4 cumulative
});

test("an offered new date holds trucks at the new date", () => {
  const o = order("Cincinnati, OH", 3, "2026-11-19", "offered", { answer: { kind: "new_date", date: "2026-11-26" } });
  assert.equal(E.allocate([o], NOW).get(o.id).date, "2026-11-26");
  assert.equal(E.dateOf({ ...o, status: "waiting" }), "2026-11-19");
});

test("money: contract customer truck keeps $3,100; spot loses the premium", () => {
  const lane = E.laneOf("order", "Downey, CA");
  const m = E.splitMoney(lane, 1, 1);
  assert.equal(m.profit, 3100 + 3100 - lane.spot_premium);
  assert.equal(m.overspend, lane.spot_premium);
});

test("baseline outlook: only the two designed dips are flagged", () => {
  const flagged = E.outlook([], NOW).flatMap((r) => r.weeks.filter((w) => w.zone !== "green").map((w) => `${r.lane.destination}@${w.wk}`));
  assert.deepEqual(flagged, ["Cincinnati, OH@4", "Mississauga, ON@1", "Mississauga, ON@2", "Mississauga, ON@3"]);
});

test("the judge's order gets a better-date offer before any carrier ask", () => {
  const o = order("Cincinnati, OH", 10, "2026-11-19");
  const s = E.suggestAnswer([o], o, NOW);
  assert.equal(s.kind, "new_date");
  assert.ok(s.date >= "2026-11-29" && s.date <= "2026-12-03");
  assert.equal(s.gain, 2 * 462); // 5 on contract (one-day limit) instead of 3
});
