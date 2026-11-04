import * as E from "./engine.js?v=34";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js?v=34";

const { RULES, PILOT_LANES, SIM_CUSTOMERS, PATTERNS, TEAMS, STAGES } = E;
const PARAMS = new URLSearchParams(location.search);
const NOW = PARAMS.get("today") || E.isoDate(new Date()); // ?today=2026-11-05 to rehearse a date
const FORCE_LOCAL = PARAMS.has("local");                   // ?local = backup if the room's Wi-Fi fails

const BALL = { orders: "Orders", calendar: "Trucks", transfers: "Transfers", exec: "Executive" };
const ALIASES = { review: "orders", pos: "orders", team: "orders", ball: "orders", sales: "orders", inventory: "orders", production: "orders",
  logistics: "calendar", schedule: "calendar", outlook: "calendar", carrier: "calendar", plan: "calendar", hub: "exec", dashboard: "exec" };
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

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (x) => Math.round(x * 100) + "%";
const nowIso = () => new Date().toISOString();
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
  : d.team === "inventory" ? "Cans already made" : "No trucks that day";

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

// The carrier's last answer for a lane and week. After a partial yes or a no, there's nothing more to ask.
function carrierSaid(items, lane, day) {
  const wk = E.weekKey(day);
  const last = items.filter((x) => x.type === "ask" && x.data.destination === lane.destination && x.data.kind === lane.kind && x.data.week === wk).at(-1);
  if (!last) return { canAsk: true, text: "" };
  const text = last.status === "yes" ? `Carrier added ${last.data.accepted}` : last.status === "part" ? `Carrier added ${last.data.accepted}: its limit that week` : "Carrier said no";
  return { canAsk: last.status === "yes", text };
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

// ---------- Customer HQ ----------
function customerView(store, state) {
  const form = { m: 2, date: E.addDays(E.weekKey(NOW), 14 + 4), changeOf: null };
  const html = `<div class="cols cols-cust">
    <section class="panel" id="c-form"></section>
    <section class="panel"><h2>My orders</h2><div id="c-mine" class="cards"><p class="empty">Loading…</p></div></section>
  </div>`;
  const changing = () => (form.changeOf ? byId(state.items, form.changeOf) : null);

  function drawForm() {
    const po = changing();
    $("#c-form").innerHTML = `
      <h1>${po ? `Change ${E.poNumber(state.items, po)}` : "New order"}</h1>
      <label class="field"><span class="label">${po ? "New total" : "Cans"}</span>
        <span class="amount"><input id="c-m" type="number" min="0.2" max="40" step="0.2" inputmode="decimal" aria-label="Million cans"><span class="unit">million</span></span>
        <span class="eq" id="c-trucks"></span></label>
      <label class="field"><span class="label">Deliver on</span><input id="c-date" type="date" min="${NOW}" max="${LAST_DAY}"></label>
      <button type="button" id="c-send" class="cta">${po ? "Send change" : "Send order"}</button>
      ${po ? `<button type="button" id="c-cancel" class="linkish">Cancel</button>` : ""}`;
    $("#c-m").value = form.m;
    $("#c-date").value = form.date;
    $("#c-m").addEventListener("input", (e) => { form.m = +e.target.value || 0; paint(); });
    $("#c-date").addEventListener("change", (e) => { form.date = e.target.value; });
    paint();
  }
  function paint() {
    const po = changing();
    const n = fromMillions(form.m);
    const was = po ? poTotal(state.items, po) : 0;
    $("#c-trucks").innerHTML = `= <strong>${plural(n, "truckload")}</strong>${po && n !== was ? ` <span class="delta">${n > was ? "+" : "−"}${Math.abs(n - was)}</span>` : ""}`;
  }

  async function add(btn, data, msg) {
    btn.disabled = true;
    try {
      await store.add({ type: "order", status: "waiting", data: { signoffs: {}, ...data } });
      toast(msg);
      form.changeOf = null; form.m = 2;
      drawForm();
      state.refresh();
    } catch (err) { toast("Couldn't send: " + err.message, true); }
    finally { btn.disabled = false; }
  }
  function send(btn) {
    const po = changing();
    const n = fromMillions(form.m);
    if (!n) return toast("Enter an amount.", true);
    if (form.date < NOW || form.date > LAST_DAY) return toast("Pick a date in the next 6 weeks.", true);
    if (!po) return add(btn, { kind: "po", customer: state.company, trucks: n, cans: n * RULES.cansPerTruck, date: form.date }, "Order sent.");
    const delta = n - poTotal(state.items, po);
    if (!delta) return toast("That's the same as now.", true);
    return add(btn, { kind: "change", parent: po.id, customer: po.data.customer, trucks: delta, cans: delta * RULES.cansPerTruck, date: form.date }, "Change sent.");
  }

  function mount() {
    drawForm();
    $("#app").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.id === "c-send") return send(b);
      if (b.id === "c-cancel") { form.changeOf = null; form.m = 2; return drawForm(); }
      if (b.dataset.change) {
        form.changeOf = b.dataset.change;
        const po = changing();
        form.m = millions(poTotal(state.items, po));
        form.date = po.data.date;
        drawForm();
        $("#c-m").focus();
        return scrollTo({ top: 0, behavior: "smooth" });
      }
      if (b.dataset.retry) {
        // Denied: send the same order (or change) again for a date that works.
        const it = byId(state.items, b.dataset.retry);
        const { kind, parent, customer, trucks, cans } = it.data;
        return add(b, { kind, parent, customer, trucks, cans, date: b.dataset.date, retry_of: it.id }, "Sent for " + fmtDate(b.dataset.date) + ".");
      }
    });
  }

  // One line per order: what, when, where it stands. A deny shows why and a date that works.
  function line(items, it) {
    const st = E.stageOf(it);
    const what = isChange(it) ? `Change ${it.data.trucks > 0 ? "+" : "−"}${Math.abs(it.data.trucks)}` : plural(it.data.trucks, "truckload");
    let extra = "";
    if (st === "denied" && it.data.denied) {
      const retried = orders(items).some((x) => String(x.data.retry_of) === String(it.id));
      const better = retried ? null : E.betterDate(items, it, NOW);
      extra = `<p class="why">${customerWhy(it.data.denied)}</p>
        ${better ? `<button type="button" class="util on small" data-retry="${esc(it.id)}" data-date="${better.date}">Try ${esc(fmtDate(better.date))}</button>` : ""}`;
    }
    return `<div class="o-line"><span class="o-what">${what} · ${esc(fmtDate(it.data.date))}</span>${stageChip(it, true)}</div>${extra}`;
  }

  function live(items) {
    if (form.changeOf && !changing()) { form.changeOf = null; drawForm(); }
    const pos = orders(items).filter((x) => !isChange(x) && x.data.customer === state.company).reverse();
    $("#c-mine").innerHTML = pos.length ? pos.map((po) => `<article class="card">
        <div class="card-head"><span class="pill">${E.poNumber(items, po)}</span>
          ${["checking", "accepted", "booked"].includes(E.stageOf(po)) ? `<button type="button" class="util small" data-change="${esc(po.id)}">Change</button>` : ""}</div>
        ${line(items, po)}
        ${changesOf(items, po).map((c) => `<div class="sub-line">${line(items, c)}</div>`).join("")}
      </article>`).join("") : `<p class="empty">No orders yet.</p>`;
    if (!form.changeOf) paint();
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
      const ask = e.target.closest("button[data-ask]");
      if (ask) {
        ask.disabled = true;
        try {
          const it = byId(state.items, ask.dataset.id);
          const lane = E.itemLane(it), n = +ask.dataset.ask;
          const ans = E.carrierAnswer(state.items, lane, it.data.date, n, NOW);
          await store.add({ type: "ask", status: ans.status, data: { kind: lane.kind, destination: lane.destination, week: E.weekKey(it.data.date), date: it.data.date, trucks: n, accepted: ans.accepted } });
          toast(`Carrier: ${ans.why}`, ans.status === "no");
          state.refresh();
        } catch (err) { toast("Couldn't ask: " + err.message, true); ask.disabled = false; }
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
    const card = (t) => {
      const s = it.data.signoffs?.[t];
      const mine = state.dept === t;
      const said = t === "logistics" ? carrierSaid(items, E.itemLane(it), it.data.date) : null;
      const canAsk = t === "logistics" && c.alloc?.fixable > 0 && E.daysBetween(NOW, it.data.date) >= RULES.carrierFlexNoticeDays && said.canAsk;
      return `<div class="dcard ${s ? (s.ok ? "d-yes" : "d-no") : ""}${mine ? " d-mine" : ""}">
        <p class="d-name">${DEPT[t]}</p>
        <p class="d-check ${c[t].ok ? "ok" : "bad"}">${icon(c[t].ok ? "check" : "x")}${esc(c[t].verdict)}</p>
        ${said?.text ? `<p class="said">${esc(said.text)}</p>` : ""}
        ${canAsk && mine && canAnswer && !s ? `<button type="button" class="util on ask" data-ask="${c.alloc.fixable}" data-id="${esc(it.id)}">Ask carrier +${c.alloc.fixable}</button>` : ""}
        ${mine && canAnswer ? `<div class="d-btns"><button type="button" class="util${s?.ok === true ? " on" : !s && c[t].ok ? " rec" : ""}" data-decide="${t}" data-ok="1" data-id="${esc(it.id)}">Accept</button>
            <button type="button" class="util${s?.ok === false ? " on-no" : !s && !c[t].ok && !canAsk ? " rec-no" : ""}" data-decide="${t}" data-ok="0" data-id="${esc(it.id)}">Deny</button></div>`
          : `<p class="d-status">${s ? (s.ok ? "Accepted" : "Denied") : "Waiting"}</p>`}
      </div>`;
    };
    const parent = isChange(it) ? byId(items, it.data.parent) : null;
    return `<div class="card-head"><span class="pill">${E.poNumber(items, it)}</span>${stageChip(it)}</div>
      <h1 class="detail-h">${esc(custName(it.data.customer))}</h1>
      <p class="d-what">${parent ? (() => { const before = poTotal(items, parent) - (it.status === "confirmed" && it.data.date === parent.data.date ? it.data.trucks : 0);
        return it.data.date === parent.data.date ? `Change: ${before} → ${plural(before + it.data.trucks, "truckload")}` : `Change: +${plural(it.data.trucks, "truckload")} more`; })() : whatOf(items, it)} · ${esc(fmtDate(it.data.date))}</p>
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
      const sp = e.target.closest("button[data-spread]");
      if (sp) {
        if (state.dept !== "logistics") return toast("Switch to Logistics.", true);
        const it = byId(await store.list(), sp.dataset.spread);
        await store.update(it.id, { data: { ...it.data, pattern: sp.dataset.pattern } });
        toast(`Spread out: ${PATTERNS[sp.dataset.pattern].label.toLowerCase()}.`);
        pick = null;
        return state.refresh();
      }
      const b = e.target.closest("button[data-book], button[data-ask], button[data-bookall], button[data-bookitem]");
      if (!b) return;
      if (state.dept !== "logistics") return toast("Switch to Logistics to book.", true);
      b.disabled = true;
      try {
        if (b.dataset.bookall || b.dataset.bookitem) {
          // Book every unbooked truck day of one order or transfer, or of all of them.
          const fresh = await store.list();
          const rows = E.toBookItems(fresh, NOW).filter((x) => b.dataset.bookall || String(x.it.id) === b.dataset.bookitem);
          const at = nowIso();
          for (const x of rows) {
            const it = byId(fresh, x.it.id);
            await store.update(it.id, { data: { ...it.data, booked: { ...(it.data.booked || {}), ...Object.fromEntries(x.days.map((d) => [d.day, at])) } } });
          }
          toast(`Booked ${plural(rows.reduce((s, x) => s + x.trucks, 0), "truck")}.`);
          return state.refresh();
        }
        const [key, day] = b.dataset.cellkey.split("@");
        const lane = PILOT_LANES.find((l) => l.key === key);
        if (b.dataset.book) {
          // Book every accepted truck on this lane and day.
          const fresh = await store.list();
          const row = E.calendar(fresh, NOW, E.weekIndex(day, NOW)).find((r) => r.lane.key === key);
          const c = row.cells.find((x) => x.day === day);
          for (const m of c.moves.filter((x) => !x.checking && !x.booked)) {
            const it = byId(fresh, m.it.id);
            await store.update(it.id, { data: { ...it.data, booked: { ...(it.data.booked || {}), [day]: nowIso() } } });
          }
          toast(`Booked: ${fmtDate(day)}, ${lane.destination}.`);
        } else {
          const n = +b.dataset.ask;
          const ans = E.carrierAnswer(state.items, lane, day, n, NOW);
          await store.add({ type: "ask", status: ans.status, data: { kind: lane.kind, destination: lane.destination, week: E.weekKey(day), date: day, trucks: n, accepted: ans.accepted } });
          toast(`Carrier: ${ans.why}`, ans.status === "no");
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
        const said = carrierSaid(items, row.lane, day);
        const canAsk = c.fixable > 0 && E.daysBetween(NOW, day) >= RULES.carrierFlexNoticeDays && said.canAsk;
        return `<button type="button" class="linkish back" id="side-back">${icon("left")}To book</button>
          <h2>${esc(fmtDate(day))}</h2><p class="side-lane">${esc(row.lane.kind === "order" ? `${custName(row.lane.destination)} · ${row.lane.destination}` : row.lane.destination)}${c.toBook ? ` · book by ${esc(fmtShort(E.addDays(day, -RULES.noticeDays)))}` : ""}</p>
          <ul class="moves">${c.moves.map((m) => `<li><span>${m.it.type === "order" ? `${E.poNumber(items, m.it)} · ${esc(custName(m.it.data.customer))}` : "Transfer"}</span>
            <span>${m.checking ? `<span class="t-chk">${m.n} not accepted</span>` : `${m.contract ? `<span class="t-con">${m.contract} contract</span>` : ""}${m.spot ? ` <span class="t-spot">${m.spot} spot</span>` : ""}`}${m.booked ? ` ${icon("check")}` : ""}</span></li>`).join("") || `<li class="empty">Nothing moving.</li>`}</ul>
          ${isLog && c.toBook ? `<button type="button" class="cta" data-book="1" data-cellkey="${esc(pick)}">Book ${plural(c.toBook, "truck")}</button>` : ""}
          ${isLog ? c.moves.filter((m) => m.it.type === "transfer" && m.spot && !m.booked).map((m) => {
            // A transfer with spot trucks: try spreading it out; offer the pattern with the fewest spot trucks.
            const now = E.allocate(items, NOW).get(m.it.id).spot;
            const best = Object.keys(PATTERNS).map((k) => ({ k, spot: E.allocate(items.map((x) => (x.id === m.it.id ? { ...x, data: { ...x.data, pattern: k } } : x)), NOW).get(m.it.id).spot }))
              .reduce((a, b) => (b.spot < a.spot ? b : a));
            return best.spot < now ? `<button type="button" class="util on wide" data-spread="${esc(m.it.id)}" data-pattern="${best.k}">${PATTERNS[best.k].label}: ${best.spot} spot</button>` : "";
          }).join("") : ""}
          ${isLog && canAsk ? `<button type="button" class="util wide" data-ask="${c.fixable}" data-cellkey="${esc(pick)}">Ask carrier for +${c.fixable}</button>` : ""}
          ${said.text ? `<p class="said">${esc(said.text)}</p>` : ""}
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
        }).join("")}<td class="open${r.open ? "" : " open-0"}" title="Contract trucks still free this week">${r.open}</td></tr>`).join("");
    $("#cal").innerHTML = `<div class="table-wrap"><table class="cal">
      <thead><tr><th></th>${days.map((d) => `<th class="${d === NOW ? "today" : ""}">${esc(dow(d))} <span>${E.atNoon(d).getDate()}</span></th>`).join("")}<th class="open-h">Open</th></tr></thead>
      <tbody>${group("order", "Customers")}${group("transfer", "Warehouses")}</tbody></table></div>`;
    $("#cal-side").innerHTML = side(items, rows);
  }

  return { html, mount, live };
}

// ---------- Ball HQ · Transfers (plan Ball's own moves to warehouses) ----------
function transfersView(store, state) {
  const lanes = PILOT_LANES.filter((l) => l.kind === "transfer");
  const nextMon = E.addDays(E.weekKey(NOW), 8);
  const form = { destination: "Mississauga, ON", trucks: 12, date: E.daysBetween(NOW, nextMon) >= RULES.noticeDays ? nextMon : E.addDays(nextMon, 7), pattern: "w3" };
  const html = `<div class="cols cols-plan">
    <section class="panel">
      <h1>Plan a transfer</h1>
      <div class="row3">
        <label class="field"><span class="label">To</span><select id="p-dest">${lanes.map((l) => `<option>${esc(l.destination)}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Truckloads</span><input id="p-trucks" type="number" min="1" max="200" inputmode="numeric"></label>
        <label class="field"><span class="label">Start</span><input id="p-date" type="date" min="${E.addDays(NOW, RULES.noticeDays)}" max="${LAST_DAY}"></label>
      </div>
      <div id="p-options" class="options" role="radiogroup" aria-label="How it ships"></div>
      <button type="button" id="p-send" class="cta">Put on calendar</button>
    </section>
    <section class="panel"><h2>Planned</h2><div id="p-list"></div></section>
  </div>`;

  const draft = (pattern) => ({ id: "draft", type: "transfer", status: "booked", created_at: "￿",
    data: { destination: form.destination, trucks: form.trucks, date: form.date, pattern } });

  function paint() {
    $("#p-dest").value = form.destination;
    $("#p-trucks").value = form.trucks;
    $("#p-date").value = form.date;
    const opts = Object.entries(PATTERNS).map(([key, p]) => ({ key, p, a: E.allocate([...state.items, draft(key)], NOW).get("draft") }));
    const best = opts.reduce((m, o) => (o.a.spot < m.a.spot ? o : m), opts[0]);
    $("#p-options").innerHTML = opts.map(({ key, p, a }) => `<button type="button" role="radio" aria-checked="${key === form.pattern}" class="option${key === form.pattern ? " on" : ""}" data-pattern="${key}">
        <span class="op-name">${p.label}${key === best.key ? ` <span class="best">Best</span>` : ""}</span>
        <span class="op-sq">${squares([{ contract: a.contract, spot: a.spot, booked: true }], 30)}</span>
        <span class="op-n"><span class="t-con">${a.contract} contract</span>${a.spot ? ` <span class="t-spot">${a.spot} spot · ${money(a.overspend)}</span>` : ""}</span>
      </button>`).join("");
  }

  function mount() {
    $("#p-dest").addEventListener("change", (e) => { form.destination = e.target.value; paint(); });
    $("#p-trucks").addEventListener("input", (e) => { form.trucks = Math.min(200, Math.max(1, +e.target.value || 1)); paint(); });
    $("#p-date").addEventListener("change", (e) => { form.date = e.target.value; paint(); });
    $("#p-options").addEventListener("click", (e) => { const o = e.target.closest("[data-pattern]"); if (o) { form.pattern = o.dataset.pattern; paint(); } });
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
      if (E.daysBetween(NOW, form.date) < RULES.noticeDays) return toast(`Start ${RULES.noticeDays}+ days out.`, true);
      b.disabled = true;
      try {
        await store.add({ type: "transfer", status: "booked", data: { ...draft(form.pattern).data } });
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
      return `<li><span><strong>${esc(it.data.destination)}</strong> · ${it.data.trucks} · ${esc(PATTERNS[it.data.pattern].label.toLowerCase())} from ${esc(fmtShort(it.data.date))}</span>
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
    const parts = [["Check-off", by.checkoff], ["Transfer waves", by.transfers], ["Carrier asks", by.carrier]];
    const top = Math.max(1, ...parts.map(([, v]) => v));
    $("#x-from").innerHTML = saved ? `<p class="big-label">Where it came from</p>${parts.map(([n, v]) => `<div class="from-row"><span>${n}</span>
        <span class="from-bar"><i style="width:${(v / top) * 100}%"></i></span><span class="from-n">${money(v)}</span></div>`).join("")}` : "";
    const card = (name, value, sub, good) => `<div class="x-card ${good == null ? "" : good ? "x-good" : "x-bad"}"><p class="x-name">${name}</p><p class="x-n">${value}</p><p class="x-sub">${sub}</p></div>`;
    const m = s.sales.answerMin;
    $("#x-cards").innerHTML =
      card("Sales", m == null ? "–" : m < 60 ? `${Math.max(1, Math.round(m))} min` : `${(m / 60).toFixed(1)} hr`, "to answer · goal 4 hr", m == null ? null : m <= 240) +
      card("Inventory", `${s.inventory.stranded}`, "truckloads stranded", s.inventory.stranded === 0) +
      card("Production", pct(s.production.share), `line time used`, null) +
      card("Logistics", s.logistics.trucks ? pct(s.logistics.spotShare) : "–", `spot · ${s.logistics.ahead == null ? "–" : pct(s.logistics.ahead)} booked 3+ days ahead`, s.logistics.trucks ? s.logistics.spotShare <= RULES.spotGoal : null);
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
  document.body.dataset.portal = portal;
  document.body.dataset.role = role || "home";
  // Who's using it: a department (Ball) or a company (customer). Old links like ?role=sales pick the department.
  const savedDept = localStorage.getItem("bc_dept");
  const state = { items: [], refresh: null,
    dept: TEAMS.includes(asked) ? asked : asked === "logistics" || ((role === "calendar" || role === "transfers") && !savedDept) ? "logistics"
      : role === "exec" && !savedDept ? "exec" : DEPT[savedDept] ? savedDept : "sales",
    company: SIM_CUSTOMERS[localStorage.getItem("bc_company")] ? localStorage.getItem("bc_company") : "Cincinnati, OH" };
  if (portal === "ball") localStorage.setItem("bc_dept", state.dept);

  $("#brand").textContent = portal === "customer" ? "Customer HQ" : portal === "ball" ? "Ball HQ" : "Ball · Findlay pilot";
  $("#brand").href = portal === "customer" ? link("customer") : "./" + link("").replace(/^\?role=&?/, "?").replace(/^\?$/, "");
  $("#who").innerHTML = portal === "customer"
    ? `<select id="who-sel" aria-label="Company">${Object.entries(SIM_CUSTOMERS).map(([d, c]) => `<option value="${esc(d)}">${esc(c.name)}</option>`).join("")}</select>`
    : portal === "ball" ? `<select id="who-sel" aria-label="Department">${Object.entries(DEPT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>` : "";

  const store = await makeStore();
  const drawNav = (items = []) => {
    if (portal !== "ball") { $("#nav").innerHTML = ""; return; }
    const mine = TEAMS.includes(state.dept) ? orders(items).filter((x) => E.stageOf(x) === "checking" && !x.data.signoffs?.[state.dept]).length : 0;
    const count = { orders: mine, calendar: state.dept === "logistics" ? E.toBookItems(items, NOW).length : 0 };
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
  if (PARAMS.get("today")) notes.push(`Today: ${fmtDate(NOW)}`);
  if (notes.length) { $("#mode-banner").hidden = false; $("#mode-banner").textContent = notes.join(" · "); }
  document.title = portal === "customer" ? "Customer HQ" : portal === "ball" ? `${BALL[role]} · Ball HQ` : "Ball · Findlay pilot";

  const view = portal === "home" ? homeView()
    : portal === "customer" ? customerView(store, state)
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
