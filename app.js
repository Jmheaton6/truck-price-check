import * as E from "./engine.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const { RULES, PILOT_LANES, SIM_CUSTOMERS, SIM_LINE_TIME, PATTERNS, TEAMS, QUESTIONS, STAGES } = E;
const PARAMS = new URLSearchParams(location.search);
const NOW = PARAMS.get("today") || E.isoDate(new Date()); // ?today=2026-11-05 to rehearse a date
const FORCE_LOCAL = PARAMS.has("local");                   // ?local = backup if the room's Wi-Fi fails

// Ball HQ: one shared board, one tab per department, and the plant manager's dashboard.
const BALL_TABS = { pos: "All POs", sales: "Sales", inventory: "Inventory", production: "Production", logistics: "Logistics", dashboard: "Dashboard" };
const LOG_TABS = { signoff: "Sign-offs", book: "Book trucks", outlook: "6-week outlook", transfers: "Transfers" };
const ALIASES = { review: ["pos"], team: ["pos"], hub: ["dashboard"], planning: ["production"],
  schedule: ["logistics", "book"], carrier: ["logistics", "book"], outlook: ["logistics", "outlook"], plan: ["logistics", "outlook"], transfers: ["logistics", "transfers"] };
const TEAM_NAME = { sales: "Sales", inventory: "Inventory", production: "Production", logistics: "Logistics", management: "Management" };
const HOME_TAB = { sales: "sales", inventory: "inventory", production: "production", logistics: "logistics", management: "dashboard" };
const DEPT = {
  sales: "Sales owns the customer. Check each PO against what the customer forecast, and answer the customer when a team says no: offer a better date, accept anyway, or decline.",
  inventory: "Check whether the customer's labeled cans are already in stock at Findlay, and flag cuts that would leave made cans stranded.",
  production: "Check whether Findlay has the line time to make the cans before the production freeze.",
  logistics: "Check whether a PO fits on contract trucks, ask carriers for more ahead of time, and book the trucks once a PO is accepted. Spot is for emergencies only.",
};
const REASONS = ["Promotion", "Filling-line change", "Demand up", "Demand down"];
const SPOT_REASONS = ["Customer's line would go down", "Carrier said no", "Under 3 days' notice", "Accepted as an exception"];

// ---------- Data store: Supabase when configured, this browser otherwise ----------
async function makeStore() {
  if (SUPABASE_URL && SUPABASE_KEY && !FORCE_LOCAL) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);
    const check = ({ data, error }) => { if (error) throw error; return data; };
    return {
      live: true,
      list: async () => check(await db.from("items").select("*").order("created_at", { ascending: true })),
      add: async (row) => check(await db.from("items").insert(row).select().single()),
      update: async (id, patch) => check(await db.from("items").update(patch).eq("id", id)),
      reset: async (pin) => check(await db.rpc("reset_items", { pin })),
      subscribe(cb) {
        db.channel("items-live").on("postgres_changes", { event: "*", schema: "public", table: "items" }, cb).subscribe();
        setInterval(cb, 8000); // safety net if websockets are blocked
      },
    };
  }
  const KEY = "bc_items_v2";
  const listeners = [];
  const read = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const write = (rows) => { localStorage.setItem(KEY, JSON.stringify(rows)); listeners.forEach((f) => f()); };
  let seq = 0;
  return {
    live: false,
    list: async () => read(),
    add: async (row) => {
      const saved = { ...row, id: Date.now() * 10 + (seq++ % 10), created_at: new Date().toISOString() };
      write([...read(), saved]);
      return saved;
    },
    update: async (id, patch) => write(read().map((r) => (r.id === id ? { ...r, ...patch } : r))),
    reset: async () => write([]),
    subscribe(cb) {
      listeners.push(cb);
      addEventListener("storage", (e) => e.key === KEY && cb());
    },
  };
}

