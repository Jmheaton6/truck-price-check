// Run: node --test tests/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../engine.js";

const NOW = "2026-11-05"; // competition day (Thursday). Week 0 = Nov 1–7.
const AT = "2026-11-05T15:00:00Z";
let t = 0;
const ts = () => new Date(Date.UTC(2026, 10, 5, 15, t++)).toISOString();
const po = (customer, trucks, date, status = "waiting", extra = {}) =>
  ({ id: "o" + t, type: "order", status, created_at: ts(), data: { kind: "po", customer, trucks, date, signoffs: {}, ...extra } });
const change = (parent, trucks, status = "waiting", extra = {}) =>
  ({ id: "c" + t, type: "order", status, created_at: ts(), data: { kind: "change", parent: parent.id, customer: parent.data.customer, trucks, date: parent.data.date, signoffs: {}, ...extra } });
const transfer = (destination, trucks, date, pattern, extra = {}) =>
  ({ id: "t" + t, type: "transfer", status: "booked", created_at: ts(), data: { destination, trucks, date, pattern, ...extra } });
const allAccept = (items, it) => {
  let cur = it;
  for (const team of E.TEAMS) { const u = E.decide(items, cur, team, true, AT, NOW); cur = { ...cur, status: u.status, data: u.data }; }
  return cur;
};
const cin = () => E.laneOf("order", "Cincinnati, OH");

test("lane numbers: 2026 averages; customer lanes sized for their forecast", () => {
  assert.equal(cin().perWeek, 35); // 1,048 loads / 30.3 weeks
  assert.equal(E.bookedTrucks(cin(), 2), 25); // 35 a week minus Customer A's forecast of 10
  assert.equal(E.bookedTrucks(E.laneOf("transfer", "Mississauga, ON"), 1), 10);
});

test("demo 1: the judge's PO passes every check; four accepts confirm it", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19");
  const c = E.checks([p], p, NOW);
  assert.deepEqual(E.TEAMS.map((x) => c[x].ok), [true, true, true, true]);
  assert.deepEqual([c.alloc.contract, c.alloc.spot], [10, 0]);
  const done = allAccept([p], p);
  assert.equal(E.stageOf(done), "accepted");
  assert.equal(done.data.decided_at, AT);
});

test("demo 2: a +4 change fails three checks; one deny stops it; a better date passes", () => {
  const p = po("Cincinnati, OH", 10, "2026-11-19", "confirmed", { booked: { "2026-11-19": AT } });
  const ch = change(p, 4);
  const items = [p, ch];
  const c = E.checks(items, ch, NOW);
  assert.deepEqual([c.sales.ok, c.inventory.ok, c.production.ok, c.logistics.ok], [false, true, false, false]);
  const u = E.decide(items, ch, "production", false, AT, NOW);
  assert.equal(u.status, "declined");
  assert.deepEqual(u.data.denied, { team: "production", why: "Short 4 of line time" });
  const better = E.betterDate(items, ch, NOW);
  assert.equal(better.date, "2026-11-22");
});

