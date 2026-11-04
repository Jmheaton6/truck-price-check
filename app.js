import * as E from "./engine.js?v=44";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js?v=44";

const { RULES, PILOT_LANES, SIM_CUSTOMERS, TEAMS, STAGES } = E;
const PARAMS = new URLSearchParams(location.search);
const NOW = PARAMS.get("today") || E.isoDate(new Date()); // ?today=2026-11-05 to rehearse a date
const FORCE_LOCAL = PARAMS.has("local");                   // ?local = backup if the room's Wi-Fi fails

// Ball HQ: one hub per department, each with its own tabs. Anyone can open any hub (the demo acts as all of them);
// the hub you're in is the department you're answering as.
const HUBS = {
  sales:      { name: "Sales",      tabs: { orders: "Orders", customers: "Customers" } },
  inventory:  { name: "Inventory",  tabs: { orders: "Orders", stock: "Stock" } },
  planning:   { name: "Planning",   tabs: { orders: "Orders", shortterm: "Short-term", longterm: "Long-term", line: "Line time" } },
  logistics:  { name: "Logistics",  tabs: { orders: "Orders", calendar: "Lanes", transfers: "Transfers" } },
  exec:       { name: "Executive",  tabs: { exec: "Dashboard" } },
};
// Old links still land somewhere sensible.
const ALIASES = { review: "orders", pos: "orders", team: "orders", ball: "orders", sales: "orders", inventory: "orders", production: "orders", planning: "orders",
  logistics: "calendar", schedule: "calendar", trucks: "calendar", lanes: "calendar", outlook: "shortterm", forecast: "shortterm", warning: "shortterm",
  carrier: "calendar", plan: "calendar", hub: "exec", dashboard: "exec" };
const DEPT = Object.fromEntries(Object.entries(HUBS).map(([k, h]) => [k, h.name]));
const LAST_DAY = E.addDays(E.weekKey(NOW), RULES.weeks * 7 - 1);

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
  const KEY = "bc_items_v4"; // v4: the Monticello pilot (older local data is left behind)
  const listeners = [];
  const read = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const write = (rows) => { localStorage.setItem(KEY, JSON.stringify(rows)); listeners.forEach((f) => f()); };
  let seq = 0;
  return {
    live: false,
    list: async () => read(),
    add: async (row) => { const saved = { ...row, id: Date.now() * 10 + (seq++ % 10), created_at: new Date().toISOString() }; write([...read(), saved]); return saved; },
    update: async (id, patch) => write(read().map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r))),
    reset: async () => write([]),
    subscribe(cb) { listeners.push(cb); addEventListener("storage", (e) => e.key === KEY && cb()); },
  };
}

// Forecast versions are saved as "ask" rows with status "noted" and data.kind "forecast", so the items table
// needs no new SQL. The rest of the app sees them as type "forecast".
// Rows from earlier versions of the app (other pilot plants, old transfer shapes, carrier asks) are skipped,
// so leftover data can't break a screen.
const fits = (r) => {
  const d = r.data || {};
  if (r.type === "order") return !!SIM_CUSTOMERS[d.customer] && /^\d{4}-\d\d-\d\d$/.test(d.date || "") && Number.isFinite(d.trucks);
  if (r.type === "transfer") return !!E.laneOf("transfer", d.destination) && /^\d{4}-\d\d-\d\d$/.test(d.ready || "") && Number.isFinite(d.trucks);
  if (r.type === "forecast") return !!SIM_CUSTOMERS[d.customer] && /^\d{4}-\d\d-\d\d$/.test(d.week || "");
  return false;
};
function withForecasts(store) {
  const out = (r) => (r.type === "ask" && r.data?.kind === "forecast" ? { ...r, type: "forecast" } : r);
  const inn = (r) => (r.type === "forecast" ? { ...r, type: "ask", status: "noted", data: { ...r.data, kind: "forecast" } } : r);
  return { ...store, list: async () => (await store.list()).map(out).filter(fits), add: async (row) => out(await store.add(inn(row))) };
}

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (x) => Math.round(x * 100) + "%";
const nowIso = () => new Date().toISOString();
// When something was booked, on the app's calendar (so rehearsing a later ?today= books on that day).
const stamp = () => (PARAMS.get("today") ? `${NOW}T12:00:00` : nowIso());
const fmtDate = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dow = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { weekday: "short" });
const weekLabel = (sun) => {
  const sat = E.addDays(sun, 6);
  return E.atNoon(sun).getMonth() === E.atNoon(sat).getMonth() ? `${fmtShort(sun)}–${E.atNoon(sat).getDate()}` : `${fmtShort(sun)}–${fmtShort(sat)}`;
};
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const millions = (trucks) => +(trucks * RULES.cansPerTruck / 1e6).toFixed(1);
const fromMillions = (m) => Math.max(0, Math.round((+m || 0) * 1e6 / RULES.cansPerTruck));
function link(role, extra = {}) {
  let s = "?" + new URLSearchParams({ role, ...extra }).toString();
  if (FORCE_LOCAL) s += "&local";
  if (PARAMS.get("today")) s += `&today=${PARAMS.get("today")}`;
  return s;
}
const hubLink = (hub, tab, extra = {}) => link(tab, { hub, ...extra });
const byId = (items, id) => items.find((x) => String(x.id) === String(id));
const orders = (items) => items.filter((x) => x.type === "order");
const isChange = (it) => it.data.kind === "change";
const changesOf = (items, po) => orders(items).filter((x) => isChange(x) && String(x.data.parent) === String(po.id));
// A PO's total on its date: the PO plus accepted changes for that date.
const poTotal = (items, po) => po.data.trucks + changesOf(items, po)
  .filter((c) => c.status === "confirmed" && c.data.date === po.data.date).reduce((s, c) => s + c.data.trucks, 0);
const custName = (dest) => SIM_CUSTOMERS[dest].name;
const ICONS = {
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  x: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  left: '<path d="M12.5 4.5L7 10l5.5 5.5"/>',
  right: '<path d="M7.5 4.5L13 10l-5.5 5.5"/>',
};
const icon = (name) => `<svg class="ic ic-${name}" viewBox="0 0 20 20" aria-hidden="true">${ICONS[name]}</svg>`;
const stageChip = (it, forCustomer = false) => {
  const st = E.stageOf(it);
  const label = st === "checking" && !forCustomer ? `${TEAMS.filter((t) => it.data.signoffs?.[t]?.ok).length}/4 accepted` : STAGES[st];
  return `<span class="chip chip-${st}">${label}</span>`;
};
// What a customer reads when a department says no.
const customerWhy = (d) => d.why === "Customer cancelled" ? "You cancelled" : d.team === "sales" ? (/^Only/.test(d.why) ? "Too close to delivery" : "Over your forecast")
  : d.team === "planning" ? (/freeze/i.test(d.why) ? "Too close to make" : "No line time that week")
  : d.team === "inventory" ? "Cans already made" : "Too late to book trucks";

function toast(msg, bad = false) {
  document.querySelectorAll(".toast").forEach((x) => x.remove());
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " toast-bad" : "");
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}
function showBroken(msg) {
  const el = $("#mode-banner");
  if (!el) return;
  el.hidden = false;
  el.classList.add("banner-bad");
  el.textContent = `Something went wrong (${msg}). Reload with Cmd+Shift+R.`;
}
addEventListener("error", (e) => showBroken(e.message));
addEventListener("unhandledrejection", (e) => showBroken(e.reason?.message || String(e.reason)));
if (typeof E.calendar !== "function") showBroken("old copy of the app");

// Truck squares: one per truck. Contract booked = solid, contract to book = outline, spot = red,
// waiting on a counteroffer = amber, not accepted yet = dashed.
function squares(moves, max = 14) {
  const parts = [];
  for (const m of moves) {
    for (let i = 0; i < m.contract; i++) parts.push(m.checking ? "chk" : m.booked ? "con" : "con-open");
    for (let i = 0; i < (m.counter || 0); i++) parts.push(m.checking ? "chk" : "ctr");
    for (let i = 0; i < m.spot; i++) parts.push(m.checking ? "chk" : "spot");
  }
  const shown = parts.slice(0, max).map((k) => `<i class="sq sq-${k}"></i>`).join("");
  return shown + (parts.length > max ? `<b class="sq-more">+${parts.length - max}</b>` : "");
}

