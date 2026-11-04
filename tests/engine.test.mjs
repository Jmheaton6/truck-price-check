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
  assert.deepEqual([c.sales.ok, c.inventory.ok, c.production.ok, c.logistics.ok], [false, true, false, true]); // 14 days out: trucks are fine
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

test("3-day rule: booked 3+ days ahead is contract, however many trucks; inside 3 days, spot", () => {
  const tr = transfer("Mississauga, ON", 40, "2026-11-09");
  assert.deepEqual(((a) => [a.contract, a.spot])(E.allocate([tr], NOW).get(tr.id)), [40, 0]);
  const late = transfer("Mississauga, ON", 12, "2026-11-07");
  assert.deepEqual(((a) => [a.contract, a.spot])(E.allocate([late], NOW).get(late.id)), [0, 12]);
  const nextDay = po("Cincinnati, OH", 10, "2026-11-06", "confirmed"); // Joe's test: a PO for tomorrow
  assert.deepEqual(((a) => [a.contract, a.spot])(E.allocate([nextDay], NOW).get(nextDay.id)), [0, 10]);
});

test("booking date counts: booked 1 day ahead is spot, booked 15 days ahead is contract", () => {
  const mk = (bookedOn) => { const x = po("Columbus, OH", 3, "2026-11-20", "confirmed"); return { ...x, data: { ...x.data, booked: { "2026-11-20": bookedOn + "T12:00:00" } } }; };
  const late = mk("2026-11-19"), early = mk("2026-11-05");
  assert.equal(E.allocate([late], NOW).get(late.id).spot, 3);
  assert.equal(E.allocate([early], NOW).get(early.id).spot, 0);
});

test("a late order rides only trucks Logistics pre-booked", () => {
  const later = "2026-11-30"; // rehearse a later day: Coca-Cola orders 14 for Dec 1
  const order = po("Cincinnati, OH", 14, "2026-12-01", "confirmed");
  const pre = (n) => ({ id: "pb" + n, type: "ask", status: "yes", created_at: ts(), data: { kind: "order", destination: "Cincinnati, OH", week: "2026-11-29", date: "2026-11-29", trucks: n, accepted: n, on: NOW } });
  const got = (items) => ((a) => [a.contract, a.spot])(E.allocate(items, later).get(order.id));
  assert.deepEqual(got([order]), [0, 14]);
  assert.deepEqual(got([pre(14), order]), [14, 0]);
  assert.deepEqual(got([pre(6), order]), [6, 8]);
});

test("calendar: accepted trucks to book; checking ones shown apart", () => {
  const a = allAccept([], po("Cincinnati, OH", 10, "2026-11-19"));
  const b = po("Cincinnati, OH", 1, "2026-11-20");
  const tr = transfer("Mississauga, ON", 12, "2026-11-09");
  const cal = E.calendar([a, b, tr], NOW, 2);
  const row = cal.find((r) => r.lane === cin());
  assert.deepEqual([row.cells[4].contract, row.cells[4].toBook, row.cells[5].checking], [10, 10, 1]);
  const list = E.toBook([a, b, tr], NOW);
  assert.equal(list[0].lane.destination, "Mississauga, ON");
  assert.equal(list[0].bookBy, "2026-11-06");
  assert.equal(list.reduce((s, x) => s + x.contract + x.spot, 0), 22);
});

test("savings: old way = each lane's 2026 spot rate on the same freight, plus denied orders shipped anyway", () => {
  const p = allAccept([], po("Cincinnati, OH", 10, "2026-11-19"));
  const ch = { ...change(p, 4), status: "declined" };
  const retry = allAccept([p, ch], { ...change(p, 4, "waiting", { date: "2026-11-22", retry_of: ch.id }) });
  const tr = transfer("Mississauga, ON", 12, "2026-11-09");
  const items = [p, ch, retry, tr];
  const now = E.totals(items, NOW), old = E.oldWay(items);
  const mis = E.laneOf("transfer", "Mississauga, ON");
  assert.deepEqual([now.trucks, now.spot], [26, 0]);
  assert.equal(old.trucks, 26);                                  // 10 + the denied 4 + 12; the retry isn't counted twice
  assert.ok(Math.abs(old.spot - (14 * cin().spot_share + 12 * mis.spot_share)) < 1e-9);
  const by = E.savingsBy(items, NOW);
  assert.ok(Math.abs(by.orders - 14 * cin().spot_share * cin().spot_premium) < 1e-6);
  assert.ok(Math.abs(by.orders + by.transfers - (old.overspend - now.overspend)) < 1e-6);
});

