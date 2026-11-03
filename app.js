import { LANES } from "./lanes.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// ---------- The price tag (same engine on every screen) ----------
// Each lane's contract carrier takes about `contract_per_week` trucks a week (lanes.js).
// Requests claim those contract trucks first come, first served, within the Sun–Sat week
// they ship. Whatever doesn't fit goes on spot. Under 3 days' notice is all spot, and so
// is a request where Logistics marked "carrier said no".
// Money: Making = $3,100 × trucks. Extra trucking = for a customer order, the spot premium
// on each spot truck (a contract truck is already in the $3,100); for a transfer, the whole
// move (contract price, or spot price on spot). Profit left = Making − extra trucking.
const PROFIT_PER_TRUCK = 3100;
const GREEN_AT = 2000;
const YELLOW_AT = 1000;
const SHORT_NOTICE_DAYS = 3;
const VERDICT = {
  green: "Go: good business",
  yellow: "Talk to Logistics first",
  red: "Rethink: change the timing or the place",
};
const STATUS = { new: "Waiting on Logistics", contract: "Booked", spot: "Carrier said no: all spot" };

const TEAMS = {
  sales: {
    name: "Sales", kind: "order", type: "Extra customer order",
    ask: "A customer wants extra loads", dest: "Customer location",
    nudge: "If the customer can take it on",
  },
  production: {
    name: "Production", kind: "transfer", type: "Prebuild run",
    ask: "Schedule an extra production run", dest: "Warehouse the run ships to",
    nudge: "Ship it on",
  },
  planning: {
    name: "Inventory Planning", kind: "transfer", type: "Inventory move",
    ask: "Move cans to another site", dest: "Move cans to",
    nudge: "Ship it on",
  },
  logistics: { name: "Logistics" },
  hub: { name: "Live Hub" },
  carrier: { name: "Carrier view" },
  how: { name: "How it works" },
};

// Spot quotes Logistics typed in today, keyed "kind|destination". They replace the
// lane's 2026 average spot price on every device until Logistics clears them.
let QUOTES = new Map();
const laneKey = (l) => `${l.kind}|${l.destination}`;
const avgSpot = (l) => l.contract_cost + l.spot_premium;
const colorFor = (perTruck) => (perTruck >= GREEN_AT ? "green" : perTruck >= YELLOW_AT ? "yellow" : "red");

function baseLane(kind, destination) {
  return LANES.find((l) => l.kind === kind && l.destination === destination);
}

function laneFor(kind, destination) {
  const lane = baseLane(kind, destination);
  const q = lane && QUOTES.get(laneKey(lane));
  if (!q) return lane;
  return { ...lane, quote: q.quote, spot_premium: Math.max(0, q.quote - lane.contract_cost) };
}

// What a given contract/spot split costs and earns.
function splitMoney(lane, contract, spot) {
  const move = lane.kind === "transfer" ? lane.contract_cost : 0;
  const cEach = move;                     // extra per contract truck
  const sEach = move + lane.spot_premium; // extra per spot truck
  const loads = contract + spot;
  const contractCost = contract * cEach;
  const spotCost = spot * sEach;
  const extra = contractCost + spotCost;
  const making = PROFIT_PER_TRUCK * loads;
  const profit = making - extra;
  const perTruck = Math.round(profit / loads);
  return { cEach, sEach, contractCost, spotCost, extra, making, profit, perTruck, color: colorFor(perTruck) };
}

// Walk every request in the order it was sent and hand out contract trucks.
// `draft` (optional) is the form being filled in, treated as the newest request.
function allocate(rows, draft) {
  const list = [...rows].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : String(a.id) < String(b.id) ? -1 : 1);
  if (draft) list.push(draft);
  const used = new Map();
  const out = new Map();
  for (const r of list) {
    const lane = laneFor(r.kind, r.destination);
    if (!lane) continue;
    const week = weekKey(shipDateOf(r));
    const key = `${laneKey(lane)}|${week}`;
    const usedBefore = used.get(key) || 0;
    const cap = lane.contract_per_week;
    const room = Math.max(0, cap - usedBefore);
    let contract, reason = null;
    if (r.status === "spot") { contract = 0; reason = "carrier"; }
    else if (noticeOf(r) < SHORT_NOTICE_DAYS) { contract = 0; reason = "notice"; }
    else { contract = Math.min(r.loads, room); if (contract < r.loads) reason = "full"; }
    used.set(key, usedBefore + contract);
    out.set(r.id, { lane, week, cap, usedBefore, room, contract, spot: r.loads - contract, reason, notice: noticeOf(r),
      ...splitMoney(lane, contract, r.loads - contract) });
  }
  return out;
}

function reasonText(a) {
  if (a.reason === "carrier") return "Carrier said no, so all spot";
  if (a.reason === "notice") return `Only ${noticeText(a.notice)}: contract carriers need ${SHORT_NOTICE_DAYS}+ days, so all spot`;
  if (a.reason === "full") return a.contract
    ? `Contract full: only ${a.room} of ~${a.cap} contract trucks were left that week`
    : `Contract full: all ~${a.cap} contract trucks that week were already taken`;
  return "All on contract";
}

// The earliest date in the next 4 weeks (3+ days out) that puts more of this request on contract.
// `rows` should already hold the request in its current spot (draft or saved row).
function betterDate(rows, r, current, draft) {
  const t0 = today();
  const day = atNoon(shipDateOf(r)).getDay();
  for (let w = 0; w <= 4; w++) {
    let date = addDays(weekKey(t0), w * 7 + day);
    if (daysBetween(t0, date) < SHORT_NOTICE_DAYS) date = addDays(t0, SHORT_NOTICE_DAYS);
    if (weekKey(date) !== addDays(weekKey(t0), w * 7) || weekKey(date) === current.week) continue;
    const moved = { ...r, ship_date: date, notice_days: daysBetween(t0, date) };
    const res = draft
      ? allocate(rows, moved).get(moved.id)
      : allocate(rows.map((x) => (x.id === r.id ? moved : x))).get(r.id);
    if (res && res.profit > current.profit) return { date, res, save: res.profit - current.profit };
  }
  return null;
}

