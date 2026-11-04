import * as E from "./engine.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const { RULES, PILOT_LANES, SIM_CUSTOMERS, PATTERNS, TEAMS, QUESTIONS } = E;
const PARAMS = new URLSearchParams(location.search);
const NOW = PARAMS.get("today") || E.isoDate(new Date()); // ?today=2026-11-05 to rehearse a date
const FORCE_LOCAL = PARAMS.has("local");                   // ?local = backup if the room's Wi-Fi fails

// Ball HQ tabs, in the order a PO moves through them.
const BALL = {
  review: { name: "1 · Review POs" },
  schedule: { name: "2 · Schedule trucks" },
  outlook: { name: "6-week outlook" },
  transfers: { name: "Transfers" },
  dashboard: { name: "Dashboard" },
};
const ALIASES = { team: "review", sales: "review", production: "review", planning: "review", logistics: "schedule",
  carrier: "schedule", plan: "outlook", hub: "dashboard", how: null };
const TEAM_NAME = { sales: "Sales", inventory: "Inventory", production: "Production", logistics: "Logistics" };
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

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (x) => Math.round(x * 100) + "%";
const num = (n) => Math.round(n).toLocaleString("en-US");
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekLabel = (sun) => {
  const sat = E.addDays(sun, 6);
  return E.atNoon(sun).getMonth() === E.atNoon(sat).getMonth() ? `${fmtShort(sun)}–${E.atNoon(sat).getDate()}` : `${fmtShort(sun)}–${fmtShort(sat)}`;
};
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const LAST_DAY = E.addDays(E.weekKey(NOW), RULES.weeks * 7 - 1);
const link = (role) => `?role=${role}${FORCE_LOCAL ? "&local" : ""}${PARAMS.get("today") ? `&today=${PARAMS.get("today")}` : ""}`;
const custName = (dest) => `${SIM_CUSTOMERS[dest].name} · ${dest}`;
const laneName = (lane) => `Findlay → ${lane.destination}`;
const chips = (contract, spot) =>
  `${contract ? `<span class="b b-contract">${contract}</span> contract ` : ""}${spot ? `<span class="b b-spot">${spot}</span> spot` : ""}`;
const byId = (items, id) => items.find((x) => String(x.id) === String(id));
const orders = (items) => items.filter((x) => x.type === "order");
const isChange = (it) => it.data.kind === "change";
const changesOf = (items, po) => orders(items).filter((x) => isChange(x) && String(x.data.parent) === String(po.id));
// A PO's total: the PO plus the changes Ball accepted.
const poTotal = (items, po) => po.data.trucks + changesOf(items, po).filter((c) => c.status === "confirmed").reduce((s, c) => s + c.data.trucks, 0);

const ICONS = {
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  x: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  dot: '<circle cx="10" cy="10" r="4.5"/>',
  arrow: '<path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5"/>',
};
const icon = (name) => `<svg class="ic ic-${name}" viewBox="0 0 20 20" aria-hidden="true">${ICONS[name]}</svg>`;

function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " toast-bad" : "");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

const sourceNote = () => `<p class="provenance"><strong>Real</strong> (Ball's 2026 workbook, Findlay, Jan–Jul, no shuttles): lanes, contract trucks a week, contract and spot prices.
  <strong>Simulated</strong> for the demo: trucks already booked, customers and their forecasts, stock, line time, and the carrier's answers.</p>`;

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

// ---------- Customer HQ ----------
const CUST_STEPS = ["Sent", "Ball reviews", "Accepted", "Trucks booked"];
function custStep(it) {
  if (it.status === "declined") return -1;
  if (it.data.scheduled_at) return 4;
  if (it.status === "confirmed") return 3;
  return 2;
}