test("cuts free trucks; a cut inside the freeze strands cans", () => {
  const base = po("Columbus, OH", 6, "2026-11-17", "confirmed");
  const after = po("Columbus, OH", 4, "2026-11-18");
  const cut = change(base, -4, "confirmed");
  const a = E.allocate([base, cut, after], NOW);
  assert.equal(a.get(base.id).trucks, 2);          // the cut shrinks the order itself
  assert.equal(a.get(after.id).contract, 4);
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
const ask = (lane, week, trucks) => ({ id: "a" + t, type: "ask", status: "yes", created_at: ts(), data: { kind: lane.kind, destination: lane.destination, week, date: week, trucks, accepted: trucks, on: NOW } });
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
  assert.deepEqual([w.base, w.latest, w.change, w.zone, w.gap], [8, 14, 6, "R", 14]); // nothing pre-booked yet
});

test("forecast trucks with nothing booked are open; a small change still shows up", () => {
  const f = fcast("Cincinnati, OH", "2026-11-15", 11); // plan 10 → 11: +10%, green
  const w = wkOf([f], "Cincinnati, OH", 2);
  assert.deepEqual([w.zone, w.gap], ["G", 11]);
  assert.equal(E.warnings([f], NOW).find((x) => x.customer === "Cincinnati, OH" && x.wk === 2).n, 11); // book by Nov 12: within a week
  assert.equal(E.warnings([], NOW).some((x) => x.wk === 4), false);  // far-off steady weeks wait
});

test("orders consume the forecast: need is the larger, not the sum", () => {
  const items = [fcast("Cincinnati, OH", "2026-11-22", 12), po("Cincinnati, OH", 14, "2026-11-25", "confirmed")];
  const w = wkOf(items, "Cincinnati, OH", 3);
  assert.deepEqual([w.ordered, w.left, w.need], [14, 0, 14]);
});

test("early warning → pre-book the open trucks; an order booked ahead also covers its week", () => {
  const lane = cin();
  const f = fcast("Cincinnati, OH", "2026-11-22", 14);
  assert.equal(wkOf([f], "Cincinnati, OH", 3).gap, 14);
  assert.equal(wkOf([f, ask(lane, "2026-11-22", 14)], "Cincinnati, OH", 3).gap, 0);
  assert.equal(wkOf([f, ask(lane, "2026-11-22", 10)], "Cincinnati, OH", 3).gap, 4);
  assert.equal(wkOf([f, po("Cincinnati, OH", 14, "2026-11-25", "confirmed")], "Cincinnati, OH", 3).gap, 0);
});

test("demand drops after pre-booking: extra trucks show up, and releasing them clears it", () => {
  const lane = cin();
  const items = [ask(lane, "2026-11-22", 8), fcast("Cincinnati, OH", "2026-11-22", 4)];
  const warn = E.warnings(items, NOW).find((x) => x.customer === "Cincinnati, OH" && x.wk === 3);
  assert.deepEqual([warn.kind, warn.n], ["down", 4]);
  const after = [...items, ask(lane, "2026-11-22", -4)];
  assert.equal(E.warnings(after, NOW).some((x) => x.customer === "Cincinnati, OH" && x.wk === 3), false);
  assert.equal(wkOf(after, "Cincinnati, OH", 3).cover, 4);
});

test("the same PO with and without the warning (Nov 25, 14 truckloads)", () => {
  const lane = cin();
  const cold = po("Cincinnati, OH", 14, "2026-11-25");
  const c1 = E.checks([cold], cold, NOW);
  assert.deepEqual(E.TEAMS.map((x) => c1[x].ok), [false, true, false, true]); // over forecast, short line time
  const f = fcast("Cincinnati, OH", "2026-11-22", 14);
  const a = ask(lane, "2026-11-22", 6);
  const warm = po("Cincinnati, OH", 14, "2026-11-25");
  const c2 = E.checks([f, a, warm], warm, NOW);
  assert.deepEqual(E.TEAMS.map((x) => c2[x].ok), [true, true, true, true]);
  assert.equal(c2.alloc.spot, 0);
  // Told too late for Production to plan (under 2 weeks before the week): line time stays short.
  const late = fcast("Cincinnati, OH", "2026-11-22", 14, "2026-11-12");
  assert.equal(E.plannedLine([late], 3, NOW), 0);
});
