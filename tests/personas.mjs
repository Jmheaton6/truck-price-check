// Persona test bot: plays a customer and each Ball department like a person would.
// It only uses what's visible on screen (button words, labels, headings), counts clicks, and grades every
// screen for simplicity. Writes tests/persona-report.md and screenshots to tests/persona-shots/.
//
// Run:  python3 -m http.server 8765   (in this folder, one terminal)
//       node tests/personas.mjs [baseUrl]        (default http://localhost:8765/, backup mode, Nov 5)
import { chromium } from "/Users/jmheaton6/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || "http://localhost:8765/";
const Q = "&local&today=2026-11-05";
const SHOTS = join(HERE, "persona-shots");
const LIMITS = { words: 120, sentence: 14, clicks: 5 };
const JARGON = ["allocate", "allocation", "tender", "pta", "capacity", "pattern", "override", "simulated", "sku", "lane", "flex", "band", "baseline", "utilization", "fixable", "toBook", "undefined", "NaN", "null"];

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const report = [];      // { persona, goal, steps[], screens[], issues[], done }
let P = null;           // current persona
let shotN = 0;
const pause = (ms = 350) => page.waitForTimeout(ms);

function persona(name, role, goal) {
  P = { name, role, goal, steps: [], screens: [], issues: [], clicks: 0, done: false };
  report.push(P);
}
const issue = (msg) => { if (!P.issues.includes(msg)) P.issues.push(msg); };
const step = (msg) => P.steps.push(msg);

// Look at the screen like a person: what's visible, how many words, is the next move obvious?
async function look(label) {
  await pause(250);
  const file = `${String(++shotN).padStart(2, "0")}-${P.role}-${label.replace(/\W+/g, "-").toLowerCase()}.png`;
  await page.screenshot({ path: join(SHOTS, file) });
  const s = await page.evaluate(({ jargon }) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const text = document.body.innerText;
    const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    const blocks = [...document.querySelectorAll("p, li, label span, h1, h2, td, th, button, a")].filter(vis)
      .map((el) => el.innerText.trim()).filter(Boolean);
    const longest = blocks.reduce((m, b) => (b.split(/\s+/).length > m.split(/\s+/).length ? b : m), "");
    const inputs = [...document.querySelectorAll("input, select")].filter(vis);
    const unlabeled = inputs.filter((i) => !i.closest("label") && !i.getAttribute("aria-label")).length;
    const ctas = [...document.querySelectorAll(".cta, .util.on")].filter(vis);
    const ctaAbove = ctas.some((b) => b.getBoundingClientRect().bottom <= innerHeight);
    const hits = jargon.filter((j) => new RegExp(`\\b${j}\\b`, "i").test(text));
    return { words: words.length, longest, longestN: longest.split(/\s+/).length, unlabeled, ctas: ctas.length, ctaAbove, hits, h1: document.querySelector("h1")?.innerText || "" };
  }, { jargon: JARGON });
  P.screens.push({ label, file, ...s });
  if (s.words > LIMITS.words) issue(`"${label}": ${s.words} words on screen (aim ≤ ${LIMITS.words}).`);
  if (s.longestN > LIMITS.sentence) issue(`"${label}": a ${s.longestN}-word line: "${s.longest.slice(0, 90)}…"`);
  if (s.unlabeled) issue(`"${label}": ${s.unlabeled} input(s) without a label.`);
  if (s.hits.length) issue(`"${label}": jargon a ${P.name.split(" ")[0]} may not know: ${s.hits.join(", ")}.`);
  return s;
}

