/**
 * Screenshots the character preview harness. Throwaway verification tooling:
 * it only loads the local preview page on a temporary port and writes PNGs.
 *
 *   node nimbalyst-local/shoot-character.mjs <port> <outDir>
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const port = process.argv[2] ?? "15911";
const outDir = process.argv[3] ?? "nimbalyst-local/screenshots/character";
const base = `http://localhost:${port}/nimbalyst-local/character-preview.html`;

const SHOTS = [
  { name: "grid-all-states", query: "grid=1", settle: 1.4 },
  { name: "run-front", query: "state=run", settle: 1.6 },
  { name: "run-three-quarter", query: "state=run&spin=1", settle: 2.3 },
  { name: "idle-front", query: "state=idle", settle: 2.0 },
  { name: "walk-front", query: "state=walk", settle: 1.7 },
  { name: "jump-rise", query: "state=jump", settle: 0.3 },
  { name: "jump-land", query: "state=jump", settle: 1.15 },
  { name: "mantle-reach", query: "state=mantle", settle: 0.12 },
  { name: "mantle-pull", query: "state=mantle", settle: 0.55 },
  { name: "turn-bank", query: "state=turn", settle: 2.6 },
  { name: "run-inside-capsule", query: "state=run&capsule=1", settle: 1.6 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});

for (const shot of SHOTS) {
  await page.goto(`${base}?${shot.query}`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.advance === "function", null, { timeout: 15000 });
  await page.evaluate((seconds) => window.advance(seconds), shot.settle);
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  console.log(`wrote ${outDir}/${shot.name}.png`);
}

await browser.close();
if (problems.length) {
  console.error("PAGE PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("no page errors");
