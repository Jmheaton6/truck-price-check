import * as E from "./engine.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const { RULES, PILOT_LANES, SIM_CUSTOMERS, PATTERNS } = E;
const PARAMS = new URLSearchParams(location.search);
const NOW = PARAMS.get("today") || E.isoDate(new Date()); // ?today=2026-11-05 to rehearse a date
const FORCE_LOCAL = PARAMS.has("local");                   // ?local = backup if the room's Wi-Fi fails

// The demo runs left to right: one customer change, start to finish.
const SCREENS = {
  customer: { n: 1, name: "Customer HQ", line: "A customer orders or changes cans" },
  team: { n: 2, name: "Team check", line: "Sales, Inventory, Production and Logistics check it together" },
  plan: { n: 3, name: "Truck plan", line: "6-week early warning by lane, and prebuild transfers" },
  carrier: { n: 4, name: "Carrier", line: "Carriers see what's coming and confirm extra trucks" },
  hub: { n: 5, name: "Marcelo's hub", line: "Spot use, profit, and the same orders the old way" },
};
const ALIASES = { sales: "team", production: "plan", planning: "plan", logistics: "plan", how: null };
const REASONS = ["Promotion", "Filling-line change", "Demand up", "Demand down"];

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
  const KEY = "bc_items";
  const listeners = [];
  const read = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const write = (rows) => { localStorage.setItem(KEY, JSON.stringify(rows)); listeners.forEach((f) => f()); };
  return {
    live: false,
    list: async () => read(),
    add: async (row) => {
      const saved = { ...row, id: Date.now(), created_at: new Date().toISOString() };
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
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const num = (n) => Math.round(n).toLocaleString("en-US");
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (iso) => E.atNoon(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekLabel = (sun) => {
  const sat = E.addDays(sun, 6);
  return E.atNoon(sun).getMonth() === E.atNoon(sat).getMonth() ? `${fmtShort(sun)}–${E.atNoon(sat).getDate()}` : `${fmtShort(sun)}–${fmtShort(sat)}`;
};
const LAST_DAY = E.addDays(E.weekKey(NOW), RULES.weeks * 7 - 1);
const link = (role) => `?role=${role}${FORCE_LOCAL ? "&local" : ""}${PARAMS.get("today") ? `&today=${PARAMS.get("today")}` : ""}`;
const custName = (dest) => `${SIM_CUSTOMERS[dest].name} · ${dest}`;
const laneName = (lane) => `Findlay → ${lane.destination}`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " toast-bad" : "");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------- Shared pieces ----------
const chips = (contract, spot) =>
  `${contract ? `<span class="b b-contract">${contract}</span> on contract ` : ""}${spot ? `<span class="b b-spot">${spot}</span> on spot` : ""}`;

const VERDICT = { green: "Good business", yellow: "Costly: look for a better option", red: "Rethink the timing" };

function moneyBox(a) {
  const order = a.lane.kind === "order";
  const rows = [];
  if (a.contract) rows.push([`${plural(a.contract, "contract truck")}`, order ? "already in the $3,100" : `× ${money(a.cEach)}`, money(a.contractCost)]);
  if (a.spot) rows.push([`${plural(a.spot, "spot truck")}`, order ? `× ${money(a.sEach)} more than contract` : `× ${money(a.sEach)}`, money(a.spotCost)]);
  return `<table class="moneybox"><tbody>
    <tr class="mb-make"><th>Making</th><td>${a.trucks} trucks × ${money(RULES.profitPerTruck)}</td><td>${money(a.making)}</td></tr>
    ${rows.map(([what, how, amt]) => `<tr><th>− ${what}</th><td>${how}</td><td>${amt}</td></tr>`).join("")}
    <tr class="mb-left"><th>Profit left</th><td>${money(a.perTruck)} per truck</td><td>${money(a.profit)}</td></tr>
  </tbody></table>`;
}

function priceTag(a) {
  if (a.trucks < 0) return `<div class="tag tag-green"><p class="verdict"><span class="dot"></span>Frees ${plural(a.cut, "contract truck")}</p>
    <p class="small">No spot cost. Warn the carrier so it can move those drivers.</p></div>`;
  return `<div class="tag tag-${a.color}">
    <p class="verdict"><span class="dot"></span>${VERDICT[a.color]}</p>
    <p class="big">${money(a.perTruck)}<small>profit per truck after freight</small></p>
    <p class="split-line">${chips(a.contract, a.spot)}</p>
    ${a.spot ? `<p class="reason">Spot adds ${money(a.overspend)} that contract trucks wouldn't cost.</p>` : ""}
    ${moneyBox(a)}
    <p class="source-line">Contract truck ${money(a.lane.contract_cost)} · spot truck ${money(a.lane.spotCost)} (${laneName(a.lane)}, 2026 averages)</p>
  </div>`;
}

const checkBox = (team, c) => `<div class="check ${c.ok ? "check-ok" : "check-flag"}">
    <p class="check-team">${team}</p>
    <p class="check-state">${c.ok ? "✓ Pass" : "! Needs a decision"}</p>
    <h3>${esc(c.title)}</h3>
    <p class="check-detail">${esc(c.detail)}</p>
    ${c.extra || ""}
  </div>`;

const sourceNote = () => `<p class="provenance"><strong>Real</strong> (Ball's 2026 workbook, Findlay, Jan–Jul, no shuttles): lanes, each lane's usual trucks a week, contract and spot prices.
  <strong>Simulated</strong> for the demo: the 6-week forecast, customers, stock and line time.</p>`;

function bookByPill(it) {
  if (E.isBooked(it) || it.status === "declined" || it.data.trucks < 0) return "";
  const by = E.addDays(E.dateOf(it), -RULES.noticeDays);
  const left = E.daysBetween(NOW, by);
  if (left < 0) return `<span class="due due-missed">Book-by missed: now spot</span>`;
  return `<span class="due${left <= 2 ? " due-soon" : ""}">Book by ${esc(fmtDate(by))} · ${left === 0 ? "today" : plural(left, "day")} left</span>`;
}

const ORDER_STATUS = { waiting: "Waiting on Ball", offered: "Ball made an offer", confirmed: "Confirmed", declined: "Declined" };

const capSpot = (a) => a.days.reduce((s, d) => s + d.capSpot, 0);

// ---------- 1. Customer HQ ----------
function customerView(store, state) {
  const saved = localStorage.getItem("bc_customer");
  const form = {
    customer: SIM_CUSTOMERS[saved] ? saved : "Cincinnati, OH",
    dir: 1, cans: 2000000, reason: "Promotion",
    date: E.addDays(E.weekKey(NOW), 14 + 4), // Thursday, two weeks out
  };
  const html = `<div class="cols cols-cust">
    <section class="panel">
      <p class="eyebrow">Customer HQ · simulated customer login</p>
      <h1>Order cans from Ball</h1>
      <label class="field"><span class="label">Your filling plant</span>
        <select id="c-who">${Object.keys(SIM_CUSTOMERS).map((d) => `<option value="${esc(d)}">${esc(custName(d))}</option>`).join("")}</select>
      </label>
      <div class="field"><span class="label">Change</span>
        <div class="seg" id="c-dir"><button type="button" data-dir="1">Add cans</button><button type="button" data-dir="-1">Cut cans</button></div>
      </div>
      <label class="field"><span class="label">How many cans?</span>
        <input id="c-cans" type="number" inputmode="numeric" min="200000" max="20000000" step="200000">
        <span class="presets presets-row">${[400000, 1000000, 2000000, 4000000].map((n) => `<button type="button" class="chip-btn" data-cans="${n}">${num(n / 1e6 >= 1 ? n / 1e6 : n / 1e3)}${n >= 1e6 ? "M" : "K"}</button>`).join("")}</span>
        <span class="notice" id="c-trucks"></span>
      </label>
      <label class="field"><span class="label">Delivery date</span>
        <input id="c-date" type="date" min="${NOW}" max="${LAST_DAY}">
      </label>
      <div class="field"><span class="label">Why?</span>
        <div class="seg" id="c-reason">${REASONS.map((r) => `<button type="button" data-reason="${esc(r)}">${esc(r)}</button>`).join("")}</div>
      </div>
      <div id="c-rules" class="rules"></div>
      <button type="button" id="c-send" class="cta">Send to Ball</button>
    </section>
    <div>
      <section class="panel"><h2>Your orders</h2><div id="c-mine" class="cards"></div></section>
      <section class="panel" id="c-score"></section>
    </div>
  </div>`;

  const trucks = () => E.trucksFromCans(form.cans);
  function paint() {
    $("#c-who").value = form.customer;
    $("#c-cans").value = form.cans;
    $("#c-date").value = form.date;
    document.querySelectorAll("#c-dir button").forEach((b) => b.classList.toggle("on", +b.dataset.dir === form.dir));
    document.querySelectorAll("#c-reason button").forEach((b) => b.classList.toggle("on", b.dataset.reason === form.reason));
    $("#c-trucks").innerHTML = `= <strong>${plural(trucks(), "truckload")}</strong> at ${num(RULES.cansPerTruck)} cans per truck`;
    const lane = E.laneOf("order", form.customer);
    const fc = E.forecastTrucks(lane, E.weekIndex(form.date, NOW));
    const band = Math.max(1, Math.round(fc * RULES.flexBand));
    const days = E.daysBetween(NOW, form.date);
    $("#c-rules").innerHTML = `<p><strong>Your flex band that week:</strong> ±${plural(band, "truckload")} (10% of the ${fc} you forecast). Changes inside it are routine.</p>
      <p><strong>Cutoff:</strong> changes inside ${RULES.noticeDays} days of delivery need a review. ${days < RULES.noticeDays
        ? `<span class="flag">This one is inside it.</span>` : `This one is ${plural(days, "day")} out.`}</p>
      <p class="small">Ball answers within 4 hours (target): yes, yes with a cost, or a better date.</p>`;
  }

  function mount() {
    $("#c-who").addEventListener("change", (e) => { form.customer = e.target.value; localStorage.setItem("bc_customer", form.customer); paint(); live(state.items); });
    $("#c-cans").addEventListener("input", (e) => { form.cans = Math.max(1, +e.target.value || 0); paint(); });
    $("#c-date").addEventListener("change", (e) => { form.date = e.target.value < NOW ? NOW : e.target.value > LAST_DAY ? LAST_DAY : e.target.value; paint(); });
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.dir) form.dir = +b.dataset.dir;
      else if (b.dataset.cans) form.cans = +b.dataset.cans;
      else if (b.dataset.reason) form.reason = b.dataset.reason;
      else if (b.id === "c-send") return send(b);
      else if (b.dataset.reply) return reply(b);
      else return;
      paint();
    });
    paint();
  }

  async function send(btn) {
    btn.disabled = true;
    try {
      await store.add({ type: "order", status: "waiting", data: {
        customer: form.customer, trucks: form.dir * trucks(), cans: form.dir * trucks() * RULES.cansPerTruck,
        date: form.date, reason: form.reason,
      } });
      toast("Sent to Ball. Watch for the answer under Your orders.");
      state.refresh();
    } catch (err) { toast("Couldn't send: " + err.message, true); }
    finally { btn.disabled = false; }
  }

  async function reply(btn) {
    const it = state.items.find((x) => String(x.id) === btn.dataset.id);
    if (!it) return;
    btn.disabled = true;
    const yes = btn.dataset.reply === "yes";
    try {
      await store.update(it.id, { status: yes ? "confirmed" : "declined", data: { ...it.data, ...(yes ? { booked_at: new Date().toISOString() } : {}) } });
      toast(yes ? "Accepted. Your order is confirmed." : "Declined. Your original order stands.");
      state.refresh();
    } catch (err) { toast("Couldn't update: " + err.message, true); btn.disabled = false; }
  }

  function answerLine(it) {
    const ans = it.data.answer;
    const n = Math.abs(it.data.trucks);
    if (it.status === "waiting") return `<p class="answer">Sent to Ball. You'll get an answer here.</p>`;
    if (it.status === "declined") return `<p class="answer">Not going ahead. Your original order stands.</p>`;
    if (it.status === "confirmed") return `<p class="answer answer-yes">✓ Confirmed: ${plural(n, "truckload")} on <strong>${esc(fmtDate(E.dateOf(it)))}</strong>${ans?.kind === "confirm_cost" ? `, with a ${money(ans.cost)} expedited freight charge` : ""}.</p>`;
    const offer = ans.kind === "new_date"
      ? `Ball can deliver on <strong>${esc(fmtDate(ans.date))}</strong> instead, at no extra cost.`
      : `Ball can deliver on ${esc(fmtDate(it.data.date))} with a <strong>${money(ans.cost)}</strong> expedited freight charge (this change is outside your flex band).`;
    return `<p class="answer answer-offer">${offer}</p><div class="card-actions">
      <button type="button" class="util on" data-reply="yes" data-id="${esc(it.id)}">Accept</button>
      <button type="button" class="util" data-reply="no" data-id="${esc(it.id)}">Decline</button></div>`;
  }

  function live(items) {
    const mine = items.filter((x) => x.type === "order" && x.data.customer === form.customer).reverse();
    $("#c-mine").innerHTML = mine.length ? mine.map((it) => `<article class="card card-plain">
        <div class="card-head"><span class="status status-${esc(it.status)}">${esc(ORDER_STATUS[it.status])}</span><time>${esc(time(it.created_at))}</time></div>
        <h3>${it.data.trucks > 0 ? "Add" : "Cut"} ${num(Math.abs(it.data.cans || it.data.trucks * RULES.cansPerTruck))} cans · ${plural(Math.abs(it.data.trucks), "truckload")}</h3>
        <p class="meta">Delivery ${esc(fmtDate(it.data.date))} · ${esc(it.data.reason || "")}</p>
        ${answerLine(it)}
      </article>`).join("") : `<p class="empty">Nothing sent yet.</p>`;
    const c = SIM_CUSTOMERS[form.customer];
    const tier = E.priorityOf(c);
    $("#c-score").innerHTML = `<h2>Your reliability</h2>
      <p class="score"><span class="big">${pct(c.inBand)}</span> of your changes this quarter stayed inside your flex band.</p>
      <p class="tier tier-${tier.toLowerCase()}">${tier === "Priority" ? "Priority customer: first claim on summer peak capacity." : "Standard customer: stay inside your band 90% of the time to earn priority for summer peak capacity."}</p>
      <p class="small">Reliability earns priority. Simulated score for the demo.</p>`;
  }

  return { html, mount, live };
}

// ---------- 2. Team check ----------
function teamView(store, state) {
  let selected = location.hash.slice(1) || null;
  const html = `<div class="cols cols-team">
    <section class="panel queue"><p class="eyebrow">Ball team check</p><h2>Customer changes</h2><div id="t-queue"></div></section>
    <section class="panel" id="t-detail"></section>
  </div>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) { selected = pick.dataset.pick; history.replaceState(null, "", "#" + selected); return live(state.items); }
      const b = e.target.closest("button");
      if (!b) return;
      const it = state.items.find((x) => String(x.id) === b.dataset.id);
      if (!it) return;
      b.disabled = true;
      try {
        if (b.dataset.answer) await answer(it, b.dataset.answer, b.dataset.date, +b.dataset.cost || 0);
        else if (b.dataset.ask) await askCarrier(store, it, +b.dataset.ask);
        else if (b.dataset.undo) await store.update(it.id, { status: "waiting", data: { ...it.data, answer: null, booked_at: null } });
        state.refresh();
      } catch (err) { toast("Couldn't update: " + err.message, true); b.disabled = false; }
    });
  }

  async function answer(it, kind, date, cost) {
    const ans = { kind, at: new Date().toISOString(), ...(kind === "new_date" ? { date } : {}), ...(kind === "confirm_cost" ? { cost } : {}) };
    const confirm = kind === "confirm";
    await store.update(it.id, { status: confirm ? "confirmed" : "offered",
      data: { ...it.data, answer: ans, ...(confirm ? { booked_at: new Date().toISOString() } : {}) } });
    toast(confirm ? "Confirmed. The customer sees it now, and the trucks are booked." : "Offer sent. The customer can accept or decline.");
  }

  function detail(items, it) {
    const c = E.checks(items, it, NOW);
    const a = c.alloc;
    const lane = E.itemLane(it);
    const wk = E.weekIndex(E.dateOf(it), NOW);
    const week = E.addDays(E.weekKey(NOW), wk * 7);
    const asks = items.filter((x) => x.type === "ask" && E.itemLane(x) === lane && x.data.week === week);
    const open = asks.find((x) => x.status === "asked");
    const answered = asks.filter((x) => x.status !== "asked");
    const n = Math.abs(it.data.trucks);
    // Logistics can ask the carrier right here.
    let carrierLine = answered.map((x) => `<p class="ask-line ask-${x.status}">Carrier ${x.status === "noted" ? "noted the drop of " + -x.data.trucks : x.status === "no" ? "said no to +" + x.data.trucks : "said yes to +" + (x.data.accepted ?? x.data.trucks)} that week.</p>`).join("");
    if (open) carrierLine += `<p class="ask-line ask-asked">Asked the carrier for ${signed(open.data.trucks)} that week. Waiting for its answer.</p>`;
    else if (it.status === "waiting" && it.data.trucks > 0 && capSpot(a))
      carrierLine += `<button type="button" class="util on" data-ask="${capSpot(a)}" data-id="${esc(it.id)}">Ask the carrier for +${capSpot(a)} trucks that week</button>`;
    else if (it.status === "waiting" && it.data.trucks < 0)
      carrierLine += `<button type="button" class="util" data-ask="${it.data.trucks}" data-id="${esc(it.id)}">Warn the carrier: ${n} fewer trucks that week</button>`;
    c.logistics.extra = carrierLine;

    const s = E.suggestAnswer(items, it, NOW);
    const better = it.data.trucks > 0 ? E.betterDate(items, it, NOW) : null;
    const opt = (kind, label, extra = "") => `<button type="button" class="util${s.kind === kind ? " on" : ""}" data-answer="${kind}" data-id="${esc(it.id)}" ${extra}>${label}</button>`;
    const answerBox = it.status === "waiting"
      ? `<div class="suggest"><p><strong>Suggested:</strong> ${esc(s.why)}</p>
          <div class="card-actions">
            ${opt("confirm", "Confirm")}
            ${a.spot ? opt("confirm_cost", `Confirm, customer pays ${money(a.overspend)} spot cost`, `data-cost="${a.overspend}"`) : ""}
            ${better ? opt("new_date", `Offer ${fmtDate(better.date)} · saves ${money(better.gain)}`, `data-date="${better.date}"`) : ""}
          </div></div>`
      : `<div class="suggest"><p><strong>Answer sent:</strong> ${esc(ORDER_STATUS[it.status])}${it.data.answer?.kind === "new_date" ? ` · new date ${esc(fmtDate(it.data.answer.date))}` : ""}${it.data.answer?.kind === "confirm_cost" ? ` · ${money(it.data.answer.cost)} charge` : ""}.</p>
          <div class="card-actions"><button type="button" class="util" data-undo="1" data-id="${esc(it.id)}">Undo answer</button></div></div>`;

    return `<div class="card-head"><span class="pill">${esc(SIM_CUSTOMERS[it.data.customer].name)}</span>
        <span class="status status-${esc(it.status)}">${esc(ORDER_STATUS[it.status])}</span>${bookByPill(it)}<time>${esc(time(it.created_at))}</time></div>
      <h1 class="detail-h">${esc(custName(it.data.customer))} wants to ${it.data.trucks > 0 ? "add" : "cut"} ${plural(n, "truckload")}
        <small>${num(Math.abs(it.data.cans || n * RULES.cansPerTruck))} cans · ${esc(fmtDate(E.dateOf(it)))}${E.dateOf(it) !== it.data.date ? ` (asked for ${esc(fmtDate(it.data.date))})` : ""} · ${esc(it.data.reason || "")}</small></h1>
      <div class="checks">
        ${checkBox("Sales", c.sales)}${checkBox("Inventory", c.inventory)}${checkBox("Production", c.production)}${checkBox("Logistics", c.logistics)}
      </div>
      <div class="cols cols-answer">${priceTag(a)}${answerBox}</div>`;
  }

  function live(items) {
    const orders = items.filter((x) => x.type === "order").reverse();
    const waiting = orders.filter((x) => x.status === "waiting");
    if (!orders.some((x) => String(x.id) === selected)) selected = waiting[0]?.id ?? orders[0]?.id ?? null;
    selected = selected == null ? null : String(selected);
    const row = (it) => {
      const a = E.allocate(items, NOW).get(it.id);
      return `<button type="button" class="q-row${String(it.id) === selected ? " q-on" : ""}" data-pick="${esc(it.id)}">
        <span class="q-top"><strong>${esc(SIM_CUSTOMERS[it.data.customer].name)}</strong> · ${it.data.trucks > 0 ? "+" : "−"}${Math.abs(it.data.trucks)} trucks · ${esc(fmtShort(E.dateOf(it)))}</span>
        <span class="q-sub"><span class="status status-${esc(it.status)}">${esc(ORDER_STATUS[it.status])}</span> ${a && a.trucks > 0 ? chips(a.contract, a.spot) : ""}</span>
      </button>`;
    };
    $("#t-queue").innerHTML = orders.length ? orders.map(row).join("") : `<p class="empty">No customer changes yet. Send one from Customer HQ.</p>`;
    const it = orders.find((x) => String(x.id) === selected);
    $("#t-detail").innerHTML = it ? detail(items, it) : `<p class="eyebrow">Ball team check</p><h2>Waiting for a customer change…</h2>
      <p class="lede">When a customer sends a change, all four teams check it at once against the same numbers: can we sell it, do we have the cans, can we make it, and can we move it on contract trucks?</p>`;
  }

  return { html, mount, live };
}

async function askCarrier(store, it, trucks) {
  const lane = E.itemLane(it);
  const week = E.weekKey(E.dateOf(it));
  await store.add({ type: "ask", status: "asked", data: { kind: lane.kind, destination: lane.destination, week, trucks } });
  toast(trucks > 0 ? `Asked the carrier for +${trucks} trucks, week of ${weekLabel(week)}.` : `Warned the carrier: ${-trucks} fewer trucks, week of ${weekLabel(week)}.`);
}

// ---------- 3. Truck plan (early warning + prebuild transfers) ----------
const ZONE = { green: "On plan", yellow: "Watch", red: "Act now" };

function planView(store, state) {
  const transferLanes = PILOT_LANES.filter((l) => l.kind === "transfer");
  const nextMon = E.addDays(E.weekKey(NOW), 8);
  const form = { destination: "Mississauga, ON", trucks: 12, date: E.daysBetween(NOW, nextMon) >= RULES.noticeDays ? nextMon : E.addDays(nextMon, 7), pattern: "w3" };
  const html = `<section class="panel">
      <p class="eyebrow">Truck plan · early warning</p>
      <h1>Findlay's next 6 weeks, in trucks</h1>
      <p class="lede">Forecasts come in cans. We turn them into trucks (${num(RULES.cansPerTruck)} cans each) and compare every lane-week with what its carriers are staffed for, so Logistics can act weeks ahead instead of finding out on Thursday.</p>
      <p class="legend"><span class="z z-green">On plan</span> within ±10% <span class="z z-yellow">Watch</span> 10–25% <span class="z z-red">Act now</span> over 25%
        · <span class="b b-spot">n</span> trucks going spot</p>
      <div id="p-grid"></div>
    </section>
    <div class="cols cols-plan">
      <section class="panel"><h2>What Logistics does next</h2><div id="p-actions"></div></section>
      <section class="panel" id="p-prebuild">
        <h2>Schedule a prebuild transfer</h2>
        <p class="lede">Ball decides when its own transfers ship. Ship a big run all at once and most of it goes spot. Release it in waves and it fits on contract.</p>
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
        <div id="p-list"></div>
      </section>
    </div>`;

  const draft = () => ({ id: "draft", type: "transfer", status: "booked", created_at: "￿",
    data: { destination: form.destination, trucks: form.trucks, date: form.date, pattern: form.pattern, booked_at: new Date().toISOString() } });

  function paint() {
    $("#p-dest").value = form.destination;
    $("#p-trucks").value = form.trucks;
    $("#p-date").value = form.date;
    const rows = Object.entries(PATTERNS).map(([key, p]) => {
      const d = { ...draft(), data: { ...draft().data, pattern: key } };
      const a = E.allocate([...state.items, d], NOW).get("draft");
      return { key, p, a };
    });
    const best = rows.reduce((m, r) => (r.a.profit > m.a.profit ? r : m), rows[0]);
    $("#p-compare").innerHTML = `<p class="label">Preview: ${form.trucks} trucks to ${esc(form.destination)} from ${esc(fmtDate(form.date))}</p><table class="compare"><thead><tr><th>How it ships</th><th>Trucks</th><th>Profit per truck</th><th>Extra trucking</th></tr></thead><tbody>
      ${rows.map(({ key, p, a }) => `<tr class="${key === form.pattern ? "c-on" : ""}" data-pattern="${key}">
        <th><label><input type="radio" name="pat" value="${key}" ${key === form.pattern ? "checked" : ""}> ${p.label}${key === best.key ? ` <span class="best">best</span>` : ""}</label></th>
        <td>${chips(a.contract, a.spot)}</td><td><span class="mini mini-${a.color}">${money(a.perTruck)}</span></td><td>${money(a.extra)}</td></tr>`).join("")}
    </tbody></table>
    <p class="small">Carriers can add about 1/7 of a lane's weekly trucks on any one day, and only what the forecast leaves open that week.</p>`;
  }

  function mount() {
    $("#p-dest").addEventListener("change", (e) => { form.destination = e.target.value; paint(); });
    $("#p-trucks").addEventListener("input", (e) => { form.trucks = Math.min(200, Math.max(1, +e.target.value || 1)); paint(); });
    $("#p-date").addEventListener("change", (e) => { form.date = e.target.value; paint(); });
    $("#p-compare").addEventListener("change", (e) => { if (e.target.name === "pat") { form.pattern = e.target.value; paint(); } });
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      b.disabled = true;
      try {
        if (b.id === "p-send") {
          if (E.daysBetween(NOW, form.date) < RULES.noticeDays) throw new Error(`pick a first pickup ${RULES.noticeDays}+ days out`);
          await store.add({ type: "transfer", status: "booked", data: { ...draft().data } });
          toast(`Scheduled: ${form.trucks} trucks to ${form.destination}, ${PATTERNS[form.pattern].label.toLowerCase()}.`);
        } else if (b.dataset.cellAsk) {
          const [key, week] = b.dataset.cell.split("@");
          const [kind, destination] = key.split("|");
          const trucks = +b.dataset.cellAsk;
          await store.add({ type: "ask", status: "asked", data: { kind, destination, week, trucks } });
          toast(trucks > 0 ? `Asked the carrier for +${trucks} trucks, week of ${weekLabel(week)}.` : `Warned the carrier: ${-trucks} fewer trucks, week of ${weekLabel(week)}.`);
        } else return;
        state.refresh();
      } catch (err) { toast("Couldn't do that: " + err.message, true); }
      finally { b.disabled = false; }
    });
    paint();
  }

  function live(items) {
    paint();
    const ol = E.outlook(items, NOW);
    const weeks = ol[0].weeks.map((w) => w.week);
    const cell = (w) => `<td class="cell z-${w.zone}" title="${ZONE[w.zone]}: ${w.needed} needed vs. ${w.cover} carrier trucks">
        <span class="cell-n">${w.needed}</span><span class="cell-plan">of ${w.cover}${w.extra > 0 ? ` (+${w.extra})` : w.extra < 0 ? ` (${w.extra})` : ""}</span>
        <span class="cell-chg">${w.change > 0 ? "+" : ""}${Math.round(w.change * 100)}%</span>
        ${w.spot ? `<span class="b b-spot">${w.spot}</span>` : w.openAsk ? `<span class="cell-ask">asked</span>` : ""}
      </td>`;
    const group = (kind, title) => ol.filter((r) => r.lane.kind === kind).map((r, i) => `<tr>
        <th scope="row">${i === 0 ? `<span class="grp">${title}</span>` : ""}${esc(r.lane.destination)}<span class="kind">~${r.lane.perWeek} a week</span></th>${r.weeks.map(cell).join("")}</tr>`).join("");
    $("#p-grid").innerHTML = `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Lane from Findlay</th>${weeks.map((w, i) => `<th>${i === 0 ? "This week" : weekLabel(w)}</th>`).join("")}</tr></thead>
      <tbody>${group("order", "Customers")}${group("transfer", "Transfers")}</tbody></table></div>
      <p class="small">Each cell: trucks needed (forecast + new orders and transfers) of the trucks carriers are staffed for, and the change vs. their usual plan.</p>`;

    const acts = [];
    for (const r of ol) for (const w of r.weeks) {
      if (w.wk === 0 && !w.spot) continue;
      const where = `<strong>${esc(laneName(r.lane))}</strong> · week of ${weekLabel(w.week)}`;
      const what = `${w.needed} needed vs. ${r.lane.perWeek} usual (${w.change > 0 ? "+" : ""}${Math.round(w.change * 100)}%)`;
      const cellKey = `${r.lane.key}@${w.week}`;
      if (w.openAsk) acts.push({ z: w.zone, wk: w.wk, html: `<li class="act z-${w.zone}"><span class="act-what">${where}<br>${what}</span><span class="ask-line ask-asked">Asked carrier for ${signed(w.openAsk.data.trucks)} · waiting</span></li>` });
      else if (w.action?.kind === "more") acts.push({ z: w.zone, wk: w.wk, html: `<li class="act z-${w.zone}"><span class="act-what">${where}<br>${what} · <strong>${w.spot} going spot</strong></span>
        <button type="button" class="util on" data-cell="${esc(cellKey)}" data-cell-ask="${w.capSpot}">Ask carrier for +${w.capSpot}</button></li>` });
      else if (w.action?.kind === "fewer") acts.push({ z: w.zone, wk: w.wk, html: `<li class="act z-${w.zone}"><span class="act-what">${where}<br>${what} · ${w.unused} carrier trucks unused</span>
        <span class="act-btns"><button type="button" class="util" data-cell="${esc(cellKey)}" data-cell-ask="${-w.unused}">Warn carrier: −${w.unused}</button>
        ${r.lane.kind === "transfer" ? `<span class="small">or ship a prebuild into it →</span>` : ""}</span></li>` });
    }
    const rank = { red: 0, yellow: 1, green: 2 };
    acts.sort((a, b) => rank[a.z] - rank[b.z] || a.wk - b.wk);
    $("#p-actions").innerHTML = acts.length ? `<ul class="acts">${acts.map((a) => a.html).join("")}</ul>` : `<p class="empty">Nothing to do: every lane-week is on plan and covered.</p>`;

    const alloc = E.allocate(items, NOW);
    const transfers = items.filter((x) => x.type === "transfer").reverse();
    $("#p-list").innerHTML = transfers.length ? `<h3 class="sub-h">Scheduled</h3><ul class="done-list">${transfers.map((it) => {
      const a = alloc.get(it.id);
      return `<li><span class="done-what"><strong>Findlay → ${esc(it.data.destination)}</strong><span class="kind">${it.data.trucks} trucks · ${esc(PATTERNS[it.data.pattern].label.toLowerCase())} from ${esc(fmtDate(it.data.date))}</span></span>
        <span class="done-split">${chips(a.contract, a.spot)}</span><span class="done-money">${money(a.perTruck)}<span class="kind">per truck</span></span></li>`;
    }).join("")}</ul>` : "";
  }

  return { html, mount, live };
}