// Fields saved with a request (the database requires them; screens use allocate()).
const savedFields = (a, loads) => ({
  spot_chance: Math.round((a.spot / loads) * 100) / 100,
  extra_cost: Math.round(a.extra / loads),
  profit_per_truck: a.perTruck,
  color: a.color,
});

// ---------- Data store: Supabase when configured, this browser otherwise ----------
async function makeStore() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);
    const check = ({ data, error }) => {
      if (error) throw error;
      return data;
    };
    return {
      live: true,
      list: async () => check(await db.from("requests").select("*").order("created_at", { ascending: false })),
      add: async (row) => check(await db.from("requests").insert(row)),
      update: async (id, patch) => check(await db.from("requests").update(patch).eq("id", id)),
      reset: async (pin) => check(await db.rpc("reset_demo", { pin })),
      quotes: async () => check(await db.from("spot_quotes").select("*")),
      setQuote: async (kind, destination, quote) =>
        check(await db.from("spot_quotes").upsert({ kind, destination, quote, updated_at: new Date().toISOString() })),
      clearQuote: async (kind, destination) =>
        check(await db.from("spot_quotes").delete().eq("kind", kind).eq("destination", destination)),
      subscribe(cb) {
        db.channel("live")
          .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, cb)
          .on("postgres_changes", { event: "*", schema: "public", table: "spot_quotes" }, cb)
          .subscribe();
        setInterval(cb, 8000); // safety net if the room's Wi-Fi blocks websockets
      },
    };
  }

  const KEY = "tpc_requests";
  const QKEY = "tpc_quotes";
  const listeners = [];
  const read = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const write = (rows) => {
    localStorage.setItem(KEY, JSON.stringify(rows));
    listeners.forEach((f) => f());
  };
  const readQ = () => JSON.parse(localStorage.getItem(QKEY) || "[]");
  const writeQ = (rows) => {
    localStorage.setItem(QKEY, JSON.stringify(rows));
    listeners.forEach((f) => f());
  };
  return {
    live: false,
    list: async () => read(),
    add: async (row) => write([{ ...row, id: Date.now(), created_at: new Date().toISOString(), status: "new" }, ...read()]),
    update: async (id, patch) => write(read().map((r) => (r.id === id ? { ...r, ...patch } : r))),
    reset: async () => { writeQ([]); write([]); },
    quotes: async () => readQ(),
    setQuote: async (kind, destination, quote) =>
      writeQ([...readQ().filter((q) => q.kind !== kind || q.destination !== destination),
        { kind, destination, quote, updated_at: new Date().toISOString() }]),
    clearQuote: async (kind, destination) =>
      writeQ(readQ().filter((q) => q.kind !== kind || q.destination !== destination)),
    subscribe(cb) {
      listeners.push(cb);
      addEventListener("storage", (e) => (e.key === KEY || e.key === QKEY) && cb());
    },
  };
}

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (x) => Math.round(x * 100) + "%";
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Dates are local calendar days as "YYYY-MM-DD".
const DAY_MS = 86400000;
const isoDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const atNoon = (iso) => new Date(iso + "T12:00:00");
const today = () => isoDate(new Date());
const addDays = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / DAY_MS);
const fmtDate = (iso) => atNoon(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (iso) => atNoon(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const noticeText = (n) => (n === 0 ? "same-day notice" : n === 1 ? "1 day's notice" : `${n} days' notice`);
// Rows sent before ship dates existed only have a week number.
const shipDateOf = (r) => r.ship_date || addDays(isoDate(new Date(r.created_at)), (r.week ?? 0) * 7);
const noticeOf = (r) => r.notice_days ?? (r.week ? r.week * 7 : 0);
// Weeks run Sunday to Saturday, the same weeks the calendar shows.
const weekKey = (iso) => addDays(iso, -atNoon(iso).getDay());
const weekLabel = (sun) => {
  const sat = addDays(sun, 6);
  return atNoon(sun).getMonth() === atNoon(sat).getMonth() ? `${fmtShort(sun)}–${atNoon(sat).getDate()}` : `${fmtShort(sun)}–${fmtShort(sat)}`;
};

function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " toast-bad" : "");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Shared pieces ----------
const splitChips = (a) =>
  `${a.contract ? `<span class="b b-contract">${a.contract}</span> on contract ` : ""}${a.spot ? `<span class="b b-spot">${a.spot}</span> on spot` : ""}`;

// The money box: Making − Extra trucking = Profit left. Same on every screen.
function moneyBox(a) {
  const order = a.lane.kind === "order";
  const rows = [];
  if (a.contract) rows.push([`${a.contract} contract truck${a.contract === 1 ? "" : "s"}`,
    order ? "already in the $3,100" : `× ${money(a.cEach)}`, money(a.contractCost)]);
  if (a.spot) rows.push([`${a.spot} spot truck${a.spot === 1 ? "" : "s"}`,
    order ? `× ${money(a.sEach)} more than contract` : `× ${money(a.sEach)}`, money(a.spotCost)]);
  const loads = a.contract + a.spot;
  return `<table class="moneybox"><tbody>
    <tr class="mb-make"><th>Making</th><td>${loads} trucks × ${money(PROFIT_PER_TRUCK)}</td><td>${money(a.making)}</td></tr>
    ${rows.map(([what, how, amt]) => `<tr><th>− ${what}</th><td>${how}</td><td>${amt}</td></tr>`).join("")}
    <tr class="mb-left"><th>Profit left</th><td>${money(a.perTruck)} per truck</td><td>${money(a.profit)}</td></tr>
  </tbody></table>`;
}

function roomLine(a) {
  return `Week of ${weekLabel(a.week)} · contract carrier takes ~${a.cap} a week · ${a.usedBefore} already taken · <strong>${a.room} open</strong>`;
}

function priceTag(a, nudge, team) {
  const source = a.lane.quote != null
    ? `<p class="source-line quoted">Spot price ${money(a.lane.quote)}: <strong>today's quote from Logistics</strong> (2026 average ${money(avgSpot(baseLane(a.lane.kind, a.lane.destination)))})</p>`
    : `<p class="source-line">Spot price ${money(avgSpot(a.lane))}: 2026 average. Contract price ${money(a.lane.contract_cost)}.</p>`;
  const tip = nudge ? `<div class="nudge">
      <p><strong>${TEAMS[team].nudge} ${fmtDate(nudge.date)} instead:</strong> ${nudge.res.contract} on contract, ${nudge.res.spot} on spot,
      ${money(nudge.res.perTruck)} per truck. <strong>Saves ${money(nudge.save)}.</strong></p>
      <button type="button" class="util" data-use-date="${nudge.date}">Use ${fmtDate(nudge.date)}</button>
    </div>` : "";
  return `<div class="tag tag-${a.color}">
    <p class="verdict"><span class="dot"></span>${VERDICT[a.color]}</p>
    <p class="big">${money(a.perTruck)}<small>profit per truck</small></p>
    <p class="split-line">${splitChips(a)}</p>
    <p class="reason">${reasonText(a)}</p>
    <p class="room">${roomLine(a)}</p>
    ${moneyBox(a)}
    ${source}
    <a class="how-link" href="?role=how#example">How is this figured?</a>
    ${tip}
  </div>`;
}

function card(r, a, actions = "") {
  const t = TEAMS[r.team] || { name: r.team, type: r.kind };
  const flex = r.flex === "outside" ? `<span class="flag">Outside customer's forecast</span>` : "";
  const color = a ? a.color : r.color;
  return `<article class="card card-${esc(color)}" data-id="${esc(r.id)}">
    <div class="card-head">
      <span class="pill">${esc(t.name)}</span>
      <span class="status status-${esc(r.status)}">${esc(STATUS[r.status] || r.status)}</span>
      <time>${esc(time(r.created_at))}</time>
    </div>
    <h3>${esc(t.type)}: Findlay → ${esc(r.destination)}</h3>
    <p class="meta">${esc(r.loads)} trucks · Ships ${esc(fmtDate(shipDateOf(r)))} (${esc(noticeText(noticeOf(r)))}) ${flex}</p>
    ${a ? `<p class="split-line">${splitChips(a)} <span class="reason-sm">${a.reason ? esc(reasonText(a)) : ""}</span></p>` : ""}
    <p class="card-money"><strong>${money(a ? a.perTruck : r.profit_per_truck)}</strong> profit / truck
      ${a ? `<span class="card-left">· ${money(a.profit)} left after ${money(a.extra)} extra trucking</span>` : ""}
      <span class="verdict-sm"><span class="dot"></span>${esc(VERDICT[color] || "")}</span></p>
    ${actions}
  </article>`;
}

// Trucks per lane per calendar week, split contract / spot.
function scheduleTable(rows) {
  const alloc = allocate(rows);
  const first = weekKey(today());
  const weeks = [0, 1, 2, 3].map((i) => addDays(first, i * 7));
  const grid = new Map();
  let anyLater = false;
  for (const r of rows) {
    const a = alloc.get(r.id);
    if (!a || a.week < first) continue; // already shipped
    let col = weeks.indexOf(a.week);
    if (col < 0) { col = 4; anyLater = true; }
    const key = `${r.kind}|${r.destination}`;
    if (!grid.has(key)) grid.set(key, Array.from({ length: 5 }, () => ({ contract: 0, spot: 0 })));
    grid.get(key)[col].contract += a.contract;
    grid.get(key)[col].spot += a.spot;
  }
  if (!grid.size) return `<p class="empty">No trucks planned yet. Send a request to fill this in.</p>`;
  const cols = anyLater ? 5 : 4;
  const totals = Array.from({ length: 5 }, () => ({ contract: 0, spot: 0 }));
  const sum = (w) => w.reduce((n, c) => n + c.contract + c.spot, 0);
  const chips = (c) => c.contract + c.spot
    ? `${c.contract ? `<span class="b b-contract">${c.contract}</span>` : ""}${c.spot ? `<span class="b b-spot">${c.spot}</span>` : ""}`
    : "·";
  const body = [...grid.entries()]
    .sort((a, b) => sum(b[1]) - sum(a[1]))
    .map(([key, cells]) => {
      const [kind, dest] = key.split("|");
      const lane = baseLane(kind, dest);
      const tds = cells.slice(0, cols).map((c, i) => {
        totals[i].contract += c.contract;
        totals[i].spot += c.spot;
        return `<td>${chips(c)}</td>`;
      }).join("");
      return `<tr><th scope="row">Findlay → ${esc(dest)} <span class="kind">${kind === "order" ? "Customer" : "Transfer"} · contract takes ~${lane ? lane.contract_per_week : "?"}/week</span></th>${tds}</tr>`;
    })
    .join("");
  return `<p class="legend"><span class="b b-contract">n</span> on contract <span class="b b-spot">n</span> on spot</p>
  <div class="table-wrap"><table class="outlook">
    <thead><tr><th>Lane</th>${weeks.map((w) => `<th>${weekLabel(w)}</th>`).join("")}${anyLater ? "<th>Later</th>" : ""}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th>Total trucks</th>${totals.slice(0, cols).map((c) => `<td>${chips(c)}</td>`).join("")}</tr></tfoot>
  </table></div>`;
}

// Calendar of trucks going out: 4 weeks (Sun–Sat) from the current week.
// Each day is one stacked bar: contract at the bottom, spot on top.
const CAL_BAR_PX = 72;

function calendarPanel(rows, selected) {
  const alloc = allocate(rows);
  const t0 = today();
  const start = weekKey(t0);
  const end = addDays(start, 27);
  const byDay = new Map();
  let after = 0;
  for (const r of rows) {
    const a = alloc.get(r.id);
    const d = shipDateOf(r);
    if (d > end) { after += r.loads; continue; }
    if (d < start || !a) continue;
    if (!byDay.has(d)) byDay.set(d, { contract: 0, spot: 0, waiting: 0, rows: [] });
    const day = byDay.get(d);
    day.contract += a.contract;
    day.spot += a.spot;
    if (r.status === "new") day.waiting += r.loads;
    day.rows.push(r);
  }
  const total = (c) => c.contract + c.spot;
  const max = Math.max(1, ...[...byDay.values()].map(total));
  const split = (c) => `${c.contract} contract · ${c.spot} spot`;
  const bar = (c) => `<span class="cal-bar">${["contract", "spot"].filter((k) => c[k]).map((k) =>
    `<span class="seg seg-${k}" style="height:${Math.max(3, Math.round((c[k] / max) * CAL_BAR_PX))}px"></span>`).join("")}</span>`;

  let html = `<div class="cal">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-head">${d}</div>`).join("")}<div class="cal-head">Week total</div>`;
  for (let w = 0; w < 4; w++) {
    const wk = { contract: 0, spot: 0, waiting: 0 };
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i);
      const c = byDay.get(d);
      if (c) ["contract", "spot", "waiting"].forEach((k) => (wk[k] += c[k]));
      const cls = ["cal-day", d === t0 ? "cal-today" : "", d < t0 ? "cal-past" : "", d === selected ? "cal-selected" : "", c ? "has" : ""].join(" ");
      const label = atNoon(d).getDate() === 1 || (w === 0 && i === 0) ? fmtShort(d) : atNoon(d).getDate();
      html += `<button type="button" class="${cls}" data-day="${d}" ${c ? `data-tip="${esc(fmtDate(d))}: ${total(c)} trucks (${split(c)})"` : "disabled"}>
        <span class="cal-date">${label}${d === t0 ? ` <em>today</em>` : ""}</span>
        ${c ? `${bar(c)}<span class="cal-n">${total(c)}</span>` : `<span class="cal-empty">·</span>`}
      </button>`;
    }
    const n = total(wk);
    html += `<div class="cal-week">${n ? `<span class="cal-week-n">${n}</span>
      <span class="cal-hbar">${["contract", "spot"].filter((k) => wk[k]).map((k) => `<span class="seg seg-${k}" style="flex:${wk[k]}"></span>`).join("")}</span>
      <span class="cal-week-split">${split(wk)}${wk.waiting ? `<br>${wk.waiting} trucks waiting on Logistics` : ""}</span>` : `<span class="cal-empty">·</span>`}</div>`;
  }
  html += `</div>`;

  if (selected && byDay.has(selected)) {
    const day = byDay.get(selected);
    html += `<div class="cal-detail"><h3>${esc(fmtDate(selected))}: ${total(day)} trucks</h3><ul>
      ${day.rows.map((r) => {
        const a = alloc.get(r.id);
        return `<li>${splitChips(a)} · <strong>Findlay → ${esc(r.destination)}</strong> · ${esc((TEAMS[r.team] || {}).name || r.team)}
          · ${esc(STATUS[r.status])} · ${money(a.perTruck)} profit / truck</li>`;
      }).join("")}
    </ul></div>`;
  } else {
    html += `<p class="small">Click a day to see which lanes ship that day.</p>`;
  }
  if (after) html += `<p class="small">+${after} more trucks ship after ${esc(fmtDate(end))}.</p>`;
  return html;
}

// What Ball's contracts look like on each Findlay lane.
function contractsTable() {
  return `<div class="table-wrap"><table class="prices contracts">
    <thead><tr><th>Lane (from Findlay, OH)</th><th>Contract trucks a week</th><th>Contract price</th><th>Spot price</th><th>Went spot in 2026</th></tr></thead>
    <tbody>${LANES.map((b) => {
      const l = laneFor(b.kind, b.destination);
      return `<tr><th scope="row">${esc(l.destination)} <span class="kind">${l.kind === "order" ? "Customer" : "Transfer"}</span></th>
        <td data-label="Contract trucks a week">~${l.contract_per_week}</td><td data-label="Contract price">${money(l.contract_cost)}</td>
        <td data-label="Spot price">${l.quote != null ? `<strong>${money(l.quote)}</strong> <span class="kind">today's quote</span>` : money(avgSpot(l))}</td>
        <td data-label="Went spot in 2026">${pct(l.spot_share)}</td></tr>`;
    }).join("")}</tbody>
  </table></div>
  <p class="small">Contract trucks a week = loads contract carriers actually took on that lane in 2026 (Jan–Jul) ÷ 30 weeks. Prices are 2026 averages unless Logistics entered a spot quote today. Ball's real carrier contracts would replace these.</p>`;
}

// ---------- Screens ----------
function homeView() {
  const tile = (role, line) => `<a class="team-tile" href="?role=${role}">
      <span class="team-name">${TEAMS[role].name}</span><span class="team-line">${line}</span></a>`;
  return {
    html: `<section class="home">
      <p class="eyebrow">Ball · Findlay pilot</p>
      <h1>One price tag every team sees before they decide.</h1>
      <p class="lede">Pick your team. Everything you send shows up on the Live Hub for everyone, right away.</p>
      <a class="guide-link" href="?role=how"><strong>New here?</strong> See how it works in 1 minute →</a>
      <div class="team-grid">
        ${tile("sales", "A customer wants extra loads")}
        ${tile("production", "Schedule an extra run")}
        ${tile("planning", "Move cans between sites")}
        ${tile("logistics", "Book the trucks")}
      </div>
      <a class="cta" href="?role=hub">Open the Live Hub</a>
      <p class="small"><a href="?role=carrier">Carrier view</a>: the 4-week outlook we share with carriers.</p>
    </section>`,
  };
}

function requestView(team, store, state) {
  const t = TEAMS[team];
  const lanes = LANES.filter((l) => l.kind === t.kind);
  const form = { destination: lanes[0].destination, loads: 10, shipDate: addDays(today(), 5), flex: "inside" };
  const notice = () => daysBetween(today(), form.shipDate);

  const html = `<section class="panel">
      <p class="eyebrow">${t.name}</p>
      <h1>${t.ask}</h1>
      <p class="lede">Pick where, how many and the ship date. You'll see right away how many trucks fit on the lane's contract that week, how many go on spot, and what Ball keeps. Then send it to the hub.</p>
      <p class="from">Ships from <strong>Ball's Findlay, OH plant</strong> (the pilot plant)</p>
      <label class="field"><span class="label">${t.dest}</span>
        <select id="dest">${lanes.map((l) => `<option>${esc(l.destination)}</option>`).join("")}</select>
      </label>
      <div class="field"><span class="label">How many truckloads?</span>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="One less">−</button>
          <output id="loads">10</output>
          <button type="button" data-step="1" aria-label="One more">+</button>
          <span class="presets">${[5, 10, 20].map((n) => `<button type="button" class="chip-btn" data-loads="${n}">${n}</button>`).join("")}</span>
        </div>
      </div>
      <label class="field"><span class="label">Ship date</span>
        <input id="ship" type="date" min="${today()}" max="${addDays(today(), 120)}" value="${form.shipDate}">
        <span class="notice" id="notice-line"></span>
      </label>
      ${team === "sales" ? `<div class="field"><span class="label">Is this inside the customer's forecast (±10%)?</span>
        <div class="seg" id="flex"><button type="button" data-flex="inside">Yes</button><button type="button" data-flex="outside">No, it's extra</button></div>
      </div>` : ""}
      <div id="tag"></div>
      <button type="button" id="send" class="cta">Send to the hub</button>
    </section>
    <section class="panel">
      <h2>Your team's requests</h2>
      <div id="mine" class="cards"></div>
    </section>`;

  const draftRow = () => ({
    id: "draft", created_at: "\uffff", team, kind: t.kind, destination: form.destination, loads: form.loads,
    ship_date: form.shipDate, notice_days: notice(), status: "new",
  });
  const draftAlloc = () => allocate(state.rows, draftRow()).get("draft");

  function paint() {
    $("#loads").textContent = form.loads;
    document.querySelectorAll("#flex button").forEach((b) => b.classList.toggle("on", b.dataset.flex === form.flex));
    if (!form.shipDate || form.shipDate < today()) form.shipDate = today();
    $("#ship").value = form.shipDate;
    const n = notice();
    $("#notice-line").innerHTML = `${fmtDate(form.shipDate)} · <strong>${noticeText(n)}</strong>${n < SHORT_NOTICE_DAYS ? ` (under ${SHORT_NOTICE_DAYS} days: spot only)` : ""}`;
    const a = draftAlloc();
    const better = a.spot ? betterDate(state.rows, draftRow(), a, true) : null;
    $("#tag").innerHTML = priceTag(a, better, team);
  }

  function mount() {
    $("#dest").addEventListener("change", (e) => { form.destination = e.target.value; paint(); });
    $("#ship").addEventListener("change", (e) => { form.shipDate = e.target.value; paint(); });
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.step) form.loads = Math.min(200, Math.max(1, form.loads + +b.dataset.step));
      else if (b.dataset.loads) form.loads = +b.dataset.loads;
      else if (b.dataset.flex) form.flex = b.dataset.flex;
      else if (b.dataset.useDate) form.shipDate = b.dataset.useDate;
      else if (b.id === "send") return send(b);
      else if (b.dataset.move) return moveLater(b);
      else return;
      paint();
    });
    paint();
  }

  async function send(btn) {
    const row = {
      team, kind: t.kind, destination: form.destination, loads: form.loads,
      ship_date: form.shipDate, notice_days: notice(),
      flex: team === "sales" ? form.flex : null, ...savedFields(draftAlloc(), form.loads),
    };
    btn.disabled = true;
    try {
      await store.add(row);
      toast("Sent. It's on the Live Hub now.");
      state.refresh();
    } catch (err) {
      toast("Couldn't send: " + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function moveLater(btn) {
    const r = state.rows.find((x) => String(x.id) === btn.dataset.move);
    const date = btn.dataset.date;
    if (!r || !date) return;
    btn.disabled = true;
    try {
      const notice_days = daysBetween(today(), date);
      const moved = allocate(state.rows.map((x) => (x.id === r.id ? { ...x, ship_date: date, notice_days } : x))).get(r.id);
      await store.update(r.id, { ship_date: date, notice_days, ...savedFields(moved, r.loads) });
      toast(`Moved to ${fmtDate(date)}.`);
      state.refresh();
    } catch (err) {
      toast("Couldn't update: " + err.message, true);
      btn.disabled = false;
    }
  }

  function live(rows) {
    paint();
    const alloc = allocate(rows);
    const mine = rows.filter((r) => r.team === team);
    $("#mine").innerHTML = mine.length
      ? mine.map((r) => {
          const a = alloc.get(r.id);
          let action = "";
          if (a && a.spot && r.status === "new") {
            const better = betterDate(rows, r, a, false);
            if (better) action = `<div class="card-actions"><button type="button" class="util" data-move="${esc(r.id)}" data-date="${better.date}">Move to ${fmtDate(better.date)} · ${better.res.contract} on contract · save ${money(better.save)}</button></div>`;
          }
          return card(r, a, action);
        }).join("")
      : `<p class="empty">Nothing sent yet.</p>`;
  }

  return { html, mount, live };
}

function logisticsView(store, state) {
  const html = `<section class="panel">
      <p class="eyebrow">Logistics</p>
      <h1>Book the trucks</h1>
      <p class="lede">Every team's requests land here with their contract / spot split already worked out from each lane's contract trucks for that week. Confirm the booking, or mark it if the contract carrier says no. <a href="?role=how">How it works</a></p>
      <a class="guide-link" href="#quote"><strong>Got a spot quote?</strong> Enter it so every team sees the real price ↓</a>
      <h2 id="todo-title" class="sub-h">Needs a decision</h2>
      <div id="incoming" class="cards"></div>
      <div id="done"></div>
    </section>
    <section class="panel" id="quote">
      <h2>Got a spot quote? Enter it here</h2>
      <p class="lede">Type the price a spot carrier quoted you. Every team's price tag for that lane updates right away. All lanes start at Ball's Findlay, OH plant (the pilot).</p>
      <label class="field"><span class="label">Lane</span>
        <select id="q-lane">${LANES.map((l) => `<option value="${esc(laneKey(l))}">Findlay → ${esc(l.destination)} (${l.kind === "order" ? "customer" : "transfer"})</option>`).join("")}</select>
      </label>
      <label class="field"><span class="label">Spot truck price, per truck</span>
        <span class="money-input"><span>$</span><input id="q-price" type="number" inputmode="numeric" min="0" max="20000" step="1"></span>
      </label>
      <p class="small" id="q-hint"></p>
      <div class="card-actions">
        <button type="button" id="q-save" class="util on">Update price</button>
        <button type="button" id="q-clear" class="util">Use 2026 average</button>
      </div>
    </section>
    <section class="panel">
      <h2>Our contracts</h2>
      <div id="contracts"></div>
    </section>`;

  const pickLane = () => {
    const [kind, dest] = $("#q-lane").value.split("|");
    return { kind, dest, lane: laneFor(kind, dest), base: baseLane(kind, dest) };
  };
  function fillQuote() {
    const { lane, base } = pickLane();
    $("#q-price").value = lane.quote ?? avgSpot(base);
    paintHint();
  }
  function paintHint() {
    const { lane, base } = pickLane();
    $("#q-hint").innerHTML = lane.quote != null
      ? `Using <strong>today's quote: ${money(lane.quote)}</strong>. The 2026 average is ${money(avgSpot(base))}. Contract truck: ${money(base.contract_cost)}.`
      : `Using the <strong>2026 average: ${money(avgSpot(base))}</strong>. Contract truck: ${money(base.contract_cost)}.`;
    $("#contracts").innerHTML = contractsTable();
  }
  async function saveQuote(clear) {
    const { kind, dest, base } = pickLane();
    const value = Math.round(Number($("#q-price").value));
    if (!clear && !(value >= 0 && value <= 20000)) return toast("Enter a price between $0 and $20,000.", true);
    try {
      if (clear) await store.clearQuote(kind, dest);
      else await store.setQuote(kind, dest, value);
      toast(clear ? `Back to the 2026 average for ${dest}.` : `Spot price for ${dest} is now ${money(value)} on every screen.`);
      if (clear) $("#q-price").value = avgSpot(base);
      await state.refresh();
    } catch (err) {
      toast("Couldn't update: " + err.message, true);
    }
  }

  let doneOpen = false; // keep the Done list open or closed across live updates
  function mount() {
    $("#app").addEventListener("toggle", (e) => { if (e.target.id === "done-box") doneOpen = e.target.open; }, true);
    $("#q-lane").addEventListener("change", fillQuote);
    $("#q-save").addEventListener("click", () => saveQuote(false));
    $("#q-clear").addEventListener("click", () => saveQuote(true));
    fillQuote();
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-status]");
      if (!b) return;
      const r = state.rows.find((x) => String(x.id) === b.dataset.id);
      if (!r) return;
      b.disabled = true;
      try {
        await store.update(r.id, { status: b.dataset.status });
        if (b.dataset.status === "spot") toast("Marked all spot. Its contract trucks go to the next request in line.");
        state.refresh();
      } catch (err) {
        toast("Couldn't update: " + err.message, true);
        b.disabled = false;
      }
    });
  }

  function live(rows) {
    paintHint();
    const alloc = allocate(rows);
    // Oldest first: that's also the order contract trucks are handed out.
    const byShip = (a, b) => (shipDateOf(a) < shipDateOf(b) ? -1 : shipDateOf(a) > shipDateOf(b) ? 1 : 0);
    const todo = rows.filter((r) => r.status === "new").sort(byShip);
    const done = rows.filter((r) => r.status !== "new").sort(byShip);
    $("#todo-title").textContent = todo.length ? `Needs a decision (${todo.length})` : "Needs a decision";
    $("#incoming").innerHTML = todo.length
      ? todo.map((r) => {
          const a = alloc.get(r.id);
          return card(r, a, `${a ? `<p class="room">${roomLine(a)}</p>` : ""}<div class="card-actions">
          <button type="button" class="util" data-status="contract" data-id="${esc(r.id)}">Confirm booking</button>
          <button type="button" class="util" data-status="spot" data-id="${esc(r.id)}">Carrier said no → spot</button>
        </div>`);
        }).join("")
      : `<p class="empty">${rows.length ? "All caught up. Every request has a decision." : "No requests yet. They'll appear here the moment another team sends one."}</p>`;
    $("#done").innerHTML = done.length ? `<details id="done-box" class="done-box"${doneOpen ? " open" : ""}>
        <summary>Done (${done.length}): booked or carrier said no</summary>
        <ul class="done-list">${done.map((r) => {
          const a = alloc.get(r.id);
          return `<li>
            <span class="status status-${esc(r.status)}">${esc(STATUS[r.status])}</span>
            <span class="done-what"><strong>Findlay → ${esc(r.destination)}</strong>
              <span class="kind">${esc((TEAMS[r.team] || {}).name || r.team)} · ${esc(r.loads)} trucks · ships ${esc(fmtDate(shipDateOf(r)))}</span></span>
            <span class="done-split">${a ? splitChips(a) : ""}</span>
            <span class="done-money">${money(a ? a.perTruck : r.profit_per_truck)}<span class="kind">per truck</span></span>
            <button type="button" class="util" data-status="new" data-id="${esc(r.id)}">Undo</button>
          </li>`;
        }).join("")}</ul>
      </details>` : "";
  }

  return { html, mount, live };
}

