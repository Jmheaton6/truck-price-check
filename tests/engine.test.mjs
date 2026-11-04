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
const fc = (customer, weeks) => ({ id: "f" + t, type: "forecast", status: "shared", created_at: ts(), data: { customer, weeks } });
const cin = () => E.laneOf("order", "Cincinnati, OH");

test("lane numbers: 2026 averages; customer lanes are sized for their outlook", () => {
  assert.equal(cin().perWeek, 35); // 1,048 loads / 30.3 weeks
  assert.equal(E.bookedTrucks(cin(), 2), 25); // 35 a week minus Customer A's outlook of 10
  assert.equal(E.bookedTrucks(E.laneOf("transfer", "Mississauga, ON"), 1), 10); // simulated dip
});

test("demo part 1: the judge's PO fits the flex band and is confirmed instantly", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19");
  const c = E.checks([p], p, NOW);
  assert.deepEqual([c.sales.ok, c.inventory.ok, c.production.ok, c.logistics.ok], [true, true, true, true]);
  assert.deepEqual([c.alloc.contract, c.alloc.spot], [10, 0]);
  const au = E.autoApprove([p], p, NOW);
  assert.equal(au.tier, "Priority");      // Customer A: 94% within band
  assert.equal(au.ok, true);
});

test("demo part 2: a +4 late change fails three checks and gets a counteroffer date", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19", "confirmed", { scheduled_at: "2026-11-05T16:00:00Z" });
  const ch = change(p, 4);
  const items = [p, ch];
  const c = E.checks(items, ch, NOW);
  assert.equal(c.sales.ok, false);       // 14 vs. outlook 10, band ±1
  assert.equal(c.production.ok, false);  // that week's line time is used up
  assert.equal(c.logistics.ok, false);   // 4 would go spot
  assert.equal(E.autoApprove(items, ch, NOW).ok, false);
  const better = E.betterDate(items, ch, NOW);
  assert.equal(better.date, "2026-11-22");
  assert.equal(better.alloc.spot, 0);
});

test("demo part 3: an outlook shared early turns into trucks before the PO arrives", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19", "confirmed", { scheduled_at: "2026-11-05T16:00:00Z" });
  const f = fc("Cincinnati, OH", { "2026-11-22": 14 });  // promo: 14 instead of 8
  let items = [p, f];
  const wk = E.outlook(items, NOW).find((r) => r.lane === cin()).weeks[3];
  assert.equal(wk.needed, 41);
  assert.deepEqual(wk.action, { kind: "more", trucks: 6 });
  assert.equal(E.lineTime(items, NOW)[3], 16);          // shared 17 days ahead: Production plans it in
  const a = ask(items, { ...po("Cincinnati, OH", 6, "2026-11-25"), id: null }, 6);
  assert.equal(a.status, "yes");
  items = [...items, a];
  const later = po("Cincinnati, OH", 14, "2026-11-25");
  items.push(later);
  assert.equal(E.autoApprove(items, later, NOW).ok, true);
  // The same PO with no outlook and no carrier ask
  const cold = po("Cincinnati, OH", 14, "2026-11-25");
  const c = E.checks([p, cold], cold, NOW);
  assert.deepEqual([c.sales.ok, c.production.ok, c.logistics.ok, c.alloc.spot], [false, false, false, 6]);
});

test("reliability moves with each order; Standard customers always go to review", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19");
  const ch = change(p, 4);
  const r = E.reliability([p, ch], "Cincinnati, OH", NOW);
  assert.deepEqual([r.orders, r.inBand, r.changes], [2, 1, 1]);
  assert.ok(Math.abs(r.score - (0.94 * 30 + 1) / 32) < 1e-9);
  const b = po("Columbus, OH", 5, "2026-11-18");
  const au = E.autoApprove([b], b, NOW);
  assert.equal(au.tier, "Standard");
  assert.equal(au.ok, false);
  assert.equal(au.failed.length, 0);   // every check passes, but Customer B isn't Priority
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
  const p = po("Cincinnati, OH", 2, "2026-11-07", "confirmed", { scheduled_at: "2026-11-01T15:00:00Z" }); // 8 left that week
  assert.equal(E.allocate([p], "2026-11-06").get(p.id).contract, 2);
});

test("a cut frees trucks for the next PO that week", () => {
  // Columbus (customer) week of Nov 15: 30 contract trucks, 24 for other business, 6 left.
  const before = po("Columbus, OH", 8, "2026-11-18");
  assert.equal(E.allocate([before], NOW).get(before.id).contract, 6);
  const base = po("Columbus, OH", 6, "2026-11-17", "confirmed", { scheduled_at: "2026-11-05T15:00:00Z" });
  const cut = change(base, -4, "confirmed");
  const after = po("Columbus, OH", 8, "2026-11-18");
  // 6 left − 6 for the first PO + 4 freed by the cut = 4
  assert.equal(E.allocate([base, cut, after], NOW).get(after.id).contract, 4);
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

test("teams can change answers: forwards to accepted, backwards to review, locked once booked", () => {
  const who = (team) => ({ name: "Pat", team });
  let p = po("Cincinnati, OH", 2, "2026-11-19");
  const step = (team, ok) => { const u = E.applySign(p, team, ok, who(team), ts()); if (u) p = { ...p, status: u.status, data: u.data }; return u; };
  for (const t of ["sales", "inventory", "production"]) step(t, true);
  assert.equal(E.stageOf(p), "review");
  step("logistics", true);
  assert.equal(E.stageOf(p), "accepted");            // the fourth Approve accepts it
  assert.equal(step("logistics", true), null);       // same answer again: nothing to save
  step("production", false);
  assert.equal(E.stageOf(p), "review");              // a new Reject sends it back
  assert.equal(p.data.answer, null);
  step("production", true);
  assert.equal(E.stageOf(p), "accepted");            // and it can come forward again
  assert.ok(p.data.log.some((e) => e.ev.startsWith("Back in review")));
  p = { ...p, data: { ...p.data, scheduled_at: ts() } };
  assert.equal(E.stageOf(p), "booked");
  assert.equal(step("sales", false), null);          // locked once trucks are booked
});

test("the history log keeps the first entry and the latest ones", () => {
  let d = {};
  for (let i = 0; i < 40; i++) d = E.withLog(d, { ev: "e" + i });
  assert.equal(d.log.length, E.LOG_MAX);
  assert.equal(d.log[0].ev, "e0");
  assert.equal(d.log.at(-1).ev, "e39");
});

test("money: a contract customer truck keeps $3,100; spot loses the premium", () => {
  const lane = E.laneOf("order", "Downey, CA");
  const m = E.splitMoney(lane, 1, 1);
  assert.equal(m.profit, 3100 + 3100 - lane.spot_premium);
  assert.equal(m.overspend, lane.spot_premium);
});

test("baseline outlook: customer lanes on plan; only the Mississauga dip is flagged", () => {
  const flagged = E.outlook([], NOW).flatMap((r) => r.weeks.filter((w) => w.zone !== "green").map((w) => `${r.lane.destination}@${w.wk}`));
  assert.deepEqual(flagged, ["Mississauga, ON@1", "Mississauga, ON@2", "Mississauga, ON@3"]);
});

test("KPIs: days of warning count from the outlook, not just the PO", () => {
  const f = fc("Cincinnati, OH", { "2026-11-22": 14 });
  const p = po("Cincinnati, OH", 14, "2026-11-25", "confirmed", { scheduled_at: "2026-11-05T16:00:00Z" });
  const k = E.kpis([f, p], NOW);
  assert.equal(k.warningDays, 20);
  assert.equal(k.bookedAhead, 1);
});