// ---------- Customer HQ: two tabs. Order (new order and forecast) and My POs (where each one stands) ----------
const CUST_TABS = { order: "Order", pos: "My POs" };
const retried = (items, it) => orders(items).some((x) => String(x.data.retry_of) === String(it.id));
// The customer's move: a counteroffer to answer, or a deny with a date that works.
const needsCustomer = (items, company) => orders(items).filter((x) => x.data.customer === company
  && (E.stageOf(x) === "offered" || (E.stageOf(x) === "denied" && !retried(items, x) && E.betterDate(items, x, NOW))));
const reliabilityChip = (items, customer) => { const r = E.reliability(items, customer);
  return `<span class="chip ${r.priority ? "chip-prio" : "chip-checking"}" title="Orders kept outside the 3-day fence">${pct(r.score)} reliable${r.priority ? " · Priority" : ""}</span>`; };
// "10 → 14 truckloads" for a change on the PO's date; "+4 more" for one on another date.
function changeText(items, it) {
  const parent = byId(items, it.data.parent);
  const before = poTotal(items, parent) - (it.status === "confirmed" && it.data.date === parent.data.date ? it.data.trucks : 0);
  return it.data.date === parent.data.date ? `${before} → ${plural(before + it.data.trucks, "truckload")}`
    : `${it.data.trucks > 0 ? "+" : "−"}${plural(Math.abs(it.data.trucks), "truckload")} ${it.data.trucks > 0 ? "more" : "less"}`;
}
// Why a department said no, in the customer's words, and a date that works.
function denyBlock(items, it) {
  if (E.stageOf(it) !== "denied" || !it.data.denied) return "";
  const better = retried(items, it) ? null : E.betterDate(items, it, NOW);
  return `<p class="why">${customerWhy(it.data.denied)}</p>
    ${better ? `<button type="button" class="util on small" data-retry="${esc(it.id)}" data-date="${better.date}">Try ${esc(fmtDate(better.date))}</button>` : ""}`;
}
// Logistics' counteroffer: take Ball's date (contract), or keep yours and pay the spot premium as an expedite fee.
function offerBlock(items, it) {
  const a = E.allocate(items, NOW).get(it.id);
  if (E.stageOf(it) === "offered") {
    const fee = (a?.counter || 0) * E.itemLane(it).spot_premium;
    const d = it.data.counter.date;
    return `<p class="offer">No truck for ${plural(a?.counter || 0, "load")} on ${esc(fmtShort(it.data.date))}. ${d ? `Ball can do ${esc(fmtDate(d))}.` : "No contract truck in the next 2 weeks."}</p>
      <div class="ed-btns">${d ? `<button type="button" class="util on small" data-counter="${esc(it.id)}" data-accept="1">Take ${esc(fmtShort(d))}</button>` : ""}
        <button type="button" class="util small" data-counter="${esc(it.id)}" data-accept="0">Keep ${esc(fmtShort(it.data.date))} · +${money(fee)}</button>
        ${d ? "" : `<button type="button" class="util small" data-counter="${esc(it.id)}" data-accept="cancel">Cancel</button>`}</div>`;
  }
  return it.data.expedite && a?.fee ? `<p class="fee">Expedite fee ${money(a.fee)}</p>` : "";
}
async function answerOffer(store, state, b) {
  b.disabled = true;
  try {
    const it = byId(await store.list(), b.dataset.counter);
    const u = E.answerCounter(it, b.dataset.accept === "1", nowIso(), b.dataset.accept === "cancel");
    await store.update(it.id, { status: u.status, data: u.data });
    toast(b.dataset.accept === "1" ? `Moved to ${fmtDate(u.data.date)}.` : b.dataset.accept === "cancel" ? "Cancelled." : "Kept your date. Expedite fee added.");
    state.refresh();
  } catch (err) { toast("Couldn't save: " + err.message, true); b.disabled = false; }
}
async function sendOrder(store, state, btn, data, msg) {
  btn.disabled = true;
  try {
    const saved = await store.add({ type: "order", status: "waiting", data: { signoffs: {}, placed: NOW, ...data } });
    toast(typeof msg === "function" ? msg(saved) : msg);
    state.refresh();
    return true;
  } catch (err) { toast("Couldn't send: " + err.message, true); return false; }
  finally { btn.disabled = false; }
}
// Retry a denied order or change on the date Ball offered.
function retry(store, state, b) {
  const it = byId(state.items, b.dataset.retry);
  const { kind, parent, customer, trucks, cans } = it.data;
  return sendOrder(store, state, b, { kind, parent, customer, trucks, cans, date: b.dataset.date, retry_of: it.id }, "Sent for " + fmtDate(b.dataset.date) + ".");
}
const customerView = (store, state, tab) => (tab === "pos" ? customerPOs(store, state) : customerOrder(store, state));

function customerOrder(store, state) {
  const form = { m: 0.6, date: E.addDays(E.weekKey(NOW), 14 + 4) };
  const html = `<div class="cols cols-cust">
    <section class="panel" id="c-form"></section>
    <section class="panel c-fc"><div class="card-head"><h2>My forecast</h2><button type="button" id="f-send" class="util on">Share forecast</button></div>
      <div id="f-weeks" class="f-weeks"></div></section>
  </div>`;
  const fc = { company: null, m: [] }; // what's typed, in million cans per week
  const fcLatest = () => Array.from({ length: RULES.weeks }, (_, wk) => E.latestForecast(state.items, state.company, wk, NOW));
  function drawForecast() {
    if (fc.company !== state.company) { fc.company = state.company; fc.m = fcLatest().map(millions); }
    const latest = fcLatest();
    $("#f-weeks").innerHTML = fc.m.map((m, wk) => {
      const n = fromMillions(m);
      return `<label class="f-week${n !== latest[wk] ? " f-changed" : ""}"><span class="label">${esc(fmtShort(E.addDays(E.weekKey(NOW), wk * 7)))}</span>
        <input type="number" min="0" max="40" step="0.2" data-fw="${wk}" value="${m}" aria-label="Million cans, week of ${esc(fmtShort(E.addDays(E.weekKey(NOW), wk * 7)))}">
        <span class="f-t">${plural(n, "truckload")}</span></label>`;
    }).join("");
  }
  async function shareForecast(btn) {
    const latest = fcLatest();
    const changed = fc.m.map((m, wk) => ({ wk, trucks: fromMillions(m) })).filter((x) => x.trucks !== latest[x.wk]);
    if (!changed.length) return toast("Nothing changed.", true);
    btn.disabled = true;
    try {
      for (const x of changed) await store.add({ type: "forecast", status: "noted", data: { customer: state.company, week: E.addDays(E.weekKey(NOW), x.wk * 7), trucks: x.trucks, on: NOW } });
      toast("Forecast shared.");
      state.refresh();
    } catch (err) { toast("Couldn't share: " + err.message, true); }
    finally { btn.disabled = false; }
  }

  function drawForm() {
    $("#c-form").innerHTML = `
      <div class="card-head"><h1>New order</h1><span id="c-rel"></span></div>
      <label class="field"><span class="label">Cans</span>
        <span class="amount"><input id="c-m" type="number" min="0.2" max="40" step="0.2" inputmode="decimal" aria-label="Million cans"><span class="unit">million</span></span>
        <span class="eq" id="c-trucks"></span></label>
      <label class="field"><span class="label">Deliver on</span><input id="c-date" type="date" min="${NOW}" max="${LAST_DAY}"></label>
      <button type="button" id="c-send" class="cta">Send order</button>`;
    $("#c-m").value = form.m;
    $("#c-date").value = form.date;
    $("#c-m").addEventListener("input", (e) => { form.m = +e.target.value || 0; paint(); });
    $("#c-date").addEventListener("change", (e) => { form.date = e.target.value; });
    paint();
  }
  const paint = () => { $("#c-trucks").innerHTML = `= <strong>${plural(fromMillions(form.m), "truckload")}</strong>`; };
  async function send(btn) {
    const n = fromMillions(form.m);
    if (!n) return toast("Enter an amount.", true);
    if (form.date < NOW || form.date > LAST_DAY) return toast("Pick a date in the next 6 weeks.", true);
    const ok = await sendOrder(store, state, btn, { kind: "po", customer: state.company, trucks: n, cans: n * RULES.cansPerTruck, date: form.date },
      (saved) => `Order sent: ${E.poNumber([...state.items, saved], saved)}`);
    if (ok) { form.m = 0.6; drawForm(); }
  }

  function mount() {
    drawForm();
    $("#f-weeks").addEventListener("input", (e) => {
      const i = e.target.dataset.fw;
      if (i == null) return;
      fc.m[+i] = +e.target.value || 0;
      const lab = e.target.closest(".f-week");
      const n = fromMillions(fc.m[+i]);
      lab.querySelector(".f-t").textContent = plural(n, "truckload");
      lab.classList.toggle("f-changed", n !== fcLatest()[+i]);
    });
    $("#app").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b?.id === "c-send") return send(b);
      if (b?.id === "f-send") return shareForecast(b);
    });
  }
  function live(items) {
    $("#c-rel").innerHTML = reliabilityChip(items, state.company);
    if (fc.company !== state.company || !document.activeElement?.dataset?.fw) drawForecast(); // don't redraw under someone typing
  }
  return { html, mount, live };
}