function hubView(store, state) {
  const html = `<section class="hub">
      <div class="hub-head">
        <div><p class="eyebrow">Ball · Findlay pilot</p><h1>Live Hub</h1>
        <p class="lede">Every team's decisions with the same price tag, as they happen. <a href="?role=how">How it works</a></p></div>
        <span class="live"><span class="pulse"></span>${store.live ? "Live" : "Local demo"}</span>
      </div>
      <div id="totals" class="totals"></div>
      <section class="cal-panel">
        <div class="cal-top"><h2>Trucks going out</h2>
          <p class="legend"><span class="key key-contract"></span> on contract <span class="key key-spot"></span> on spot (contract full, short notice or carrier said no)</p></div>
        <div id="calendar"></div>
      </section>
      <div class="hub-grid">
        <div><h2 id="feed-title">Requests</h2><div id="feed" class="cards"></div></div>
        <div><h2>By lane: next 4 weeks</h2><div id="outlook"></div>
          <p class="small">The same numbers become the 4-week outlook we give carriers.</p>
          <details class="contracts-box"><summary>Our contracts by lane</summary><div id="contracts"></div></details></div>
      </div>
      <button type="button" id="reset" class="util quiet">New round</button>
    </section>`;

  let selected = null;
  function mount() {
    $("#calendar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-day]");
      if (!b || b.disabled) return;
      selected = selected === b.dataset.day ? null : b.dataset.day;
      $("#calendar").innerHTML = calendarPanel(state.rows, selected);
    });
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    document.body.append(tip);
    $("#calendar").addEventListener("mousemove", (e) => {
      const b = e.target.closest("[data-tip]");
      tip.hidden = !b;
      if (!b) return;
      tip.textContent = b.dataset.tip;
      const flip = e.clientX + 14 + tip.offsetWidth > innerWidth - 8;
      tip.style.left = `${flip ? e.clientX - 14 - tip.offsetWidth : e.clientX + 14}px`;
      tip.style.top = `${e.clientY + 14}px`;
    });
    $("#calendar").addEventListener("mouseleave", () => (tip.hidden = true));
    $("#reset").addEventListener("click", async () => {
      const pin = prompt("Enter the reset PIN to clear the hub for a new round:");
      if (pin === null) return;
      try {
        await store.reset(pin);
        toast("Hub cleared.");
        state.refresh();
      } catch (err) {
        toast("Not cleared: " + err.message, true);
      }
    });
  }

  function live(rows) {
    const alloc = allocate(rows);
    const t = { contract: 0, spot: 0, contractCost: 0, spotCost: 0, making: 0, profit: 0 };
    let waiting = 0;
    for (const r of rows) {
      const a = alloc.get(r.id);
      if (!a) continue;
      for (const k of Object.keys(t)) t[k] += a[k];
      if (r.status === "new") waiting++;
    }
    const tile = (label, value, sub = "", cls = "") => `<div class="stat ${cls}"><p class="stat-label">${label}</p><p class="stat-value">${value}</p>${sub ? `<p class="stat-sub">${sub}</p>` : ""}</div>`;
    $("#totals").innerHTML =
      tile("Trucks on contract", t.contract, "within each lane's weekly contract", "stat-contract") +
      tile("Trucks on spot", t.spot, "contract full, short notice or carrier said no", "stat-spot") +
      tile("Extra trucking", money(t.contractCost + t.spotCost), `${money(t.contractCost)} contract moves · ${money(t.spotCost)} spot`) +
      tile("Profit left", money(t.profit), `of ${money(t.making)} made`);
    $("#contracts").innerHTML = contractsTable();
    $("#feed-title").textContent = waiting ? `Requests (${waiting} waiting on Logistics)` : "Requests";
    $("#feed").innerHTML = rows.length ? rows.map((r) => card(r, alloc.get(r.id))).join("") : `<p class="empty">Waiting for the first request…</p>`;
    $("#outlook").innerHTML = scheduleTable(rows);
    $("#calendar").innerHTML = calendarPanel(rows, selected);
  }

  return { html, mount, live };
}