// Act like a person: find by visible words. Count every click. Note when it's below the fold.
async function click(name, opts = {}) {
  // A person clicks whatever control shows these words: a button, a link, or a choice.
  let loc = null;
  for (const role of opts.role === "link" ? ["link"] : ["button", "radio", "link"]) {
    const l = page.getByRole(role, { name, exact: opts.exact });
    for (let i = 0; i < (await l.count()); i++) if (await l.nth(i).isVisible()) { loc = l.nth(i); break; }
    if (loc) break;
  }
  if (!loc) { issue(`Couldn't find "${name}" on the screen.`); throw new Error(`no "${name}"`); }
  const box = await loc.boundingBox();
  if (box && box.y + box.height > 900 && !opts.scrollOk) issue(`Had to scroll to find "${name}".`);
  await loc.click();
  P.clicks++;
  step(`Clicked "${name}"`);
  await pause();
}
async function fill(label, value) {
  const loc = page.getByLabel(label, { exact: false }).first();
  if (!(await loc.count())) { issue(`No field labeled "${label}".`); throw new Error(`no field ${label}`); }
  await loc.fill(String(value));
  await loc.dispatchEvent(label.match(/deliver|start|ship on|ready on/i) ? "change" : "input");
  step(`Typed ${value} in "${label}"`);
  await pause(200);
}
async function pick(label, value) {
  await page.getByLabel(label, { exact: true }).first().selectOption({ label: value });
  P.clicks++;
  step(`Picked "${value}" in "${label}"`);
  await pause();
}
async function sees(text, what) {
  const all = page.getByText(text, { exact: false });
  let ok = false;
  for (let i = 0; i < (await all.count()) && !ok; i++) ok = await all.nth(i).isVisible().catch(() => false);
  if (!ok) issue(`Expected to see ${what || `"${text}"`}, but didn't.`);
  else step(`Saw ${what || `"${text}"`}`);
  return ok;
}
const toastText = async () => (await page.locator("[role=status]").last().textContent().catch(() => "")) || "";
const go = async (q) => { await page.goto(BASE + q); await pause(500); };
async function task(fn) {
  const before = P.clicks;
  try { await fn(); P.done = true; } catch (e) { P.done = false; step(`STUCK: ${e.message}`); }
  if (P.clicks - before > LIMITS.clicks + 4) issue(`Took ${P.clicks - before} clicks.`);
}
// Ball HQ: pick my department from the header, like a person would.
const iAm = async (dept) => {
  // Ball HQ: open my department's hub from the top bar, like a person would.
  const l = page.locator("#nav a", { hasText: dept }).first();
  if (!(await l.count())) { issue(`No "${dept}" hub in the top bar.`); throw new Error(`no hub ${dept}`); }
  await l.click(); P.clicks++; step(`Opened the ${dept} hub`); await pause(500);
};

// ---------------- The day ----------------
await go("?" + Q.slice(1));
await page.evaluate(() => localStorage.clear());
const hub = async (name, tab) => { await iAm(name); if (tab) { await click(tab, { role: "link" }); } };
const answer = async (dept) => { await go("?role=orders" + Q); await iAm(dept); const bad = await page.locator(".d-mine .d-check.bad").count(); await click(bad ? "Deny" : "Accept", { exact: true }); };

persona("Pat (customer, Coca-Cola buyer)", "forecast", "Our Nov 29 week has a promo: tell Ball it'll be 1.4 million cans.");
await task(async () => {
  await look("home");
  await click("Customer HQ", { role: "link" });
  await look("customer start");
  await fill("week of Nov 29", 1.4);
  await click("Share forecast");
  if (!/shared/i.test(await toastText())) issue("No sign the forecast went to Ball.");
});

persona("Pia (Planning, short-term forecasting)", "planning", "See what's coming, and send Logistics a prebuild: 12 truckloads to the Findlay warehouse, ready Nov 9.");
await task(async () => {
  await go("?role=exec" + Q);
  await hub("Planning", "Short-term");
  await look("short-term forecast");
  await sees("+2", "Coca-Cola's promo week flagged");
  await pick("Warehouse", "Findlay, OH");
  await fill("Truckloads", 12);
  await fill("Ready on", "2026-11-09");
  await click("Send to Logistics");
  if (!/sent to logistics/i.test(await toastText())) issue("No sign the prebuild reached Logistics.");
});

persona("Lee (Logistics)", "warning", "Coca-Cola's promo week needs more trucks than our carriers hold. Line them up now.");
await task(async () => {
  await go("?role=exec" + Q);
  await hub("Logistics", "Lanes");
  await look("early warning");
  await sees("Early warning");
  await sees("7 trucks", "the promo week's trucks vs the room");
  await click("Line up 2 more", { exact: true });
  if (!/lined up/i.test(await toastText())) issue("No sign the extra trucks were lined up.");
});

persona("Lee (Logistics)", "transfers", "Schedule the prebuild so it doesn't go spot.");
await task(async () => {
  await go("?role=exec" + Q);
  await hub("Logistics", "Transfers");
  await look("prebuild to schedule");
  await sees("One batch"); await sees("Paced waves");
  await sees("spot", "what one batch would cost");
  await click("Schedule", { exact: true });
  if (!/12 on contract/i.test(await toastText())) issue("Paced schedule didn't keep all 12 on contract.");
});

persona("Pat (customer, Coca-Cola buyer)", "customer", "Order 0.6 million cans for Thu Nov 19, then see where it stands.");
await task(async () => {
  await go("?role=customer" + Q);
  await sees("Priority", "that we're a Priority customer");
  await fill("Million cans", 0.6);
  await sees("3 truckloads", "the cans turned into truckloads");
  await fill("Deliver on", "2026-11-19");
  await click("Send order");
  if (!/sent/i.test(await toastText())) issue("No clear 'sent' message after sending the order.");
  await click("My POs", { role: "link" });
  await sees("Checking", "the order status");
  await look("order sent");
});

