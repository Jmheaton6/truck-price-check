// Clean screenshots of the demo story for the slides (no banner, 2x resolution).
// Run: python3 -m http.server 8765 (here), then node tests/deck-shots.mjs
// Saves to ~/Desktop/Case Comp/Deck screenshots/
import { chromium } from "/Users/jmheaton6/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:8765/";
const Q = "&local&today=2026-11-05";
const OUT = join(homedir(), "Desktop", "Case Comp", "Deck screenshots");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })).newPage();
const go = async (q) => { await p.goto(BASE + q); await p.addStyleTag({ content: "#mode-banner{display:none!important}.toast{display:none!important}#x-reset{display:none!important}" }); await p.waitForTimeout(600); };
const shot = (name) => p.screenshot({ path: join(OUT, `${name}.png`) });
const dept = async (d) => { await p.selectOption("#who-sel", { label: d }); await p.waitForTimeout(350); };
const btn = async (name, exact = true) => { await p.getByRole("button", { name, exact }).first().click(); await p.waitForTimeout(450); };
const bookAll = async () => { const all = p.getByRole("button", { name: /^Book all/ }); if (await all.count()) await all.first().click(); else await p.getByRole("button", { name: "Book", exact: true }).first().click(); await p.waitForTimeout(450); };
const answerAll = async () => { for (const d of ["Sales", "Inventory", "Production", "Logistics"]) { await go("?role=orders" + Q); await dept(d); const bad = await p.locator(".d-mine .d-check.bad").count(); await btn(bad ? "Deny" : "Accept"); } };

await go("?" + Q.slice(1)); await p.evaluate(() => localStorage.clear());
await go("?" + Q.slice(1)); await shot("01 Home");

// 1. Customer orders
await go("?role=customer" + Q);
await p.fill("#c-date", "2026-11-19"); await p.dispatchEvent("#c-date", "change");
await shot("02 Customer HQ - new order");
await btn("Send order");
await go("?role=customer&tab=pos" + Q); await shot("03 Customer HQ - order checking");

// 2. Departments check off
await go("?role=orders" + Q); await dept("Sales"); await shot("04 Orders - Sales checks");
await btn("Accept");
for (const d of ["Inventory", "Production"]) { await go("?role=orders" + Q); await dept(d); await btn("Accept"); }
await go("?role=orders" + Q); await dept("Logistics"); await shot("05 Orders - Logistics last check");
await btn("Accept"); await shot("06 Orders - all four accepted");

// 3. Logistics books from the calendar
await go("?role=calendar&week=2" + Q); await dept("Logistics"); await shot("07 Trucks - to book");
await btn("Book"); await shot("08 Trucks - booked");

// 4. Customer changes demand; the check-off catches it
await go("?role=customer&tab=pos" + Q); await btn("Change"); await p.fill("#e-m", "2.8"); await p.dispatchEvent("#e-m", "input");
await shot("09 Customer HQ - change request");
await btn("Send change");
await go("?role=orders" + Q); await dept("Production"); await shot("10 Orders - change fails checks");
await btn("Deny");
await go("?role=customer&tab=pos" + Q); await shot("11 Customer HQ - denied, try another date");
await p.getByRole("button", { name: /^Try / }).first().click(); await p.waitForTimeout(400);
await answerAll();

// 5. Transfers in waves
await go("?role=transfers" + Q); await dept("Logistics"); await shot("12 Transfers - one day vs waves");
await btn("Put on calendar");
await go("?role=calendar" + Q); await shot("13 Trucks - transfer on the calendar");
await bookAll();

// 6. Spot avoided by asking the carrier early
await go("?role=customer" + Q); await p.selectOption("#who-sel", { label: "PepsiCo" }); await p.waitForTimeout(300);
await p.fill("#c-m", "1.2"); await p.dispatchEvent("#c-m", "input"); await p.fill("#c-date", "2026-11-25"); await p.dispatchEvent("#c-date", "change");
await btn("Send order");
for (const d of ["Sales", "Inventory", "Production"]) { await go("?role=orders" + Q); await dept(d); await btn("Accept"); }
await go("?role=orders" + Q); await dept("Logistics"); await shot("14 Orders - would go spot");
await p.getByRole("button", { name: /^Ask carrier/ }).first().click(); await p.waitForTimeout(450);
await shot("15 Orders - carrier says yes"); await btn("Accept");
await go("?role=calendar" + Q); await bookAll();

// 7. Executive
await go("?role=exec" + Q); await dept("Executive"); await shot("16 Executive");
await b.close();
console.log("Saved to", OUT);