function customerView(store, state) {
  const saved = localStorage.getItem("bc_customer");
  const form = {
    customer: SIM_CUSTOMERS[saved] ? saved : "Cincinnati, OH",
    cans: 2000000, reason: "Promotion",
    date: E.addDays(E.weekKey(NOW), 14 + 4), // Thursday, two weeks out
    changeOf: null,                          // PO id when requesting a change
  };
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
      <h1>Request a change to ${E.poNumber(state.items, po)}</h1>
      <p class="lede">Today it's <strong>${plural(poTotal(state.items, po), "truckload")}</strong> for <strong>${esc(fmtDate(E.dateOf(po)))}</strong>. Your change goes through the same Ball review as a new PO.</p>
      ${cansField("New total: how many cans?")}
      ${reasons}
      <div id="c-rules" class="rules"></div>
      <button type="button" id="c-send" class="cta">Send change request</button>
      <button type="button" id="c-cancel" class="util quiet">Cancel</button>`
      : `
      <h1>Place a PO with Ball</h1>
      <label class="field"><span class="label">Your filling plant</span>
        <select id="c-who">${Object.keys(SIM_CUSTOMERS).map((d) => `<option value="${esc(d)}">${esc(custName(d))}</option>`).join("")}</select></label>
      ${cansField("How many cans?")}
      <label class="field"><span class="label">Delivery date</span>
        <input id="c-date" type="date" min="${NOW}" max="${LAST_DAY}"></label>
      ${reasons}
      <div id="c-rules" class="rules"></div>
      <button type="button" id="c-send" class="cta">Send PO to Ball</button>`;
    $("#c-who")?.addEventListener("change", (e) => { form.customer = e.target.value; localStorage.setItem("bc_customer", form.customer); paint(); live(state.items); });
    $("#c-cans").addEventListener("input", (e) => { form.cans = Math.max(1, +e.target.value || 0); paint(); });
    $("#c-date")?.addEventListener("change", (e) => { form.date = e.target.value < NOW ? NOW : e.target.value > LAST_DAY ? LAST_DAY : e.target.value; paint(); });
    paint();
  }

  function paint() {
    const po = changing();
    if ($("#c-who")) $("#c-who").value = form.customer;
    if ($("#c-date")) $("#c-date").value = form.date;
    $("#c-cans").value = form.cans;
    document.querySelectorAll("#c-reason button").forEach((b) => b.classList.toggle("on", b.dataset.reason === form.reason));
    const date = po ? E.dateOf(po) : form.date;
    const now = po ? poTotal(state.items, po) : 0;
    const delta = trucks() - now;
    $("#c-trucks").innerHTML = po
      ? `= <strong>${plural(trucks(), "truckload")}</strong>: that's <strong>${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}</strong> vs. today's ${now}`
      : `= <strong>${plural(trucks(), "truckload")}</strong> at ${num(RULES.cansPerTruck)} cans per truck`;
    const cust = SIM_CUSTOMERS[form.customer];
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
      await store.add({ type: "order", status: "waiting", data: po
        ? { kind: "change", parent: po.id, customer: po.data.customer, trucks: delta, cans: delta * RULES.cansPerTruck, date: E.dateOf(po), reason: form.reason, signoffs: {} }
        : { kind: "po", customer: form.customer, trucks: trucks(), cans: trucks() * RULES.cansPerTruck, date: form.date, reason: form.reason, signoffs: {} } });
      toast(po ? "Change request sent to Ball." : "PO sent to Ball. Watch its progress on the right.");
      form.changeOf = null; form.cans = 2000000;
      drawForm();
      state.refresh();
    } catch (err) { toast("Couldn't send: " + err.message, true); }
    finally { btn.disabled = false; }
  }

  async function reply(btn) {
    const it = byId(state.items, btn.dataset.id);
    if (!it) return;
    btn.disabled = true;
    const yes = btn.dataset.reply === "yes";
    try {
      await store.update(it.id, { status: yes ? "confirmed" : "declined", data: { ...it.data, customer_reply: { yes, at: new Date().toISOString() } } });
      toast(yes ? "Accepted. Ball's Logistics team books the trucks next." : "Declined.");
      state.refresh();
    } catch (err) { toast("Couldn't update: " + err.message, true); btn.disabled = false; }
  }

  // What the customer sees about one PO or change (never Ball's costs or spot).
  function statusBlock(it) {
    const step = custStep(it);
    if (it.status === "declined") {
      const byBall = it.data.answer?.kind === "declined";
      return `<p class="answer">${isChange(it) ? "Not changed. Your PO stays as it was." : byBall ? "Ball can't fill this PO." : "You declined Ball's offer."}</p>`;
    }
    const bar = `<ol class="steps-bar">${CUST_STEPS.map((s, i) => `<li class="${i + 1 < step || step === 4 ? "done" : i + 1 === step ? "now" : ""}">${s}</li>`).join("")}</ol>`;
    let line = "";
    if (it.status === "waiting") {
      const done = TEAMS.filter((t) => it.data.signoffs?.[t]).length;
      line = `<p class="answer">Ball is reviewing: <strong>${done} of 4 teams</strong> have checked it.</p>`;
    } else if (it.status === "offered") {
      line = `<p class="answer answer-offer">Ball can't do ${esc(fmtDate(it.data.date))}, but can deliver on <strong>${esc(fmtDate(it.data.answer.date))}</strong>. Does that work?</p>
        <div class="card-actions"><button type="button" class="util on" data-reply="yes" data-id="${esc(it.id)}">Accept ${esc(fmtShort(it.data.answer.date))}</button>
        <button type="button" class="util" data-reply="no" data-id="${esc(it.id)}">Decline</button></div>`;
    } else if (!it.data.scheduled_at) line = `<p class="answer answer-yes">${icon("check")}Accepted for ${esc(fmtDate(E.dateOf(it)))}. Ball's Logistics team is booking trucks.</p>`;
    else line = `<p class="answer answer-yes">${icon("check")}Trucks booked for ${esc(fmtDate(E.dateOf(it)))}.</p>`;
    return bar + line;
  }

  function live(items) {
    if (form.changeOf && !changing()) { form.changeOf = null; drawForm(); }
    const pos = orders(items).filter((x) => !isChange(x) && x.data.customer === form.customer).reverse();
    $("#c-mine").innerHTML = pos.length ? pos.map((po) => {
      const changes = changesOf(items, po).reverse();
      return `<article class="card card-plain">
        <div class="card-head"><span class="pill">${E.poNumber(items, po)}</span><span class="meta-sm">${esc(po.data.reason || "")} · sent ${esc(time(po.created_at))}</span></div>
        <h3>${plural(poTotal(items, po), "truckload")} · ${esc(fmtDate(E.dateOf(po)))}</h3>
        ${statusBlock(po)}
        ${changes.map((c) => `<div class="change-box"><p class="change-h">${whatLine(items, c)} <span class="meta-sm">· ${esc(time(c.created_at))}</span></p>${statusBlock(c)}</div>`).join("")}
        ${po.status !== "declined" ? `<div class="card-actions"><button type="button" class="util" data-change="${esc(po.id)}">Request a change</button></div>` : ""}
      </article>`;
    }).join("") : `<p class="empty">No POs yet. Place one on the left.</p>`;
    const c = SIM_CUSTOMERS[form.customer];
    const tier = E.priorityOf(c);
    $("#c-score").innerHTML = `<h2>Your reliability</h2>
      <p class="score"><span class="big">${pct(c.inBand)}</span> of your orders this quarter stayed within your forecast (±10%).</p>
      <p class="tier tier-${tier.toLowerCase()}">${tier === "Priority" ? "Priority customer: first claim on summer peak capacity." : "Standard customer: stay within your forecast 90% of the time to earn priority for summer peak capacity."}</p>
      <p class="small">Reliability earns priority. Simulated score for the demo.</p>`;
    if (!form.changeOf) paint();
  }

  return { html, mount, live };
}