test("answers can change until the trucks are booked", () => {
  const p = po("Cincinnati, OH", 2, "2026-11-19");
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

test("transfers: same 12 trucks, one day vs. 3 weeks", () => {
  const got = (pattern) => { const tr = transfer("Mississauga, ON", 12, "2026-11-09", pattern); const a = E.allocate([tr], NOW).get(tr.id); return [a.contract, a.spot]; };
  assert.deepEqual(got("day"), [3, 9]);  // a carrier adds ~1/7 of its week on any one day
  assert.deepEqual(got("w3"), [12, 0]);
});

test("not booked 3 days ahead: spot", () => {
  const p = po("Columbus, OH", 2, "2026-11-07", "confirmed");
  const a = E.allocate([p], NOW).get(p.id);
  assert.equal(a.spot, 2);
  assert.equal(a.fixable, 0);
});

test("the carrier adds trucks with 7+ days' notice, not less", () => {
  assert.equal(E.carrierAnswer([], cin(), "2026-11-19", 5, NOW).status, "yes");
  assert.equal(E.carrierAnswer([], cin(), "2026-11-10", 5, NOW).status, "no");
  assert.equal(E.carrierAnswer([], cin(), "2026-11-19", 20, NOW).status, "part"); // max 9 (25% of 35)
});

test("calendar: accepted trucks to book; checking ones shown apart", () => {
  const a = allAccept([], po("Cincinnati, OH", 10, "2026-11-19"));
  const b = po("Cincinnati, OH", 1, "2026-11-20");
  const tr = transfer("Mississauga, ON", 12, "2026-11-09", "w3");
  const cal = E.calendar([a, b, tr], NOW, 2);
  const row = cal.find((r) => r.lane === cin());
  assert.deepEqual([row.cells[4].contract, row.cells[4].toBook, row.cells[5].checking], [10, 10, 1]);
  const list = E.toBook([a, b, tr], NOW);
  assert.equal(list[0].lane.destination, "Mississauga, ON");
  assert.equal(list[0].bookBy, "2026-11-06");
  assert.equal(list.reduce((s, x) => s + x.contract + x.spot, 0), 22);
});

test("savings vs. the old way: denied change and transfer waves", () => {
  const p = allAccept([], po("Cincinnati, OH", 10, "2026-11-19"));
  const ch = { ...change(p, 4), status: "declined" };
  const retry = allAccept([p, ch], { ...change(p, 4, "waiting", { date: "2026-11-22", retry_of: ch.id }) });
  const tr = transfer("Mississauga, ON", 12, "2026-11-09", "w3");
  const items = [p, ch, retry, tr];
  const now = E.totals(items, NOW), old = E.totals(items, NOW, { oldWay: true });
  assert.deepEqual([now.trucks, now.spot], [26, 0]);
  assert.deepEqual([old.trucks, old.spot], [26, 13]);   // +4 on Nov 19 all spot, transfer 9 spot
  const by = E.savingsBy(items, NOW);
  assert.equal(by.checkoff, 4 * cin().spot_premium);   // the denied +4 would have gone spot
  assert.equal(by.transfers, 9 * E.laneOf("transfer", "Mississauga, ON").spot_premium);
  assert.equal(by.carrier, 0);
});

test("cuts free trucks; a cut inside the freeze strands cans", () => {
  const base = po("Columbus, OH", 6, "2026-11-17", "confirmed");
  const after = po("Columbus, OH", 4, "2026-11-18");
  assert.equal(E.allocate([base, after], NOW).get(after.id).contract, 0);   // 6 forecast, all used
  const cut = change(base, -4, "confirmed");
  const a = E.allocate([base, cut, after], NOW);
  assert.equal(a.get(base.id).trucks, 2);          // the cut shrinks the order itself
  assert.equal(a.get(after.id).contract, 4);
  const row = E.calendar([base, cut, after], NOW, 2).find((r) => r.lane.destination === "Columbus, OH" && r.lane.kind === "order");
  assert.equal(row.open, 0);                        // 6 forecast room: 2 + 4 claimed
  const near = po("Cincinnati, OH", 4, "2026-11-08", "confirmed");
  const nearCut = change(near, -2);
  assert.equal(E.checks([near, nearCut], nearCut, NOW).inventory.ok, false);
});

test("scorecards", () => {
  const p = allAccept([], po("Cincinnati, OH", 10, "2026-11-19"));
  const booked = { ...p, data: { ...p.data, booked: { "2026-11-19": AT } } };
  const s = E.scorecards([booked], NOW);
  assert.equal(s.production.used, 8);         // 2 from stock, 8 made
  assert.equal(s.logistics.spotShare, 0);
  assert.equal(s.logistics.ahead, 1);
  assert.equal(s.inventory.stranded, 0);
});

test("PO numbers follow arrival order; a change shows its PO's number", () => {
  const a = po("Cincinnati, OH", 2, "2026-11-19"), b = po("Columbus, OH", 2, "2026-11-19"), ch = change(a, 1);
  assert.deepEqual([a, b, ch].map((x) => E.poNumber([a, b, ch], x)), ["PO-1001", "PO-1002", "PO-1001"]);
});

// ---------- Forecast early warning ----------
const fcast = (customer, week, trucks, on = NOW) => ({ id: "f" + t, type: "forecast", status: "noted", created_at: ts(), data: { customer, week, trucks, on } });
const ask = (lane, week, trucks, status, accepted) => ({ id: "a" + t, type: "ask", status, created_at: ts(), data: { kind: lane.kind, destination: lane.destination, week, date: week, trucks, accepted } });
const wkOf = (items, customer, wk) => E.outlook(items, NOW).find((r) => r.customer === customer).weeks[wk];

test("forecast zones: 10% / 25% bands, and a zero baseline is new demand", () => {
  assert.equal(E.zoneOf(10, 11), "G");
  assert.equal(E.zoneOf(10, 12), "Y");
  assert.equal(E.zoneOf(8, 14), "R");
  assert.equal(E.zoneOf(8, 4), "R");
  assert.equal(E.zoneOf(0, 3), "N");
  assert.equal(E.zoneOf(0, 0), "G");
});

test("versions: the baseline stays, the latest wins, history is kept", () => {
  const items = [fcast("Cincinnati, OH", "2026-11-22", 12), fcast("Cincinnati, OH", "2026-11-22", 14)];
  const v = E.forecastVersions(items, "Cincinnati, OH", 3, NOW);
  assert.deepEqual(v.map((x) => x.trucks), [8, 12, 14]);
  const w = wkOf(items, "Cincinnati, OH", 3);
  assert.deepEqual([w.base, w.latest, w.change, w.zone, w.gap], [8, 14, 6, "R", 6]);
});

test("a steady forecast can still have an uncovered truck (orders above forecast)", () => {
  const p = po("Cincinnati, OH", 9, "2026-11-25", "confirmed"); // forecast 8, ordered 9
  const w = wkOf([p], "Cincinnati, OH", 3);
  assert.equal(w.zone, "G");
  assert.equal(w.gap, 1);
  assert.equal(E.warnings([p], NOW)[0].n, 1);
});

test("orders consume the forecast: need is the larger, not the sum", () => {
  const items = [fcast("Cincinnati, OH", "2026-11-22", 12), po("Cincinnati, OH", 14, "2026-11-25", "confirmed")];
  const w = wkOf(items, "Cincinnati, OH", 3);
  assert.deepEqual([w.ordered, w.left, w.need], [14, 0, 14]);
});

test("early warning → carrier yes covers the gap; a partial yes covers only what it accepted", () => {
  const lane = cin();
  const f = fcast("Cincinnati, OH", "2026-11-22", 14);
  const ans = E.carrierAnswer([f], lane, "2026-11-22", 6, NOW);
  assert.deepEqual([ans.status, ans.accepted], ["yes", 6]); // 17 days' notice, cap 9
  assert.equal(wkOf([f, ask(lane, "2026-11-22", 6, "yes", 6)], "Cincinnati, OH", 3).gap, 0);
  assert.equal(wkOf([f, ask(lane, "2026-11-22", 6, "part", 4)], "Cincinnati, OH", 3).gap, 2);
  // Under 7 days, the carrier can't add trucks.
  assert.equal(E.carrierAnswer([f], lane, "2026-11-08", 6, NOW).status, "no");
});

test("demand drops: trucks no one needs show up, and releasing them clears it", () => {
  const lane = cin();
  const f = fcast("Cincinnati, OH", "2026-11-22", 4);
  const warn = E.warnings([f], NOW);
  assert.deepEqual([warn[0].kind, warn[0].n], ["down", 4]);
  const items = [f, ask(lane, "2026-11-22", -4, "yes", -4)];
  assert.equal(E.warnings(items, NOW).length, 0);
  assert.equal(wkOf(items, "Cincinnati, OH", 3).cover, 4);
});

test("the same PO with and without the warning (Nov 25, 14 truckloads)", () => {
  const lane = cin();
  const cold = po("Cincinnati, OH", 14, "2026-11-25");
  const c1 = E.checks([cold], cold, NOW);
  assert.deepEqual(E.TEAMS.map((x) => c1[x].ok), [false, true, false, false]); // over forecast, short line time, 6 spot
  const f = fcast("Cincinnati, OH", "2026-11-22", 14);
  const a = ask(lane, "2026-11-22", 6, "yes", 6);
  const warm = po("Cincinnati, OH", 14, "2026-11-25");
  const c2 = E.checks([f, a, warm], warm, NOW);
  assert.deepEqual(E.TEAMS.map((x) => c2[x].ok), [true, true, true, true]);
  assert.equal(c2.alloc.spot, 0);
  // Told too late for Production to plan (under 2 weeks before the week): line time stays short.
  const late = fcast("Cincinnati, OH", "2026-11-22", 14, "2026-11-12");
  assert.equal(E.plannedLine([late], 3, NOW), 0);
});
