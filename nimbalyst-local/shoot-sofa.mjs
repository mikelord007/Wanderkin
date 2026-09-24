import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const port = process.argv[2] ?? "15911";
const outDir = process.argv[3] ?? "nimbalyst-local/screenshots/character";
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));
await page.goto(`http://localhost:${port}/nimbalyst-local/character-preview.html?scene=sofa`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.advance === "function", null, { timeout: 15000 });
await page.evaluate(() => window.advance(1.6));
await page.screenshot({ path: `${outDir}/scale-vs-sofa.png` });
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("wrote scale-vs-sofa.png");
