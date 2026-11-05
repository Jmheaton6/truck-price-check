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
const go = async (q) => { await p.goto(BASE + q); await p.addStyleTag({ content: "#mode-banner{display:none!important}.toast{display:none!important}#reset-demo{display:none!important}" }); await p.waitForTimeout(600); };
const shot = (name) => p.screenshot({ path: join(OUT, `${name}.png`) });
const btn = async (name, exact = true) => { await p.getByRole("button", { name, exact }).first().click(); await p.waitForTimeout(450); };
const bookAll = async () => { const all = p.getByRole("button", { name: /^Book all/ }); if (await all.count()) await all.first().click(); else await p.getByRole("button", { name: "Book", exact: true }).first().click(); await p.waitForTimeout(450); };
const hub = async (h, tab, extra = "") => { await go(`?hub=${h}&role=${tab}${extra}` + Q); };
const accept = async (h) => { await hub(h, "orders"); await btn("Accept"); };

await go("?" + Q.slice(1)); await p.evaluate(() => localStorage.clear());
await go("?" + Q.slice(1)); await shot("01 Home");

// 1. Weeks ahead: Coca-Cola shares a promo forecast; Planning sends Logistics a prebuild
await go("?role=customer" + Q);
await p.fill('[data-fw="4"]', "1.4"); await p.dispatchEvent('[data-fw="4"]', "input");
await shot("02 Customer HQ - forecast and order"); await btn("Share forecast");
await hub("planning", "shortterm"); await shot("03 Planning - short-term forecast and prebuild");
await btn("Send to Logistics");
await hub("logistics", "calendar"); await shot("04 Logistics - early warning"); await btn("Line up 2 more");

// 2. Logistics paces the prebuild: one batch vs paced waves
await hub("logistics", "transfers"); await shot("05 Logistics - prebuild one batch vs paced");
await btn("Schedule");

// Logistics contacts the prebuild's carriers, then records their yes
await hub("logistics", "calendar"); await shot("06 Logistics - contact carriers");
await btn("Contact"); await shot("07 Logistics - waiting on carrier");
await btn("Said yes");

// 3. Coca-Cola orders 5 truckloads for one day; the four teams check it
await go("?role=customer" + Q);
await p.fill("#c-m", "1"); await p.dispatchEvent("#c-m", "input"); await p.fill("#c-date", "2026-11-19"); await p.dispatchEvent("#c-date", "change");
await btn("Send order");
await hub("sales", "orders"); await shot("08 Sales - check, what my accept does"); await btn("Accept");
await accept("inventory"); await accept("planning");
await hub("logistics", "orders"); await shot("09 Logistics - no carrier has room, split counteroffer");

// 4. Spread, not spot: the customer takes the split
await p.getByRole("button", { name: /^Counteroffer/ }).first().click(); await p.waitForTimeout(450);
await go("?role=customer&tab=pos" + Q); await shot("10 Customer HQ - split or expedite");
await p.getByRole("button", { name: /^Take/ }).first().click(); await p.waitForTimeout(450);
await hub("logistics", "calendar"); await shot("11 Logistics - calendar after the split");
await btn("Contact"); await btn("Said yes");
await shot("12 Logistics - all confirmed");

// 5. The rest of Ball HQ
await hub("sales", "customers"); await shot("13 Sales - customer reliability");
await hub("inventory", "stock"); await shot("14 Inventory - stock");
await hub("planning", "longterm"); await shot("15 Planning - long-term");
await hub("planning", "line"); await shot("16 Planning - line time");
await hub("exec", "exec"); await shot("17 Executive");
await b.close();
console.log("Saved to", OUT);