for (const [dept, who] of [["Sales", "Sam"], ["Inventory", "Ivy"], ["Planning", "Pia"], ["Logistics", "Lee"]]) {
  persona(`${who} (${dept})`, dept.toLowerCase(), "Find the new order, read my check, answer it.");
  await task(async () => {
    await go("?role=orders" + Q);
    await iAm(dept);
    await look(`${dept} check`);
    if (dept === "Sales") await sees("profit / truck", "the price tag");
    if (dept === "Logistics") await sees("Dedicated", "which carriers take it");
    await click("Accept", { exact: true });
  });
}
persona("Lee (Logistics)", "book", "Contact the carriers for the accepted order, then record their yes.");
await task(async () => {
  await click("Contact carriers", { role: "link" });
  await look("lanes");
  await sees("Contact carriers", "a list of carriers to contact");
  await click("Contact", { exact: true });
  if (!/contacted/i.test(await toastText())) issue("No confirmation after contacting carriers.");
  await sees("Waiting on carrier", "what's waiting on a carrier's answer");
  await click("Said yes", { exact: true });
  if (!/confirmed/i.test(await toastText())) issue("No confirmation after the carrier said yes.");
});

persona("Pat (customer, Coca-Cola buyer)", "change", "The promo grew: change the Nov 19 order to 1 million cans.");
await task(async () => {
  await go("?role=customer" + Q);
  await click("My POs", { role: "link" });
  await click("Change");
  await fill("Million cans", 1);
  await sees("+2", "the change in truckloads");
  await click("Send change");
});
for (const [dept, who] of [["Sales", "Sam"], ["Inventory", "Ivy"], ["Planning", "Pia"]]) {
  persona(`${who} (${dept})`, `${dept.toLowerCase()}2`, "A change came in. Read my check and answer.");
  await task(async () => { await answer(dept); });
}
persona("Lee (Logistics)", "counter", "The change doesn't fit the routing guide. Don't go spot: offer the customer another date.");
await task(async () => {
  await go("?role=orders" + Q);
  await iAm("Logistics");
  await look("no carrier has room");
  await sees("No carrier has room", "why it doesn't fit");
  const co = page.getByRole("button", { name: /^Counteroffer/ });
  if (!(await co.count())) { issue("No counteroffer button."); throw new Error("no counteroffer"); }
  await click((await co.first().textContent()).trim());
  if (!/counteroffer sent/i.test(await toastText())) issue("No sign the counteroffer went out.");
});
persona("Pat (customer, Coca-Cola buyer)", "take", "Ball offered a new date. Take it.");
await task(async () => {
  await go("?role=customer" + Q);
  await click("My POs", { role: "link" });
  await look("counteroffer");
  await sees("Ball can do", "Ball's new date");
  const take = page.getByRole("button", { name: /^Take / });
  if (!(await take.count())) { issue("No way to take the new date."); throw new Error("no take"); }
  await click((await take.first().textContent()).trim());
  await sees("Accepted", "the change accepted");
});

// ---------- Harder days ----------
persona("Cy (customer, AB InBev buyer)", "edge-keep", "Order 0.4 million cans for Wed Nov 18 and keep that date even if it costs more.");
await task(async () => {
  await go("?role=customer" + Q);
  await pick("Company", "AB InBev");
  await fill("Million cans", 0.4);
  await fill("Deliver on", "2026-11-18");
  await click("Send order");
});
for (const dept of ["Sales", "Inventory", "Planning"]) {
  persona(`${dept} team`, `edge-keep-${dept.toLowerCase()}`, "Answer AB InBev's order.");
  await task(async () => { await answer(dept); });
}
persona("Lee (Logistics)", "edge-spot", "AB InBev's lane has one carrier taking 1 a week. Offer the customer spot.");
await task(async () => {
  await go("?role=orders" + Q);
  await iAm("Logistics");
  await look("one-carrier lane");
  await click("Offer spot to customer");
});
persona("Cy (customer, AB InBev buyer)", "edge-keep2", "Keep my date and pay the fee.");
await task(async () => {
  await go("?role=customer" + Q);
  await click("My POs", { role: "link" });
  const keep = page.getByRole("button", { name: /^Keep / });
  if (!(await keep.count())) { issue("No way to keep my date."); throw new Error("no keep"); }
  await click((await keep.first().textContent()).trim());
  await sees("Expedite fee", "the fee on my PO");
  await look("kept date");
});
persona("Bo (customer, PepsiCo buyer)", "edge-late", "Rush: order 0.4 million cans for Sat Nov 7 (2 days out).");
await task(async () => {
  await go("?role=customer" + Q);
  await pick("Company", "PepsiCo");
  await fill("Million cans", 0.4);
  await fill("Deliver on", "2026-11-07");
  await click("Send order");
});
persona("Sam (Sales)", "edge-sales", "Deny the rush order, then change my mind and accept it.");
await task(async () => {
  await go("?role=orders" + Q);
  await iAm("Sales");
  await look("rush order");
  await sees("Only 2 days out", "why the rush is a problem");
  await click("Deny", { exact: true });
  await click("All", { exact: true });
  await sees("Denied", "the order now shows denied");
  await click("Accept", { exact: true });
  await sees("1/4 accepted", "the order back in play");
});
persona("Ivy (Inventory)", "edge-stock", "Check how many labeled cans each customer has left.");
await task(async () => {
  await go("?role=exec" + Q);
  await hub("Inventory", "Stock");
  await look("stock");
  await sees("Coca-Cola");
});
persona("Pia (Planning)", "edge-line", "Check line time and the yearly baseline.");
await task(async () => {
  await go("?role=exec" + Q);
  await hub("Planning", "Line time");
  await look("line time");
  await click("Long-term", { role: "link", exact: true });
  await look("long-term");
  await sees("2026 plan", "this year's plan");
});
persona("Sam (Sales)", "edge-perm", "Try to contact carriers even though I'm in Sales.");
await task(async () => {
  await go("?role=calendar" + Q);
  await iAm("Sales");
  if (await page.locator("#subnav a", { hasText: "Lanes" }).count()) issue("The Sales hub has a Lanes tab.");
  if (await page.getByRole("button", { name: /^(Contact|Said yes|Carrier said yes)/ }).count()) issue("Sales can see carrier buttons.");
});