// ---------- 4. Carrier ----------
function carrierView(store, state) {
  const html = `<div class="cols cols-carrier">
    <section class="panel">
      <p class="eyebrow">Carrier view · shared with our contract carriers</p>
      <h1>Requests from Ball</h1>
      <p class="lede">Weeks ahead, not the day before. Say yes and the trucks are booked at your contract rate.</p>
      <div id="k-asks"></div>
    </section>
    <section class="panel">
      <h2>Trucks we expect, next 6 weeks</h2>
      <div id="k-outlook"></div>
      <p class="small">Expected volume, not a promise. Only requests you confirm are bookings. You see your own lanes only: no customer names, no other carriers' rates.</p>
    </section>
  </div>`;

  function mount() {
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-reply]");
      if (!b) return;
      const it = state.items.find((x) => String(x.id) === b.dataset.id);
      if (!it) return;
      b.disabled = true;
      const kind = b.dataset.reply;
      const accepted = kind === "part" ? +$(`#part-${it.id}`).value : kind === "yes" ? it.data.trucks : 0;
      try {
        await store.update(it.id, { status: kind, data: { ...it.data, accepted } });
        toast(kind === "noted" ? "Thanks. Ball sees you noted it." : kind === "no" ? "Ball sees your no and will look for backup." : `Booked: +${accepted} trucks. Ball sees it now.`);
        state.refresh();
      } catch (err) { toast("Couldn't update: " + err.message, true); b.disabled = false; }
    });
  }

  function live(items) {
    const asks = items.filter((x) => x.type === "ask").reverse();
    const open = asks.filter((x) => x.status === "asked");
    const done = asks.filter((x) => x.status !== "asked");
    const askCard = (it) => {
      const lane = E.itemLane(it);
      const up = it.data.trucks > 0;
      const n = Math.abs(it.data.trucks);
      return `<article class="card card-plain ask-card">
        <div class="card-head"><span class="pill">${up ? "More trucks" : "Heads-up: fewer trucks"}</span><time>${esc(time(it.created_at))}</time></div>
        <h3>${esc(laneName(lane))} · week of ${weekLabel(it.data.week)}</h3>
        <p class="meta">${up ? `Can you take <strong>+${n}</strong> more trucks that week?` : `We'll need <strong>${n} fewer</strong> trucks that week, so you can move those drivers.`} Usually ~${lane.perWeek} a week (~${lane.perDay} a day).</p>
        <div class="card-actions">${up
          ? `<button type="button" class="util on" data-reply="yes" data-id="${esc(it.id)}">Yes, all ${n}</button>
             ${n > 1 ? `<span class="part"><select id="part-${esc(it.id)}">${Array.from({ length: n - 1 }, (_, i) => `<option>${i + 1}</option>`).join("")}</select>
             <button type="button" class="util" data-reply="part" data-id="${esc(it.id)}">Take some</button></span>` : ""}
             <button type="button" class="util" data-reply="no" data-id="${esc(it.id)}">No</button>`
          : `<button type="button" class="util on" data-reply="noted" data-id="${esc(it.id)}">Got it</button>`}</div>
      </article>`;
    };
    const ANS = { yes: "Yes", part: "Took some", no: "No", noted: "Noted" };
    $("#k-asks").innerHTML = (open.length ? `<div class="cards">${open.map(askCard).join("")}</div>` : `<p class="empty">No open requests. New ones appear here the moment Ball sends them.</p>`)
      + (done.length ? `<h3 class="sub-h">Answered</h3><ul class="done-list">${done.map((it) => `<li><span class="status status-${it.status}">${ANS[it.status]}</span>
          <span class="done-what"><strong>${esc(laneName(E.itemLane(it)))}</strong><span class="kind">week of ${weekLabel(it.data.week)} · asked ${signed(it.data.trucks)}${it.status === "part" ? `, took +${it.data.accepted}` : ""}</span></span></li>`).join("")}</ul>` : "");
    const ol = E.outlook(items, NOW);
    $("#k-outlook").innerHTML = `<div class="table-wrap"><table class="grid grid-carrier"><thead><tr><th>Lane</th>${ol[0].weeks.map((w, i) => `<th>${i === 0 ? "This week" : weekLabel(w.week)}</th>`).join("")}</tr></thead>
      <tbody>${ol.map((r) => `<tr><th scope="row">${esc(r.lane.destination)}<span class="kind">${r.lane.kind === "order" ? "to customer" : "to warehouse"}</span></th>${r.weeks.map((w) => `<td><span class="cell-n">${w.needed}</span><span class="cell-plan">~${Math.round(w.needed / 7 * 10) / 10}/day</span></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  return { html, mount, live };
}

// ---------- 5. Marcelo's hub ----------
const CAL_BAR_PX = 64;

function calendarPanel(items, selected) {
  const alloc = E.allocate(items, NOW);
  const start = E.weekKey(NOW);
  const byDay = new Map();
  for (const it of items) {
    const a = alloc.get(it.id);
    if (!a || a.trucks < 0) continue;
    for (const d of a.days) {
      if (!byDay.has(d.day)) byDay.set(d.day, { contract: 0, spot: 0, rows: [] });
      const c = byDay.get(d.day);
      c.contract += d.contract; c.spot += d.spot; c.rows.push({ it, d });
    }
  }
  const total = (c) => c.contract + c.spot;
  const max = Math.max(1, ...[...byDay.values()].map(total));
  const bar = (c) => `<span class="cal-bar">${["contract", "spot"].filter((k) => c[k]).map((k) =>
    `<span class="seg seg-${k}" style="height:${Math.max(3, Math.round((c[k] / max) * CAL_BAR_PX))}px"></span>`).join("")}</span>`;
  let html = `<div class="cal">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-head">${d}</div>`).join("")}<div class="cal-head">Week</div>`;
  for (let w = 0; w < RULES.weeks; w++) {
    const wk = { contract: 0, spot: 0 };
    for (let i = 0; i < 7; i++) {
      const d = E.addDays(start, w * 7 + i);
      const c = byDay.get(d);
      if (c) { wk.contract += c.contract; wk.spot += c.spot; }
      const cls = ["cal-day", d === NOW ? "cal-today" : "", d < NOW ? "cal-past" : "", d === selected ? "cal-selected" : "", c ? "has" : ""].join(" ");
      const label = E.atNoon(d).getDate() === 1 || (w === 0 && i === 0) ? fmtShort(d) : E.atNoon(d).getDate();
      html += `<button type="button" class="${cls}" data-day="${d}" ${c ? "" : "disabled"}>
        <span class="cal-date">${label}${d === NOW ? " <em>today</em>" : ""}</span>
        ${c ? `${bar(c)}<span class="cal-n">${total(c)}</span>` : `<span class="cal-empty">·</span>`}</button>`;
    }
    const n = total(wk);
    html += `<div class="cal-week">${n ? `<span class="cal-week-n">${n}</span><span class="cal-hbar">${["contract", "spot"].filter((k) => wk[k]).map((k) => `<span class="seg seg-${k}" style="flex:${wk[k]}"></span>`).join("")}</span>
      <span class="cal-week-split">${wk.contract} contract · ${wk.spot} spot</span>` : `<span class="cal-empty">·</span>`}</div>`;
  }
  html += `</div>`;
  if (selected && byDay.has(selected)) {
    const day = byDay.get(selected);
    html += `<div class="cal-detail"><h3>${esc(fmtDate(selected))}: ${total(day)} new trucks</h3><ul>${day.rows.map(({ it, d }) =>
      `<li>${chips(d.contract, d.spot)} · <strong>${esc(laneName(E.itemLane(it)))}</strong> · ${it.type === "order" ? esc(SIM_CUSTOMERS[it.data.customer].name) + " order" : "Prebuild transfer"}</li>`).join("")}</ul></div>`;
  } else html += `<p class="small">New orders and transfers only (the forecast's usual trucks aren't drawn). Click a day for its lanes.</p>`;
  return html;
}

function hubView(store, state) {
  let selected = null;
  const html = `<section class="hub">
      <div class="hub-head"><div><p class="eyebrow">Marcelo's hub · Findlay pilot</p><h1>Every team, one set of numbers</h1></div>
        <span class="live"><span class="pulse"></span>${store.live ? "Live" : "Local demo"}</span></div>
      <div id="h-tiles" class="totals"></div>
      <div id="h-compare"></div>
      <section class="cal-panel"><div class="cal-top"><h2>New trucks going out</h2>
        <p class="legend"><span class="key key-contract"></span> on contract <span class="key key-spot"></span> on spot</p></div><div id="h-cal"></div></section>
      <section class="panel"><h2>Activity</h2><ul id="h-feed" class="feed"></ul></section>
      <button type="button" id="h-reset" class="util quiet">New round (clear everything)</button>
    </section>`;

  function mount() {
    $("#h-cal").addEventListener("click", (e) => {
      const b = e.target.closest("[data-day]");
      if (!b || b.disabled) return;
      selected = selected === b.dataset.day ? null : b.dataset.day;
      $("#h-cal").innerHTML = calendarPanel(state.items, selected);
    });
    $("#h-reset").addEventListener("click", async () => {
      const pin = store.live ? prompt("Enter the reset PIN to clear everything for a new round:") : "local";
      if (pin === null) return;
      if (!store.live && !confirm("Clear every order, transfer and carrier answer in this browser?")) return;
      try { await store.reset(pin); toast("Cleared. Ready for a new round."); state.refresh(); }
      catch (err) { toast("Not cleared: " + err.message, true); }
    });
  }

  function live(items) {
    const now = E.totals(items, NOW);
    const old = E.totals(items, NOW, { oldWay: true });
    const saved = now.profit - old.profit;
    const secured = items.filter((x) => x.type === "ask" && (x.status === "yes" || x.status === "part")).reduce((s, x) => s + (x.data.accepted ?? x.data.trucks), 0);
    const tile = (label, value, sub, cls = "") => `<div class="stat ${cls}"><p class="stat-label">${label}</p><p class="stat-value">${value}</p><p class="stat-sub">${sub}</p></div>`;
    $("#h-tiles").innerHTML =
      tile("Spot share", now.trucks ? pct(now.spotShare) : "–", `${now.spot} of ${now.trucks} new trucks · pilot target ≤10%`, "stat-spot") +
      tile("Spot overspend", money(now.overspend), "paid above contract prices") +
      tile("Profit left", money(now.profit), `${money(now.making)} the cans earn − ${money(now.extra)} freight`, "stat-contract") +
      tile("Saved vs. the old way", money(Math.max(0, saved)), `${plural(secured, "truck")} secured early from carriers`);
    $("#h-compare").innerHTML = now.trucks ? `<div class="compare-box">
      <div><p class="stat-label">The old way</p><p class="cmp-n">${old.spot} spot · ${money(old.overspend)}</p><p class="small">Same orders, but no carrier heads-up and transfers shipped in one batch.</p></div>
      <div class="cmp-arrow">→</div>
      <div><p class="stat-label">With the system</p><p class="cmp-n">${now.spot} spot · ${money(now.overspend)}</p><p class="small">Carriers asked weeks ahead and transfers released in waves.</p></div></div>` : "";
    $("#h-cal").innerHTML = calendarPanel(items, selected);
    const alloc = E.allocate(items, NOW);
    const line = (it) => {
      const a = alloc.get(it.id);
      if (it.type === "order") return `<strong>${esc(SIM_CUSTOMERS[it.data.customer].name)}</strong> ${it.data.trucks > 0 ? "+" : "−"}${Math.abs(it.data.trucks)} trucks for ${esc(fmtShort(E.dateOf(it)))} · ${esc(ORDER_STATUS[it.status])} ${a && a.trucks > 0 ? "· " + chips(a.contract, a.spot) : ""}`;
      if (it.type === "transfer") return `<strong>Prebuild</strong> ${it.data.trucks} trucks to ${esc(it.data.destination)} · ${esc(PATTERNS[it.data.pattern].label.toLowerCase())} · ${chips(a.contract, a.spot)}`;
      return `<strong>Carrier</strong> ${esc(it.data.destination)}, week of ${weekLabel(it.data.week)}: asked ${signed(it.data.trucks)} · ${esc({ asked: "waiting", yes: "yes", part: `took +${it.data.accepted}`, no: "no", noted: "noted" }[it.status])}`;
    };
    $("#h-feed").innerHTML = items.length ? [...items].reverse().map((it) => `<li><time>${esc(time(it.created_at))}</time> ${line(it)}</li>`).join("") : `<li class="empty">Nothing yet. Start at Customer HQ.</li>`;
  }

  return { html, mount, live };
}

// ---------- Home ----------
function homeView() {
  return { html: `<section class="home">
    <p class="eyebrow">Ball · Findlay pilot</p>
    <h1>One customer change, from order to truck.</h1>
    <p class="lede">Customers, Ball's four teams and its carriers work from the same numbers, weeks before the trucks move.</p>
    <div class="screen-grid">${Object.entries(SCREENS).map(([role, s]) => `<a class="screen-tile" href="${link(role)}">
      <span class="screen-n">${s.n}</span><span class="team-name">${s.name}</span><span class="team-line">${s.line}</span></a>`).join("")}</div>
    ${sourceNote()}
  </section>` };
}

// ---------- Boot ----------
async function main() {
  let role = PARAMS.get("role");
  if (role in ALIASES) role = ALIASES[role];
  if (!SCREENS[role]) role = null;
  const store = await makeStore();
  const state = { items: [], refresh: null };

  $("#nav").innerHTML = Object.entries(SCREENS).map(([r, s]) =>
    `<a href="${link(r)}" class="${r === role ? "on" : ""}"><span>${s.n}</span>${s.name}</a>`).join("");
  const notes = [];
  if (!store.live) notes.push(FORCE_LOCAL ? "Backup mode: everything stays on this laptop." : "Local demo mode: add the Supabase keys in config.js to share across devices.");
  if (PARAMS.get("today")) notes.push(`Rehearsal date: today is set to ${fmtDate(NOW)}.`);
  if (notes.length) { $("#mode-banner").hidden = false; $("#mode-banner").textContent = notes.join(" "); }
  document.body.dataset.role = role || "home";
  if (role) document.title = `${SCREENS[role].name} · Ball Findlay pilot`;

  const view = !role ? homeView()
    : role === "customer" ? customerView(store, state)
    : role === "team" ? teamView(store, state)
    : role === "plan" ? planView(store, state)
    : role === "carrier" ? carrierView(store, state)
    : hubView(store, state);
  $("#app").innerHTML = view.html + (role && role !== "customer" && role !== "carrier" ? sourceNote() : "");
  view.mount?.();

  let busy = false, again = false;
  state.refresh = async () => {
    if (!view.live) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      state.items = await store.list();
      view.live(state.items);
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