function carrierView() {
  const html = `<section class="panel">
      <p class="eyebrow">Shared with carriers</p>
      <h1>Findlay, OH: trucks we need, next 4 weeks</h1>
      <p class="lede">Straight from Ball's shared plan, so you can commit trucks before we tender them.</p>
      <div id="outlook"></div>
    </section>`;
  return { html, live: (rows) => ($("#outlook").innerHTML = scheduleTable(rows)) };
}

function howView() {
  // The example runs through the same engine as the app: Mississauga, ~15 contract trucks a week.
  const lane = baseLane("transfer", "Mississauga, ON");
  const wed = addDays(weekKey(today()), 7 + 3); // Wednesday next week
  const mk = (id, n, date, loads = 10) => ({ id, created_at: String(n), kind: "transfer", destination: lane.destination,
    loads, ship_date: date, notice_days: Math.max(daysBetween(today(), date), SHORT_NOTICE_DAYS), status: "new" });
  const A = mk("a", 1, wed), B = mk("b", 2, wed);
  const one = allocate([A]).get("a");
  const two = allocate([A, B]).get("b");
  const moved = allocate([A, { ...B, ship_date: addDays(wed, 7) }]).get("b");
  const rush = allocate([{ ...mk("c", 3, addDays(today(), 1), 10), notice_days: 1 }]).get("c");
  const tag = (a) => `<span class="mini mini-${a.color}">${money(a.perTruck)} per truck · ${a.color[0].toUpperCase() + a.color.slice(1)}</span>`;
  const html = `<section class="panel how">
      <p class="eyebrow">1-minute guide</p>
      <h1>Every truck gets a price tag.</h1>

      <h2>The problem</h2>
      <ul class="plain">
        <li>Ball's teams each chase their own goal. Nobody sees what trucking costs until the bill shows up 1–2 months later.</li>
        <li>When a truck is needed at the last minute, Ball pays extra for a <strong>spot truck</strong>. In 2026, <strong>15.8%</strong> of loads went spot (6.4% in 2025). That cost <strong>$18.9 million</strong> extra in 7 months.</li>
        <li><strong>64%</strong> of those spot loads were Ball moving its own cans between its own sites, which Ball schedules itself.</li>
      </ul>

      <h2>Two kinds of trucks</h2>
      <div class="two">
        <div class="box box-mint"><h3>Contract truck</h3><p>Booked ahead with a carrier at a set price. Cheaper, but each lane's carrier only takes about so many trucks a week, and needs ${SHORT_NOTICE_DAYS}+ days' notice.</p></div>
        <div class="box box-red"><h3>Spot truck</h3><p>Found at the last minute at market price. Costs more. Used when the week's contract trucks are taken or there isn't enough notice.</p></div>
      </div>

      <h2>The price tag</h2>
      <div class="formula">
        <div><strong>$3,100</strong><span>what one truckload of cans earns Ball</span></div>
        <div class="op">−</div>
        <div><strong>Extra trucking</strong><span>the trucking this decision adds</span></div>
        <div class="op">=</div>
        <div><strong>Profit per truck</strong><span>what Ball keeps</span></div>
      </div>
      <p class="note">$3,100 is an average: Ball's 2025 can profit in North America divided by the truckloads it ships.
        <strong>Extra trucking depends on whether the lane still has contract trucks open that week.</strong> First come, first served.</p>

      <h2 id="example">One example, step by step</h2>
      <p>Findlay → ${esc(lane.destination)}: the contract carrier takes about <strong>${lane.contract_per_week} trucks a week</strong>.
        A contract truck costs ${money(lane.contract_cost)}; a spot truck costs ${money(avgSpot(lane))}.</p>
      <ol class="steps">
        <li><strong>Inventory Planning sends 10 trucks for Wed, ${fmtShort(wed)}.</strong> ${lane.contract_per_week} contract trucks are open, so all 10 go on contract:
          10 × ${money(one.cEach)} = ${money(one.extra)} extra trucking.<br>
          ${money(one.making)} − ${money(one.extra)} = ${money(one.profit)} → ${tag(one)}</li>
        <li><strong>Then Production sends 10 more the same week.</strong> Only ${two.room} contract trucks are left, so ${two.contract} go on contract and ${two.spot} on spot:
          ${two.contract} × ${money(two.cEach)} + ${two.spot} × ${money(two.sEach)} = ${money(two.extra)}.<br>
          ${money(two.making)} − ${money(two.extra)} = ${money(two.profit)} → ${tag(two)}</li>
        <li><strong>Production ships the week after instead.</strong> That week's contract trucks are open, so all 10 go on contract → ${tag(moved)}.
          <strong>Saves ${money(moved.profit - two.profit)}.</strong> The app suggests this date automatically.</li>
        <li><strong>Anything with less than ${SHORT_NOTICE_DAYS} days' notice goes on spot</strong>, even if contract trucks are open: 10 × ${money(rush.sEach)} → ${tag(rush)}</li>
      </ol>
      <p class="note">Every team sees this the moment they pick a lane and date, before they send anything.</p>

      <h2>What the colors mean</h2>
      <ul class="colors">
        <li><span class="mini mini-green">$2,000+</span> Go: good business.</li>
        <li><span class="mini mini-yellow">$1,000–$1,999</span> Talk to Logistics first.</li>
        <li><span class="mini mini-red">Under $1,000</span> Rethink: change the timing or the place.</li>
      </ul>
      <p class="note">The cutoffs are examples. Ball's finance team would set the real ones.</p>

      <h2>Who does what</h2>
      <table class="who"><tbody>
        <tr><th>Sales</th><td>Sees whether extra customer loads fit on contract that week, and what Ball keeps, before saying yes.</td></tr>
        <tr><th>Production</th><td>Sees whether an extra run's trucks to the warehouse fit on contract, and picks a better week if not.</td></tr>
        <tr><th>Inventory Planning</th><td>Sees whether a move between sites fits on contract, and picks a better week if not.</td></tr>
        <tr><th>Logistics</th><td>Confirms each booking, marks when a carrier says no, and types in real spot quotes so every price tag is current.</td></tr>
        <tr><th>Live Hub</th><td>Everyone sees the same requests and totals as they happen.</td></tr>
        <tr><th>Carriers</th><td>Get a 4-week look ahead so they can hold trucks for Ball.</td></tr>
      </tbody></table>

      <details class="source"><summary>Where the numbers come from</summary>
        <p>Ball's case workbook (Detail sheet), Findlay plant, January–July 2026, with short yard moves (shuttles) left out.
        Contract and spot prices are each lane's 2026 averages. When Logistics gets a real quote from a spot carrier, they type it in and every price tag uses it instead.
        Three rules (assumptions): (1) "Contract trucks a week" is how many loads contract carriers actually took on that lane in 2026, divided by 30 weeks; Ball's real carrier contracts would replace it.
        (2) Contract trucks go first come, first served within each Sunday–Saturday week. (3) Less than ${SHORT_NOTICE_DAYS} days' notice goes on spot, because contract carriers need time (Ball's own plan: tender 3–5 days ahead).</p>
      </details>

      <a class="cta" href="./">Try it: pick a team</a>
    </section>`;
  return { html };
}

