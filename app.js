import { LANES } from "./lanes.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// ---------- The price tag (same math on every screen) ----------
// Profit per truck = $3,100 average profit per truckload of cans
//   − extra trucking: spot chance × the lane's spot premium,
//     plus the move's own contract cost when it is a transfer (an extra truck move).
// Under 7 days' notice assumes a spot truck; 7+ days uses the lane's 2026 spot share.
const PROFIT_PER_TRUCK = 3100;
const GREEN_AT = 2000;
const YELLOW_AT = 1000;
const SHORT_NOTICE_DAYS = 7;
const VERDICT = {
  green: "Go: good business",
  yellow: "Talk to Logistics first",
  red: "Rethink: change the timing or the place",
};
const STATUS = { new: "Waiting on Logistics", contract: "Booked on contract", spot: "Needs spot truck" };

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

function baseLane(kind, destination) {
  return LANES.find((l) => l.kind === kind && l.destination === destination);
}

function laneFor(kind, destination) {
  const lane = baseLane(kind, destination);
  const q = lane && QUOTES.get(laneKey(lane));
  if (!q) return lane;
  return { ...lane, quote: q.quote, spot_premium: Math.max(0, q.quote - lane.contract_cost) };
}

function price(lane, noticeDays) {
  const spot_chance = noticeDays < SHORT_NOTICE_DAYS ? 1 : Math.round(lane.spot_share * 100) / 100;
  const base = lane.kind === "transfer" ? lane.contract_cost : 0;
  const spot_risk = Math.round(spot_chance * lane.spot_premium);
  const extra_cost = base + spot_risk;
  const profit_per_truck = PROFIT_PER_TRUCK - extra_cost;
  const color = profit_per_truck >= GREEN_AT ? "green" : profit_per_truck >= YELLOW_AT ? "yellow" : "red";
  return { spot_chance, extra_cost, profit_per_truck, color, spot_risk };
}

// The price fields saved with a request (spot_risk is display-only).
function priceFields(lane, noticeDays) {
  const { spot_chance, extra_cost, profit_per_truck, color } = price(lane, noticeDays);
  return { spot_chance, extra_cost, profit_per_truck, color };
}

// Once Logistics books a request, the estimate becomes the actual cost:
// contract = no spot truck; spot = a spot truck at today's spot price.
function finalFields(lane, status) {
  const base = lane.kind === "transfer" ? lane.contract_cost : 0;
  const extra_cost = status === "spot" ? base + lane.spot_premium : base;
  const profit_per_truck = PROFIT_PER_TRUCK - extra_cost;
  const color = profit_per_truck >= GREEN_AT ? "green" : profit_per_truck >= YELLOW_AT ? "yellow" : "red";
  return { spot_chance: status === "spot" ? 1 : 0, extra_cost, profit_per_truck, color };
}

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
// 7-day buckets counted from today: 0 = the next 7 days.
const weekIndex = (r) => Math.floor(daysBetween(today(), shipDateOf(r)) / 7);
const weekLabel = (i) => {
  const a = addDays(today(), i * 7), b = addDays(today(), i * 7 + 6);
  return atNoon(a).getMonth() === atNoon(b).getMonth() ? `${fmtShort(a)}–${atNoon(b).getDate()}` : `${fmtShort(a)}–${fmtShort(b)}`;
};

// Contract trucks still open on a lane in a week, after what Logistics already booked.
function contractRoom(lane, week, rows, excludeId) {
  const booked = rows
    .filter((x) => x.status === "contract" && x.id !== excludeId && x.kind === lane.kind &&
      x.destination === lane.destination && weekIndex(x) === week)
    .reduce((n, x) => n + x.loads, 0);
  return { cap: lane.contract_per_week, booked, room: Math.max(0, lane.contract_per_week - booked) };
}