// ---------- Ball HQ · 1. Review POs ----------
async function freshItem(store, id) {
  return byId(await store.list(), id); // re-read so two teams signing at once don't overwrite each other
}

async function askCarrier(store, items, lane, date, trucks, forId) {
  const ans = E.carrierAnswer(items, lane, date, trucks, NOW);
  await store.add({ type: "ask", status: ans.status, data: { kind: lane.kind, destination: lane.destination, week: E.weekKey(date), date, trucks, accepted: ans.accepted, for: forId ?? null, why: ans.why } });
  toast(`Carrier: ${ans.why}`, ans.status === "no");
}

function reviewView(store, state) {
  let selected = location.hash.slice(1) || null;
  const moreOpen = new Set(); // which teams' "Why" panels are open
  const html = `<div class="cols cols-team">
    <section class="panel queue"><h2>POs and changes</h2><div id="r-queue"><p class="empty">Loading…</p></div></section>
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
      const b = e.target.closest("button");
      if (!b || !b.dataset.id) return;
      b.disabled = true;
      try {
        const it = await freshItem(store, b.dataset.id);
        if (!it) return;
        if (b.dataset.sign) await sign(it, b.dataset.sign, b.dataset.ok === "1");
        else if (b.dataset.unsign) { const so = { ...it.data.signoffs }; delete so[b.dataset.unsign]; await store.update(it.id, { data: { ...it.data, signoffs: so } }); }
        else if (b.dataset.ask) await askCarrier(store, state.items, E.itemLane(it), E.dateOf(it), +b.dataset.ask, it.id);
        else if (b.dataset.answer) await answer(it, b.dataset.answer, b.dataset.date);
        else if (b.dataset.reopen) await store.update(it.id, { status: "waiting", data: { ...it.data, signoffs: {}, answer: null, scheduled_at: null, spot_reason: null, customer_reply: null } });
        state.refresh();
      } catch (err) { toast("Couldn't update: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  async function sign(it, team, ok) {
    const signoffs = { ...(it.data.signoffs || {}), [team]: { ok, at: new Date().toISOString() } };
    const all = TEAMS.every((t) => signoffs[t]?.ok === true);
    await store.update(it.id, { status: all ? "confirmed" : "waiting",
      data: { ...it.data, signoffs, ...(all ? { answer: { kind: "accepted", at: new Date().toISOString() } } : {}) } });
    toast(all ? "All four teams approved. Accepted: it's in Logistics' queue to schedule." : `${TEAM_NAME[team]} ${ok ? "approved" : "rejected"} it.`);
  }

  async function answer(it, kind, date) {
    const at = new Date().toISOString();
    if (kind === "new_date") await store.update(it.id, { status: "offered", data: { ...it.data, answer: { kind, date, at } } });
    else if (kind === "override") await store.update(it.id, { status: "confirmed", data: { ...it.data, answer: { kind, at } } });
    else await store.update(it.id, { status: "declined", data: { ...it.data, answer: { kind: "declined", at } } });
    toast(kind === "new_date" ? "Counteroffer sent. The customer sees it now." : kind === "override" ? "Accepted as an exception. It goes to Logistics." : "Declined. The customer sees it now.");
  }

  // Each team: its question, the check's answer, the reasons (folded), and Approve / Reject.
  // The button matching the check is the dark one; a team can still pick the other.
  function teamBox(it, team, c, signed, extra = "") {
    const s = signed[team];
    const override = s && s.ok !== c.ok;
    const open = it.status === "waiting";
    const state = s ? (s.ok ? "tbox-yes" : "tbox-no") : c.ok ? "tbox-ok" : "tbox-warn";
    return `<div class="tbox ${state}">
      <p class="tb-team">${TEAM_NAME[team]}</p>
      <p class="tb-q">${QUESTIONS[team]}</p>
      <p class="tb-verdict ${c.ok ? "tb-ok" : "tb-bad"}">${icon(c.ok ? "check" : "x")}${esc(c.verdict)}</p>
      <details class="tb-more" data-more="${team}"${moreOpen.has(team) ? " open" : ""}><summary>Why</summary>
        <ul class="tb-facts">${c.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>
      ${extra}
      ${s ? `<p class="tb-signed">${icon(s.ok ? "check" : "x")}${s.ok ? "Approved" : "Rejected"} at ${esc(time(s.at))}${override ? " (overrode the check)" : ""}
          ${open ? `<button type="button" class="linkish" data-unsign="${team}" data-id="${esc(it.id)}">Undo</button>` : ""}</p>`
        : open ? `<div class="tb-btns"><button type="button" class="util${c.ok ? " on" : ""}" data-sign="${team}" data-ok="1" data-id="${esc(it.id)}">Approve</button>
          <button type="button" class="util${c.ok ? "" : " on"}" data-sign="${team}" data-ok="0" data-id="${esc(it.id)}">Reject</button></div>`
        : `<p class="tb-signed tb-none">Not signed</p>`}
    </div>`;
  }

  // The one thing to do next on this PO, with its buttons when Sales must answer.
  function nextStep(items, it, r, logAsk) {
    const a = r.checks.alloc;
    const signed = r.signed;
    if (it.status === "offered") return { tone: "", html: `<p><strong>Waiting on the customer</strong> to accept ${esc(fmtDate(it.data.answer.date))}.</p>` };
    if (it.status === "declined") return { tone: "", html: `<p><strong>Declined</strong>${it.data.customer_reply ? " by the customer" : " by Ball"}. Nothing ships.</p>` };
    if (it.status === "confirmed") return { tone: "ok", html: it.data.scheduled_at
      ? `<p>${icon("check")}<strong>Done.</strong> Trucks booked: ${chips(a.contract, a.spot)}</p>`
      : `<p>${icon("check")}<strong>Accepted${it.data.answer?.kind === "override" ? " as an exception" : ""}.</strong> Next, Logistics books the trucks.</p>
         <a class="util on next-link" href="${link("schedule")}">Go to Schedule trucks ${icon("arrow")}</a>` };
    if (r.refused.length) {
      const better = E.betterDate(items, it, NOW);
      return { tone: "warn", html: `<p><strong>${r.refused.map((t) => TEAM_NAME[t]).join(" and ")} rejected it.</strong> Sales answers the customer:</p>
        <div class="card-actions">
          ${better ? `<button type="button" class="util on" data-answer="new_date" data-date="${better.date}" data-id="${esc(it.id)}">Offer ${esc(fmtDate(better.date))} instead</button>` : ""}
          <button type="button" class="util" data-answer="override" data-id="${esc(it.id)}">Accept anyway${a.spot ? ` (Ball pays ${money(a.overspend)} for spot)` : ""}</button>
          <button type="button" class="util" data-answer="declined" data-id="${esc(it.id)}">Decline</button>
        </div>${better ? `<p class="small">${esc(fmtDate(better.date))} passes Production and fits on contract trucks${better.gain ? `, saving ${money(better.gain)}` : ""}.</p>` : `<p class="small">No date in the next few weeks passes every check.</p>`}` };
    }
    if (!signed.logistics && logAsk) return { tone: "warn", html: `<p><strong>Logistics:</strong> ask the carrier for ${a.capSpot} more trucks before approving. With a week's notice it can usually add some.</p>` };
    const waiting = TEAMS.filter((t) => !signed[t]).map((t) => TEAM_NAME[t]);
    return { tone: "", html: `<p><strong>Waiting on ${waiting.join(", ")}.</strong> When all four approve, the PO is accepted and goes to Logistics.</p>` };
  }

  function detail(items, it) {
    const r = E.review(items, it, NOW);
    const c = r.checks;
    const a = c.alloc;
    // Logistics can ask the carrier for extra trucks right here.
    const asks = items.filter((x) => x.type === "ask" && String(x.data.for) === String(it.id));
    const logAsk = it.status === "waiting" && a.capSpot > 0 && !asks.some((x) => x.data.trucks > 0);
    let logExtra = asks.map((x) => `<p class="ask-line ask-${x.status}">Carrier: ${esc(x.data.why)}</p>`).join("");
    if (logAsk) logExtra += `<button type="button" class="util on wide" data-ask="${a.capSpot}" data-id="${esc(it.id)}">Ask the carrier for ${a.capSpot} more trucks</button>`;

    const signed = r.signed;
    const marks = TEAMS.map((t) => `<li class="${signed[t] ? (signed[t].ok ? "m-yes" : "m-no") : ""}">${icon(signed[t] ? (signed[t].ok ? "check" : "x") : "dot")}${TEAM_NAME[t]}</li>`).join("");
    const next = nextStep(items, it, r, logAsk);

    return `<div class="card-head"><span class="pill">${E.poNumber(items, it)}</span>${isChange(it) ? `<span class="pill pill-change">Change request</span>` : ""}
        <time>${esc(time(it.created_at))}</time></div>
      <h1 class="detail-h">${esc(custName(it.data.customer))}</h1>
      <p class="po-what">${whatLine(items, it)} · ${esc(it.data.reason || "")}</p>
      <div class="signrow"><ul class="marks">${marks}</ul><span class="m-count">${r.approved} of 4 approved${r.refused.length ? `, ${r.refused.length} rejected` : ""}</span></div>
      <div class="next next-${next.tone || "plain"}"><p class="next-label">Next step</p>${next.html}</div>
      ${it.data.trucks > 0 ? `<p class="shared shared-${a.color}">Profit per truckload: <strong>${money(a.perTruck)}</strong>
        <span class="sh-split">${chips(a.contract, a.spot)}${a.spot ? ` · spot adds ${money(a.overspend)}` : ""}</span>
        <span class="sh-sub">$3,100 minus extra trucking. Every team sees this number.</span></p>` : ""}
      <div class="tboxes">
        ${teamBox(it, "sales", c.sales, signed)}${teamBox(it, "inventory", c.inventory, signed)}${teamBox(it, "production", c.production, signed)}${teamBox(it, "logistics", c.logistics, signed, logExtra)}
      </div>
      <button type="button" class="linkish reopen" data-reopen="1" data-id="${esc(it.id)}">Reset this PO (for rehearsal)</button>`;
  }

  function live(items) {
    const list = orders(items).reverse();
    const open = list.filter((x) => x.status === "waiting");
    if (!list.some((x) => String(x.id) === String(selected))) selected = open[0]?.id ?? list[0]?.id ?? null;
    const STAT = { waiting: "In review", offered: "Counteroffer out", confirmed: "Accepted", declined: "Declined" };
    const row = (it) => {
      const n = TEAMS.filter((t) => it.data.signoffs?.[t]).length;
      return `<button type="button" class="q-row${String(it.id) === String(selected) ? " q-on" : ""}" data-pick="${esc(it.id)}">
        <span class="q-top"><strong>${E.poNumber(items, it)}</strong>${isChange(it) ? " change" : ""} · ${esc(SIM_CUSTOMERS[it.data.customer].name)}</span>
        <span class="q-sub">${it.data.trucks > 0 ? "+" : "−"}${plural(Math.abs(it.data.trucks), "truckload")} · ${esc(fmtShort(E.dateOf(it)))}
          <span class="status status-${esc(it.status)}">${STAT[it.status]}${it.status === "waiting" ? ` ${n}/4` : ""}${it.data.scheduled_at ? " · booked" : ""}</span></span>
      </button>`;
    };
    $("#r-queue").innerHTML = list.length ? list.map(row).join("") : `<p class="empty">No POs yet. They arrive here the moment a customer sends one from Customer HQ.</p>`;
    const it = byId(items, selected);
    $("#r-detail").innerHTML = it ? detail(items, it) : `<h2>Waiting for a PO…</h2>
      <p class="lede">When a customer sends a PO or a change, Sales, Inventory, Production and Logistics each check it here against the same numbers and sign off. Four approvals and it's accepted.</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · 2. Schedule trucks (Logistics) ----------
function scheduleView(store, state) {
  const html = `<section class="panel">
      <h1>Schedule trucks</h1>
      <p class="lede">For Logistics. Accepted POs land here. Book the lane's contract carrier first. If it's full, ask the carrier for extra trucks ahead of time. <strong>Spot is for emergencies</strong> and needs a reason.</p>
      <div id="s-todo" class="cards"><p class="empty">Loading…</p></div>
    </section>
    <section class="panel"><h2>Booked</h2><div id="s-done"></div></section>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-id]");
      if (!b) return;
      b.disabled = true;
      try {
        const it = await freshItem(store, b.dataset.id);
        if (!it) return;
        const lane = E.itemLane(it);
        if (b.dataset.ask) await askCarrier(store, state.items, lane, E.dateOf(it), +b.dataset.ask, it.id);
        else if (b.dataset.book) {
          const a = E.allocate(state.items, NOW).get(it.id);
          const reason = $(`#why-${it.id}`)?.value || "";
          if (a.spot && !reason) throw new Error("pick why spot is needed");
          if (it.data.trucks < 0) await askCarrier(store, state.items, lane, E.dateOf(it), it.data.trucks, it.id);
          await store.update(it.id, { data: { ...it.data, scheduled_at: new Date().toISOString(), spot_reason: a.spot ? reason : null } });
          toast(it.data.trucks < 0 ? "Released. The carrier knows." : a.spot ? `Booked: ${a.contract} contract, ${a.spot} emergency spot.` : `Booked: all ${a.contract} on contract.`);
        } else if (b.dataset.unbook) await store.update(it.id, { data: { ...it.data, scheduled_at: null, spot_reason: null } });
        state.refresh();
      } catch (err) { toast("Couldn't do that: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  function live(items) {
    const alloc = E.allocate(items, NOW);
    const accepted = orders(items).filter((x) => x.status === "confirmed");
    const todo = accepted.filter((x) => !x.data.scheduled_at).sort((a, b) => (E.dateOf(a) < E.dateOf(b) ? -1 : 1));
    const done = accepted.filter((x) => x.data.scheduled_at).reverse();
    $("#s-todo").innerHTML = todo.length ? todo.map((it) => {
      const a = alloc.get(it.id);
      const lane = E.itemLane(it);
      const by = E.addDays(E.dateOf(it), -RULES.noticeDays);
      const asks = items.filter((x) => x.type === "ask" && String(x.data.for) === String(it.id));
      const head = `<div class="card-head"><span class="pill">${E.poNumber(items, it)}</span>${isChange(it) ? `<span class="pill pill-change">Change</span>` : ""}
          <span class="due${E.daysBetween(NOW, by) <= 2 ? " due-soon" : ""}">Book by ${esc(fmtDate(by))}</span></div>
        <h3>${esc(laneName(lane))} · ${esc(SIM_CUSTOMERS[it.data.customer].name)} · ${esc(fmtDate(E.dateOf(it)))}</h3>`;
      if (it.data.trucks < 0) return `<article class="card card-plain">${head}
        <p class="meta">The customer cut ${plural(-it.data.trucks, "truckload")}. Release those contract trucks so the carrier can move its drivers.</p>
        <div class="card-actions"><button type="button" class="util on" data-book="1" data-id="${esc(it.id)}">Release ${plural(-it.data.trucks, "contract truck")} and tell the carrier</button></div></article>`;
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
          ${askFirst ? `<button type="button" class="util on" data-ask="${a.capSpot}" data-id="${esc(it.id)}">Ask the carrier for +${a.capSpot}</button>` : ""}
          ${a.spot ? `<select id="why-${esc(it.id)}" class="why"><option value="">Why spot? (emergency only)</option>${SPOT_REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>` : ""}
          <button type="button" class="util${askFirst ? "" : " on"}" data-book="1" data-id="${esc(it.id)}">${a.spot ? `Book ${a.contract} contract + ${a.spot} spot` : `Book all ${a.contract} on contract`}</button>
        </div></article>`;
    }).join("") : `<p class="empty">Nothing to schedule. Accepted POs appear here.</p>`;
    $("#s-done").innerHTML = done.length ? `<ul class="done-list">${done.map((it) => {
      const a = alloc.get(it.id);
      return `<li><span class="done-what"><strong>${E.poNumber(items, it)}${isChange(it) ? " change" : ""} · ${esc(laneName(E.itemLane(it)))}</strong>
          <span class="kind">${esc(fmtDate(E.dateOf(it)))}${it.data.spot_reason ? ` · spot because: ${esc(it.data.spot_reason)}` : ""}</span></span>
        <span class="done-split">${it.data.trucks < 0 ? `released ${-it.data.trucks}` : chips(a.contract, a.spot)}</span>
        <button type="button" class="linkish" data-unbook="1" data-id="${esc(it.id)}">undo</button></li>`;
    }).join("")}</ul>` : `<p class="empty">Nothing booked yet.</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · 6-week outlook (early warning) ----------
const ZONE = { green: "On plan", yellow: "Watch", red: "Act now" };

function outlookView(store, state) {
  const html = `<section class="panel">
      <h1>Early warning: Findlay's next 6 weeks, in trucks</h1>
      <p class="lede">POs come in as cans. We turn them into trucks (${num(RULES.cansPerTruck)} cans each) and compare every lane and week with the trucks its contract carrier takes. Logistics sees a problem weeks ahead and calls the carrier then, not on Thursday.</p>
      <p class="legend"><span class="z z-green">On plan</span> within ±10% <span class="z z-yellow">Watch</span> 10–25% <span class="z z-red">Act now</span> over 25% · <span class="b b-spot">n</span> trucks going spot</p>
      <div id="o-grid"><p class="empty">Loading…</p></div>
    </section>
    <section class="panel"><h2>What Logistics does next</h2><div id="o-actions"></div></section>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-cell]");
      if (!b) return;
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
            <button type="button" class="util on" data-cell="${esc(cellKey)}" data-n="${w.capSpot}">Ask carrier for +${w.capSpot}</button></li>`
        : `<li class="act z-${w.zone}"><span>${where}<br>${what} · ${w.unused} contract trucks unused</span>
            <span class="act-btns"><button type="button" class="util" data-cell="${esc(cellKey)}" data-n="${-w.unused}">Warn carrier: −${w.unused}</button>
            ${r.lane.kind === "transfer" ? `<a class="small" href="${link("transfers")}">or ship a prebuild into it →</a>` : ""}</span></li>` });
    }
    const rank = { red: 0, yellow: 1, green: 2 };
    acts.sort((a, b) => rank[a.z] - rank[b.z] || a.wk - b.wk);
    $("#o-actions").innerHTML = acts.length ? `<ul class="acts">${acts.map((a) => a.html).join("")}</ul>` : `<p class="empty">Nothing to do: every lane and week is on plan and covered.</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Transfers (prebuild in waves) ----------
function transfersView(store, state) {
  const transferLanes = PILOT_LANES.filter((l) => l.kind === "transfer");
  const nextMon = E.addDays(E.weekKey(NOW), 8);
  const form = { destination: "Mississauga, ON", trucks: 12, date: E.daysBetween(NOW, nextMon) >= RULES.noticeDays ? nextMon : E.addDays(nextMon, 7), pattern: "w3" };
  const html = `<div class="cols cols-plan">
    <section class="panel">
      <h1>Ship a prebuild in waves</h1>
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
    data: { destination: form.destination, trucks: form.trucks, date: form.date, pattern, booked_at: new Date().toISOString() } });

  function paint() {
    $("#p-dest").value = form.destination;
    $("#p-trucks").value = form.trucks;
    $("#p-date").value = form.date;
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
        await store.add({ type: "transfer", status: "booked", data: { ...draft().data } });
        toast(`Scheduled: ${form.trucks} trucks to ${form.destination}, ${PATTERNS[form.pattern].label.toLowerCase()}.`);
        state.refresh();
      } catch (err) { toast("Couldn't do that: " + err.message, true); }
      finally { b.disabled = false; }
    });
    paint();
  }

  function live(items) {
    paint();
    const alloc = E.allocate(items, NOW);
    const list = items.filter((x) => x.type === "transfer").reverse();
    $("#p-list").innerHTML = list.length ? `<ul class="done-list">${list.map((it) => {
      const a = alloc.get(it.id);
      return `<li><span class="done-what"><strong>Findlay → ${esc(it.data.destination)}</strong><span class="kind">${plural(it.data.trucks, "truckload")} · ${esc(PATTERNS[it.data.pattern].label.toLowerCase())} from ${esc(fmtDate(it.data.date))}</span></span>
        <span class="done-split">${chips(a.contract, a.spot)}</span><span class="done-money">${money(a.perTruck)}<span class="kind">per truck</span></span></li>`;
    }).join("")}</ul>` : `<p class="empty">None yet.</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Dashboard (Marcelo) ----------
function dashboardView(store, state) {
  const html = `<section class="hub">
      <div class="hub-head"><div><h1>Marcelo's dashboard</h1><p class="lede">Findlay pilot: every team on the same page.</p></div>
        <span class="live"><span class="pulse"></span>${store.live ? "Live" : "This laptop only"}</span></div>
      <div id="d-tiles" class="totals"><p class="empty">Loading…</p></div>
      <div id="d-compare"></div>
      <div class="cols cols-plan">
        <section class="panel"><h2>Emergency spot log</h2><div id="d-spot"></div></section>
        <section class="panel"><h2>Activity</h2><ul id="d-feed" class="feed"></ul></section>
      </div>
      <button type="button" id="d-reset" class="util quiet">New round (clear everything)</button>
    </section>`;

  function mount() {
    $("#d-reset").addEventListener("click", async () => {
      const pin = store.live ? prompt("Enter the reset PIN to clear everything for a new round:") : "local";
      if (pin === null) return;
      if (!store.live && !confirm("Clear every PO, transfer and carrier answer on this laptop?")) return;
      try { await store.reset(pin); toast("Cleared. Ready for a new round."); state.refresh(); }
      catch (err) { toast("Not cleared: " + err.message, true); }
    });
  }

  function live(items) {
    const now = E.totals(items, NOW);
    const old = E.totals(items, NOW, { oldWay: true });
    const os = orders(items);
    const waiting = os.filter((x) => x.status === "waiting");
    const perTeam = TEAMS.map((t) => `${TEAM_NAME[t]} ${waiting.filter((x) => !x.data.signoffs?.[t]).length}`).join(" · ");
    const answered = os.filter((x) => x.data.answer?.at);
    const avgMin = answered.length ? answered.reduce((s, x) => s + (new Date(x.data.answer.at) - new Date(x.created_at)), 0) / answered.length / 60000 : null;
    const tile = (label, value, sub, cls = "") => `<div class="stat ${cls}"><p class="stat-label">${label}</p><p class="stat-value">${value}</p><p class="stat-sub">${sub}</p></div>`;
    $("#d-tiles").innerHTML =
      tile("Spot share", now.trucks ? pct(now.spotShare) : "–", `${now.spot} of ${now.trucks} new truckloads · goal 10% or less`, "stat-spot") +
      tile("Spot cost", money(now.overspend), "paid above contract prices") +
      tile("POs in review", waiting.length, waiting.length ? `still to sign: ${perTeam}` : "nothing waiting on a team", "stat-contract") +
      tile("Time to answer customers", avgMin == null ? "–" : avgMin < 60 ? `${Math.max(1, Math.round(avgMin))} min` : `${(avgMin / 60).toFixed(1)} hr`, "target: under 4 hours");
    $("#d-compare").innerHTML = now.trucks ? `<div class="compare-box">
      <div><p class="stat-label">The old way</p><p class="cmp-n">${old.spot} spot · ${money(old.overspend)}</p><p class="small">Same POs, but nobody asks the carrier ahead and transfers ship in one batch.</p></div>
      <div class="cmp-arrow">${icon("arrow")}</div>
      <div><p class="stat-label">With the system</p><p class="cmp-n">${now.spot} spot · ${money(now.overspend)}</p><p class="small">Teams check together, Logistics asks carriers early, transfers go in waves.</p></div></div>` : "";
    const alloc = E.allocate(items, NOW);
    const spotted = os.filter((x) => x.data.scheduled_at && alloc.get(x.id)?.spot);
    $("#d-spot").innerHTML = spotted.length ? `<ul class="feed">${spotted.map((x) => `<li><strong>${E.poNumber(items, x)}</strong> · ${alloc.get(x.id).spot} spot (${money(alloc.get(x.id).overspend)}) · ${esc(x.data.spot_reason || "")}</li>`).join("")}</ul>`
      : `<p class="empty">No spot trucks booked. Spot is for emergencies only.</p>`;
    const line = (it) => {
      if (it.type === "order") return `<strong>${E.poNumber(items, it)}</strong>${isChange(it) ? " change" : ""} · ${esc(SIM_CUSTOMERS[it.data.customer].name)} ${it.data.trucks > 0 ? "+" : "−"}${plural(Math.abs(it.data.trucks), "truckload")} · ${{ waiting: `in review (${TEAMS.filter((t) => it.data.signoffs?.[t]).length}/4)`, offered: "counteroffer out", confirmed: it.data.scheduled_at ? "trucks booked" : "accepted", declined: "declined" }[it.status]}`;
      if (it.type === "transfer") return `<strong>Transfer</strong> ${plural(it.data.trucks, "truckload")} to ${esc(it.data.destination)} · ${esc(PATTERNS[it.data.pattern].label.toLowerCase())}`;
      return `<strong>Carrier</strong> ${esc(it.data.destination)}, week of ${weekLabel(it.data.week)}: ${esc(it.data.why || it.status)}`;
    };
    $("#d-feed").innerHTML = items.length ? [...items].reverse().slice(0, 30).map((it) => `<li><time>${esc(time(it.created_at))}</time> ${line(it)}</li>`).join("") : `<li class="empty">Nothing yet. Start at Customer HQ.</li>`;
  }

  return { html, mount, live };
}

// ---------- Home ----------
function homeView() {
  return { html: `<section class="home">
    <h1>From customer PO to booked truck, with every team on the same page.</h1>
    <div class="two-doors">
      <a class="door door-cust" href="${link("customer")}"><span class="team-name">Customer HQ</span><span class="team-line">For customers: place a PO, request a change, see where it stands.</span></a>
      <a class="door" href="${link("review")}"><span class="team-name">Ball HQ</span><span class="team-line">For Ball's teams: review POs together, schedule trucks, watch the next 6 weeks.</span></a>
    </div>
    ${sourceNote()}
  </section>` };
}

// ---------- Boot ----------
async function main() {
  let role = PARAMS.get("role");
  if (role in ALIASES) role = ALIASES[role];
  if (role !== "customer" && !BALL[role]) role = null;
  const store = await makeStore();
  const state = { items: [], refresh: null };
  const portal = role === "customer" ? "customer" : role ? "ball" : "home";
  document.body.dataset.portal = portal;
  document.body.dataset.role = role || "home";

  // Two separate headers: customers never see Ball HQ.
  $("#brand").textContent = portal === "customer" ? "Ball · Customer HQ" : portal === "ball" ? "Ball HQ" : "Findlay pilot";
  $("#brand").href = portal === "customer" ? link("customer") : "./";
  const drawNav = (items = []) => {
    if (portal !== "ball") { $("#nav").innerHTML = ""; return; }
    const os = orders(items);
    const count = { review: os.filter((x) => x.status === "waiting").length, schedule: os.filter((x) => x.status === "confirmed" && !x.data.scheduled_at).length };
    $("#nav").innerHTML = Object.entries(BALL).map(([r, s]) =>
      `<a href="${link(r)}" class="${r === role ? "on" : ""}">${s.name}${count[r] ? ` <span class="tab-count">${count[r]}</span>` : ""}</a>`).join("");
  };
  drawNav();
  const notes = [];
  if (!store.live) notes.push(FORCE_LOCAL ? "Backup mode: everything stays on this laptop." : "Local demo mode: add the Supabase keys in config.js to share across devices.");
  if (PARAMS.get("today")) notes.push(`Rehearsal date: today is ${fmtDate(NOW)}.`);
  if (notes.length) { $("#mode-banner").hidden = false; $("#mode-banner").textContent = notes.join(" "); }
  document.title = portal === "customer" ? "Customer HQ · Ball" : role ? `${BALL[role].name.replace(/^\d · /, "")} · Ball HQ` : "Ball Findlay pilot";

  const view = !role ? homeView()
    : role === "customer" ? customerView(store, state)
    : role === "review" ? reviewView(store, state)
    : role === "schedule" ? scheduleView(store, state)
    : role === "outlook" ? outlookView(store, state)
    : role === "transfers" ? transfersView(store, state)
    : dashboardView(store, state);
  $("#app").innerHTML = view.html + (portal === "ball" ? sourceNote() : "");
  view.mount?.();

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