// ---------- Boot ----------
async function main() {
  const role = new URLSearchParams(location.search).get("role");
  const team = TEAMS[role] ? role : null;
  const store = await makeStore();
  const state = { rows: [], refresh: null };

  if (!store.live) {
    const b = $("#mode-banner");
    b.hidden = false;
    b.textContent = "Local demo mode: requests stay in this browser. Add the Supabase keys in config.js to share across devices.";
  }
  if (team) {
    const chip = $("#team-chip");
    chip.hidden = false;
    chip.innerHTML = `<a href="./">${esc(TEAMS[team].name)} ▾</a>`;
    document.title = `${TEAMS[team].name} · Truck Price Check`;
  }
  document.body.dataset.role = team || "home";

  const view =
    !team ? homeView()
    : team === "logistics" ? logisticsView(store, state)
    : team === "hub" ? hubView(store, state)
    : team === "carrier" ? carrierView()
    : team === "how" ? howView()
    : requestView(team, store, state);

  $("#app").innerHTML = view.html;
  view.mount?.();

  let busy = false;
  let again = false;
  let loaded = false;
  state.refresh = async () => {
    if (!view.live) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const [rows, quotes] = await Promise.all([store.list(), store.quotes().catch(() => [])]);
      const next = new Map(quotes.map((q) => [`${q.kind}|${q.destination}`, q]));
      if (loaded && team !== "logistics") {
        for (const [key, q] of next) {
          if (QUOTES.get(key)?.quote !== q.quote) toast(`Logistics updated the spot price to ${q.destination}: ${money(q.quote)}`);
        }
      }
      QUOTES = next;
      loaded = true;
      state.rows = rows;
      view.live(state.rows);
    } catch (err) {
      toast("Can't reach the hub: " + err.message, true);
    } finally {
      busy = false;
      if (again) { again = false; state.refresh(); }
    }
  };
  if (view.live) {
    store.subscribe(() => state.refresh());
    state.refresh();
  }
}

main();