function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " toast-bad" : "");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Shared pieces ----------
function priceTag(lane, notice, loads, team) {
  const p = price(lane, notice);
  const lines = [];
  if (lane.kind === "transfer") lines.push(`Truck to move the cans (contract price): ${money(lane.contract_cost)}`);
  lines.push(notice < SHORT_NOTICE_DAYS
    ? `Only ${noticeText(notice)}, too late to book a contract truck, so we count a spot truck: +${money(lane.spot_premium)}`
    : `${pct(lane.spot_share)} of trucks on this lane end up spot, at ${money(lane.spot_premium)} extra each: +${money(p.spot_risk)}`);
  lines.push(`${loads} loads × ${money(p.extra_cost)} = ${money(p.extra_cost * loads)} extra trucking`);
  const source = lane.quote != null
    ? `<p class="source-line quoted">Spot price ${money(lane.quote)}: <strong>today's quote from Logistics</strong> (2026 average ${money(avgSpot(baseLane(lane.kind, lane.destination)))})</p>`
    : `<p class="source-line">Spot price ${money(avgSpot(lane))}: 2026 average. Logistics can update it with a real quote.</p>`;
  let nudge = "";
  if (notice < SHORT_NOTICE_DAYS) {
    const laterDate = addDays(today(), SHORT_NOTICE_DAYS);
    const later = price(lane, SHORT_NOTICE_DAYS);
    const save = (later.profit_per_truck - p.profit_per_truck) * loads;
    if (save > 0) {
      nudge = `<div class="nudge">
        <p><strong>${TEAMS[team].nudge} ${fmtDate(laterDate)} instead:</strong> ${money(later.profit_per_truck)} per truck.
        Saves ${money(save)} on ${loads} loads.</p>
        <button type="button" class="util" data-use-date="${laterDate}">Use ${fmtDate(laterDate)}</button>
      </div>`;
    }
  }
  return `<div class="tag tag-${p.color}">
    <p class="verdict"><span class="dot"></span>${VERDICT[p.color]}</p>
    <p class="big">${money(p.profit_per_truck)}<small>profit per truck</small></p>
    <p class="math">${money(PROFIT_PER_TRUCK)} profit − ${money(p.extra_cost)} extra trucking</p>
    <ul class="why">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
    ${source}
    <a class="how-link" href="?role=how#example">How is this figured?</a>
    ${nudge}
  </div>`;
}

function card(r, actions = "") {
  const t = TEAMS[r.team] || { name: r.team, type: r.kind };
  const flex = r.flex === "outside" ? `<span class="flag">Outside customer's forecast</span>` : "";
  return `<article class="card card-${esc(r.color)}" data-id="${esc(r.id)}">
    <div class="card-head">
      <span class="pill">${esc(t.name)}</span>
      <span class="status status-${esc(r.status)}">${esc(STATUS[r.status] || r.status)}</span>
      <time>${esc(time(r.created_at))}</time>
    </div>
    <h3>${esc(t.type)}: Findlay → ${esc(r.destination)}</h3>
    <p class="meta">${esc(r.loads)} loads · Ships ${esc(fmtDate(shipDateOf(r)))} (${esc(noticeText(noticeOf(r)))}) ${flex}</p>
    <p class="card-money"><strong>${money(r.profit_per_truck)}</strong> profit / truck
      <span class="est">${r.status === "new" ? "estimate" : "final"}</span>
      <span class="verdict-sm"><span class="dot"></span>${esc(VERDICT[r.color] || "")}</span></p>
    ${actions}
  </article>`;
}

