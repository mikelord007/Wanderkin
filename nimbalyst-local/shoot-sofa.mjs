/**
 * Screenshots the scale comparison and the game-camera framing at both scales.
 * Throwaway verification tooling: local preview page on a temporary port only.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const port = process.argv[2] ?? "15911";
const outDir = process.argv[3] ?? "nimbalyst-local/screenshots/character";
const base = `http://localhost:${port}/nimbalyst-local/character-preview.html`;

const SHOTS = [
  { name: "scale-vs-sofa", query: "scene=sofa" },
  { name: "game-camera-old-070m", query: "scene=sofa&cam=game&height=0.7" },
  { name: "game-camera-new-035m", query: "scene=sofa&cam=game&height=0.35" },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));
for (const shot of SHOTS) {
  await page.goto(`${base}?${shot.query}`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.advance === "function", null, { timeout: 15000 });
  await page.evaluate(() => window.advance(1.6));
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  console.log(`wrote ${outDir}/${shot.name}.png`);
}
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("no page errors");