persona("Erin (Executive)", "exec", "Check the three shared numbers, each team and its guardrail, the watch list, and what the pilot saved.");
await task(async () => {
  await go("?role=exec" + Q);
  await iAm("Executive");
  await look("executive");
  for (const t of ["On-time delivery", "Change requests resolved", "Cost to serve", "Sales", "Inventory", "Planning", "Logistics", "Early warning", "Monticello pilot"]) await sees(t);
  const saved = (await page.locator(".x-box").last().innerText()).match(/saved (\$[\d,]+)/)?.[1] || "$0";
  step(`Pilot saved ${saved}`);
  if (saved === "$0") issue("Pilot shows $0 saved after a paced prebuild.");
});

const finalData = await page.evaluate(() => JSON.parse(localStorage.getItem("bc_items_v4") || "[]"));
if (errors.length) report.push({ name: "Browser errors", role: "errors", goal: "", steps: errors, screens: [], issues: errors.map((e) => "JS error: " + e), clicks: 0, done: false });
await browser.close();

// ---------------- Report ----------------
const lines = ["# Persona test report", "", `Run: ${new Date().toLocaleString()} · ${BASE} · backup mode, today = Thu Nov 5`, "",
  "| Persona | Task | Done | Clicks | Issues |", "|---|---|---|---|---|",
  ...report.map((p) => `| ${p.name} | ${p.goal} | ${p.done ? "yes" : "**no**"} | ${p.clicks} | ${p.issues.length} |`), ""];
for (const p of report) {
  lines.push(`## ${p.name}`, `*${p.goal}*`, "");
  if (p.issues.length) lines.push("**Friction:**", ...p.issues.map((i) => `- ${i}`), "");
  lines.push("**What I did:**", ...p.steps.map((s) => `- ${s}`), "");
  if (p.screens.length) lines.push("**Screens:**", ...p.screens.map((s) => `- ${s.label}: ${s.words} words, longest line ${s.longestN} words, main button ${s.ctaAbove ? "visible" : s.ctas ? "below the fold" : "none"} · \`${s.file}\``), "");
}
lines.push("## Final data", "| # | Type | Status | What | Date | Booked days |", "|---|---|---|---|---|---|",
  ...finalData.map((r, i) => `| ${i + 1} | ${r.type}${r.data.kind ? " " + r.data.kind : ""} | ${r.status} | ${r.data.customer || r.data.destination || ""} ${r.data.trucks ?? ""}${r.data.parent ? ` (of #${finalData.findIndex((x) => String(x.id) === String(r.data.parent)) + 1})` : ""} | ${r.data.date || ""} | ${Object.keys(r.data.booked || {}).length} |`));
writeFileSync(join(HERE, "persona-report.md"), lines.join("\n"));
const total = report.reduce((s, p) => s + p.issues.length, 0);
console.log(report.map((p) => `${p.done ? "✓" : "✗"} ${p.name.padEnd(36)} clicks ${String(p.clicks).padStart(2)}  issues ${p.issues.length}`).join("\n"));
console.log(`\n${total} issues · report: tests/persona-report.md`);