// ---------- Who is using this laptop (no passwords: name + team, or name + company) ----------
const ME_KEY = { ball: "bc_me_ball", customer: "bc_me_cust" };
let ME = null;
const loadMe = (portal) => { try { return JSON.parse(localStorage.getItem(ME_KEY[portal])); } catch { return null; } };
const saveMe = (portal, me) => localStorage.setItem(ME_KEY[portal], JSON.stringify(me));
const mine = (team) => ME?.team === team;
const nowIso = () => new Date().toISOString();
const entry = (ev, cust) => ({ at: nowIso(), by: ME.name, tm: ME.team || "customer", ev, ...(cust ? { cust } : {}) });

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (x) => Math.round(x * 100) + "%";
const num = (n) => Math.round(n).toLocaleString("en-US");
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const stamp = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const fmtDate = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekLabel = (sun) => {
  const sat = E.addDays(sun, 6);
  return E.atNoon(sun).getMonth() === E.atNoon(sat).getMonth() ? `${fmtShort(sun)}–${E.atNoon(sat).getDate()}` : `${fmtShort(sun)}–${fmtShort(sat)}`;
};
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} hr` : `${Math.round(m / 1440)} days`;
};
const LAST_DAY = E.addDays(E.weekKey(NOW), RULES.weeks * 7 - 1);
function link(role, extra = {}) {
  const q = new URLSearchParams({ role, ...extra });
  if (FORCE_LOCAL) q.set("local", "");
  if (PARAMS.get("today")) q.set("today", PARAMS.get("today"));
  return "?" + q.toString().replace("local=&", "local&").replace(/local=$/, "local");
}
const custName = (dest) => `${SIM_CUSTOMERS[dest].name} · ${dest}`;
const laneName = (lane) => `Findlay → ${lane.destination}`;
const chips = (contract, spot) =>
  `${contract ? `<span class="b b-contract">${contract}</span> contract ` : ""}${spot ? `<span class="b b-spot">${spot}</span> spot` : ""}`;
const byId = (items, id) => items.find((x) => String(x.id) === String(id));
const orders = (items) => items.filter((x) => x.type === "order");
const isChange = (it) => it.data.kind === "change";
const changesOf = (items, po) => orders(items).filter((x) => isChange(x) && String(x.data.parent) === String(po.id));
// A PO's total on its date: the PO plus accepted changes for that same date (a change moved to another date ships on its own).
const poTotal = (items, po) => po.data.trucks + changesOf(items, po).filter((c) => c.status === "confirmed" && E.dateOf(c) === E.dateOf(po)).reduce((s, c) => s + c.data.trucks, 0);
const stagePill = (it) => `<span class="status st-${E.stageOf(it)}">${STAGES[E.stageOf(it)]}</span>`;

const ICONS = {
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  x: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  dot: '<circle cx="10" cy="10" r="4.5"/>',
  arrow: '<path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5"/>',
  back: '<path d="M16.5 10h-12M9 5.5L4.5 10 9 14.5"/>',
  lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
};
const icon = (name) => `<svg class="ic ic-${name}" viewBox="0 0 20 20" aria-hidden="true">${ICONS[name]}</svg>`;
const actAs = (team) => `<button type="button" class="linkish" data-act-as="${team}">Act as ${TEAM_NAME[team]}</button>`;
const locked = (team) => (mine(team) ? "" : ` disabled title="${TEAM_NAME[team]} only. Use “Act as ${TEAM_NAME[team]}”."`);

function toast(msg, bad = false) {
  document.querySelectorAll(".toast").forEach((x) => x.remove());
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " toast-bad" : "");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

const sourceNote = () => `<p class="provenance"><strong>Real</strong> (Ball's 2026 workbook, Findlay, Jan–Jul, no shuttles): lanes, contract trucks a week, contract and spot prices.
  <strong>Simulated</strong> for the pilot: trucks already booked, customers and their forecasts, stock, line time, and the carrier's answers.</p>`;

// One line that says what a PO or change is.
function whatLine(items, it) {
  const n = Math.abs(it.data.trucks);
  const cans = num(Math.abs(it.data.cans || n * RULES.cansPerTruck));
  if (!isChange(it)) return `New PO: <strong>${plural(n, "truckload")}</strong> (${cans} cans) for <strong>${esc(fmtDate(E.dateOf(it)))}</strong>`;
  const po = byId(items, it.data.parent);
  const before = po ? poTotal(items, po) - (it.status === "confirmed" ? it.data.trucks : 0) : null;
  const date = it.status === "offered" ? it.data.date : E.dateOf(it); // show the asked-for date until the customer accepts
  return `Change: <strong>${it.data.trucks > 0 ? "+" : "−"}${plural(n, "truckload")}</strong> (${cans} cans)${before != null ? `, ${before} → ${before + it.data.trucks}` : ""} for <strong>${esc(fmtDate(date))}</strong>`;
}

// The history of one PO or change. Old rows without a log get their first line rebuilt.
function logOf(it) {
  const log = it.data.log?.length ? it.data.log : [{ at: it.created_at, by: it.data.by?.name || "Customer", tm: "customer", ev: isChange(it) ? "Requested a change" : "Sent the PO" }];
  return [...log].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
const whoLabel = (it, e) => e.tm === "system" ? "Ball HQ" : e.tm === "customer" ? `${esc(e.by)} (${esc(SIM_CUSTOMERS[it.data.customer]?.name || "customer")})` : `${esc(e.by)} (${TEAM_NAME[e.tm] || esc(e.tm)})`;

// What a team must do on this PO right now, or null.
function needs(it, team) {
  const st = E.stageOf(it);
  const so = it.data.signoffs || {};
  if (st === "review" && !so[team]) return "Needs your answer";
  if (team === "sales" && st === "review" && TEAMS.some((t) => so[t]?.ok === false)) return "A team said no: answer the customer";
  if (team === "logistics" && st === "accepted") return "Accepted: book the trucks";
  return null;
}
const teamCount = (items, team) => orders(items).filter((it) => needs(it, team)).length;

// ---------- Sign in ----------
function signInView(portal) {
  const prev = loadMe(portal) || {};
  const ball = portal === "ball";
  const pick = { team: prev.team || "sales", customer: prev.customer || localStorage.getItem("bc_customer") || "Cincinnati, OH" };
  const html = `<section class="panel signin">
      <h1>${ball ? "Sign in to Ball HQ" : "Sign in to Customer HQ"}</h1>
      <p class="lede">${ball ? "Your name goes on every answer you give, so every team can see who decided what." : "Your name goes on every PO and reply you send Ball."}</p>
      <label class="field"><span class="label">Your name</span><input id="si-name" type="text" autocomplete="name" maxlength="40" value="${esc(prev.name || "")}" placeholder="First and last name"></label>
      ${ball ? `<div class="field"><span class="label">Your team</span>
        <div class="seg" id="si-team">${Object.entries(TEAM_NAME).map(([k, v]) => `<button type="button" data-team="${k}">${v}</button>`).join("")}</div></div>`
      : `<label class="field"><span class="label">Your company</span>
        <select id="si-cust">${Object.keys(SIM_CUSTOMERS).map((d) => `<option value="${esc(d)}">${esc(custName(d))}</option>`).join("")}</select></label>`}
      <button type="button" id="si-go" class="cta">Continue</button>
    </section>`;
  function paint() {
    document.querySelectorAll("#si-team button").forEach((b) => b.classList.toggle("on", b.dataset.team === pick.team));
    if ($("#si-cust")) $("#si-cust").value = pick.customer;
  }
  function mount() {
    paint();
    $("#si-name").focus();
    $("#si-team")?.addEventListener("click", (e) => { const b = e.target.closest("[data-team]"); if (b) { pick.team = b.dataset.team; paint(); } });
    $("#si-cust")?.addEventListener("change", (e) => { pick.customer = e.target.value; });
    const go = () => {
      const name = $("#si-name").value.trim();
      if (!name) { toast("Type your name first.", true); return $("#si-name").focus(); }
      saveMe(portal, ball ? { name, team: pick.team } : { name, customer: pick.customer });
      sessionStorage.removeItem("bc_switch");
      if (ball && PARAMS.get("role") === "ball") location.href = link(HOME_TAB[pick.team]);
      else location.reload();
    };
    $("#si-go").addEventListener("click", go);
    $("#si-name").addEventListener("keydown", (e) => e.key === "Enter" && go());
  }
  return { html, mount };
}

// ---------- Customer HQ ----------
const CUST_STEPS = ["Sent", "Ball reviews", "Accepted", "Trucks booked"];
const CUST_AT = { review: 2, offered: 2, accepted: 3, booked: 4 };

function customerView(store, state) {
  const form = {
    cans: 2000000, reason: "Promotion",
    date: E.addDays(E.weekKey(NOW), 14 + 4), // Thursday, two weeks out
    changeOf: null,                          // PO id when requesting a change
  };
  const customer = ME.customer;
  const html = `<div class="cols cols-cust">
    <section class="panel" id="c-form"></section>
    <div>
      <section class="panel"><h2>Your POs</h2><div id="c-mine" class="cards"><p class="empty">Loading…</p></div></section>
      <section class="panel" id="c-score"></section>
    </div>
  </div>`;

  const trucks = () => E.trucksFromCans(form.cans);
  const changing = () => (form.changeOf ? byId(state.items, form.changeOf) : null);

  function drawForm() {
    const po = changing();
    const presets = [400000, 1000000, 2000000, 4000000];
    const cansField = (label) => `<label class="field"><span class="label">${label}</span>
        <input id="c-cans" type="number" inputmode="numeric" min="200000" max="20000000" step="200000">
        <span class="presets presets-row">${presets.map((n) => `<button type="button" class="chip-btn" data-cans="${n}">${n >= 1e6 ? n / 1e6 + "M" : n / 1e3 + "K"}</button>`).join("")}</span>
        <span class="notice" id="c-trucks"></span></label>`;
    const reasons = `<div class="field"><span class="label">Why?</span>
        <div class="seg" id="c-reason">${REASONS.map((r) => `<button type="button" data-reason="${esc(r)}">${esc(r)}</button>`).join("")}</div></div>`;
    $("#c-form").innerHTML = po ? `
      <h1>Change ${E.poNumber(state.items, po)}</h1>
      <p class="lede">Today it's <strong>${plural(poTotal(state.items, po), "truckload")}</strong> for <strong>${esc(fmtDate(E.dateOf(po)))}</strong>. Your change goes through the same Ball review as a new PO.</p>
      ${cansField("New total: how many cans?")}
      ${reasons}
      <div id="c-rules" class="rules"></div>
      <button type="button" id="c-send" class="cta">Send change request</button>
      <button type="button" id="c-cancel" class="util quiet">Cancel</button>`
      : `
      <h1>Place a PO with Ball</h1>
      <p class="lede">Ordering for <strong>${esc(custName(customer))}</strong>.</p>
      ${cansField("How many cans?")}
      <label class="field"><span class="label">Delivery date</span>
        <input id="c-date" type="date" min="${NOW}" max="${LAST_DAY}"></label>
      ${reasons}
      <div id="c-rules" class="rules"></div>
      <button type="button" id="c-send" class="cta">Send PO to Ball</button>`;
    $("#c-cans").addEventListener("input", (e) => { form.cans = Math.max(1, +e.target.value || 0); paint(); });
    $("#c-date")?.addEventListener("change", (e) => { form.date = e.target.value < NOW ? NOW : e.target.value > LAST_DAY ? LAST_DAY : e.target.value; paint(); });
    paint();
  }

  function paint() {
    const po = changing();
    if ($("#c-date")) $("#c-date").value = form.date;
    $("#c-cans").value = form.cans;
    document.querySelectorAll("#c-reason button").forEach((b) => b.classList.toggle("on", b.dataset.reason === form.reason));
    const date = po ? E.dateOf(po) : form.date;
    const now = po ? poTotal(state.items, po) : 0;
    const delta = trucks() - now;
    $("#c-trucks").innerHTML = po
      ? `= <strong>${plural(trucks(), "truckload")}</strong>: that's <strong>${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}</strong> vs. today's ${now}`
      : `= <strong>${plural(trucks(), "truckload")}</strong> at ${num(RULES.cansPerTruck)} cans per truck`;
    const cust = SIM_CUSTOMERS[customer];
    const wk = E.weekIndex(date, NOW);
    const fc = cust.forecast[wk] ?? cust.forecast.at(-1);
    const band = Math.max(1, Math.round(fc * RULES.flexBand));
    const days = E.daysBetween(NOW, date);
    $("#c-rules").innerHTML = `<p><strong>You forecast ${plural(fc, "truckload")} for the week of ${weekLabel(E.weekKey(date))}.</strong> Orders within ${fc - band}–${fc + band} (±10%) are routine.</p>
      <p><strong>Delivery is ${plural(days, "day")} away.</strong> Changes inside ${RULES.noticeDays} days of delivery are hard to fill.</p>
      <p class="small">Ball's four teams review it together and answer within 4 hours (target).</p>`;
  }

  function mount() {
    drawForm();
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.cans) { form.cans = +b.dataset.cans; return paint(); }
      if (b.dataset.reason) { form.reason = b.dataset.reason; return paint(); }
      if (b.id === "c-cancel") { form.changeOf = null; form.cans = 2000000; return drawForm(); }
      if (b.dataset.change) {
        form.changeOf = b.dataset.change;
        form.cans = poTotal(state.items, changing()) * RULES.cansPerTruck;
        form.reason = "Demand up";
        drawForm();
        return scrollTo({ top: 0, behavior: "smooth" });
      }
      if (b.id === "c-send") return send(b);
      if (b.dataset.reply) return reply(b);
    });
  }

  async function send(btn) {
    const po = changing();
    const delta = po ? trucks() - poTotal(state.items, po) : trucks();
    if (po && !delta) return toast("That's the same amount you have now.", true);
    btn.disabled = true;
    try {
      const by = { name: ME.name };
      const data = po
        ? { kind: "change", parent: po.id, customer, trucks: delta, cans: delta * RULES.cansPerTruck, date: E.dateOf(po), reason: form.reason, signoffs: {}, by }
        : { kind: "po", customer, trucks: trucks(), cans: trucks() * RULES.cansPerTruck, date: form.date, reason: form.reason, signoffs: {}, by };
      const ev = po ? `Requested a change: ${delta > 0 ? "+" : "−"}${plural(Math.abs(delta), "truckload")}` : `Sent the PO: ${plural(trucks(), "truckload")} for ${fmtDate(form.date)}`;
      await store.add({ type: "order", status: "waiting", data: E.withLog(data, entry(ev, ev)) });
      toast(po ? "Change request sent to Ball." : "PO sent to Ball. Watch its progress on the right.");
      form.changeOf = null; form.cans = 2000000;
      drawForm();
      state.refresh();
    } catch (err) { toast("Couldn't send: " + err.message, true); }
    finally { btn.disabled = false; }
  }

  async function reply(btn) {
    btn.disabled = true;
    try {
      const it = byId(await store.list(), btn.dataset.id);
      if (!it || it.status !== "offered") return;
      const yes = btn.dataset.reply === "yes";
      const ev = yes ? `Accepted Ball's date: ${fmtDate(it.data.answer.date)}` : "Declined Ball's offer";
      await store.update(it.id, { status: yes ? "confirmed" : "declined", data: E.withLog({ ...it.data, customer_reply: { yes, at: nowIso() } }, entry(ev, ev)) });
      toast(yes ? "Accepted. Ball's Logistics team books the trucks next." : "Declined.");
      state.refresh();
    } catch (err) { toast("Couldn't update: " + err.message, true); btn.disabled = false; }
  }

  // What the customer sees about one PO or change (never Ball's costs or spot).
  function statusBlock(it) {
    const st = E.stageOf(it);
    if (st === "declined") {
      const byBall = it.data.answer?.kind === "declined";
      return `<p class="answer">${isChange(it) ? "Not changed. Your PO stays as it was." : byBall ? "Ball can't fill this PO." : "You declined Ball's offer."}</p>`;
    }
    const step = CUST_AT[st];
    const bar = `<ol class="steps-bar">${CUST_STEPS.map((s, i) => `<li class="${i + 1 < step || step === 4 ? "done" : i + 1 === step ? "now" : ""}">${s}</li>`).join("")}</ol>`;
    let line = "";
    if (st === "review") {
      const done = TEAMS.filter((t) => it.data.signoffs?.[t]).length;
      line = `<p class="answer">Ball is reviewing: <strong>${done} of 4 teams</strong> have answered.</p>`;
    } else if (st === "offered") {
      line = `<p class="answer answer-offer">Ball can't do ${esc(fmtDate(it.data.date))}, but can deliver on <strong>${esc(fmtDate(it.data.answer.date))}</strong>. Does that work?</p>
        <div class="card-actions"><button type="button" class="util on" data-reply="yes" data-id="${esc(it.id)}">Accept ${esc(fmtShort(it.data.answer.date))}</button>
        <button type="button" class="util" data-reply="no" data-id="${esc(it.id)}">Decline</button></div>`;
    } else if (st === "accepted") line = `<p class="answer answer-yes">${icon("check")}Accepted for ${esc(fmtDate(E.dateOf(it)))}. Ball's Logistics team is booking trucks.</p>`;
    else line = `<p class="answer answer-yes">${icon("check")}Trucks booked for ${esc(fmtDate(E.dateOf(it)))}.</p>`;
    return bar + line;
  }
  const custLog = (it) => {
    const seen = logOf(it).filter((e) => e.cust);
    return seen.length > 1 ? `<details class="c-log"><summary>History</summary><ol class="log">${seen.reverse().map((e) => `<li><time>${esc(stamp(e.at))}</time><span>${esc(e.cust)}</span></li>`).join("")}</ol></details>` : "";
  };

  function live(items) {
    if (form.changeOf && !changing()) { form.changeOf = null; drawForm(); }
    const pos = orders(items).filter((x) => !isChange(x) && x.data.customer === customer).reverse();
    $("#c-mine").innerHTML = pos.length ? pos.map((po) => {
      const changes = changesOf(items, po).reverse();
      return `<article class="card card-plain">
        <div class="card-head"><span class="pill">${E.poNumber(items, po)}</span><span class="meta-sm">${esc(po.data.reason || "")} · sent ${esc(time(po.created_at))}${po.data.by?.name ? ` by ${esc(po.data.by.name)}` : ""}</span></div>
        <h3>${plural(poTotal(items, po), "truckload")} · ${esc(fmtDate(E.dateOf(po)))}</h3>
        ${statusBlock(po)}${custLog(po)}
        ${changes.map((c) => `<div class="change-box"><p class="change-h">${whatLine(items, c)} <span class="meta-sm">· ${esc(time(c.created_at))}</span></p>${statusBlock(c)}${custLog(c)}</div>`).join("")}
        ${po.status !== "declined" ? `<div class="card-actions"><button type="button" class="util" data-change="${esc(po.id)}">Request a change</button></div>` : ""}
      </article>`;
    }).join("") : `<p class="empty">No POs yet. Place one on the left.</p>`;
    const c = SIM_CUSTOMERS[customer];
    const tier = E.priorityOf(c);
    $("#c-score").innerHTML = `<h2>Your reliability</h2>
      <p class="score"><span class="big">${pct(c.inBand)}</span> of your orders this quarter stayed within your forecast (±10%).</p>
      <p class="tier tier-${tier.toLowerCase()}">${tier === "Priority" ? "Priority customer: first claim on summer peak capacity." : "Standard customer: stay within your forecast 90% of the time to earn priority for summer peak capacity."}</p>
      <p class="small">Reliability earns priority. Simulated score for the pilot.</p>`;
    if (!form.changeOf) paint();
  }

  return { html, mount, live };
}