function customerPOs(store, state) {
  let editing = null;                 // the PO whose change editor is open
  const edit = { m: 0, date: "" };
  const html = `<div class="cols cols-pos">
    <section class="panel"><h2>Open POs</h2><div id="c-pos" class="cards"><p class="empty">Loading…</p></div></section>
    <section class="panel"><h2>Change requests</h2><div id="c-changes" class="cards"></div></section>
  </div>`;

  const editor = (po) => `<div class="editor">
      <div class="ed-fields">
        <label class="field"><span class="label">New total</span>
          <span class="amount"><input id="e-m" type="number" min="0" max="40" step="0.2" inputmode="decimal" value="${edit.m}" aria-label="Million cans"><span class="unit">million</span></span>
          <span class="eq" id="e-trucks"></span></label>
        <label class="field"><span class="label">Deliver on</span><input id="e-date" type="date" min="${NOW}" max="${LAST_DAY}" value="${edit.date}"></label>
      </div>
      <div class="ed-btns"><button type="button" class="util on" id="e-send" data-po="${esc(po.id)}">Send change</button><button type="button" class="util" id="e-cancel">Cancel</button></div>
    </div>`;
  function paintEdit() {
    const po = byId(state.items, editing);
    const el = $("#e-trucks");
    if (!po || !el) return;
    const n = fromMillions(edit.m), was = poTotal(state.items, po);
    el.innerHTML = `= <strong>${plural(n, "truckload")}</strong>${n !== was ? ` <span class="delta">${n > was ? "+" : "−"}${Math.abs(n - was)}</span>` : ""}`;
  }
  async function sendChange(btn) {
    const po = byId(state.items, editing);
    const n = fromMillions(edit.m);
    if (edit.date < NOW || edit.date > LAST_DAY) return toast("Pick a date in the next 6 weeks.", true);
    const delta = n - poTotal(state.items, po);
    if (!delta) return toast("That's the same as now.", true);
    const ok = await sendOrder(store, state, btn, { kind: "change", parent: po.id, customer: po.data.customer, trucks: delta, cans: delta * RULES.cansPerTruck, date: edit.date }, "Change sent.");
    if (ok) { editing = null; drawPOs(state.items); }
  }

  function mount() {
    $("#app").addEventListener("input", (e) => {
      if (e.target.id === "e-m") { edit.m = +e.target.value || 0; paintEdit(); }
    });
    $("#app").addEventListener("change", (e) => { if (e.target.id === "e-date") edit.date = e.target.value; });
    $("#app").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.change) {
        const po = byId(state.items, b.dataset.change);
        editing = po.id; edit.m = millions(poTotal(state.items, po)); edit.date = po.data.date;
        drawPOs(state.items);
        return $("#e-m")?.focus();
      }
      if (b.id === "e-cancel") { editing = null; return drawPOs(state.items); }
      if (b.id === "e-send") return sendChange(b);
      if (b.dataset.retry) return retry(store, state, b);
      if (b.dataset.counter) return answerOffer(store, state, b);
    });
  }

  function drawPOs(items) {
    const pos = orders(items).filter((x) => !isChange(x) && x.data.customer === state.company).reverse();
    if (editing && !pos.some((x) => String(x.id) === String(editing))) editing = null;
    $("#c-pos").innerHTML = pos.length ? pos.map((po) => {
      const st = E.stageOf(po), total = poTotal(items, po);
      const open = String(po.id) === String(editing);
      return `<article class="card${open ? " card-edit" : ""}">
        <div class="card-head"><span class="pill">${E.poNumber(items, po)}</span>${stageChip(po, true)}</div>
        <div class="o-line"><span class="o-what">${millions(total)}M cans · ${plural(total, "truckload")} · ${esc(fmtDate(po.data.date))}</span>
          ${st !== "denied" && st !== "offered" && !open ? `<button type="button" class="util small" data-change="${esc(po.id)}">Change</button>` : ""}</div>
        ${denyBlock(items, po)}${offerBlock(items, po)}
        ${open ? editor(po) : ""}
      </article>`;
    }).join("") : `<p class="empty">No orders yet.</p>`;
    paintEdit();
  }

  function live(items) {
    // Don't redraw the PO list under someone typing a change.
    if (!editing || !$("#c-pos").contains(document.activeElement)) drawPOs(items);
    const changes = orders(items).filter((x) => isChange(x) && x.data.customer === state.company).reverse();
    $("#c-changes").innerHTML = changes.length ? changes.map((c) => `<article class="card">
        <div class="card-head"><span class="pill">${E.poNumber(items, c)}</span>${stageChip(c, true)}</div>
        <div class="o-line"><span class="o-what">${changeText(items, c)} · ${esc(fmtDate(c.data.date))}</span></div>
        ${denyBlock(items, c)}${offerBlock(items, c)}
      </article>`).join("") : `<p class="empty">No changes.</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Orders (every department accepts or denies) ----------
function ordersView(store, state) {
  let selected = location.hash.slice(1) || null;
  let pinned = selected;   // an order you picked or answered stays open; anything else follows your list
  let filter = "mine";
  let deptSeen = state.dept;
  const html = `<div class="cols cols-orders">
    <section class="panel list"><div class="seg" id="o-filter"><button type="button" data-filter="mine">Waiting on me</button><button type="button" data-filter="all">All</button></div><div id="o-list"></div></section>
    <section class="panel" id="o-detail"></section>
  </div>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const f = e.target.closest("[data-filter]");
      if (f) { filter = f.dataset.filter; return live(state.items); }
      const pick = e.target.closest("[data-pick]");
      if (pick) { selected = pinned = pick.dataset.pick; history.replaceState(null, "", "#" + selected); return live(state.items); }
      const co = e.target.closest("button[data-counteroffer]");
      if (co) {
        co.disabled = true;
        try {
          const fresh = await store.list();
          const it = byId(fresh, co.dataset.counteroffer);
          pinned = selected = co.dataset.counteroffer;
          const u = E.counteroffer(fresh, it, nowIso(), NOW);
          await store.update(it.id, { data: u.data });
          toast(u.data.counter.date ? `Counteroffer sent: ${fmtDate(u.data.counter.date)}.` : "Spot offered to the customer.");
          state.refresh();
        } catch (err) { toast("Couldn't save: " + err.message, true); co.disabled = false; }
        return;
      }
      const b = e.target.closest("button[data-decide]");
      if (!b) return;
      b.disabled = true;
      try {
        const fresh = await store.list(); // re-read so two departments answering at once don't overwrite each other
        const it = byId(fresh, b.dataset.id);
        pinned = selected = b.dataset.id;
        const u = it && E.decide(fresh, it, b.dataset.decide, b.dataset.ok === "1", nowIso(), NOW);
        if (!u) return toast("Already booked.", true);
        await store.update(it.id, { status: u.status, data: u.data });
        toast(u.status === "confirmed" ? "All four accepted." : u.status === "declined" ? "Denied." : "Accepted.");
        state.refresh();
      } catch (err) { toast("Couldn't save: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  const needsMe = (it) => TEAMS.includes(state.dept) && E.stageOf(it) === "checking" && !it.data.signoffs?.[state.dept];
  const dots = (it) => `<span class="dots">${TEAMS.map((t) => { const s = it.data.signoffs?.[t]; return `<i class="dot ${s ? (s.ok ? "dot-yes" : "dot-no") : ""}" title="${DEPT[t]}"></i>`; }).join("")}</span>`;
  const whatOf = (items, it) => {
    if (!isChange(it)) return plural(it.data.trucks, "truckload");
    const sign = it.data.trucks > 0 ? "+" : "−";
    return `Change ${sign}${Math.abs(it.data.trucks)}`;
  };

  function detail(items, it) {
    // Checks are read as if the order were still open, so a denied order still shows why.
    const open = it.status === "declined" ? { ...it, status: "waiting" } : it;
    const c = E.checks(items.map((x) => (x.id === it.id ? open : x)), open, NOW);
    const st = E.stageOf(it);
    const canAnswer = st !== "booked";
    const offered = st === "offered";
    const card = (t) => {
      const s = it.data.signoffs?.[t];
      const mine = state.dept === t;
      // Logistics: when no carrier on the routing guide has room, the move is a counteroffer, not an accept.
      const short = t === "logistics" && c.logistics.counter && !s && !offered;
      const counter = short ? E.betterDate(items, it, NOW) || { date: null } : null;
      const extra = t === "sales" && it.data.trucks > 0 ? `<p class="d-extra">${money(E.priceTag(c.alloc))} profit / truck</p><p class="d-extra">${reliabilityChip(items, it.data.customer)}</p>` : "";
      return `<div class="dcard ${s ? (s.ok ? "d-yes" : "d-no") : ""}${mine ? " d-mine" : ""}">
        <p class="d-name">${DEPT[t]}</p>
        <p class="d-check ${c[t].ok ? "ok" : "bad"}">${icon(c[t].ok ? "check" : "x")}${esc(c[t].verdict)}</p>${extra}
        ${short && !counter.date ? `<p class="d-extra">No date in 2 weeks works</p>` : ""}
        ${t === "logistics" && offered ? `<p class="d-status">Waiting on customer</p>`
          : mine && canAnswer && counter ? `<button type="button" class="util on wide" data-counteroffer="${esc(it.id)}">${counter.date ? `Counteroffer ${esc(fmtShort(counter.date))}` : "Offer spot to customer"}</button>
            <div class="d-btns"><button type="button" class="util" data-decide="${t}" data-ok="0" data-id="${esc(it.id)}">Deny</button></div>`
          : mine && canAnswer ? `<div class="d-btns"><button type="button" class="util${s?.ok === true ? " on" : !s && c[t].ok ? " rec" : ""}" data-decide="${t}" data-ok="1" data-id="${esc(it.id)}">Accept</button>
            <button type="button" class="util${s?.ok === false ? " on-no" : !s && !c[t].ok ? " rec-no" : ""}" data-decide="${t}" data-ok="0" data-id="${esc(it.id)}">Deny</button></div>`
          : `<p class="d-status">${s ? (s.ok ? "Accepted" : "Denied") : "Waiting"}</p>`}
      </div>`;
    };
    const parent = isChange(it) ? byId(items, it.data.parent) : null;
    return `<div class="card-head"><span class="pill">${E.poNumber(items, it)}</span>${stageChip(it)}</div>
      <h1 class="detail-h">${esc(custName(it.data.customer))}</h1>
      <p class="d-what">${parent ? `Change: ${changeText(items, it)}` : whatOf(items, it)} · ${esc(fmtDate(it.data.date))}</p>
      <div class="dcards">${TEAMS.map(card).join("")}</div>
      ${st === "denied" && it.data.denied ? `<p class="note note-no">${DEPT[it.data.denied.team]} denied: ${esc(it.data.denied.why)}</p>` : ""}
      ${st === "accepted" ? `<p class="note note-ok">${icon("check")}Accepted · <a href="${hubLink("logistics", "calendar", { week: E.weekIndex(it.data.date, NOW) })}">Book trucks</a></p>` : ""}
      ${st === "booked" ? `<p class="note note-ok">${icon("check")}Trucks booked</p>` : ""}
      ${offered ? `<p class="note note-wait">${it.data.counter.date ? `Counteroffer sent: ${esc(fmtDate(it.data.counter.date))}` : "Spot offered"}. Waiting on the customer.</p>` : ""}
      ${it.data.counter?.answer === "kept" ? `<p class="note note-no">Customer kept ${esc(fmtShort(it.data.date))}: ${plural(c.alloc.spot, "spot truck")}, expedite fee ${money(c.alloc.fee)} on their PO</p>` : ""}
      ${it.data.counter?.answer === "accepted" ? `<p class="note note-ok">${icon("check")}Customer took ${esc(fmtShort(it.data.date))} (asked ${esc(fmtShort(it.data.asked))})</p>` : ""}`;
  }

  function live(items) {
    document.querySelectorAll("#o-filter button").forEach((b) => b.classList.toggle("on", b.dataset.filter === filter));
    const all = orders(items).reverse();
    const list = filter === "mine" ? all.filter(needsMe) : all;
    // New department: start from the top of its own list. Otherwise keep the order you picked or just answered.
    if (deptSeen !== state.dept) { deptSeen = state.dept; pinned = selected = null; history.replaceState(null, "", location.pathname + location.search); }
    const inList = list.some((x) => String(x.id) === String(selected));
    if (!inList && !(pinned && String(pinned) === String(selected) && byId(items, selected))) selected = list[0]?.id ?? null;
    $("#o-list").innerHTML = list.length ? list.map((it) => `<button type="button" class="row${String(it.id) === String(selected) ? " row-on" : ""}" data-pick="${esc(it.id)}">
        <span class="row-top"><strong>${E.poNumber(items, it)}</strong> ${esc(custName(it.data.customer))}${dots(it)}</span>
        <span class="row-sub">${whatOf(items, it)} · ${esc(fmtShort(it.data.date))}${stageChip(it)}</span>
      </button>`).join("") : `<p class="empty">${filter === "mine" ? (TEAMS.includes(state.dept) ? "Nothing waiting on you." : "Pick your department above.") : "No orders yet."}</p>`;
    const it = byId(items, selected);
    $("#o-detail").innerHTML = it ? detail(items, it) : `<p class="empty">${all.length ? "Pick an order." : "Customer orders show up here."}</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Truck calendar (Logistics books from here) ----------
function calendarView(store, state) {
  let wk = PARAMS.has("week") ? Math.min(RULES.weeks - 1, Math.max(0, +PARAMS.get("week"))) : null; // null: first week with something to book
  let pick = null; // "laneKey@day"
  let showAll = false; // every pilot lane, or just the ones with something moving that week
  const html = `<div class="cols cols-cal">
    <section class="panel"><div class="cal-head"><button type="button" class="util icon-btn" id="w-prev" aria-label="Previous week">${icon("left")}</button><h1 id="w-label"></h1>
      <button type="button" class="util icon-btn" id="w-next" aria-label="Next week">${icon("right")}</button>
      <span class="legend"><i class="sq sq-con"></i>Booked <i class="sq sq-con-open"></i>To book <i class="sq sq-ctr"></i>Counteroffer <i class="sq sq-spot"></i>Spot <i class="sq sq-chk"></i>Not accepted</span></div>
      <div id="cal"></div></section>
    <section class="panel side" id="cal-side"></section>
  </div>`;

  function mount() {
    $("#w-prev").addEventListener("click", () => { wk = Math.max(0, wk - 1); pick = null; live(state.items); });
    $("#w-next").addEventListener("click", () => { wk = Math.min(RULES.weeks - 1, wk + 1); pick = null; live(state.items); });
    $("#app").addEventListener("click", async (e) => {
      const cell = e.target.closest("[data-cell]");
      if (cell) {
        pick = pick === cell.dataset.cell ? null : cell.dataset.cell;
        if (pick) wk = E.weekIndex(pick.split("@")[1], NOW);
        return live(state.items);
      }
      if (e.target.closest("#side-back")) { pick = null; return live(state.items); }
      if (e.target.closest("#all-lanes")) { showAll = !showAll; return live(state.items); }
      const b = e.target.closest("button[data-book], button[data-bookall], button[data-bookitem]");
      if (!b) return;
      if (state.dept !== "logistics") return toast("Switch to Logistics to book.", true);
      b.disabled = true;
      try {
        if (b.dataset.bookall || b.dataset.bookitem) {
          // Book every unbooked truck day of one order or transfer, or of all of them.
          const fresh = await store.list();
          const rows = E.toBookItems(fresh, NOW).filter((x) => b.dataset.bookall || String(x.it.id) === b.dataset.bookitem);
          const at = stamp();
          for (const x of rows) {
            const it = byId(fresh, x.it.id);
            await store.update(it.id, { data: { ...it.data, booked: { ...(it.data.booked || {}), ...Object.fromEntries(x.days.map((d) => [d.day, at])) } } });
          }
          toast(`Booked ${plural(rows.reduce((s, x) => s + x.trucks, 0), "truck")}.`);
          return state.refresh();
        }
        const [key, day] = b.dataset.cellkey.split("@");
        const lane = PILOT_LANES.find((l) => l.key === key);
        {
          // Book every accepted truck on this lane and day.
          const fresh = await store.list();
          const row = E.calendar(fresh, NOW, E.weekIndex(day, NOW)).find((r) => r.lane.key === key);
          const c = row.cells.find((x) => x.day === day);
          for (const m of c.moves.filter((x) => !x.checking && !x.booked)) {
            const it = byId(fresh, m.it.id);
            await store.update(it.id, { data: { ...it.data, booked: { ...(it.data.booked || {}), [day]: stamp() } } });
          }
          toast(`Booked: ${fmtDate(day)}, ${lane.destination}.`);
        }
        state.refresh();
      } catch (err) { toast("Couldn't save: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }

  // Right side: the day you picked, or the list of what to book next.
  function side(items, rows) {
    const isLog = state.dept === "logistics";
    if (pick) {
      const [key, day] = pick.split("@");
      const row = rows.find((r) => r.lane.key === key);
      const c = row?.cells.find((x) => x.day === day);
      if (c) {
        return `<button type="button" class="linkish back" id="side-back">${icon("left")}To book</button>
          <h2>${esc(fmtDate(day))}</h2><p class="side-lane">${esc(row.lane.kind === "order" ? `${custName(row.lane.destination)} · ${row.lane.destination}` : row.lane.destination)}${c.toBook ? ` · book by ${esc(fmtShort(E.addDays(day, -RULES.noticeDays)))}` : ""}</p>
          <ul class="moves">${c.moves.map((m) => `<li class="mv"><span>${m.it.type === "order" ? `${E.poNumber(items, m.it)} · ${esc(custName(m.it.data.customer))}` : "Prebuild"}</span>
            <span>${m.checking ? `<span class="t-chk">${m.n} not accepted</span>` : `${m.contract ? `<span class="t-con">${m.contract} contract</span>` : ""}${m.counter ? ` <span class="t-ctr">${m.counter} counteroffer</span>` : ""}${m.spot ? ` <span class="t-spot">${m.spot} spot</span>` : ""}`}${m.booked ? ` ${icon("check")}` : ""}</span>
            ${m.carriers?.length ? `<span class="mv-car">${m.carriers.map((x) => `${esc(x.name)} ${x.n}`).join(" · ")}</span>` : ""}</li>`).join("") || `<li class="empty">Nothing moving.</li>`}</ul>
          <p class="big-label">Routing guide</p>
          <ul class="moves rg">${row.lane.routing.map((x) => `<li><span>${E.TIERS[x.tier]} · ${esc(x.name)}</span><span>${x.daily}/day · ${x.weekly}/wk</span></li>`).join("")}</ul>
          ${isLog && c.toBook ? `<button type="button" class="cta" data-book="1" data-cellkey="${esc(pick)}">Book ${plural(c.toBook, "truck")}</button>` : ""}
          ${!isLog && c.toBook ? `<p class="small">Logistics books this.</p>` : ""}`;
      }
    }
    // What to book: one row per order or transfer, soonest first, each with Book; Book all at the bottom.
    const list = E.toBookItems(items, NOW);
    if (!list.length) return `<h2>To book</h2><p class="empty">All booked.</p>`;
    const name = (x) => (x.it.type === "order" ? `${E.poNumber(items, x.it)} ${custName(x.lane.destination)}` : x.lane.destination.split(",")[0]);
    const when = (x) => (x.it.type === "transfer" ? "Prebuild · " : "") + (x.first === x.last ? `${dow(x.first)} ${fmtShort(x.first)}`
      : E.atNoon(x.first).getMonth() === E.atNoon(x.last).getMonth() ? `${fmtShort(x.first)}–${E.atNoon(x.last).getDate()}` : `${fmtShort(x.first)}–${fmtShort(x.last)}`);
    return `<h2>To book</h2><ul class="tobook">${list.map((x) => `<li class="tb-row">
        <button type="button" class="row" data-cell="${esc(x.lane.key)}@${x.first}">
          <span class="row-top"><strong>${esc(name(x))}</strong><span class="by${E.daysBetween(NOW, x.bookBy) <= 2 ? " by-soon" : ""}">by ${esc(fmtShort(x.bookBy))}</span></span>
          <span class="row-sub">${esc(when(x))}</span>
          <span class="row-sub"><span class="t-con">${x.contract} contract</span>${x.spot ? `<span class="t-spot">${x.spot} spot</span>` : ""}</span></button>
        ${isLog ? `<button type="button" class="util small" data-bookitem="${esc(x.it.id)}">Book</button>` : ""}</li>`).join("")}</ul>
      ${isLog ? (list.length > 1 ? `<button type="button" class="cta" data-bookall="1">Book all ${list.reduce((s, x) => s + x.trucks, 0)}</button>` : "") : `<p class="small">Logistics books these.</p>`}`;
  }

  function live(items) {
    if (wk == null) { const first = E.toBookItems(items, NOW)[0]; wk = first ? E.weekIndex(first.first, NOW) : 0; }
    const start = E.addDays(E.weekKey(NOW), wk * 7);
    $("#w-label").textContent = wk === 0 ? `This week · ${weekLabel(start)}` : weekLabel(start);
    $("#w-prev").disabled = wk === 0;
    $("#w-next").disabled = wk === RULES.weeks - 1;
    const rows = E.calendar(items, NOW, wk);
    const days = rows[0].cells.map((c) => c.day);
    const shown = rows.filter((r) => showAll || r.busy);
    const group = (kind, title) => shown.filter((r) => r.lane.kind === kind).map((r, i) => `<tr>
        <th scope="row">${i === 0 ? `<span class="grp">${title}</span>` : ""}${r.lane.kind === "order" ? `${esc(custName(r.lane.destination))}<span class="city">${esc(r.lane.destination)}</span>` : esc(r.lane.destination)}
          <span class="city">${r.perDay}/day on contract${r.expected ? ` · <span class="exp">${r.expected} more expected</span>` : ""}</span></th>
        ${r.cells.map((c) => {
          const key = `${r.lane.key}@${c.day}`;
          const cls = [c.spot ? "c-spot" : c.counter ? "c-ctr" : c.toBook ? "c-book" : "", c.day < NOW ? "c-past" : "", pick === key ? "c-pick" : ""].join(" ");
          return `<td class="${cls}"><button type="button" class="cell" data-cell="${esc(key)}" aria-label="${esc(r.lane.destination)} ${esc(fmtDate(c.day))}">${squares(c.moves)}</button></td>`;
        }).join("")}</tr>`).join("");
    $("#cal").innerHTML = `<div class="table-wrap"><table class="cal">
      <thead><tr><th></th>${days.map((d) => `<th class="${d === NOW ? "today" : ""}">${esc(dow(d))} <span>${E.atNoon(d).getDate()}</span></th>`).join("")}</tr></thead>
      <tbody>${group("order", "Customers")}${group("transfer", "Warehouses")}</tbody></table></div>
      ${shown.length ? "" : `<p class="empty">Nothing moving this week.</p>`}
      <button type="button" class="linkish" id="all-lanes">${showAll ? "Only lanes with loads" : `All ${rows.length} lanes`}</button>`;
    $("#cal-side").innerHTML = side(items, rows);
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Logistics · Transfers: prebuilds from Planning, scheduled in paced waves ----------
function transfersView(store, state) {
  const html = `<div class="cols cols-plan">
    <section class="panel"><h1>Prebuilds to schedule</h1><div id="tq"></div></section>
    <section class="panel"><h2>Scheduled</h2><div id="ts"></div></section>
  </div>`;
  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-sched]");
      if (!b) return;
      if (state.dept !== "logistics") return toast("Logistics schedules prebuilds.", true);
      b.disabled = true;
      try {
        const fresh = await store.list();
        const it = byId(fresh, b.dataset.sched);
        const o = E.transferOptions(fresh, it, NOW)[b.dataset.how];
        const at = stamp();
        await store.update(it.id, { status: "booked", data: { ...it.data, days: o.days, booked: Object.fromEntries(o.days.map((d) => [d.day, at])) } });
        toast(b.dataset.how === "paced" ? `Scheduled over ${plural(o.days.length, "day")}: ${o.contract} on contract.` : `Shipped as one batch: ${o.spot} spot.`);
        state.refresh();
      } catch (err) { toast("Couldn't save: " + err.message, true); b.disabled = false; }
    });
  }
  const range = (days) => days.length === 1 ? fmtDate(days[0].day) : `${fmtShort(days[0].day)}–${fmtShort(days.at(-1).day)}`;
  function live(items) {
    const waiting = items.filter((x) => x.type === "transfer" && x.status === "waiting");
    const isLog = state.dept === "logistics";
    $("#tq").innerHTML = waiting.length ? waiting.map((it) => {
      const o = E.transferOptions(items, it, NOW);
      const opt = (key, label, x, cls) => `<div class="option${key === "paced" ? " on" : ""}">
        <span class="op-name">${label}${key === "paced" && x.spot < o.batch.spot ? ` <span class="best">Best</span>` : ""}</span>
        <span class="op-sq">${squares([{ contract: x.contract, spot: x.spot, booked: false }], 30)}</span>
        <span class="op-n"><span class="t-con">${x.contract} contract</span>${x.spot ? ` <span class="t-spot">${x.spot} spot · ${money(x.overspend)}</span>` : ""}<span class="op-when">${esc(range(x.days))}</span></span>
        ${isLog ? `<button type="button" class="util ${cls} small" data-sched="${esc(it.id)}" data-how="${key}">${key === "paced" ? "Schedule" : "Ship batch"}</button>` : ""}</div>`;
      return `<article class="card tq-card"><div class="card-head"><strong>${esc(it.data.destination)} · ${plural(it.data.trucks, "truckload")}</strong><span class="by">ready ${esc(fmtShort(it.data.ready))}</span></div>
        <div class="options">${opt("batch", "One batch", o.batch, "")}${opt("paced", "Paced waves", o.paced, "on")}</div></article>`;
    }).join("") : `<p class="empty">None waiting. Planning sends prebuilds here.</p>`;
    const alloc = E.allocate(items, NOW);
    const done = items.filter((x) => x.type === "transfer" && x.status === "booked").reverse();
    $("#ts").innerHTML = done.length ? `<ul class="plain">${done.map((it) => {
      const a = alloc.get(it.id);
      return `<li><span><strong>${esc(it.data.destination)}</strong> · ${it.data.trucks} · ${esc(range(it.data.days || [{ day: it.data.ready }]))}</span>
        <span><span class="t-con">${a.contract} contract</span>${a.spot ? ` <span class="t-spot">${a.spot} spot</span>` : ""}</span></li>`;
    }).join("")}</ul>` : `<p class="empty">None yet.</p>`;
  }
  return { html, mount, live };
}

// ---------- Ball HQ · Planning · Short-term: customer forecasts by week, and prebuild decisions ----------
function shorttermView(store, state) {
  const lanes = PILOT_LANES.filter((l) => l.kind === "transfer");
  const form = { destination: "Findlay, OH", trucks: 12, ready: E.addDays(E.weekKey(NOW), 8) };
  const html = `<div class="cols cols-st">
    <section class="panel"><h1>Next 6 weeks</h1><span class="legend st-legend">Truckloads · forecast moved <span class="z z-Y">10–25%</span><span class="z z-R">25%+</span></span><div id="st-fc"></div></section>
    <section class="panel">
      <h2>Prebuild</h2>
      <label class="field"><span class="label">To warehouse</span><select id="pb-dest" aria-label="Warehouse">${lanes.map((l) => `<option>${esc(l.destination)}</option>`).join("")}</select></label>
      <div class="row2"><label class="field"><span class="label">Truckloads</span><input id="pb-trucks" type="number" min="1" max="200" inputmode="numeric"></label>
        <label class="field"><span class="label">Ready on</span><input id="pb-ready" type="date" min="${NOW}" max="${LAST_DAY}"></label></div>
      <button type="button" id="pb-send" class="cta">Send to Logistics</button>
      <div id="pb-list"></div>
    </section>
  </div>`;
  function mount() {
    $("#pb-dest").value = form.destination; $("#pb-trucks").value = form.trucks; $("#pb-ready").value = form.ready;
    $("#pb-dest").addEventListener("change", (e) => { form.destination = e.target.value; });
    $("#pb-trucks").addEventListener("input", (e) => { form.trucks = Math.min(200, Math.max(1, +e.target.value || 1)); });
    $("#pb-ready").addEventListener("change", (e) => { form.ready = e.target.value; });
    $("#pb-send").addEventListener("click", async (e) => {
      const b = e.target;
      if (state.dept !== "planning") return toast("Planning decides prebuilds.", true);
      b.disabled = true;
      try {
        await store.add({ type: "transfer", status: "waiting", data: { destination: form.destination, trucks: form.trucks, ready: form.ready, placed: NOW } });
        toast(`Sent to Logistics: ${form.trucks} to ${form.destination}.`);
        state.refresh();
      } catch (err) { toast("Couldn't send: " + err.message, true); }
      finally { b.disabled = false; }
    });
  }
  function live(items) {
    const weeks = Array.from({ length: RULES.weeks }, (_, wk) => E.addDays(E.weekKey(NOW), wk * 7));
    $("#st-fc").innerHTML = `<table class="tbl st"><thead><tr><th></th>${weeks.map((w, i) => `<th>${i ? esc(fmtShort(w)) : "This week"}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(SIM_CUSTOMERS).map(([c, x]) => `<tr><th scope="row">${esc(x.name)}</th>${weeks.map((_, wk) => {
        const v = E.forecastVersions(items, c, wk, NOW), base = v[0].trucks, latest = v.at(-1).trucks, z = E.zoneOf(base, latest);
        return `<td>${latest}${latest !== base ? `<span class="z z-${z}">${latest > base ? "+" : "−"}${Math.abs(latest - base)}</span>` : ""}</td>`;
      }).join("")}</tr>`).join("")}
      <tr class="st-tot"><th scope="row">All customers</th>${weeks.map((_, wk) => `<td>${Object.keys(SIM_CUSTOMERS).reduce((s, c) => s + E.latestForecast(items, c, wk, NOW), 0)}</td>`).join("")}</tr>
      <tr class="st-tot"><th scope="row">Line time</th>${weeks.map((_, wk) => `<td>${E.SIM_LINE_TIME[wk] + E.plannedLine(items, wk, NOW)}</td>`).join("")}</tr></tbody></table>`;
    const pbs = items.filter((x) => x.type === "transfer").reverse();
    $("#pb-list").innerHTML = pbs.length ? `<ul class="plain pb">${pbs.map((it) => `<li><span><strong>${esc(it.data.destination)}</strong> · ${it.data.trucks} · ready ${esc(fmtShort(it.data.ready))}</span>
      <span class="chip ${it.status === "booked" ? "chip-booked" : "chip-checking"}">${it.status === "booked" ? "Scheduled" : "With Logistics"}</span></li>`).join("")}</ul>` : "";
  }
  return { html, mount, live };
}

// ---------- Ball HQ · Planning · Long-term: the plant's real monthly loads and next year's baseline ----------
function longtermView() {
  const html = `<section class="panel"><h1>Monticello, 12 months</h1>
    <span class="legend line-legend"><i class="lb lb-2025"></i>2025 <i class="lb lb-used"></i>2026 <i class="lb lb-fc"></i>2026 plan (2025 + 2%)</span>
    <div id="lt" class="lt"></div><p class="small">Loads a month, all lanes (Ball's workbook).</p></section>`;
  function live() {
    const lt = E.longTerm();
    const top = Math.max(...lt.flatMap((m) => [m.y2025 || 0, m.forecast2026 || 0]));
    $("#lt").innerHTML = lt.map((m) => `<div class="lt-m"><div class="lt-bars">
        <i class="lb-2025" style="height:${((m.y2025 || 0) / top) * 100}%" title="2025: ${m.y2025}"></i>
        <i class="${m.actual ? "lb-used" : "lb-fc"}" style="height:${(m.forecast2026 / top) * 100}%" title="2026: ${m.forecast2026}"></i></div>
        <span>${m.month}</span><b>${m.forecast2026.toLocaleString("en-US")}</b></div>`).join("");
  }
  return { html, live };
}

// ---------- Ball HQ · Sales · Customers: reliability earns priority ----------
function customersView() {
  const html = `<section class="panel narrow"><h1>Customers</h1><div id="cu"></div>
    <p class="small">Reliable = orders placed and kept outside the 3-day fence. ${pct(RULES.priorityAt)}+ is Priority: first in line for backup carriers and counteroffer dates.</p></section>`;
  function live(items) {
    $("#cu").innerHTML = `<table class="tbl"><thead><tr><th></th><th>Reliable</th><th>Late</th><th>Open POs</th><th></th></tr></thead><tbody>
      ${Object.entries(SIM_CUSTOMERS).map(([c, x]) => { const r = E.reliability(items, c);
        const open = orders(items).filter((o) => o.data.customer === c && !isChange(o) && ["checking", "offered", "accepted"].includes(E.stageOf(o))).length;
        return `<tr><th scope="row">${esc(x.name)}</th><td>${pct(r.score)}</td><td class="muted">${r.late} of ${r.total}</td><td>${open}</td><td>${r.priority ? `<span class="chip chip-prio">Priority</span>` : ""}</td></tr>`; }).join("")}</tbody></table>`;
  }
  return { html, live };
}

// ---------- Ball HQ · Inventory: labeled cans in stock ----------
function stockView() {
  const html = `<section class="panel narrow"><h1>Labeled cans at Monticello</h1><div id="st"></div><p class="small">Truckloads. Labeled cans fit only that customer.</p></section>`;
  function live(items) {
    const plan = E.planUse(items, NOW);
    const os = orders(items).filter((x) => E.isActive(x));
    const sum = (c, status, f) => os.filter((x) => x.data.customer === c && (status ? x.status === status : true)).reduce((s, x) => s + (f(plan.get(x.id)) || 0), 0);
    const stranded = (c) => os.filter((x) => x.data.customer === c && x.status === "confirmed" && x.data.trucks < 0 && plan.get(x.id)?.frozen).reduce((s, x) => s - x.data.trucks, 0);
    $("#st").innerHTML = `<table class="tbl"><thead><tr><th></th><th>In stock</th><th>Promised</th><th>Checking</th><th>Left</th><th>Stranded</th></tr></thead><tbody>
      ${Object.entries(SIM_CUSTOMERS).map(([c, x]) => {
        const promised = sum(c, "confirmed", (p) => p?.fromStock), checking = sum(c, "waiting", (p) => p?.fromStock), str = stranded(c);
        return `<tr><th scope="row">${esc(x.name)}</th><td>${x.stock}</td><td>${promised}</td><td class="muted">${checking}</td><td><strong>${x.stock - promised - checking}</strong></td><td class="${str ? "t-spot" : "muted"}">${str}</td></tr>`;
      }).join("")}</tbody></table>`;
  }
  return { html, live };
}

// ---------- Ball HQ · Planning: line time per week ----------
function lineView() {
  const html = `<section class="panel"><h1>Line time, next 6 weeks</h1>
    <span class="legend line-legend"><i class="lb lb-used"></i>Accepted <i class="lb lb-chk"></i>Checking <i class="lb lb-left"></i>Open</span>
    <div id="ln" class="ln"></div><p class="small">Truckloads of cans. Weeks start Sunday.</p></section>`;
  function live(items) {
    const plan = E.planUse(items, NOW);
    const os = orders(items).filter((x) => E.isActive(x) && x.data.trucks > 0);
    $("#ln").innerHTML = Array.from({ length: RULES.weeks }, (_, wk) => {
      const open = E.SIM_LINE_TIME[wk] + E.plannedLine(items, wk, NOW);
      const made = (status) => os.filter((x) => x.status === status && plan.get(x.id)?.wk === wk).reduce((s, x) => s + (plan.get(x.id)?.made || 0), 0);
      const used = made("confirmed"), chk = made("waiting"), left = Math.max(0, open - used - chk);
      const frozen = E.daysBetween(NOW, E.addDays(E.weekKey(NOW), wk * 7 + 6)) < RULES.makeLeadDays + RULES.freezeDays;
      return `<div class="ln-wk"><p class="ln-h">${wk === 0 ? "This week" : esc(fmtShort(E.addDays(E.weekKey(NOW), wk * 7)))}${frozen ? ` <span class="chip chip-checking">Frozen</span>` : ""}</p>
        <p class="ln-n">${left} <span>of ${open} open</span></p>
        <span class="ln-bar">${used ? `<i class="lb-used" style="flex:${used}"></i>` : ""}${chk ? `<i class="lb-chk" style="flex:${chk}"></i>` : ""}${left ? `<i class="lb-left" style="flex:${left}"></i>` : ""}</span></div>`;
    }).join("");
  }
  return { html, live };
}

// ---------- Ball HQ · Executive ----------
function execView(store, state) {
  const html = `<section class="exec">
    <div id="x-top" class="x-top"></div>
    <div id="x-from" class="x-from"></div>
    <div id="x-cards" class="x-cards"></div>
    <button type="button" id="x-reset" class="linkish quiet">Clear all data</button>
  </section>`;

  function mount() {
    $("#x-reset").addEventListener("click", async () => {
      const pin = store.live ? prompt("Admin PIN:") : "local";
      if (pin === null) return;
      if (!store.live && !confirm("Clear everything on this laptop?")) return;
      try { await store.reset(pin); toast("Cleared."); state.refresh(); }
      catch (err) { toast("Not cleared: " + err.message, true); }
    });
  }

  function live(items) {
    const now = E.totals(items, NOW);
    const old = E.oldWay(items, NOW); // the same freight run the old way: Thursday batches, shipped Fri–Sun
    const s = E.scorecards(items, NOW);
    const saved = Math.max(0, old.overspend - now.overspend);
    const bar = (label, t, cls) => `<div class="bar-row"><span class="bar-label">${label}</span>
      <span class="bar">${t.trucks ? `<i class="bar-con" style="flex:${t.contract}"></i><i class="bar-spot" style="flex:${t.spot}"></i>` : `<i class="bar-none"></i>`}</span>
      <span class="bar-n ${cls}">${t.trucks ? `${pct(t.spotShare)} spot` : "–"}</span></div>`;
    $("#x-top").innerHTML = `
      <div class="big-card big-save"><p class="big-label">Saved</p><p class="big-n">${money(saved)}</p><p class="big-sub">${plural(Math.max(0, Math.round(old.spot - now.spot)), "fewer spot truck", "fewer spot trucks")}</p></div>
      <div class="big-card"><p class="big-label">Spot Ball paid</p><p class="big-n">${money(now.overspend)}</p><p class="big-sub">${plural(now.spot, "spot truck")}${now.fees ? ` · ${money(now.fees)} billed as expedite fees` : ""}</p></div>
      <div class="big-card wide"><p class="big-label">Spot share</p>${bar("Old way", old, "bad")}${bar("Now", now, now.spotShare <= RULES.spotGoal ? "good" : "bad")}
        <p class="big-sub">Old way = weekly batches, shipped Fri–Sun · Goal ${pct(RULES.spotGoal)}</p></div>`;
    const by = E.savingsBy(items, NOW);
    const parts = [["Prebuilds paced", by.transfers], ["Orders on the routing guide", by.orders]].filter(([, v]) => v > 0);
    const top = Math.max(1, ...parts.map(([, v]) => v));
    $("#x-from").innerHTML = saved ? `<p class="big-label">Where it came from</p>${parts.map(([n, v]) => `<div class="from-row"><span>${n}</span>
        <span class="from-bar"><i style="width:${(v / top) * 100}%"></i></span><span class="from-n">${money(v)}</span></div>`).join("")}` : "";
    // One card per hub: its number, and what's waiting on it. Click to open the hub.
    const card = (name, value, sub, good, backlog = []) => { const hub = Object.keys(HUBS).find((k) => HUBS[k].name === name);
      const due = backlog.filter(([n]) => n).map(([n, what]) => `${n} ${what}`).join(" · ");
      return `<div class="x-card ${good == null ? "" : good ? "x-good" : "x-bad"}"><a class="x-name" href="${hubLink(hub, "orders")}">${name} ${icon("right")}</a><p class="x-n">${value}</p><p class="x-sub">${sub}</p>${due ? `<p class="x-wait">${due}</p>` : ""}</div>`; };
    const m = s.sales.answerMin;
    const waiting = (t) => orders(items).filter((x) => E.stageOf(x) === "checking" && !x.data.signoffs?.[t]).length;
    const toBook = E.toBookItems(items, NOW).length;
    const toSchedule = items.filter((x) => x.type === "transfer" && x.status === "waiting").length;
    $("#x-cards").innerHTML =
      card("Sales", m == null ? "–" : m < 60 ? `${Math.max(1, Math.round(m))} min` : `${(m / 60).toFixed(1)} hr`, "to answer · goal 4 hr", m == null ? null : m <= 240, [[waiting("sales"), "waiting"]]) +
      card("Inventory", `${s.inventory.stranded}`, "truckloads stranded", s.inventory.stranded === 0, [[waiting("inventory"), "waiting"]]) +
      card("Planning", pct(s.planning.share), "line time used", null, [[waiting("planning"), "waiting"]]) +
      card("Logistics", s.logistics.trucks ? pct(s.logistics.spotShare) : "–", `spot · ${s.logistics.ahead == null ? "–" : pct(s.logistics.ahead)} booked ahead`, s.logistics.trucks ? s.logistics.spotShare <= RULES.spotGoal : null,
        [[waiting("logistics"), "waiting"], [toBook, "to book"], [toSchedule, "to schedule"]]);
  }

  return { html, mount, live };
}

// ---------- Home ----------
const homeView = () => ({ html: `<section class="home">
    <h1>From order to truck, every team on the same page.</h1>
    <div class="two-doors">
      <a class="door door-cust" href="${link("customer")}"><span class="door-name">Customer HQ</span><span class="door-line">Order and change</span></a>
      <a class="door" href="${hubLink("sales", "orders")}"><span class="door-name">Ball HQ</span><span class="door-line">Accept, book, plan</span></a>
    </div>
  </section>` });

// ---------- Boot ----------
async function main() {
  const asked = PARAMS.get("role");
  let role = asked in ALIASES ? ALIASES[asked] : asked;
  const allTabs = new Set(Object.values(HUBS).flatMap((h) => Object.keys(h.tabs)));
  const portal = role === "customer" ? "customer" : allTabs.has(role) || HUBS[PARAMS.get("hub")] ? "ball" : "home";
  const custTab = PARAMS.get("tab") === "pos" ? "pos" : "order";
  // Which hub: ?hub=, else an old department link (?role=sales), else the only hub with that tab, else the last one used.
  const saved = localStorage.getItem("bc_dept");
  const hub = HUBS[PARAMS.get("hub")] ? PARAMS.get("hub")
    : TEAMS.includes(asked) ? asked : asked === "production" ? "planning"
    : allTabs.has(role) && Object.keys(HUBS).filter((k) => HUBS[k].tabs[role]).length === 1 ? Object.keys(HUBS).find((k) => HUBS[k].tabs[role])
    : HUBS[saved] && (!role || HUBS[saved].tabs[role]) ? saved : "sales";
  if (portal === "ball" && !HUBS[hub].tabs[role]) role = Object.keys(HUBS[hub].tabs)[0];
  document.body.dataset.portal = portal;
  document.body.dataset.role = role || "home";
  const state = { items: [], refresh: null, dept: hub,
    company: SIM_CUSTOMERS[localStorage.getItem("bc_company")] ? localStorage.getItem("bc_company") : Object.keys(SIM_CUSTOMERS)[0] };
  if (portal === "ball") { localStorage.setItem("bc_dept", hub); localStorage.setItem("bc_tab", role); }

  $("#brand").textContent = portal === "customer" ? "Customer HQ" : portal === "ball" ? "Ball HQ" : "Ball · Monticello pilot";
  $("#brand").href = portal === "customer" ? link("customer") : "./" + link("").replace(/^\?role=&?/, "?").replace(/^\?$/, "");
  // One click between the two portals; Ball HQ reopens the hub and tab you were last on.
  const lastHub = HUBS[saved] ? saved : "sales";
  const lastTab = HUBS[lastHub].tabs[localStorage.getItem("bc_tab")] ? localStorage.getItem("bc_tab") : Object.keys(HUBS[lastHub].tabs)[0];
  const switcher = portal === "home" ? "" : `<nav class="switch" aria-label="Switch portal">
    <a href="${link("customer")}" class="${portal === "customer" ? "on" : ""}">Customer HQ</a><a href="${hubLink(lastHub, lastTab)}" class="${portal === "ball" ? "on" : ""}">Ball HQ</a></nav>`;
  $("#who").innerHTML = switcher + (portal === "customer"
    ? `<select id="who-sel" aria-label="Company">${Object.entries(SIM_CUSTOMERS).map(([d, c]) => `<option value="${esc(d)}">${esc(c.name)}</option>`).join("")}</select>` : "");

  const store = withForecasts(await makeStore());
  const drawNav = (items = []) => {
    if (portal === "customer") {
      const need = needsCustomer(items, state.company).length;
      $("#nav").innerHTML = Object.entries(CUST_TABS).map(([k, name]) =>
        `<a href="${link("customer", k === "pos" ? { tab: "pos" } : {})}" class="${k === custTab ? "on" : ""}">${name}${k === "pos" && need ? ` <span class="count">${need}</span>` : ""}</a>`).join("");
      return;
    }
    if (portal !== "ball") { $("#nav").innerHTML = ""; return; }
    // Hubs across the top (with what's waiting on each); the hub's own tabs underneath.
    const waiting = (d) => (TEAMS.includes(d) ? orders(items).filter((x) => E.stageOf(x) === "checking" && !x.data.signoffs?.[d]).length : 0);
    const tabCount = (d, t) => (t === "orders" ? waiting(d) : d !== "logistics" ? 0
      : t === "calendar" ? E.toBookItems(items, NOW).length : t === "transfers" ? items.filter((x) => x.type === "transfer" && x.status === "waiting").length : 0);
    const hubCount = (d) => Object.keys(HUBS[d].tabs).reduce((s, t) => s + tabCount(d, t), 0);
    const badge = (n) => (n ? ` <span class="count">${n}</span>` : "");
    $("#nav").innerHTML = Object.entries(HUBS).map(([d, h]) =>
      `<a href="${hubLink(d, h.tabs[role] ? role : Object.keys(h.tabs)[0])}" class="${d === hub ? "on" : ""}">${h.name}${badge(hubCount(d))}</a>`).join("");
    const tabs = Object.entries(HUBS[hub].tabs);
    $("#subnav").hidden = tabs.length < 2;
    $("#subnav").innerHTML = tabs.map(([t, name]) => `<a href="${hubLink(hub, t)}" class="${t === role ? "on" : ""}">${name}${badge(tabCount(hub, t))}</a>`).join("");
  };
  if ($("#who-sel")) {
    $("#who-sel").value = state.company;
    $("#who-sel").addEventListener("change", (e) => { state.company = e.target.value; localStorage.setItem("bc_company", state.company); state.refresh(); });
  }
  drawNav();
  const notes = [];
  if (!store.live) notes.push(FORCE_LOCAL ? "Backup mode: this laptop only" : "Local mode");
  if (notes.length || PARAMS.get("today")) {
    // Rehearsal: pick the app's "today" to show what happens days later (a late order, a missed book-by date).
    $("#mode-banner").hidden = false;
    $("#mode-banner").innerHTML = esc(notes.join(" · ")) + (PARAMS.get("today")
      ? `${notes.length ? " · " : ""}<label class="today">Today <input type="date" id="today-pick" value="${NOW}" aria-label="Today"></label>` : "");
    $("#today-pick")?.addEventListener("change", (e) => {
      if (!e.target.value) return;
      const q = new URLSearchParams(location.search);
      q.set("today", e.target.value);
      location.search = q.toString().replace(/local=(&|$)/, "local$1");
    });
  }
  document.title = portal === "customer" ? `${CUST_TABS[custTab]} · Customer HQ` : portal === "ball" ? `${HUBS[hub].tabs[role]} · ${HUBS[hub].name} · Ball HQ` : "Ball · Monticello pilot";

  const view = portal === "home" ? homeView()
    : portal === "customer" ? customerView(store, state, custTab)
    : role === "shortterm" ? shorttermView(store, state)
    : role === "longterm" ? longtermView()
    : role === "customers" ? customersView()
    : role === "orders" ? ordersView(store, state)
    : role === "calendar" ? calendarView(store, state)
    : role === "transfers" ? transfersView(store, state)
    : role === "stock" ? stockView()
    : role === "line" ? lineView()
    : execView(store, state);
  $("#app").innerHTML = view.html;
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
      if (/fetch|network/i.test(err.message)) toast("Can't reach the database.", true);
      else { showBroken(err.message); console.error(err); }
    } finally {
      busy = false;
      if (again) { again = false; state.refresh(); }
    }
  };
  if (view.live) { store.subscribe(() => state.refresh()); state.refresh(); }
}

main();
