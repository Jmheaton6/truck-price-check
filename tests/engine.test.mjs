// Run: node --test tests/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../engine.js";

const NOW = "2026-11-05"; // competition day (Thursday). Week 0 = Nov 1–7.
let t = 0;
const ts = () => new Date(Date.UTC(2026, 10, 5, 15, t++)).toISOString();
const po = (customer, trucks, date, status = "waiting", extra = {}) =>
  ({ id: "o" + t, type: "order", status, created_at: ts(), data: { kind: "po", customer, trucks, date, signoffs: {}, ...extra } });
const change = (parent, trucks, status = "waiting", extra = {}) =>
  ({ id: "c" + t, type: "order", status, created_at: ts(), data: { kind: "change", parent: parent.id, customer: parent.data.customer, trucks, date: parent.data.date, signoffs: {}, ...extra } });
const transfer = (destination, trucks, date, pattern) =>
  ({ id: "t" + t, type: "transfer", status: "booked", created_at: ts(), data: { destination, trucks, date, pattern, booked_at: "2026-11-05T15:00:00Z" } });
// Simulates Logistics asking the carrier (the answer comes from the engine's carrier rule).
const ask = (items, it, trucks) => {
  const lane = E.itemLane(it), date = E.dateOf(it);
  const ans = E.carrierAnswer(items, lane, date, trucks, NOW);
  return { id: "a" + t, type: "ask", status: ans.status, created_at: ts(), data: { kind: lane.kind, destination: lane.destination, week: E.weekKey(date), date, trucks, accepted: ans.accepted, for: it.id } };
};
const cin = () => E.laneOf("order", "Cincinnati, OH");

test("lane numbers come from 2026 averages", () => {
  assert.equal(cin().perWeek, 35); // 1,048 loads / 30.3 weeks
  assert.equal(cin().perDay, 5);
  assert.equal(E.bookedTrucks(cin(), 2), 32); // simulated: already booked that week
});

test("demo part 1: the judge's PO, then the carrier ask, then every check passes", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19");
  let items = [p];
  let c = E.checks(items, p, NOW);
  assert.equal(c.sales.ok, true);       // 10 = their forecast of 10
  assert.equal(c.inventory.ok, true);   // 2 from stock
  assert.equal(c.production.ok, true);  // 8 to make, 8 open
  assert.equal(c.logistics.ok, false);  // only 3 contract trucks left
  assert.deepEqual([c.alloc.contract, c.alloc.spot, c.alloc.capSpot], [3, 7, 7]);

  const a = ask(items, p, 7);
  assert.equal(a.status, "yes");        // 14 days' notice, 7 ≤ 25% of 35
  items = [p, a];
  c = E.checks(items, p, NOW);
  assert.equal(c.logistics.ok, true);
  assert.deepEqual([c.alloc.contract, c.alloc.spot], [10, 0]);
});

test("demo part 2: a +4 change fails three checks and gets a counteroffer date", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19", "confirmed", { scheduled_at: "2026-11-05T16:00:00Z" });
  const a = ask([p], p, 7);
  const ch = change(p, 4);
  const items = [p, a, ch];
  const c = E.checks(items, ch, NOW);
  assert.equal(c.sales.ok, false);       // 14 vs. forecast 10, band ±1
  assert.equal(c.production.ok, false);  // that week's line time is used up
  assert.equal(c.logistics.ok, false);   // no contract trucks left
  const more = ask(items, ch, c.alloc.capSpot);
  assert.equal(more.status, "part");     // carrier can only add 2 more (9 max that week)
  assert.equal(more.data.accepted, 2);
  const better = E.betterDate(items, ch, NOW);
  assert.ok(better.date >= "2026-11-29" && better.date <= "2026-12-03");
  assert.equal(better.alloc.spot, 0);
});

test("the carrier says no with under 7 days' notice", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-10");
  assert.equal(ask([p], p, 7).status, "no");
});

test("review counts sign-offs; all four approvals = accepted", () => {
  const p = po("Cincinnati, OH", 2, "2026-11-19", "waiting", { signoffs: { sales: { ok: true }, inventory: { ok: true }, production: { ok: false } } });
  const r = E.review([p], p, NOW);
  assert.equal(r.approved, 2);
  assert.deepEqual(r.refused, ["production"]);
  assert.equal(r.allApproved, false);
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

test("under 3 days and not booked: all spot, nothing to ask the carrier for", () => {
  const p = po("Columbus, OH", 2, "2026-11-07");
  const a = E.allocate([p], NOW).get(p.id);
  assert.equal(a.spot, 2);
  assert.deepEqual(a.reasons, ["late"]);
  assert.equal(a.capSpot, 0);
});

test("booked with enough notice keeps its contract trucks", () => {
  const p = po("Cincinnati, OH", 2, "2026-11-07", "confirmed", { scheduled_at: "2026-11-01T15:00:00Z" }); // 2 left that week
  assert.equal(E.allocate([p], "2026-11-06").get(p.id).contract, 2);
});

test("a cut frees trucks for the next PO that week", () => {
  // Columbus (customer) week of Nov 15: 30 contract trucks, 27 booked, 3 left.
  const before = po("Columbus, OH", 5, "2026-11-18");
  assert.equal(E.allocate([before], NOW).get(before.id).contract, 3);
  const base = po("Columbus, OH", 6, "2026-11-17", "confirmed", { scheduled_at: "2026-11-05T15:00:00Z" });
  const cut = change(base, -4, "confirmed");
  const after = po("Columbus, OH", 5, "2026-11-18");
  // 3 left + 4 freed = 7; the first PO takes 5 (one-day limit), so 2 are left
  assert.equal(E.allocate([base, cut, after], NOW).get(after.id).contract, 2);
});

test("a cut inside the freeze strands labeled cans (Inventory says no)", () => {
  const base = po("Cincinnati, OH", 4, "2026-11-08", "confirmed");
  const cut = change(base, -2);
  assert.equal(E.checks([base, cut], cut, NOW).inventory.ok, false);
});

test("PO numbers follow arrival order; a change shows its PO's number", () => {
  const a = po("Cincinnati, OH", 2, "2026-11-19");
  const b = po("Columbus, OH", 2, "2026-11-19");
  const ch = change(a, 1);
  const items = [a, b, ch];
  assert.equal(E.poNumber(items, a), "PO-1001");
  assert.equal(E.poNumber(items, b), "PO-1002");
  assert.equal(E.poNumber(items, ch), "PO-1001");
});

test("money: a contract customer truck keeps $3,100; spot loses the premium", () => {
  const lane = E.laneOf("order", "Downey, CA");
  const m = E.splitMoney(lane, 1, 1);
  assert.equal(m.profit, 3100 + 3100 - lane.spot_premium);
  assert.equal(m.overspend, lane.spot_premium);
});

test("baseline outlook: only the two designed dips are flagged", () => {
  const flagged = E.outlook([], NOW).flatMap((r) => r.weeks.filter((w) => w.zone !== "green").map((w) => `${r.lane.destination}@${w.wk}`));
  assert.deepEqual(flagged, ["Cincinnati, OH@4", "Mississauga, ON@1", "Mississauga, ON@2", "Mississauga, ON@3"]);
});