// ---------- Ball HQ: shared PO board (used by All POs and every department) ----------
async function askCarrier(store, items, lane, date, trucks, forItem) {
  const ans = E.carrierAnswer(items, lane, date, trucks, NOW);
  await store.add({ type: "ask", status: ans.status, data: { kind: lane.kind, destination: lane.destination, week: E.weekKey(date), date, trucks, accepted: ans.accepted, for: forItem?.id ?? null, why: ans.why, by: { name: ME.name } } });
  if (forItem) {
    const it = byId(await store.list(), forItem.id);
    if (it) await store.update(it.id, { data: E.withLog(it.data, entry(`Asked the carrier for ${trucks > 0 ? "+" : ""}${trucks}. Carrier: ${ans.why}`)) });
  }
  toast(`Carrier: ${ans.why}`, ans.status === "no");
}

function board(store, state, team) {
  let selected = location.hash.slice(1) || null;
  let filter = "all";
  const moreOpen = new Set(); // which teams' "Why" panels are open
  const html = `<div class="cols cols-team">
    <section class="panel queue"><div id="r-filter"></div><div id="r-queue"><p class="empty">Loading…</p></div></section>
    <section class="panel" id="r-detail"><p class="empty">Loading…</p></section>
  </div>`;

  function mount() {
    $("#app").addEventListener("toggle", (e) => {
      const d = e.target.closest?.("[data-more]");
      if (d) d.open ? moreOpen.add(d.dataset.more) : moreOpen.delete(d.dataset.more);
    }, true);
    $("#app").addEventListener("click", async (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) { selected = pick.dataset.pick; history.replaceState(null, "", "#" + selected); return live(state.items); }
      const f = e.target.closest("[data-filter]");
      if (f) { filter = f.dataset.filter; return live(state.items); }
      const b = e.target.closest("button[data-id]");
      if (!b) return;
      b.disabled = true;
      try {
        const it = byId(await store.list(), b.dataset.id); // re-read so two teams answering at once don't overwrite each other
        if (!it) return;
        if (b.dataset.sign) await sign(it, b.dataset.sign, b.dataset.ok === "1");
        else if (b.dataset.ask) await askCarrier(store, state.items, E.itemLane(it), E.dateOf(it), +b.dataset.ask, it);
        else if (b.dataset.answer) await answer(it, b.dataset.answer, b.dataset.date);
        state.refresh();
      } catch (err) { toast("Couldn't update: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  async function sign(it, t, ok) {
    if (!mine(t)) return toast(`Only ${TEAM_NAME[t]} can answer for ${TEAM_NAME[t]}.`, true);
    const u = E.applySign(it, t, ok, ME, nowIso());
    if (!u) return toast(E.answersOpen(it) ? "That's already your answer." : "Answers are locked on this PO.", true);
    await store.update(it.id, { status: u.status, data: u.data });
    toast(u.event.startsWith("All four") ? "All four teams approved. Accepted: Logistics books the trucks next."
      : u.event.startsWith("Back in review") ? "Changed. The PO is back in review, and the customer sees Ball is re-checking." : u.event + ".");
  }

  async function answer(it, kind, date) {
    if (!mine("sales")) return toast("Only Sales answers the customer.", true);
    const at = nowIso();
    if (kind === "new_date") {
      const ev = `Offered ${fmtDate(date)} instead`;
      await store.update(it.id, { status: "offered", data: E.withLog({ ...it.data, answer: { kind, date, at } }, entry(ev, `Ball offered ${fmtDate(date)} instead`)) });
    } else if (kind === "override") {
      await store.update(it.id, { status: "confirmed", data: E.withLog({ ...it.data, answer: { kind, at } }, entry("Accepted as an exception", "Accepted by Ball")) });
    } else {
      await store.update(it.id, { status: "declined", data: E.withLog({ ...it.data, answer: { kind: "declined", at } }, entry("Declined", "Ball declined")) });
    }
    toast(kind === "new_date" ? "Counteroffer sent. The customer sees it now." : kind === "override" ? "Accepted as an exception. It goes to Logistics." : "Declined. The customer sees it now.");
  }

  // Each team: its question, the app's check, the reasons (folded), and its answer.
  // Only that team can answer; anyone can see it. Answers stay changeable until trucks are booked.
  function teamBox(it, t, c, extra = "") {
    const s = it.data.signoffs?.[t];
    const open = E.answersOpen(it);
    const cls = s ? (s.ok ? "tbox-yes" : "tbox-no") : c.ok ? "tbox-ok" : "tbox-warn";
    let act = "";
    if (open && mine(t)) act = s
      ? `<button type="button" class="util slim" data-sign="${t}" data-ok="${s.ok ? 0 : 1}" data-id="${esc(it.id)}">${icon("back")}Change to ${s.ok ? "Reject" : "Approve"}</button>`
      : `<div class="tb-btns"><button type="button" class="util${c.ok ? " on" : ""}" data-sign="${t}" data-ok="1" data-id="${esc(it.id)}">Approve</button>
          <button type="button" class="util${c.ok ? "" : " on"}" data-sign="${t}" data-ok="0" data-id="${esc(it.id)}">Reject</button></div>`;
    else if (open && !s) act = `<p class="tb-signed tb-none">Waiting on ${TEAM_NAME[t]} · ${actAs(t)}</p>`;
    return `<div class="tbox ${cls}${t === team ? " tbox-focus" : ""}">
      <p class="tb-team">${TEAM_NAME[t]}</p>
      <p class="tb-q">${QUESTIONS[t]}</p>
      <p class="tb-verdict ${c.ok ? "tb-ok" : "tb-bad"}">${icon(c.ok ? "check" : "x")}${esc(c.verdict)}</p>
      <details class="tb-more" data-more="${t}"${moreOpen.has(t) ? " open" : ""}><summary>Why</summary>
        <ul class="tb-facts">${c.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>
      ${extra}
      ${s ? `<p class="tb-signed">${icon(s.ok ? "check" : "x")}${s.ok ? "Approved" : "Rejected"}${s.by ? ` by ${esc(s.by)}` : ""} · ${esc(time(s.at))}${s.ok !== c.ok ? " (overrode the check)" : ""}</p>` : open ? "" : `<p class="tb-signed tb-none">No answer</p>`}
      ${act}
    </div>`;
  }

  // The one thing that happens next on this PO, and who does it.
  function nextStep(items, it, r, logAsk) {
    const a = r.checks.alloc;
    const signed = r.signed;
    const st = E.stageOf(it);
    if (st === "offered") return { tone: "", html: `<p><strong>Waiting on the customer</strong> to accept ${esc(fmtDate(it.data.answer.date))}.</p>` };
    if (st === "declined") return { tone: "", html: `<p><strong>Declined</strong>${it.data.customer_reply ? " by the customer" : " by Ball"}. Nothing ships.</p>` };
    if (st === "booked") return { tone: "ok", html: `<p>${icon("check")}<strong>Trucks booked:</strong> ${chips(a.contract, a.spot)}</p>` };
    if (st === "accepted") return { tone: "ok", html: `<p>${icon("check")}<strong>Accepted${it.data.answer?.kind === "override" ? " as an exception" : ""}.</strong> Next, Logistics books the trucks.</p>
       ${mine("logistics") ? `<a class="util on next-link" href="${link("logistics", { tab: "book" })}">Book trucks ${icon("arrow")}</a>` : `<p class="small">Waiting on Logistics · ${actAs("logistics")}</p>`}` };
    if (r.refused.length) {
      const better = E.betterDate(items, it, NOW);
      const who = `<p><strong>${r.refused.map((t) => TEAM_NAME[t]).join(" and ")} rejected it.</strong> Sales answers the customer${mine("sales") ? ":" : "."}</p>`;
      if (!mine("sales")) return { tone: "warn", html: `${who}<p class="small">Waiting on Sales · ${actAs("sales")}</p>` };
      return { tone: "warn", html: `${who}
        <div class="card-actions">
          ${better ? `<button type="button" class="util on" data-answer="new_date" data-date="${better.date}" data-id="${esc(it.id)}">Offer ${esc(fmtDate(better.date))} instead</button>` : ""}
          <button type="button" class="util" data-answer="override" data-id="${esc(it.id)}">Accept anyway${a.spot ? ` (Ball pays ${money(a.overspend)} for spot)` : ""}</button>
          <button type="button" class="util" data-answer="declined" data-id="${esc(it.id)}">Decline</button>
        </div>${better ? `<p class="small">${esc(fmtDate(better.date))} passes Production and fits on contract trucks${better.gain ? `, saving ${money(better.gain)}` : ""}.</p>` : `<p class="small">No date in the next few weeks passes every check.</p>`}` };
    }
    if (!signed.logistics && logAsk) return { tone: "warn", html: `<p><strong>Logistics:</strong> ask the carrier for ${a.capSpot} more trucks before answering. With a week's notice it can usually add some.</p>` };
    const waiting = TEAMS.filter((t) => !signed[t]).map((t) => TEAM_NAME[t]);
    return { tone: "", html: `<p><strong>Waiting on ${waiting.join(", ")}.</strong> When all four approve, the PO is accepted and goes to Logistics.</p>` };
  }

  const LOCK = {
    offered: "Answers are paused while the customer decides on Ball's date.",
    booked: "Answers are locked because the trucks are booked. To reopen them, Logistics un-books it on Book trucks.",
    declined: "Answers are locked because this PO was declined.",
  };

  function detail(items, it) {
    const r = E.review(items, it, NOW);
    const c = r.checks;
    const a = c.alloc;
    const st = E.stageOf(it);
    const asks = items.filter((x) => x.type === "ask" && String(x.data.for) === String(it.id));
    const logAsk = st === "review" && a.capSpot > 0 && !asks.some((x) => x.data.trucks > 0);
    let logExtra = asks.map((x) => `<p class="ask-line ask-${x.status}">Carrier: ${esc(x.data.why)}</p>`).join("");
    if (logAsk && mine("logistics")) logExtra += `<button type="button" class="util on wide" data-ask="${a.capSpot}" data-id="${esc(it.id)}">Ask the carrier for ${a.capSpot} more trucks</button>`;

    const signed = r.signed;
    const marks = TEAMS.map((t) => `<li class="${signed[t] ? (signed[t].ok ? "m-yes" : "m-no") : ""}">${icon(signed[t] ? (signed[t].ok ? "check" : "x") : "dot")}${TEAM_NAME[t]}</li>`).join("");
    const next = nextStep(items, it, r, logAsk);
    const parent = isChange(it) ? byId(items, it.data.parent) : null;
    const kids = isChange(it) ? [] : changesOf(items, it);
    const related = parent ? `<p class="related">Change to <button type="button" class="linkish" data-pick="${esc(parent.id)}">${E.poNumber(items, parent)}</button>, now ${plural(poTotal(items, parent), "truckload")} (${STAGES[E.stageOf(parent)].toLowerCase()}).</p>`
      : kids.length ? `<p class="related">Changes: ${kids.map((k) => `<button type="button" class="linkish" data-pick="${esc(k.id)}">${k.data.trucks > 0 ? "+" : "−"}${Math.abs(k.data.trucks)} · ${STAGES[E.stageOf(k)].toLowerCase()}</button>`).join(" ")}</p>` : "";
    const log = logOf(it).reverse();

    return `<div class="card-head"><span class="pill">${E.poNumber(items, it)}</span>${isChange(it) ? `<span class="pill pill-change">Change request</span>` : ""}${stagePill(it)}
        <time>Updated ${esc(ago(log[0].at))}${ago(log[0].at) === "just now" ? "" : " ago"}</time></div>
      <h1 class="detail-h">${esc(custName(it.data.customer))}</h1>
      <p class="po-what">${whatLine(items, it)} · ${esc(it.data.reason || "")}</p>
      ${related}
      <div class="signrow"><ul class="marks">${marks}</ul><span class="m-count">${r.approved} of 4 approved${r.refused.length ? `, ${r.refused.length} rejected` : ""}</span></div>
      <div class="next next-${next.tone || "plain"}"><p class="next-label">Next step</p>${next.html}</div>
      ${LOCK[st] ? `<p class="lock">${icon("lock")}${LOCK[st]}</p>` : st === "accepted" ? `<p class="lock lock-open">Any team can still change its answer until the trucks are booked. A new Reject sends it back to review.</p>` : ""}
      ${it.data.trucks > 0 ? `<p class="shared shared-${a.color}">Profit per truckload: <strong>${money(a.perTruck)}</strong>
        <span class="sh-split">${chips(a.contract, a.spot)}${a.spot ? ` · spot adds ${money(a.overspend)}` : ""}</span>
        <span class="sh-sub">$3,100 minus extra trucking. Every team sees this number.</span></p>` : ""}
      <div class="tboxes">
        ${teamBox(it, "sales", c.sales)}${teamBox(it, "inventory", c.inventory)}${teamBox(it, "production", c.production)}${teamBox(it, "logistics", c.logistics, logExtra)}
      </div>
      <section class="history"><h2>History</h2><ol class="log">${log.map((e) => `<li><time>${esc(stamp(e.at))}</time><span><strong>${whoLabel(it, e)}</strong> ${esc(e.ev)}</span></li>`).join("")}</ol></section>`;
  }

  const row = (items, it, why) => `<button type="button" class="q-row${String(it.id) === String(selected) ? " q-on" : ""}" data-pick="${esc(it.id)}">
      <span class="q-top"><strong>${E.poNumber(items, it)}</strong><span class="q-cust">${isChange(it) ? "Change · " : ""}${esc(SIM_CUSTOMERS[it.data.customer].name)}</span>${stagePill(it)}</span>
      <span class="q-sub">${it.data.trucks > 0 ? "+" : "−"}${plural(Math.abs(it.data.trucks), "truckload")} · ${esc(fmtShort(E.dateOf(it)))}
        <span class="mms">${TEAMS.map((t) => { const s = it.data.signoffs?.[t]; return `<span class="mm${s ? (s.ok ? " mm-yes" : " mm-no") : ""}" title="${TEAM_NAME[t]}: ${s ? (s.ok ? "approved" : "rejected") : "no answer yet"}">${TEAM_NAME[t][0]}</span>`; }).join("")}</span></span>
      ${why ? `<span class="q-why">${esc(why)}</span>` : ""}
    </button>`;

  function live(items) {
    const list = orders(items).reverse();
    let groups;
    if (!team) {
      const counts = Object.fromEntries(Object.keys(STAGES).map((k) => [k, list.filter((x) => E.stageOf(x) === k).length]));
      $("#r-filter").innerHTML = `<div class="filters">${[["all", "All", list.length], ...Object.entries(STAGES).map(([k, v]) => [k, v, counts[k]])]
        .map(([k, v, n]) => `<button type="button" class="fchip${filter === k ? " on" : ""}" data-filter="${k}">${v} <span>${n}</span></button>`).join("")}</div>`;
      groups = [["", list.filter((x) => filter === "all" || E.stageOf(x) === filter).map((it) => [it, null])]];
    } else {
      const need = [], wait = [], cust = [], done = [];
      for (const it of list) {
        const why = needs(it, team);
        if (why) need.push([it, why]);
        else if (E.stageOf(it) === "review") wait.push([it, null]);
        else if (E.stageOf(it) === "offered") cust.push([it, null]);
        else done.push([it, null]);
      }
      groups = [[`Needs ${TEAM_NAME[team]}`, need], ["Waiting on other teams", wait], ["Waiting on the customer", cust], ["Decided", done]];
    }
    const shown = groups.flatMap(([, g]) => g.map(([it]) => it));
    if (!shown.some((x) => String(x.id) === String(selected))) selected = (team ? groups[0][1][0]?.[0]?.id : null) ?? shown[0]?.id ?? null;
    $("#r-queue").innerHTML = !list.length ? `<p class="empty">No POs yet. They arrive here the moment a customer sends one from Customer HQ.</p>`
      : groups.map(([title, g]) => (title ? `<h3 class="q-group">${title} <span>${g.length}</span></h3>` : "")
        + (g.length ? g.map(([it, why]) => row(items, it, why)).join("") : title ? `<p class="q-none">${title.startsWith("Needs") ? "Nothing waiting on you." : "None."}</p>` : `<p class="empty">None.</p>`)).join("");
    const it = byId(items, selected);
    $("#r-detail").innerHTML = it ? detail(items, it) : `<h2>No PO selected</h2>
      <p class="lede">When a customer sends a PO or a change, Sales, Inventory, Production and Logistics each check it against the same numbers and answer. Four approvals and it's accepted.</p>`;
  }

  return { html, mount, live };
}

// ---------- Department side panels ----------
function salesPanel(items) {
  const weeks = Array.from({ length: RULES.weeks }, (_, wk) => E.addDays(E.weekKey(NOW), wk * 7));
  const rows = Object.entries(SIM_CUSTOMERS).map(([dest, c]) => {
    const cells = weeks.map((w, wk) => {
      const ordered = orders(items).filter((x) => E.isActive(x) && x.data.customer === dest && E.weekIndex(E.dateOf(x), NOW) === wk).reduce((s, x) => s + x.data.trucks, 0);
      const fc = c.forecast[wk];
      const band = Math.max(1, Math.round(fc * RULES.flexBand));
      const cls = !ordered ? "" : Math.abs(ordered - fc) <= band ? "z-green" : ordered > fc ? "z-red" : "z-yellow";
      return `<td class="${cls}"><span class="cell-n">${ordered}</span><span class="cell-plan">of ${fc}</span></td>`;
    }).join("");
    return `<tr><th scope="row">${esc(c.name)}<span class="kind">${esc(dest)} · ${pct(c.inBand)} reliable · ${E.priorityOf(c)}</span></th>${cells}</tr>`;
  }).join("");
  return `<h2>Customer orders vs. forecast, in truckloads</h2>
    <div class="table-wrap"><table class="grid"><thead><tr><th>Customer</th>${weeks.map((w, i) => `<th>${i === 0 ? "This week" : weekLabel(w)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small">Ordered (POs and changes, including ones still in review) of the customer's forecast. Green: within ±10%. Red: above it. Yellow: below it.</p>`;
}

function inventoryPanel(items) {
  const plan = E.planUse(items, NOW);
  const rows = Object.entries(SIM_CUSTOMERS).map(([dest, c]) => {
    const mineOrders = orders(items).filter((x) => E.isActive(x) && x.data.customer === dest);
    const used = mineOrders.reduce((s, x) => s + (plan.get(x.id)?.fromStock || 0), 0);
    const strand = mineOrders.filter((x) => x.data.trucks < 0 && plan.get(x.id)?.frozen).reduce((s, x) => s - x.data.trucks, 0);
    return `<tr><th scope="row">${esc(c.name)}<span class="kind">${esc(dest)}</span></th><td>${c.stock}</td><td>${used}</td><td><strong>${c.stock - used}</strong></td><td>${strand ? `<span class="b b-spot">${strand}</span>` : "0"}</td></tr>`;
  }).join("");
  return `<h2>Labeled cans in stock at Findlay, in truckloads</h2>
    <div class="table-wrap"><table class="grid grid-plain"><thead><tr><th>Customer</th><th>In stock</th><th>Promised to POs</th><th>Left</th><th>Stranded by cuts</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small">Labeled cans fit only one customer. A cut after the cans are made strands them.</p>`;
}

function productionPanel(items) {
  const plan = E.planUse(items, NOW);
  const used = SIM_LINE_TIME.map(() => 0);
  for (const it of orders(items)) {
    const p = plan.get(it.id);
    if (p && p.toMake != null && used[p.wk] != null) used[p.wk] += p.toMake - p.short;
  }
  const freezeTo = E.addDays(NOW, RULES.makeLeadDays + RULES.freezeDays - 1);
  return `<h2>Findlay line time for new orders, in truckloads of cans</h2>
    <div class="table-wrap"><table class="grid"><thead><tr><th></th>${SIM_LINE_TIME.map((_, wk) => `<th>${wk === 0 ? "This week" : weekLabel(E.addDays(E.weekKey(NOW), wk * 7))}</th>`).join("")}</tr></thead>
    <tbody><tr><th scope="row">Open for new orders</th>${SIM_LINE_TIME.map((n) => `<td><span class="cell-n">${n}</span></td>`).join("")}</tr>
      <tr><th scope="row">Used by POs</th>${used.map((n) => `<td><span class="cell-n">${n}</span></td>`).join("")}</tr>
      <tr><th scope="row">Left</th>${SIM_LINE_TIME.map((n, i) => `<td class="${n - used[i] <= 0 ? "z-red" : n - used[i] <= 2 ? "z-yellow" : "z-green"}"><span class="cell-n">${n - used[i]}</span></td>`).join("")}</tr></tbody></table></div>
    <p class="small">Frozen: anything delivering through ${esc(fmtDate(freezeTo))}. Runs lock ${RULES.freezeDays} days before they start, and cans are made about ${RULES.makeLeadDays} days before they ship.</p>`;
}
const SIDE = { sales: salesPanel, inventory: inventoryPanel, production: productionPanel };

function deptHead(team, sub) {
  return `<div class="dept-head"><div><h1>${TEAM_NAME[team]}</h1><p class="lede">${DEPT[team]}</p></div><div id="as-bar" class="as-bar"></div></div>
    ${team === "logistics" ? `<nav class="subtabs">${Object.entries(LOG_TABS).map(([k, v]) => `<a href="${link("logistics", k === "signoff" ? {} : { tab: k })}" class="${k === sub ? "on" : ""}" data-sub="${k}">${v}</a>`).join("")}</nav>` : ""}`;
}
const asBar = (team) => mine(team)
  ? `<p class="as as-me">${icon("check")}You're answering for ${TEAM_NAME[team]}.</p>`
  : `<p class="as">You're signed in as ${TEAM_NAME[ME.team]}, so this tab is view-only. ${actAs(team)}</p>`;

function deptView(store, state, team, sub) {
  const inner = team === "logistics" && sub !== "signoff"
    ? { book: scheduleView, outlook: outlookView, transfers: transfersView }[sub](store, state)
    : board(store, state, team);
  return {
    html: deptHead(team, sub) + inner.html + (SIDE[team] ? `<section class="panel" id="d-side"></section>` : ""),
    mount: inner.mount,
    live(items) {
      $("#as-bar").innerHTML = asBar(team);
      const n = teamCount(items, "logistics"), book = orders(items).filter((x) => E.stageOf(x) === "accepted").length;
      document.querySelectorAll(".subtabs [data-sub]").forEach((a) => {
        const c = a.dataset.sub === "signoff" ? n - book : a.dataset.sub === "book" ? book : 0;
        a.innerHTML = LOG_TABS[a.dataset.sub] + (c ? ` <span class="tab-count">${c}</span>` : "");
      });
      inner.live(items);
      if (SIDE[team]) $("#d-side").innerHTML = SIDE[team](items);
    },
  };
}

// ---------- Logistics · Book trucks ----------
function scheduleView(store, state) {
  const html = `<section class="panel">
      <h2>Accepted POs to book</h2>
      <p class="lede">Book the lane's contract carrier first. If it's full, ask the carrier for extra trucks ahead of time. <strong>Spot is for emergencies</strong> and needs a reason.</p>
      <div id="s-todo" class="cards"><p class="empty">Loading…</p></div>
    </section>
    <section class="panel"><h2>Booked</h2><p class="small top0">Un-book sends a PO back to Accepted, and the teams can change their answers again.</p><div id="s-done"></div></section>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-id]");
      if (!b) return;
      if (!mine("logistics")) return toast("Only Logistics books trucks. Use “Act as Logistics”.", true);
      b.disabled = true;
      try {
        const it = byId(await store.list(), b.dataset.id);
        if (!it) return;
        const lane = E.itemLane(it);
        if (b.dataset.ask) await askCarrier(store, state.items, lane, E.dateOf(it), +b.dataset.ask, it);
        else if (b.dataset.book) {
          if (E.stageOf(it) !== "accepted") throw new Error("it's no longer accepted. A team changed its answer");
          const a = E.allocate(state.items, NOW).get(it.id);
          const reason = $(`#why-${it.id}`)?.value || "";
          if (a.spot && !reason) throw new Error("pick why spot is needed");
          if (it.data.trucks < 0) await askCarrier(store, state.items, lane, E.dateOf(it), it.data.trucks, null);
          const fresh = byId(await store.list(), it.id);
          const ev = it.data.trucks < 0 ? `Released ${plural(-it.data.trucks, "contract truck")} and told the carrier`
            : a.spot ? `Booked ${a.contract} contract + ${a.spot} spot (${reason})` : `Booked all ${a.contract} on contract`;
          await store.update(it.id, { data: E.withLog({ ...fresh.data, scheduled_at: nowIso(), spot_reason: a.spot ? reason : null }, entry(ev, it.data.trucks < 0 ? "Change done" : `Trucks booked for ${fmtDate(E.dateOf(it))}`)) });
          toast(it.data.trucks < 0 ? "Released. The carrier knows." : a.spot ? `Booked: ${a.contract} contract, ${a.spot} emergency spot.` : `Booked: all ${a.contract} on contract.`);
        } else if (b.dataset.unbook) {
          await store.update(it.id, { data: E.withLog({ ...it.data, scheduled_at: null, spot_reason: null }, entry("Un-booked: back to Accepted", "Ball is re-booking trucks")) });
          toast("Un-booked. It's back in Accepted, and teams can change their answers.");
        }
        state.refresh();
      } catch (err) { toast("Couldn't do that: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  function live(items) {
    const alloc = E.allocate(items, NOW);
    const todo = orders(items).filter((x) => E.stageOf(x) === "accepted").sort((a, b) => (E.dateOf(a) < E.dateOf(b) ? -1 : 1));
    const done = orders(items).filter((x) => E.stageOf(x) === "booked").reverse();
    const L = locked("logistics");
    $("#s-todo").innerHTML = todo.length ? todo.map((it) => {
      const a = alloc.get(it.id);
      const lane = E.itemLane(it);
      const by = E.addDays(E.dateOf(it), -RULES.noticeDays);
      const asks = items.filter((x) => x.type === "ask" && String(x.data.for) === String(it.id));
      const head = `<div class="card-head"><span class="pill">${E.poNumber(items, it)}</span>${isChange(it) ? `<span class="pill pill-change">Change</span>` : ""}
          <span class="due${E.daysBetween(NOW, by) <= 2 ? " due-soon" : ""}">Book by ${esc(fmtDate(by))}</span>
          <a class="meta-sm open-po" href="${link("pos")}#${esc(it.id)}">Open PO</a></div>
        <h3>${esc(laneName(lane))} · ${esc(SIM_CUSTOMERS[it.data.customer].name)} · ${esc(fmtDate(E.dateOf(it)))}</h3>`;
      if (it.data.trucks < 0) return `<article class="card card-plain">${head}
        <p class="meta">The customer cut ${plural(-it.data.trucks, "truckload")}. Release those contract trucks so the carrier can move its drivers.</p>
        <div class="card-actions"><button type="button" class="util on" data-book="1" data-id="${esc(it.id)}"${L}>Release ${plural(-it.data.trucks, "contract truck")} and tell the carrier</button></div></article>`;
      const d = a.days[0];
      const asked = asks.some((x) => x.data.trucks > 0);
      const askFirst = a.capSpot > 0 && !asked;
      return `<article class="card card-plain">${head}
        <div class="plan-rows">
          <p><span class="b b-contract">${a.contract}</span> on the contract carrier <span class="meta-sm">(${d.weekRoom} contract trucks left that week, of ${d.cover})</span></p>
          ${asks.map((x) => `<p class="ask-line ask-${x.status}">Carrier: ${esc(x.data.why)}</p>`).join("")}
          ${a.spot ? `<p><span class="b b-spot">${a.spot}</span> no contract truck: <strong>spot, ${money(a.overspend)} more</strong></p>` : ""}
        </div>
        ${askFirst ? `<p class="hint">Before using spot, ask the carrier for extra trucks. With a week's notice it can usually add some.</p>` : ""}
        <div class="card-actions">
          ${askFirst ? `<button type="button" class="util on" data-ask="${a.capSpot}" data-id="${esc(it.id)}"${L}>Ask the carrier for +${a.capSpot}</button>` : ""}
          ${a.spot ? `<select id="why-${esc(it.id)}" class="why"${L}><option value="">Why spot? (emergency only)</option>${SPOT_REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>` : ""}
          <button type="button" class="util${askFirst ? "" : " on"}" data-book="1" data-id="${esc(it.id)}"${L}>${a.spot ? `Book ${a.contract} contract + ${a.spot} spot` : `Book all ${a.contract} on contract`}</button>
        </div></article>`;
    }).join("") : `<p class="empty">Nothing to book. POs land here when all four teams approve.</p>`;
    $("#s-done").innerHTML = done.length ? `<ul class="done-list">${done.map((it) => {
      const a = alloc.get(it.id);
      return `<li><span class="done-what"><strong>${E.poNumber(items, it)}${isChange(it) ? " change" : ""} · ${esc(laneName(E.itemLane(it)))}</strong>
          <span class="kind">${esc(fmtDate(E.dateOf(it)))}${it.data.spot_reason ? ` · spot because: ${esc(it.data.spot_reason)}` : ""}</span></span>
        <span class="done-split">${it.data.trucks < 0 ? `released ${-it.data.trucks}` : chips(a.contract, a.spot)}</span>
        <button type="button" class="linkish" data-unbook="1" data-id="${esc(it.id)}"${L}>Un-book</button></li>`;
    }).join("")}</ul>` : `<p class="empty">Nothing booked yet.</p>`;
  }

  return { html, mount, live };
}

// ---------- Logistics · 6-week outlook (early warning) ----------
const ZONE = { green: "On plan", yellow: "Watch", red: "Act now" };

function outlookView(store, state) {
  const html = `<section class="panel">
      <h2>Findlay's next 6 weeks, in trucks</h2>
      <p class="lede">POs come in as cans. We turn them into trucks (${num(RULES.cansPerTruck)} cans each) and compare every lane and week with the trucks its contract carrier takes, so Logistics calls the carrier weeks ahead, not on Thursday.</p>
      <p class="legend"><span class="z z-green">On plan</span> within ±10% <span class="z z-yellow">Watch</span> 10–25% <span class="z z-red">Act now</span> over 25% · <span class="b b-spot">n</span> trucks going spot</p>
      <div id="o-grid"><p class="empty">Loading…</p></div>
    </section>
    <section class="panel"><h2>What Logistics does next</h2><div id="o-actions"></div></section>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-cell]");
      if (!b) return;
      if (!mine("logistics")) return toast("Only Logistics talks to carriers. Use “Act as Logistics”.", true);
      b.disabled = true;
      try {
        const [key, week] = b.dataset.cell.split("@");
        const [kind, destination] = key.split("|");
        await askCarrier(store, state.items, E.laneOf(kind, destination), E.addDays(week, 3), +b.dataset.n, null);
        state.refresh();
      } catch (err) { toast("Couldn't do that: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  function live(items) {
    const ol = E.outlook(items, NOW);
    const L = locked("logistics");
    const cell = (w) => `<td class="cell z-${w.zone}" title="${ZONE[w.zone]}">
        <span class="cell-n">${w.needed}</span><span class="cell-plan">of ${w.cover}${w.extra ? ` (${w.extra > 0 ? "+" : ""}${w.extra})` : ""}</span>
        <span class="cell-chg">${w.change > 0 ? "+" : ""}${Math.round(w.change * 100)}%</span>${w.spot ? `<span class="b b-spot">${w.spot}</span>` : ""}</td>`;
    const group = (kind, title) => ol.filter((r) => r.lane.kind === kind).map((r, i) => `<tr>
        <th scope="row">${i === 0 ? `<span class="grp">${title}</span>` : ""}${esc(r.lane.destination)}<span class="kind">~${r.lane.perWeek} contract trucks a week</span></th>${r.weeks.map(cell).join("")}</tr>`).join("");
    $("#o-grid").innerHTML = `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Lane from Findlay</th>${ol[0].weeks.map((w, i) => `<th>${i === 0 ? "This week" : weekLabel(w.week)}</th>`).join("")}</tr></thead>
      <tbody>${group("order", "To customers")}${group("transfer", "Transfers to warehouses")}</tbody></table></div>
      <p class="small">Each cell: trucks needed (already booked + new POs and transfers) of the contract trucks that week, and the change vs. the usual.</p>`;
    const acts = [];
    for (const r of ol) for (const w of r.weeks) {
      if (!w.action) continue;
      const where = `<strong>${esc(laneName(r.lane))}</strong> · week of ${weekLabel(w.week)}`;
      const what = `${w.needed} needed vs. ${r.lane.perWeek} usual (${w.change > 0 ? "+" : ""}${Math.round(w.change * 100)}%)`;
      const cellKey = `${r.lane.key}@${w.week}`;
      acts.push({ z: w.zone, wk: w.wk, html: w.action.kind === "more"
        ? `<li class="act z-${w.zone}"><span>${where}<br>${what} · <strong>${w.capSpot} going spot</strong></span>
            <button type="button" class="util on" data-cell="${esc(cellKey)}" data-n="${w.capSpot}"${L}>Ask carrier for +${w.capSpot}</button></li>`
        : `<li class="act z-${w.zone}"><span>${where}<br>${what} · ${w.unused} contract trucks unused</span>
            <span class="act-btns"><button type="button" class="util" data-cell="${esc(cellKey)}" data-n="${-w.unused}"${L}>Warn carrier: −${w.unused}</button>
            ${r.lane.kind === "transfer" ? `<a class="small" href="${link("logistics", { tab: "transfers" })}">or ship a prebuild into it →</a>` : ""}</span></li>` });
    }
    const rank = { red: 0, yellow: 1, green: 2 };
    acts.sort((a, b) => rank[a.z] - rank[b.z] || a.wk - b.wk);
    $("#o-actions").innerHTML = acts.length ? `<ul class="acts">${acts.map((a) => a.html).join("")}</ul>` : `<p class="empty">Nothing to do: every lane and week is on plan and covered.</p>`;
  }

  return { html, mount, live };
}

// ---------- Logistics · Transfers (prebuild in waves) ----------
function transfersView(store, state) {
  const transferLanes = PILOT_LANES.filter((l) => l.kind === "transfer");
  const nextMon = E.addDays(E.weekKey(NOW), 8);
  const form = { destination: "Mississauga, ON", trucks: 12, date: E.daysBetween(NOW, nextMon) >= RULES.noticeDays ? nextMon : E.addDays(nextMon, 7), pattern: "w3" };
  const html = `<div class="cols cols-plan">
    <section class="panel">
      <h2>Ship a prebuild in waves</h2>
      <p class="lede">64% of 2026 spot loads were Ball moving its own cans to warehouses. Ball decides when those ship. Send a big run all at once and carriers can't take it. Release it in waves and it fits on contract.</p>
      <div class="row2">
        <label class="field"><span class="label">To warehouse</span>
          <select id="p-dest">${transferLanes.map((l) => `<option>${esc(l.destination)}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Truckloads</span>
          <input id="p-trucks" type="number" min="1" max="200" inputmode="numeric"></label>
        <label class="field"><span class="label">First pickup</span>
          <input id="p-date" type="date" min="${E.addDays(NOW, RULES.noticeDays)}" max="${LAST_DAY}"></label>
      </div>
      <div id="p-compare"></div>
      <button type="button" id="p-send" class="cta">Schedule it</button>
    </section>
    <section class="panel"><h2>Scheduled transfers</h2><div id="p-list"></div></section>
  </div>`;

  const draft = (pattern = form.pattern) => ({ id: "draft", type: "transfer", status: "booked", created_at: "￿",
    data: { destination: form.destination, trucks: form.trucks, date: form.date, pattern, booked_at: nowIso() } });

  function paint() {
    $("#p-dest").value = form.destination;
    $("#p-trucks").value = form.trucks;
    $("#p-date").value = form.date;
    $("#p-send").disabled = !mine("logistics");
    $("#p-send").title = mine("logistics") ? "" : "Logistics only. Use “Act as Logistics”.";
    const rows = Object.entries(PATTERNS).map(([key, p]) => ({ key, p, a: E.allocate([...state.items, draft(key)], NOW).get("draft") }));
    const best = rows.reduce((m, r) => (r.a.profit > m.a.profit ? r : m), rows[0]);
    $("#p-compare").innerHTML = `<p class="label">Preview: ${form.trucks} trucks to ${esc(form.destination)} from ${esc(fmtDate(form.date))}</p>
    <table class="compare"><thead><tr><th>How it ships</th><th>Trucks</th><th>Profit per truck</th><th>Trucking cost</th></tr></thead><tbody>
      ${rows.map(({ key, p, a }) => `<tr class="${key === form.pattern ? "c-on" : ""}">
        <th><label><input type="radio" name="pat" value="${key}" ${key === form.pattern ? "checked" : ""}> ${p.label}${key === best.key ? ` <span class="best">best</span>` : ""}</label></th>
        <td>${chips(a.contract, a.spot)}</td><td><span class="mini mini-${a.color}">${money(a.perTruck)}</span></td><td>${money(a.extra)}</td></tr>`).join("")}
    </tbody></table>
    <p class="small">Why: a carrier can add only about 1/7 of its weekly trucks on any one day, and only what's left that week after trucks already booked.</p>`;
  }

  function mount() {
    $("#p-dest").addEventListener("change", (e) => { form.destination = e.target.value; paint(); });
    $("#p-trucks").addEventListener("input", (e) => { form.trucks = Math.min(200, Math.max(1, +e.target.value || 1)); paint(); });
    $("#p-date").addEventListener("change", (e) => { form.date = e.target.value; paint(); });
    $("#p-compare").addEventListener("change", (e) => { if (e.target.name === "pat") { form.pattern = e.target.value; paint(); } });
    $("#p-send").addEventListener("click", async (e) => {
      const b = e.target;
      b.disabled = true;
      try {
        if (E.daysBetween(NOW, form.date) < RULES.noticeDays) throw new Error(`pick a first pickup ${RULES.noticeDays}+ days out`);
        await store.add({ type: "transfer", status: "booked", data: { ...draft().data, by: { name: ME.name } } });
        toast(`Scheduled: ${form.trucks} trucks to ${form.destination}, ${PATTERNS[form.pattern].label.toLowerCase()}.`);
        state.refresh();
      } catch (err) { toast("Couldn't do that: " + err.message, true); }
      finally { b.disabled = !mine("logistics"); }
    });
    paint();
  }

  function live(items) {
    paint();
    const alloc = E.allocate(items, NOW);
    const list = items.filter((x) => x.type === "transfer").reverse();
    $("#p-list").innerHTML = list.length ? `<ul class="done-list">${list.map((it) => {
      const a = alloc.get(it.id);
      return `<li><span class="done-what"><strong>Findlay → ${esc(it.data.destination)}</strong><span class="kind">${plural(it.data.trucks, "truckload")} · ${esc(PATTERNS[it.data.pattern].label.toLowerCase())} from ${esc(fmtDate(it.data.date))}${it.data.by?.name ? ` · by ${esc(it.data.by.name)}` : ""}</span></span>
        <span class="done-split">${chips(a.contract, a.spot)}</span><span class="done-money">${money(a.perTruck)}<span class="kind">per truck</span></span></li>`;
    }).join("")}</ul>` : `<p class="empty">None yet.</p>`;
  }

  return { html, mount, live };
}

// ---------- Dashboard (plant manager) ----------
function dashboardView(store, state) {
  const html = `<section class="hub">
      <div class="hub-head"><div><h1>Findlay pilot dashboard</h1><p class="lede">Where every PO stands, who it's waiting on, and what spot is costing.</p></div>
        <span class="live"><span class="pulse"></span>${store.live ? "Live" : "This laptop only"}</span></div>
      <div id="d-tiles" class="totals"><p class="empty">Loading…</p></div>
      <div id="d-teams"></div>
      <div id="d-compare"></div>
      <div class="cols cols-plan">
        <section class="panel"><h2>Activity</h2><ul id="d-feed" class="feed"></ul></section>
        <section class="panel"><h2>Emergency spot log</h2><div id="d-spot"></div></section>
      </div>
      <button type="button" id="d-reset" class="util quiet">Clear all data (admin)</button>
    </section>`;

  function mount() {
    $("#d-reset").addEventListener("click", async () => {
      const pin = store.live ? prompt("Enter the admin PIN to clear every PO, transfer and carrier answer:") : "local";
      if (pin === null) return;
      if (!store.live && !confirm("Clear every PO, transfer and carrier answer on this laptop?")) return;
      try { await store.reset(pin); toast("Cleared."); state.refresh(); }
      catch (err) { toast("Not cleared: " + err.message, true); }
    });
  }

  function live(items) {
    const now = E.totals(items, NOW);
    const old = E.totals(items, NOW, { oldWay: true });
    const os = orders(items);
    const inReview = os.filter((x) => E.stageOf(x) === "review");
    const answered = os.filter((x) => x.data.answer?.at);
    const avgMin = answered.length ? answered.reduce((s, x) => s + (new Date(x.data.answer.at) - new Date(x.created_at)), 0) / answered.length / 60000 : null;
    const tile = (label, value, sub, cls = "") => `<div class="stat ${cls}"><p class="stat-label">${label}</p><p class="stat-value">${value}</p><p class="stat-sub">${sub}</p></div>`;
    $("#d-tiles").innerHTML =
      tile("Spot share", now.trucks ? pct(now.spotShare) : "–", `${now.spot} of ${now.trucks} new truckloads · goal 10% or less`) +
      tile("Spot cost", money(now.overspend), "paid above contract prices") +
      tile("POs in review", inReview.length, `${os.filter((x) => E.stageOf(x) === "accepted").length} accepted, waiting to book`) +
      tile("Time to answer customers", avgMin == null ? "–" : avgMin < 60 ? `${Math.max(1, Math.round(avgMin))} min` : `${(avgMin / 60).toFixed(1)} hr`, "target: under 4 hours");
    $("#d-teams").innerHTML = `<section class="panel"><h2>Waiting on each team</h2><div class="teamrow">${TEAMS.map((t) => {
      const mineNow = os.filter((x) => needs(x, t));
      const oldest = mineNow.reduce((m, x) => (!m || x.created_at < m ? x.created_at : m), null);
      return `<a class="teamcard${mineNow.length ? " tc-busy" : ""}" href="${link(t)}"><span class="tc-name">${TEAM_NAME[t]}</span>
        <span class="tc-n">${mineNow.length}</span><span class="tc-sub">${mineNow.length ? `oldest waiting ${ago(oldest)}` : "nothing waiting"}</span></a>`;
    }).join("")}</div></section>`;
    $("#d-compare").innerHTML = now.trucks ? `<div class="compare-box">
      <div><p class="stat-label">The old way</p><p class="cmp-n">${old.spot} spot · ${money(old.overspend)}</p><p class="small">Same POs, but nobody asks the carrier ahead and transfers ship in one batch.</p></div>
      <div class="cmp-arrow">${icon("arrow")}</div>
      <div><p class="stat-label">With the system</p><p class="cmp-n">${now.spot} spot · ${money(now.overspend)}</p><p class="small">Teams check together, Logistics asks carriers early, transfers go in waves.</p></div></div>` : "";
    const alloc = E.allocate(items, NOW);
    const spotted = os.filter((x) => E.stageOf(x) === "booked" && alloc.get(x.id)?.spot);
    $("#d-spot").innerHTML = spotted.length ? `<ul class="feed">${spotted.map((x) => `<li><strong>${E.poNumber(items, x)}</strong> · ${alloc.get(x.id).spot} spot (${money(alloc.get(x.id).overspend)}) · ${esc(x.data.spot_reason || "")}</li>`).join("")}</ul>`
      : `<p class="empty">No spot trucks booked. Spot is for emergencies only.</p>`;
    // Activity: every history entry from every PO, plus carrier answers and transfers.
    const feed = [];
    for (const it of items) {
      if (it.type === "order") for (const e of logOf(it)) feed.push({ at: e.at, html: `<a href="${link("pos")}#${esc(it.id)}"><strong>${E.poNumber(items, it)}</strong>${isChange(it) ? " change" : ""}</a> · <strong>${whoLabel(it, e)}</strong> ${esc(e.ev)}` });
      else if (it.type === "transfer") feed.push({ at: it.created_at, html: `<strong>Transfer</strong> ${plural(it.data.trucks, "truckload")} to ${esc(it.data.destination)}, ${esc(PATTERNS[it.data.pattern].label.toLowerCase())}${it.data.by?.name ? ` · ${esc(it.data.by.name)} (Logistics)` : ""}` });
      else if (!it.data.for) feed.push({ at: it.created_at, html: `<strong>Carrier</strong> ${esc(it.data.destination)}, week of ${weekLabel(it.data.week)}: ${esc(it.data.why || it.status)}` });
    }
    feed.sort((a, b) => (a.at < b.at ? 1 : -1));
    $("#d-feed").innerHTML = feed.length ? feed.slice(0, 40).map((f) => `<li><time>${esc(time(f.at))}</time> ${f.html}</li>`).join("") : `<li class="empty">Nothing yet. Start at Customer HQ.</li>`;
  }

  return { html, mount, live };
}

// ---------- Home ----------
function homeView() {
  return { html: `<section class="home">
    <h1>From customer PO to booked truck, with every team on the same page.</h1>
    <div class="two-doors">
      <a class="door door-cust" href="${link("customer")}"><span class="team-name">Customer HQ</span><span class="team-line">For customers: place a PO, request a change, see where it stands.</span></a>
      <a class="door" href="${link("ball")}"><span class="team-name">Ball HQ</span><span class="team-line">For Ball's teams: Sales, Inventory, Production and Logistics answer every PO together, then Logistics books the trucks.</span></a>
    </div>
    ${sourceNote()}
  </section>` };
}

// ---------- Boot ----------
async function main() {
  let role = PARAMS.get("role");
  let sub = PARAMS.get("tab") || "signoff";
  if (role in ALIASES) [role, sub = sub] = ALIASES[role];
  if (role && role !== "customer" && role !== "ball" && !BALL_TABS[role]) role = null;
  const portal = role === "customer" ? "customer" : role ? "ball" : "home";
  ME = portal === "home" ? null : loadMe(portal);
  if (portal === "ball" && ME && !TEAM_NAME[ME.team]) ME = null;
  if (portal === "customer" && ME && !SIM_CUSTOMERS[ME.customer]) ME = null;
  const signingIn = portal !== "home" && (!ME || sessionStorage.getItem("bc_switch") === portal);
  if (portal === "ball" && role === "ball" && ME && !signingIn) role = HOME_TAB[ME.team];
  if (role === "logistics" && !LOG_TABS[sub]) sub = "signoff";
  document.body.dataset.portal = portal;
  document.body.dataset.role = role || "home";

  // Two separate headers: customers never see Ball HQ.
  $("#brand").innerHTML = portal === "customer" ? `<span class="wordmark">Ball</span> Customer HQ` : portal === "ball" ? `<span class="wordmark">Ball</span> HQ` : `<span class="wordmark">Ball</span> Findlay pilot`;
  $("#brand").href = portal === "customer" ? link("customer") : "./";
  const drawMe = () => {
    $("#me").innerHTML = ME && !signingIn ? `<span class="me-name">${esc(ME.name)}</span><span class="me-team">${portal === "ball" ? TEAM_NAME[ME.team] : esc(SIM_CUSTOMERS[ME.customer].name)}</span>
      <button type="button" class="me-switch" id="me-switch">Switch</button>` : "";
  };
  drawMe();
  const store = await makeStore();
  const state = { items: [], refresh: null };
  const drawNav = (items = []) => {
    if (portal !== "ball" || signingIn) { $("#nav").innerHTML = ""; return; }
    const count = { sales: teamCount(items, "sales"), inventory: teamCount(items, "inventory"), production: teamCount(items, "production"), logistics: teamCount(items, "logistics") };
    $("#nav").innerHTML = Object.entries(BALL_TABS).map(([r, name]) =>
      `<a href="${link(r)}${location.hash}" class="${r === role ? "on" : ""}${r === HOME_TAB[ME.team] ? " mine" : ""}">${name}${count[r] ? ` <span class="tab-count">${count[r]}</span>` : ""}</a>`).join("");
  };
  drawNav();
  addEventListener("hashchange", () => drawNav(state.items));
  const notes = [];
  if (!store.live) notes.push(FORCE_LOCAL ? "Backup mode: everything stays on this laptop." : "Local mode: add the Supabase keys in config.js to share across devices.");
  if (PARAMS.get("today")) notes.push(`Rehearsal date: today is ${fmtDate(NOW)}.`);
  if (notes.length) { $("#mode-banner").hidden = false; $("#mode-banner").textContent = notes.join(" "); }
  document.title = portal === "customer" ? "Customer HQ · Ball" : portal === "ball" ? `${signingIn ? "Sign in" : BALL_TABS[role]} · Ball HQ` : "Ball Findlay pilot";

  const view = portal === "home" ? homeView()
    : signingIn ? signInView(portal)
    : portal === "customer" ? customerView(store, state)
    : role === "pos" ? (() => { const b = board(store, state, null); return { ...b, html: `<div class="dept-head"><div><h1>All POs</h1><p class="lede">Every PO and change, every team's answer, in one place. Open any PO to see its history.</p></div></div>` + b.html }; })()
    : role === "dashboard" ? dashboardView(store, state)
    : deptView(store, state, role, sub);
  $("#app").innerHTML = view.html + (portal === "ball" && !signingIn ? sourceNote() : "");
  view.mount?.();

  // Switch person or team; "Act as" swaps the team in place.
  document.addEventListener("click", (e) => {
    if (e.target.closest("#me-switch")) { sessionStorage.setItem("bc_switch", portal); location.reload(); return; }
    const as = e.target.closest("[data-act-as]");
    if (as && ME) {
      ME = { ...ME, team: as.dataset.actAs };
      saveMe(portal, ME);
      drawMe();
      toast(`Now answering for ${TEAM_NAME[ME.team]}.`);
      state.refresh();
    }
  });

  let busy = false, again = false;
  state.refresh = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      state.items = await store.list();
      drawNav(state.items);
      view.live?.(state.items);
    } catch (err) {
      toast("Can't reach the database: " + err.message, true);
    } finally {
      busy = false;
      if (again) { again = false; state.refresh(); }
    }
  };
  if (view.live) { store.subscribe(() => state.refresh()); state.refresh(); }
}

main();
