import * as E from "./engine.js?v=39";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js?v=39";

const { RULES, PILOT_LANES, SIM_CUSTOMERS, TEAMS, STAGES } = E;
const PARAMS = new URLSearchParams(location.search);
const NOW = PARAMS.get("today") || E.isoDate(new Date()); // ?today=2026-11-05 to rehearse a date
const FORCE_LOCAL = PARAMS.has("local");                   // ?local = backup if the room's Wi-Fi fails

const BALL = { outlook: "Outlook", orders: "Orders", calendar: "Trucks", transfers: "Transfers", exec: "Executive" };
const ALIASES = { review: "orders", pos: "orders", team: "orders", ball: "orders", sales: "orders", inventory: "orders", production: "orders",
  logistics: "calendar", schedule: "calendar", forecast: "outlook", warning: "outlook", carrier: "calendar", plan: "calendar", hub: "exec", dashboard: "exec" };
const DEPT = { sales: "Sales", inventory: "Inventory", production: "Production", logistics: "Logistics", exec: "Executive" };
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
  const KEY = "bc_items_v3";
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
function withForecasts(store) {
  const out = (r) => (r.type === "ask" && r.data?.kind === "forecast" ? { ...r, type: "forecast" } : r);
  const inn = (r) => (r.type === "forecast" ? { ...r, type: "ask", status: "noted", data: { ...r.data, kind: "forecast" } } : r);
  return { ...store, list: async () => (await store.list()).map(out), add: async (row) => out(await store.add(inn(row))) };
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
const customerWhy = (d) => d.team === "sales" ? (/^Only/.test(d.why) ? "Too close to delivery" : "Over your forecast")
  : d.team === "production" ? (/freeze/i.test(d.why) ? "Too close to make" : "No line time that week")
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

// The last pre-booking or release for a lane-week.
function preSaid(items, lane, day) {
  const wk = E.weekKey(day);
  const last = items.filter((x) => x.type === "ask" && x.data.destination === lane.destination && x.data.kind === lane.kind && x.data.week === wk).at(-1);
  return !last ? "" : last.data.trucks < 0 ? `Released ${-last.data.trucks}` : `Pre-booked ${last.data.trucks}`;
}

// Truck squares: one per truck. Contract booked = solid, contract to book = outline, spot = red, not accepted = dashed.
function squares(moves, max = 14) {
  const parts = [];
  for (const m of moves) {
    for (let i = 0; i < m.contract; i++) parts.push(m.checking ? "chk" : m.booked ? "con" : "con-open");
    for (let i = 0; i < m.spot; i++) parts.push(m.checking ? "chk" : "spot");
  }
  const shown = parts.slice(0, max).map((k) => `<i class="sq sq-${k}"></i>`).join("");
  return shown + (parts.length > max ? `<b class="sq-more">+${parts.length - max}</b>` : "");
}

// ---------- Customer HQ: two tabs. Order (new order and forecast) and My POs (where each one stands) ----------
const CUST_TABS = { order: "Order", pos: "My POs" };
const retried = (items, it) => orders(items).some((x) => String(x.data.retry_of) === String(it.id));
// Denied, and Ball found a date that works: the customer's move.
const needsCustomer = (items, company) => orders(items)
  .filter((x) => x.data.customer === company && E.stageOf(x) === "denied" && !retried(items, x) && E.betterDate(items, x, NOW));
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
async function sendOrder(store, state, btn, data, msg) {
  btn.disabled = true;
  try {
    const saved = await store.add({ type: "order", status: "waiting", data: { signoffs: {}, ...data } });
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
  const form = { m: 2, date: E.addDays(E.weekKey(NOW), 14 + 4) };
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
      <h1>New order</h1>
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
    if (ok) { form.m = 2; drawForm(); }
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
  function live() {
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
          ${st !== "denied" && !open ? `<button type="button" class="util small" data-change="${esc(po.id)}">Change</button>` : ""}</div>
        ${denyBlock(items, po)}
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
        ${denyBlock(items, c)}
      </article>`).join("") : `<p class="empty">No changes.</p>`;
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Outlook (forecast early warning: the next 6 weeks per customer) ----------
function outlookView(store, state) {
  let pick = null; // "customer@wk"
  const html = `<div class="cols cols-cal">
    <section class="panel"><div class="cal-head"><h1 class="ol-h">Next 6 weeks</h1>
      <span class="legend">Forecast moved <span class="z z-G">≤10%</span><span class="z z-Y">10–25%</span><span class="z z-R">25%+</span></span></div>
      <div id="ol"></div></section>
    <section class="panel side" id="ol-side"></section>
  </div>`;
  const zoneText = (w) => (w.zone === "N" ? "New" : `${w.change > 0 ? "+" : "−"}${Math.round(Math.abs(w.change) / w.base * 100)}%`);

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const cell = e.target.closest("[data-ol]");
      if (cell) { pick = pick === cell.dataset.ol ? null : cell.dataset.ol; return live(state.items); }
      if (e.target.closest("#side-back")) { pick = null; return live(state.items); }
      const b = e.target.closest("button[data-olbook], button[data-olrelease]");
      if (!b) return;
      if (state.dept !== "logistics") return toast("Switch to Logistics.", true);
      b.disabled = true;
      try {
        const lane = E.laneOf("order", b.dataset.customer);
        const week = b.dataset.week;
        const base = { kind: lane.kind, destination: lane.destination, week, date: week };
        const n = b.dataset.olbook ? +b.dataset.olbook : -b.dataset.olrelease;
        await store.add({ type: "ask", status: "yes", data: { ...base, trucks: n, accepted: n, on: NOW } });
        toast(n > 0 ? `Pre-booked ${plural(n, "truck")}.` : `Released ${plural(-n, "truck")}.`);
        state.refresh();
      } catch (err) { toast("Couldn't save: " + err.message, true); b.disabled = false; }
    });
  }

  // The one button for a week, if there is one: pre-book the open trucks, or release trucks no one needs.
  function action(items, row, w) {
    if (state.dept !== "logistics" || !w.canBook) return "";
    const data = `data-customer="${esc(row.customer)}" data-week="${w.week}"`;
    if (w.gap) return `<button type="button" class="util on small" data-olbook="${w.gap}" ${data}>Book +${w.gap}</button>`;
    if (w.surplus && w.latest < w.base) return `<button type="button" class="util small" data-olrelease="${w.surplus}" ${data}>Release ${w.surplus}</button>`;
    return "";
  }
  const status = (w) => w.gap ? `<span class="ol-gap">${w.gap} open</span>`
    : w.surplus && w.latest < w.base ? `<span class="ol-sur">${w.surplus} extra</span>`
    : w.extra ? `<span class="ol-ok">${icon("check")}Covered</span>` : "";

  function side(items, rows) {
    if (pick) {
      const [customer, wk] = pick.split("@");
      const row = rows.find((r) => r.customer === customer);
      const w = row.weeks[+wk];
      const said = preSaid(items, row.lane, w.week);
      return `<button type="button" class="linkish back" id="side-back">${icon("left")}To act on</button>
        <h2>${esc(custName(customer))}</h2><p class="side-lane">${esc(weekLabel(w.week))}</p>
        <p class="big-label">Forecast</p>
        <ul class="moves">${w.versions.map((v, i) => `<li><span>${v.baseline ? "Plan" : esc(fmtShort(v.on))}</span><span>${i && w.versions[i - 1].trucks !== v.trucks
          ? `<span class="t-chk">${w.versions[i - 1].trucks} →</span> ` : ""}<strong>${v.trucks}</strong></span></li>`).join("")}</ul>
        <p class="big-label">Orders</p>
        <ul class="moves"><li><span>Accepted</span><strong>${w.ordered}</strong></li>${w.pending ? `<li><span>Checking</span><strong>${w.pending}</strong></li>` : ""}<li><span>Forecast left</span><strong>${w.left}</strong></li></ul>
        <p class="big-label">Trucks</p>
        <ul class="moves"><li><span>Needed</span><strong>${w.need}</strong></li><li><span>Scheduled</span><strong>${w.base}${w.extra ? ` ${w.extra > 0 ? "+" : "−"} ${Math.abs(w.extra)}` : ""}</strong></li>
          ${w.ahead ? `<li><span>Orders booked ahead</span><strong>${w.ahead}</strong></li>` : ""}
          <li><span>${!w.gap && w.surplus ? "Extra" : "Open"}</span><strong class="${w.gap ? "t-spot" : ""}">${w.gap || w.surplus}</strong></li></ul>
        ${w.gap && !w.canBook ? `<p class="why">Under ${RULES.noticeDays} days: late orders go spot</p>` : ""}
        ${action(items, row, w).replace("small", "wide")}
        ${said ? `<p class="said">${esc(said)}</p>` : ""}`;
    }
    const list = E.warnings(items, NOW);
    if (!list.length) return `<h2>To act on</h2><p class="empty">Nothing. Every week is covered.</p>`;
    return `<h2>To act on</h2><ul class="tobook">${list.map((x) => {
      const row = rows.find((r) => r.customer === x.customer);
      const by = x.bookBy;
      return `<li class="tb-row"><button type="button" class="row" data-ol="${esc(x.customer)}@${x.wk}">
          <span class="row-top"><strong>${esc(custName(x.customer))}</strong>${!x.canBook ? `<span class="by by-soon">spot risk</span>` : `<span class="by${E.daysBetween(NOW, by) <= 2 ? " by-soon" : ""}">by ${esc(fmtShort(by))}</span>`}</span>
          <span class="row-sub">${esc(weekLabel(x.week))}</span>
          <span class="row-sub">${x.kind === "up" ? `<span class="t-spot">${x.n} open</span>` : `<span class="t-chk">${x.n} extra</span>`}</span></button>
        ${action(items, row, x)}</li>`;
    }).join("")}</ul>${state.dept !== "logistics" ? `<p class="small">Logistics acts on these.</p>` : ""}`;
  }

  function live(items) {
    const rows = E.outlook(items, NOW);
    const weeks = rows[0].weeks.map((w) => w.week);
    $("#ol").innerHTML = `<div class="table-wrap"><table class="cal ol">
      <thead><tr><th></th>${weeks.map((d, i) => `<th>${i === 0 ? "This week" : "Week of"} <span>${esc(fmtShort(d))}</span></th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${esc(custName(r.customer))}<span class="city">${esc(r.customer)}</span></th>
        ${r.weeks.map((w) => {
          const key = `${r.customer}@${w.wk}`;
          const cls = [w.gap ? "c-spot" : "", pick === key ? "c-pick" : ""].join(" ");
          return `<td class="${cls}"><button type="button" class="cell ol-cell" data-ol="${esc(key)}" aria-label="${esc(custName(r.customer))}, week of ${esc(fmtShort(w.week))}">
            <span class="ol-n">${w.need}</span>${w.change || w.zone === "N" ? `<span class="z z-${w.zone}">${zoneText(w)}</span>` : ""}${status(w)}</button></td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
    $("#ol-side").innerHTML = side(items, rows);
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
    const card = (t) => {
      const s = it.data.signoffs?.[t];
      const mine = state.dept === t;
      return `<div class="dcard ${s ? (s.ok ? "d-yes" : "d-no") : ""}${mine ? " d-mine" : ""}">
        <p class="d-name">${DEPT[t]}</p>
        <p class="d-check ${c[t].ok ? "ok" : "bad"}">${icon(c[t].ok ? "check" : "x")}${esc(c[t].verdict)}</p>
        ${mine && canAnswer ? `<div class="d-btns"><button type="button" class="util${s?.ok === true ? " on" : !s && c[t].ok ? " rec" : ""}" data-decide="${t}" data-ok="1" data-id="${esc(it.id)}">Accept</button>
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
      ${st === "accepted" ? `<p class="note note-ok">${icon("check")}Accepted · <a href="${link("calendar", { week: E.weekIndex(it.data.date, NOW) })}">Book trucks</a></p>` : ""}
      ${st === "booked" ? `<p class="note note-ok">${icon("check")}Trucks booked</p>` : ""}`;
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
  const html = `<div class="cols cols-cal">
    <section class="panel"><div class="cal-head"><button type="button" class="util icon-btn" id="w-prev" aria-label="Previous week">${icon("left")}</button><h1 id="w-label"></h1>
      <button type="button" class="util icon-btn" id="w-next" aria-label="Next week">${icon("right")}</button>
      <span class="legend"><i class="sq sq-con"></i>Booked <i class="sq sq-con-open"></i>To book <i class="sq sq-spot"></i>Spot <i class="sq sq-chk"></i>Not accepted yet</span></div>
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
          <ul class="moves">${c.moves.map((m) => `<li><span>${m.it.type === "order" ? `${E.poNumber(items, m.it)} · ${esc(custName(m.it.data.customer))}` : "Transfer"}</span>
            <span>${m.checking ? `<span class="t-chk">${m.n} not accepted</span>` : `${m.contract ? `<span class="t-con">${m.contract} contract</span>` : ""}${m.spot ? ` <span class="t-spot">${m.spot} spot</span>` : ""}`}${m.booked ? ` ${icon("check")}` : ""}</span></li>`).join("") || `<li class="empty">Nothing moving.</li>`}</ul>
          ${isLog && c.toBook ? `<button type="button" class="cta" data-book="1" data-cellkey="${esc(pick)}">Book ${plural(c.toBook, "truck")}</button>` : ""}
          ${!isLog && c.toBook ? `<p class="small">Logistics books this.</p>` : ""}`;
      }
    }
    // What to book: one row per order or transfer, soonest first, each with Book; Book all at the bottom.
    const list = E.toBookItems(items, NOW);
    if (!list.length) return `<h2>To book</h2><p class="empty">All booked.</p>`;
    const name = (x) => (x.it.type === "order" ? `${E.poNumber(items, x.it)} ${custName(x.lane.destination)}` : x.lane.destination.split(",")[0]);
    const when = (x) => (x.it.type === "transfer" ? "Transfer · " : "") + (x.first === x.last ? `${dow(x.first)} ${fmtShort(x.first)}`
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
    const group = (kind, title) => rows.filter((r) => r.lane.kind === kind).map((r, i) => `<tr>
        <th scope="row">${i === 0 ? `<span class="grp">${title}</span>` : ""}${r.lane.kind === "order" ? `${esc(custName(r.lane.destination))}<span class="city">${esc(r.lane.destination)}</span>` : esc(r.lane.destination)}</th>
        ${r.cells.map((c) => {
          const key = `${r.lane.key}@${c.day}`;
          const cls = [c.spot ? "c-spot" : c.toBook ? "c-book" : "", c.day < NOW ? "c-past" : "", pick === key ? "c-pick" : ""].join(" ");
          return `<td class="${cls}"><button type="button" class="cell" data-cell="${esc(key)}" aria-label="${esc(r.lane.destination)} ${esc(fmtDate(c.day))}">${squares(c.moves)}</button></td>`;
        }).join("")}</tr>`).join("");
    $("#cal").innerHTML = `<div class="table-wrap"><table class="cal">
      <thead><tr><th></th>${days.map((d) => `<th class="${d === NOW ? "today" : ""}">${esc(dow(d))} <span>${E.atNoon(d).getDate()}</span></th>`).join("")}</tr></thead>
      <tbody>${group("order", "Customers")}${group("transfer", "Warehouses")}</tbody></table></div>`;
    $("#cal-side").innerHTML = side(items, rows);
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Transfers (plan Ball's own moves to warehouses) ----------
function transfersView(store, state) {
  const lanes = PILOT_LANES.filter((l) => l.kind === "transfer");
  const nextMon = E.addDays(E.weekKey(NOW), 8);
  const form = { destination: "Mississauga, ON", trucks: 12, date: E.daysBetween(NOW, nextMon) >= RULES.noticeDays ? nextMon : E.addDays(nextMon, 7) };
  const html = `<div class="cols cols-plan">
    <section class="panel">
      <h1>Plan a transfer</h1>
      <div class="row3">
        <label class="field"><span class="label">To</span><select id="p-dest" aria-label="To">${lanes.map((l) => `<option>${esc(l.destination)}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Truckloads</span><input id="p-trucks" type="number" min="1" max="200" inputmode="numeric"></label>
        <label class="field"><span class="label">Ship on</span><input id="p-date" type="date" min="${NOW}" max="${LAST_DAY}"></label>
      </div>
      <div id="p-result" class="p-result"></div>
      <button type="button" id="p-send" class="cta">Put on calendar</button>
    </section>
    <section class="panel"><h2>Planned</h2><div id="p-list"></div></section>
  </div>`;

  const draft = () => ({ id: "draft", type: "transfer", status: "booked", created_at: "￿",
    data: { destination: form.destination, trucks: form.trucks, date: form.date } });

  // What this transfer costs in spot: none if booked 3+ days ahead.
  function paint() {
    $("#p-dest").value = form.destination;
    $("#p-trucks").value = form.trucks;
    $("#p-date").value = form.date;
    const a = E.allocate([...state.items, draft()], NOW).get("draft");
    const bookBy = E.addDays(form.date, -RULES.noticeDays);
    $("#p-result").innerHTML = `<span class="op-sq">${squares([{ contract: a.contract, spot: a.spot, booked: false }], 40)}</span>
      <span class="op-n"><span class="t-con">${a.contract} contract</span>${a.spot ? ` <span class="t-spot">${a.spot} spot · ${money(a.overspend)}</span>` : ""}</span>
      <span class="p-by">${a.spot ? `Under ${RULES.noticeDays} days` : `Book by ${esc(fmtDate(bookBy))}`}</span>`;
  }

  function mount() {
    $("#p-dest").addEventListener("change", (e) => { form.destination = e.target.value; paint(); });
    $("#p-trucks").addEventListener("input", (e) => { form.trucks = Math.min(200, Math.max(1, +e.target.value || 1)); paint(); });
    $("#p-date").addEventListener("change", (e) => { form.date = e.target.value; paint(); });
    $("#p-list").addEventListener("click", async (e) => {
      const r = e.target.closest("[data-remove]");
      if (!r) return;
      if (state.dept !== "logistics") return toast("Switch to Logistics to change transfers.", true);
      await store.update(r.dataset.remove, { status: "declined" });
      toast("Removed.");
      state.refresh();
    });
    $("#p-send").addEventListener("click", async (e) => {
      const b = e.target;
      if (state.dept !== "logistics") return toast("Switch to Logistics to plan transfers.", true);
      if (form.date < NOW || form.date > LAST_DAY) return toast("Pick a date in the next 6 weeks.", true);
      b.disabled = true;
      try {
        await store.add({ type: "transfer", status: "booked", data: { ...draft().data } });
        toast(`On the calendar: ${form.trucks} to ${form.destination}.`);
        state.refresh();
      } catch (err) { toast("Couldn't save: " + err.message, true); }
      finally { b.disabled = false; }
    });
    paint();
  }

  function live(items) {
    paint();
    const alloc = E.allocate(items, NOW);
    const list = items.filter((x) => x.type === "transfer" && E.isActive(x)).reverse();
    $("#p-list").innerHTML = list.length ? `<ul class="plain">${list.map((it) => {
      const a = alloc.get(it.id);
      const booked = it.data.booked && Object.keys(it.data.booked).length;
      return `<li><span><strong>${esc(it.data.destination)}</strong> · ${it.data.trucks} · ${esc(fmtShort(it.data.date))}</span>
        <span><span class="t-con">${a.contract} contract</span>${a.spot ? ` <span class="t-spot">${a.spot} spot</span>` : ""}
        ${booked ? "" : `<button type="button" class="linkish inline" data-remove="${esc(it.id)}">Remove</button>`}</span></li>`;
    }).join("")}</ul>` : `<p class="empty">None yet.</p>`;
  }

  return { html, mount, live };
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
    const old = E.totals(items, NOW, { oldWay: true });
    const s = E.scorecards(items, NOW);
    const saved = Math.max(0, old.overspend - now.overspend);
    const bar = (label, t, cls) => `<div class="bar-row"><span class="bar-label">${label}</span>
      <span class="bar">${t.trucks ? `<i class="bar-con" style="flex:${t.contract}"></i><i class="bar-spot" style="flex:${t.spot}"></i>` : `<i class="bar-none"></i>`}</span>
      <span class="bar-n ${cls}">${t.trucks ? `${pct(t.spotShare)} spot` : "–"}</span></div>`;
    $("#x-top").innerHTML = `
      <div class="big-card big-save"><p class="big-label">Saved</p><p class="big-n">${money(saved)}</p><p class="big-sub">${plural(Math.max(0, old.spot - now.spot), "fewer spot truck", "fewer spot trucks")}</p></div>
      <div class="big-card"><p class="big-label">Spot spent</p><p class="big-n">${money(now.overspend)}</p><p class="big-sub">${plural(now.spot, "spot truck")}</p></div>
      <div class="big-card wide"><p class="big-label">Spot share</p>${bar("Old way", old, "bad")}${bar("Now", now, now.spotShare <= RULES.spotGoal ? "good" : "bad")}
        <p class="big-sub">Goal ${pct(RULES.spotGoal)} · 2026 so far ${pct(RULES.spotToday)}</p></div>`;
    const by = E.savingsBy(items, NOW);
    const parts = [["Check-off", by.checkoff], ["Booked ahead", by.bookAhead], ["Transfers ahead", by.transfers], ["Early warning", by.warning]].filter(([, v]) => v > 0);
    const top = Math.max(1, ...parts.map(([, v]) => v));
    $("#x-from").innerHTML = saved ? `<p class="big-label">Where it came from</p>${parts.map(([n, v]) => `<div class="from-row"><span>${n}</span>
        <span class="from-bar"><i style="width:${(v / top) * 100}%"></i></span><span class="from-n">${money(v)}</span></div>`).join("")}` : "";
    const card = (name, value, sub, good) => `<div class="x-card ${good == null ? "" : good ? "x-good" : "x-bad"}"><p class="x-name">${name}</p><p class="x-n">${value}</p><p class="x-sub">${sub}</p></div>`;
    const m = s.sales.answerMin;
    const waiting = (t) => orders(items).filter((x) => E.stageOf(x) === "checking" && !x.data.signoffs?.[t]).length;
    const wait = (t) => (waiting(t) ? ` · <strong>${waiting(t)} waiting</strong>` : "");
    const toBook = E.toBookItems(items, NOW).length;
    const warn = E.warnings(items, NOW).length;
    $("#x-cards").innerHTML =
      card("Sales", m == null ? "–" : m < 60 ? `${Math.max(1, Math.round(m))} min` : `${(m / 60).toFixed(1)} hr`, `to answer · goal 4 hr${wait("sales")}`, m == null ? null : m <= 240) +
      card("Inventory", `${s.inventory.stranded}`, `truckloads stranded${wait("inventory")}`, s.inventory.stranded === 0) +
      card("Production", pct(s.production.share), `line time used${wait("production")}`, null) +
      card("Logistics", s.logistics.trucks ? pct(s.logistics.spotShare) : "–", `spot · ${s.logistics.ahead == null ? "–" : pct(s.logistics.ahead)} booked 3+ days ahead${wait("logistics")}${toBook ? ` · <strong>${toBook} to book</strong>` : ""}${warn ? ` · <strong>${warn} warnings</strong>` : ""}`, s.logistics.trucks ? s.logistics.spotShare <= RULES.spotGoal : null);
  }

  return { html, mount, live };
}

// ---------- Home ----------
const homeView = () => ({ html: `<section class="home">
    <h1>From order to truck, every team on the same page.</h1>
    <div class="two-doors">
      <a class="door door-cust" href="${link("customer")}"><span class="door-name">Customer HQ</span><span class="door-line">Order and change</span></a>
      <a class="door" href="${link("orders")}"><span class="door-name">Ball HQ</span><span class="door-line">Accept, book, plan</span></a>
    </div>
  </section>` });

// ---------- Boot ----------
async function main() {
  const asked = PARAMS.get("role");
  let role = asked in ALIASES ? ALIASES[asked] : asked;
  if (role !== "customer" && !BALL[role]) role = null;
  const portal = role === "customer" ? "customer" : role ? "ball" : "home";
  const custTab = PARAMS.get("tab") === "pos" ? "pos" : "order";
  document.body.dataset.portal = portal;
  document.body.dataset.role = role || "home";
  // Who's using it: a department (Ball) or a company (customer). Old links like ?role=sales pick the department.
  const savedDept = localStorage.getItem("bc_dept");
  const state = { items: [], refresh: null,
    dept: TEAMS.includes(asked) ? asked : asked === "logistics" || ((role === "calendar" || role === "transfers" || role === "outlook") && !savedDept) ? "logistics"
      : role === "exec" && !savedDept ? "exec" : DEPT[savedDept] ? savedDept : "sales",
    company: SIM_CUSTOMERS[localStorage.getItem("bc_company")] ? localStorage.getItem("bc_company") : "Cincinnati, OH" };
  if (portal === "ball") { localStorage.setItem("bc_dept", state.dept); localStorage.setItem("bc_tab", role); }

  $("#brand").textContent = portal === "customer" ? "Customer HQ" : portal === "ball" ? "Ball HQ" : "Ball · Findlay pilot";
  $("#brand").href = portal === "customer" ? link("customer") : "./" + link("").replace(/^\?role=&?/, "?").replace(/^\?$/, "");
  // One click between the two portals; Ball HQ reopens the tab you were last on.
  const ballTab = BALL[localStorage.getItem("bc_tab")] ? localStorage.getItem("bc_tab") : "orders";
  const switcher = portal === "home" ? "" : `<nav class="switch" aria-label="Switch portal">
    <a href="${link("customer")}" class="${portal === "customer" ? "on" : ""}">Customer HQ</a><a href="${link(ballTab)}" class="${portal === "ball" ? "on" : ""}">Ball HQ</a></nav>`;
  $("#who").innerHTML = switcher + (portal === "customer"
    ? `<select id="who-sel" aria-label="Company">${Object.entries(SIM_CUSTOMERS).map(([d, c]) => `<option value="${esc(d)}">${esc(c.name)}</option>`).join("")}</select>`
    : portal === "ball" ? `<select id="who-sel" aria-label="Department">${Object.entries(DEPT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>` : "");

  const store = withForecasts(await makeStore());
  const drawNav = (items = []) => {
    if (portal === "customer") {
      const need = needsCustomer(items, state.company).length;
      $("#nav").innerHTML = Object.entries(CUST_TABS).map(([k, name]) =>
        `<a href="${link("customer", k === "pos" ? { tab: "pos" } : {})}" class="${k === custTab ? "on" : ""}">${name}${k === "pos" && need ? ` <span class="count">${need}</span>` : ""}</a>`).join("");
      return;
    }
    if (portal !== "ball") { $("#nav").innerHTML = ""; return; }
    const mine = TEAMS.includes(state.dept) ? orders(items).filter((x) => E.stageOf(x) === "checking" && !x.data.signoffs?.[state.dept]).length : 0;
    const isLog = state.dept === "logistics";
    const count = { outlook: isLog ? E.warnings(items, NOW).length : 0, orders: mine, calendar: isLog ? E.toBookItems(items, NOW).length : 0 };
    $("#nav").innerHTML = Object.entries(BALL).map(([r, name]) =>
      `<a href="${link(r)}" class="${r === role ? "on" : ""}">${name}${count[r] ? ` <span class="count">${count[r]}</span>` : ""}</a>`).join("");
  };
  if ($("#who-sel")) {
    $("#who-sel").value = portal === "customer" ? state.company : state.dept;
    $("#who-sel").addEventListener("change", (e) => {
      if (portal === "customer") { state.company = e.target.value; localStorage.setItem("bc_company", state.company); }
      else { state.dept = e.target.value; localStorage.setItem("bc_dept", state.dept); }
      state.refresh();
    });
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
  document.title = portal === "customer" ? `${CUST_TABS[custTab]} · Customer HQ` : portal === "ball" ? `${BALL[role]} · Ball HQ` : "Ball · Findlay pilot";

  const view = portal === "home" ? homeView()
    : portal === "customer" ? customerView(store, state, custTab)
    : role === "outlook" ? outlookView(store, state)
    : role === "orders" ? ordersView(store, state)
    : role === "calendar" ? calendarView(store, state)
    : role === "transfers" ? transfersView(store, state)
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
