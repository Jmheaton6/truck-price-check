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
const LIMITS = { words: 120, sentence: 14, clicks: 4 };
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
  await loc.dispatchEvent(label.match(/deliver|start/i) ? "change" : "input");
  step(`Typed ${value} in "${label}"`);
  await pause(200);
}
async function pick(label, value) {
  await page.getByLabel(label).first().selectOption({ label: value });
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
const iAm = (dept) => pick("Department", dept);

// ---------------- The day ----------------
await go("?" + Q.slice(1));
await page.evaluate(() => localStorage.clear());

persona("Pat (customer, Customer A buyer)", "customer", "Order 2 million cans for Thu Nov 19, then see if Ball accepted.");
await task(async () => {
  await go("?" + Q.slice(1));
  await look("home");
  await click("Customer HQ", { role: "link" });
  await look("customer start");
  await fill("Million cans", 2);
  await sees("10 truckloads", "the cans turned into truckloads");
  await fill("Deliver on", "2026-11-19");
  await click("Send order");
  if (!/sent/i.test(await toastText())) issue("No clear 'sent' message after sending the order.");
  await sees("Checking", "the order status");
  await look("order sent");
});

for (const [dept, who] of [["Sales", "Sam"], ["Inventory", "Ivy"], ["Production", "Paolo"]]) {
  persona(`${who} (${dept})`, dept.toLowerCase(), "Find the new order waiting on me, read my check, and answer it.");
  await task(async () => {
    await go("?role=orders" + Q);
    await iAm(dept);
    await look(`${dept} queue`);
    await sees("Customer A", "the waiting order");
    await click("Accept", { exact: true });
    if (!/accept/i.test(await toastText())) issue("No confirmation after Accept.");
    await sees("Nothing waiting on you", "an empty queue after answering");
  });
}

persona("Lee (Logistics)", "logistics", "Accept the order, then book its trucks on the calendar, then plan 12 truckloads to Mississauga.");
await task(async () => {
  await go("?role=orders" + Q);
  await iAm("Logistics");
  await click("Accept", { exact: true });
  if (!/all four/i.test(await toastText())) issue("After the 4th accept, no message that the order went through.");
  await look("order accepted");
  await click("Book trucks", { role: "link" });
  await look("calendar");
  await sees("To book", "a list of what to book");
  await click("Book", { exact: true });            // the order I just accepted is in "To book"
  if (!/booked/i.test(await toastText())) issue("No confirmation after booking.");
  await click("Transfers", { role: "link" });
  await look("transfers");
  await fill("Truckloads", 12);
  await click("Over 3 weeks");
  await sees("12 contract", "the best option keeps all 12 on contract");
  await click("Put on calendar");
  await look("transfer planned");
});
await task(async () => {
  await click("Trucks", { role: "link" });
  await look("calendar with transfer");
  const all = page.getByRole("button", { name: /^Book all/ });
  if (await all.count()) { await click((await all.first().textContent()).trim()); if (!/booked/i.test(await toastText())) issue("No confirmation after Book all."); }
  else if (await page.getByRole("button", { name: "Book", exact: true }).count()) { await click("Book", { exact: true }); if (!/booked/i.test(await toastText())) issue("No confirmation after Book."); }
  else issue("Nothing to book, but the transfer wasn't booked.");
  await look("after book all");
});

persona("Pat (customer, Customer A buyer)", "customer2", "Promo got bigger: change the order to 2.8 million cans.");
await task(async () => {
  await go("?role=customer" + Q);
  await click("Change");
  await look("change form");
  await fill("Million cans", 2.8);
  await sees("+4", "the change in truckloads");
  await click("Send change");
});

for (const [dept, who] of [["Sales", "Sam"], ["Production", "Paolo"]]) {
  persona(`${who} (${dept})`, `${dept.toLowerCase()}2`, "A change came in. Read my check and answer honestly.");
  await task(async () => {
    await go("?role=orders" + Q);
    await iAm(dept);
    await look(`${dept} change`);
    if (await page.getByText("Nothing waiting on you").isVisible().catch(() => false)) { step("Nothing waiting on me: another department already denied it"); return; }
    const bad = await page.locator(".d-mine .d-check.bad").count();
    if (bad) { step("My check shows a problem, so I deny it"); await click("Deny", { exact: true }); }
    else await click("Accept", { exact: true });
  });
}

persona("Pat (customer, Customer A buyer)", "customer3", "See what happened to my change, and take Ball's other date.");
await task(async () => {
  await go("?role=customer" + Q);
  await look("change denied");
  await sees("Denied", "that the change was denied");
  const tryBtn = page.getByRole("button", { name: /^Try / }).first();
  if (await tryBtn.count()) { const name = (await tryBtn.textContent()).trim(); await click(name); }
  else issue("Denied with no other date to try.");
  await look("retry sent");
});

for (const [dept, who] of [["Sales", "Sam"], ["Inventory", "Ivy"], ["Production", "Paolo"], ["Logistics", "Lee"]]) {
  persona(`${who} (${dept})`, `${dept.toLowerCase()}3`, "Answer the customer's new date.");
  await task(async () => {
    await go("?role=orders" + Q);
    await iAm(dept);
    if (await page.getByText("Nothing waiting on you").isVisible().catch(() => false)) { step("Nothing waiting on me"); return; }
    const bad = await page.locator(".d-mine .d-check.bad").count();
    await click(bad ? "Deny" : "Accept", { exact: true });
  });
}

persona("Bo (customer, Customer B buyer)", "customer4", "Order 1.2 million cans for Wed Nov 25.");
await task(async () => {
  await go("?role=customer" + Q);
  await pick("Company", "Customer B");
  await fill("Million cans", 1.2);
  await fill("Deliver on", "2026-11-25");
  await click("Send order");
});
for (const [dept, who] of [["Sales", "Sam"], ["Inventory", "Ivy"], ["Production", "Paolo"]]) {
  persona(`${who} (${dept})`, `${dept.toLowerCase()}4`, "Answer the new order.");
  await task(async () => {
    await go("?role=orders" + Q);
    await iAm(dept);
    const bad = await page.locator(".d-mine .d-check.bad").count();
    await click(bad ? "Deny" : "Accept", { exact: true });
  });
}
persona("Lee (Logistics)", "logistics4", "This order would need a spot truck. Avoid spot before I accept.");
await task(async () => {
  await go("?role=orders" + Q);
  await iAm("Logistics");
  await look("order needing spot");
  await sees("spot", "that a truck would go spot");
  const ask = page.getByRole("button", { name: /^Ask carrier/ });
  if (!(await ask.count())) { issue("Order would go spot, but no way to ask the carrier from here."); throw new Error("no ask"); }
  await click((await ask.first().textContent()).trim());
  if (!/yes/i.test(await toastText())) issue("Carrier didn't say yes with 20 days' notice.");
  await look("after asking carrier");
  if (await page.locator(".d-mine .d-check.bad").count()) issue("Still shows spot after the carrier said yes.");
  await click("Accept", { exact: true });
});

// ---------- Harder days ----------
persona("Cy (customer, Customer C buyer)", "edge-late", "Rush: order 0.4 million cans for Sat Nov 7 (2 days out).");
await task(async () => {
  await go("?role=customer" + Q);
  await pick("Company", "Customer C");
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
persona("Cy (customer, Customer C buyer)", "edge-late2", "Check my rush order.");
await task(async () => {
  await go("?role=customer" + Q);
  await look("rush status");
  await sees("Checking", "my rush order is being checked");
});
persona("Pat (customer, Customer A buyer)", "edge-cut", "Demand dropped: cut the booked Nov 19 order to 1.6 million cans.");
await task(async () => {
  await go("?role=customer" + Q);
  await pick("Company", "Customer A");
  const cards = page.locator(".card", { hasText: "Thu, Nov 19" });
  await cards.first().getByRole("button", { name: "Change" }).click(); P.clicks++; await pause();
  await fill("Million cans", 1.6);
  await sees("−2", "the cut in truckloads");
  await click("Send change");
});
for (const dept of ["Sales", "Inventory", "Production", "Logistics"]) {
  persona(`${dept} team`, `edge-cut-${dept.toLowerCase()}`, "Answer the cut.");
  await task(async () => {
    await go("?role=orders" + Q);
    await iAm(dept);
    await look(`cut ${dept}`);
    step(`Open order: ${(await page.locator("#o-detail .d-what").textContent().catch(() => "none")).trim()}`);
    if (await page.getByText("Nothing waiting on you").isVisible().catch(() => false)) { step("Nothing waiting on me"); return; }
    const bad = await page.locator(".d-mine .d-check.bad").count();
    await click(bad ? "Deny" : "Accept", { exact: true });
  });
}
persona("Lee (Logistics)", "edge-transfer", "Ship 10 to Adairsville all on Fri Nov 20, see the spot, and fix what I can.");
await task(async () => {
  await go("?role=transfers" + Q);
  await iAm("Logistics");
  await pick("To", "Adairsville, GA");
  await fill("Truckloads", 10);
  await fill("Start", "2026-11-20");
  await click("All on one day");
  await click("Put on calendar");
  await click("Trucks", { role: "link" });
  await look("calendar with spot");
  await click("Adairsville Transfer", { exact: false, scrollOk: true });   // its row in "To book"
  await look("spot day");
  const ask = page.getByRole("button", { name: /^Ask carrier/ });
  if (!(await ask.count())) issue("Red spot day with 15 days' notice, but no Ask carrier.");
  else { await click((await ask.first().textContent()).trim()); step(`Carrier said: ${await toastText()}`); }
  await look("after ask");
});
persona("Lee (Logistics)", "edge-remove", "Changed my mind: remove the Adairsville transfer.");
await task(async () => {
  await click("Transfers", { role: "link" });
  const before = await page.locator("#p-list li").count();
  await click("Remove", { exact: true });
  if ((await page.locator("#p-list li").count()) !== before - 1) issue("Remove didn't take the transfer off the list.");
});
persona("Sam (Sales)", "edge-perm", "Try to book trucks even though I'm in Sales.");
await task(async () => {
  await go("?role=calendar" + Q);
  await iAm("Sales");
  if (await page.getByRole("button", { name: /^Book/ }).count()) issue("Sales can see Book buttons.");
  await sees("Logistics books these", "who books trucks");
});

persona("Erin (Executive)", "exec", "See how each department is doing and what we saved vs. the spot we're still paying for.");
await task(async () => {
  await go("?role=exec" + Q);
  await iAm("Executive");
  const s = await look("executive");
  for (const t of ["Saved", "Spot spent", "Sales", "Inventory", "Production", "Logistics"]) await sees(t);
  const saved = await page.locator(".big-save .big-n").textContent();
  step(`Saved shows ${saved}`);
  if (/\$0$/.test(saved.trim())) issue("Saved is $0 after a denied change and a spread-out transfer.");
  void s;
});

const finalData = await page.evaluate(() => JSON.parse(localStorage.getItem("bc_items_v3") || "[]"));
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