// Trucks per lane per week, split by what Logistics has done with them.
function scheduleTable(rows) {
  const grid = new Map();
  let anyLater = false;
  for (const r of rows) {
    const w = weekIndex(r);
    if (w < 0) continue; // already shipped
    const col = Math.min(4, w);
    if (col === 4) anyLater = true;
    const key = `${r.kind}|${r.destination}`;
    if (!grid.has(key)) grid.set(key, Array.from({ length: 5 }, () => ({ contract: 0, spot: 0, new: 0 })));
    grid.get(key)[col][r.status] += r.loads;
  }
  if (!grid.size) return `<p class="empty">No trucks planned yet. Send a request to fill this in.</p>`;
  const cols = anyLater ? 5 : 4;
  const totals = Array.from({ length: 5 }, () => ({ contract: 0, spot: 0, new: 0 }));
  const all = (c) => c.contract + c.spot + c.new;
  const chips = (c) => all(c)
    ? ["contract", "spot", "new"].filter((k) => c[k]).map((k) => `<span class="b b-${k}">${c[k]}</span>`).join("")
    : "·";
  let anyOver = false;
  const body = [...grid.entries()]
    .sort((a, b) => b[1].reduce((n, c) => n + all(c), 0) - a[1].reduce((n, c) => n + all(c), 0))
    .map(([key, weeks]) => {
      const [kind, dest] = key.split("|");
      const lane = baseLane(kind, dest);
      const cells = weeks.slice(0, cols).map((c, i) => {
        ["contract", "spot", "new"].forEach((k) => (totals[i][k] += c[k]));
        const over = i < 4 && lane && c.contract + c.new > lane.contract_per_week;
        if (over) anyOver = true;
        return `<td class="${over ? "over" : ""}">${chips(c)}${over ? `<span class="warn" title="More than the contract carrier usually takes">⚠</span>` : ""}</td>`;
      }).join("");
      return `<tr><th scope="row">Findlay → ${esc(dest)} <span class="kind">${kind === "order" ? "Customer" : "Transfer"} · contract takes ~${lane ? lane.contract_per_week : "?"}/week</span></th>${cells}</tr>`;
    })
    .join("");
  return `<p class="legend"><span class="b b-contract">n</span> on contract <span class="b b-spot">n</span> on spot <span class="b b-new">n</span> waiting on Logistics</p>
  <div class="table-wrap"><table class="outlook">
    <thead><tr><th>Lane</th>${[0, 1, 2, 3].map((i) => `<th>${weekLabel(i)}</th>`).join("")}${anyLater ? "<th>Later</th>" : ""}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th>Total trucks</th>${totals.slice(0, cols).map((c) => `<td>${chips(c)}</td>`).join("")}</tr></tfoot>
  </table></div>
  ${anyOver ? `<p class="small"><span class="warn">⚠</span> More trucks than that lane's contract carrier usually takes in a week. The extra ones will probably need spot trucks unless Logistics lines up more contract capacity.</p>` : ""}`;
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
  const form = { destination: lanes[0].destination, loads: 10, shipDate: addDays(today(), 2), flex: "inside" };
  const notice = () => daysBetween(today(), form.shipDate);

  const html = `<section class="panel">
      <p class="eyebrow">${t.name}</p>
      <h1>${t.ask}</h1>
      <p class="lede">Pick where, how many and the ship date. The price tag shows what Ball keeps after trucking. Then send it to the hub.</p>
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

  function paint() {
    const lane = laneFor(t.kind, form.destination);
    $("#loads").textContent = form.loads;
    document.querySelectorAll("#flex button").forEach((b) => b.classList.toggle("on", b.dataset.flex === form.flex));
    if (!form.shipDate || form.shipDate < today()) form.shipDate = today();
    $("#ship").value = form.shipDate;
    const n = notice();
    $("#notice-line").innerHTML = `${fmtDate(form.shipDate)} · <strong>${noticeText(n)}</strong>${n < SHORT_NOTICE_DAYS ? " (short notice)" : ""}`;
    $("#tag").innerHTML = priceTag(lane, n, form.loads, team);
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
    const lane = laneFor(t.kind, form.destination);
    const row = {
      team, kind: t.kind, destination: form.destination, loads: form.loads,
      ship_date: form.shipDate, notice_days: notice(),
      flex: team === "sales" ? form.flex : null, ...priceFields(lane, notice()),
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
    const lane = r && laneFor(r.kind, r.destination);
    if (!lane) return;
    btn.disabled = true;
    try {
      const date = addDays(today(), SHORT_NOTICE_DAYS);
      await store.update(r.id, { ship_date: date, notice_days: SHORT_NOTICE_DAYS, ...priceFields(lane, SHORT_NOTICE_DAYS) });
      toast(`Moved to ${fmtDate(date)}.`);
      state.refresh();
    } catch (err) {
      toast("Couldn't update: " + err.message, true);
      btn.disabled = false;
    }
  }

  function live(rows) {
    paint();
    const mine = rows.filter((r) => r.team === team);
    $("#mine").innerHTML = mine.length
      ? mine.map((r) => {
          const lane = laneFor(r.kind, r.destination);
          let action = "";
          if (lane && noticeOf(r) < SHORT_NOTICE_DAYS && r.status === "new") {
            const save = (price(lane, SHORT_NOTICE_DAYS).profit_per_truck - price(lane, noticeOf(r)).profit_per_truck) * r.loads;
            if (save > 0) action = `<div class="card-actions"><button type="button" class="util" data-move="${esc(r.id)}">Move to ${fmtDate(addDays(today(), SHORT_NOTICE_DAYS))} · save ${money(save)}</button></div>`;
          }
          return card(r, action);
        }).join("")
      : `<p class="empty">Nothing sent yet.</p>`;
  }

  return { html, mount, live };
}

function logisticsView(store, state) {
  const html = `<section class="panel">
      <p class="eyebrow">Logistics</p>
      <h1>Book the trucks</h1>
      <p class="lede">Every team's requests land here. Book a contract truck (cheaper, set in advance) when you can. Mark "Needs spot" when you have to buy a last-minute truck. <a href="?role=how">How it works</a></p>
      <a class="guide-link" href="#quote"><strong>Got a spot quote?</strong> Enter it so every team sees the real price ↓</a>
      <div id="incoming" class="cards"></div>
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

  function mount() {
    $("#q-lane").addEventListener("change", fillQuote);
    $("#q-save").addEventListener("click", () => saveQuote(false));
    $("#q-clear").addEventListener("click", () => saveQuote(true));
    fillQuote();
    $("#app").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-status]");
      if (!b) return;
      const r = state.rows.find((x) => String(x.id) === b.dataset.id);
      const lane = r && laneFor(r.kind, r.destination);
      if (!lane) return;
      b.disabled = true;
      try {
        await store.update(r.id, { status: b.dataset.status, ...finalFields(lane, b.dataset.status) });
        if (b.dataset.status === "contract") {
          const { room } = contractRoom(lane, weekIndex(r), state.rows, r.id);
          if (r.loads > room) toast(`Heads up: only ${room} contract trucks were open that week. The carrier may turn some down.`, true);
        }
        state.refresh();
      } catch (err) {
        toast("Couldn't update: " + err.message, true);
        b.disabled = false;
      }
    });
  }

  function roomLine(r, rows) {
    const lane = laneFor(r.kind, r.destination);
    const w = weekIndex(r);
    if (!lane || w < 0) return "";
    const { cap, booked, room } = contractRoom(lane, w, rows, r.id);
    if (r.status === "spot") return "";
    if (r.status === "contract") {
      const total = booked + r.loads;
      return `<p class="room">Contract on this lane: ~${cap} trucks a week. Week of ${weekLabel(w)}: <strong>${total} of ~${cap} booked</strong>.${total > cap
        ? ` <span class="warn">⚠ ${total - cap} over</span>: the carrier may turn some down.` : ""}</p>`;
    }
    const short = r.loads > room
      ? ` This request needs ${r.loads}, so about <strong>${r.loads - room} would likely need spot</strong>.` : "";
    return `<p class="room">Contract on this lane: ~${cap} trucks a week. Week of ${weekLabel(w)}: ${booked} booked, <strong>${room} open</strong>.${short}</p>`;
  }

  function live(rows) {
    paintHint();
    const order = { new: 0, spot: 1, contract: 2 };
    const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);
    $("#incoming").innerHTML = sorted.length
      ? sorted.map((r) => card(r, `${roomLine(r, rows)}<div class="card-actions">
          <button type="button" class="util${r.status === "contract" ? " on" : ""}" data-status="contract" data-id="${esc(r.id)}">Book contract</button>
          <button type="button" class="util${r.status === "spot" ? " on" : ""}" data-status="spot" data-id="${esc(r.id)}">Needs spot</button>
        </div>`)).join("")
      : `<p class="empty">No requests yet. They'll appear here the moment another team sends one.</p>`;
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
      <div class="hub-grid">
        <div><h2>Requests</h2><div id="feed" class="cards"></div></div>
        <div><h2>Truck schedule: next 4 weeks</h2><div id="outlook"></div>
          <p class="small">The same numbers become the 4-week outlook we give carriers.</p>
          <details class="contracts-box"><summary>Our contracts by lane</summary><div id="contracts"></div></details></div>
      </div>
      <button type="button" id="reset" class="util quiet">New round</button>
    </section>`;

  function mount() {
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
    let profit = 0, extra = 0;
    const trucks = { contract: 0, spot: 0, new: 0 };
    for (const r of rows) {
      profit += r.profit_per_truck * r.loads;
      extra += r.extra_cost * r.loads;
      trucks[r.status] += r.loads;
    }
    const tile = (label, value, sub = "", cls = "") => `<div class="stat ${cls}"><p class="stat-label">${label}</p><p class="stat-value">${value}</p>${sub ? `<p class="stat-sub">${sub}</p>` : ""}</div>`;
    $("#totals").innerHTML =
      tile("Trucks booked on contract", trucks.contract, "", "stat-contract") +
      tile("Trucks on spot", trucks.spot, "", "stat-spot") +
      tile("Trucks waiting on Logistics", trucks.new, "", "stat-new") +
      tile("Profit left after trucking", money(profit), `after ${money(extra)} extra trucking`);
    $("#contracts").innerHTML = contractsTable();
    $("#feed").innerHTML = rows.length ? rows.map((r) => card(r)).join("") : `<p class="empty">Waiting for the first request…</p>`;
    $("#outlook").innerHTML = scheduleTable(rows);
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
  const lane = baseLane("transfer", "Mississauga, ON");
  const loads = 10;
  const now = price(lane, 3);
  const later = price(lane, SHORT_NOTICE_DAYS);
  const save = (later.profit_per_truck - now.profit_per_truck) * loads;
  const tag = (p) => `<span class="mini mini-${p.color}">${money(p.profit_per_truck)} · ${p.color[0].toUpperCase() + p.color.slice(1)}</span>`;
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
        <div class="box box-mint"><h3>Contract truck</h3><p>Booked ahead with a carrier at a set price. Cheaper, but each lane's carrier only takes about so many trucks a week.</p></div>
        <div class="box box-red"><h3>Spot truck</h3><p>Found at the last minute at market price. Costs more.</p></div>
      </div>

      <h2>The price tag</h2>
      <div class="formula">
        <div><strong>$3,100</strong><span>what one truckload of cans earns Ball</span></div>
        <div class="op">−</div>
        <div><strong>Extra trucking</strong><span>the trucking this decision adds</span></div>
        <div class="op">=</div>
        <div><strong>Profit per truck</strong><span>what Ball keeps</span></div>
      </div>
      <p class="note">$3,100 is an average: Ball's 2025 can profit in North America divided by the truckloads it ships.</p>

      <h2 id="example">One example, step by step</h2>
      <p>Inventory Planning wants to move ${loads} truckloads of cans from Findlay to ${esc(lane.destination)}.</p>
      <ol class="steps">
        <li><strong>A truck to move the cans</strong> costs ${money(lane.contract_cost)} on a contract truck.</li>
        <li><strong>Shipping in 3 days?</strong> Under a week's notice is too late to book a contract truck, so we count a spot truck: <strong>+${money(lane.spot_premium)}</strong>.<br>
          ${money(PROFIT_PER_TRUCK)} − ${money(now.extra_cost)} = ${tag(now)}</li>
        <li><strong>Shipping a week or more out?</strong> Only ${pct(lane.spot_share)} of trucks on this lane end up spot, so the risk is ${pct(lane.spot_share)} × ${money(lane.spot_premium)} = <strong>+${money(later.spot_risk)}</strong>.<br>
          ${money(PROFIT_PER_TRUCK)} − ${money(later.extra_cost)} = ${tag(later)}</li>
        <li><strong>Planning a week ahead saves ${money(save)}</strong> on ${loads} loads. The app shows this before anyone decides.</li>
      </ol>

      <h2>What the colors mean</h2>
      <ul class="colors">
        <li><span class="mini mini-green">$2,000+</span> Go: good business.</li>
        <li><span class="mini mini-yellow">$1,000–$1,999</span> Talk to Logistics first.</li>
        <li><span class="mini mini-red">Under $1,000</span> Rethink: change the timing or the place.</li>
      </ul>
      <p class="note">The cutoffs are examples. Ball's finance team would set the real ones.</p>

      <h2>Who does what</h2>
      <table class="who"><tbody>
        <tr><th>Sales</th><td>Checks the price before saying yes to extra customer loads.</td></tr>
        <tr><th>Production</th><td>Checks the price before an extra run that has to be trucked to a warehouse.</td></tr>
        <tr><th>Inventory Planning</th><td>Checks the price before moving cans between sites.</td></tr>
        <tr><th>Logistics</th><td>Sees every request early, books contract trucks while there's room on the contract, and types in real spot quotes so every price tag is current.</td></tr>
        <tr><th>Live Hub</th><td>Everyone sees the same requests and totals as they happen.</td></tr>
        <tr><th>Carriers</th><td>Get a 4-week look ahead so they can hold trucks for Ball.</td></tr>
      </tbody></table>

      <details class="source"><summary>Where the numbers come from</summary>
        <p>Ball's case workbook (Detail sheet), Findlay plant, January–July 2026, with short yard moves (shuttles) left out.
        "Trucks that go spot" is the share of a lane's loads that went on spot trucks. The spot price starts at the lane's 2026 average. When Logistics gets a real quote from a spot carrier, they type it in and every team's price tag uses it instead.
        "Contract trucks a week" is how many loads contract carriers actually took on that lane in 2026, divided by 30 weeks. Ball's real carrier contracts would replace it.
        A price tag is an estimate until Logistics books the truck. Then it shows the final cost: no spot truck if booked on contract, a spot truck at today's price if not.
        Less than 7 days' notice counts as a spot truck because the data is monthly and can't show how much notice each load had. That's an assumption.</p>
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
