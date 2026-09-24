/** Measure the pre-v2 neutral renderer from an extracted historical checkout. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";

const baselineRoot = process.env.OBJECTQUEST_BASELINE_ROOT;
if (!baselineRoot) throw new Error("OBJECTQUEST_BASELINE_ROOT is required.");
const currentRoot = resolve(import.meta.dirname, "../..");
const server = await createServer({
  root: baselineRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 4181, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
const results: unknown[] = [];

try {
  await server.listen();
  for (const sample of ["Room corner — Rodin", "Room corner — Tripo"]) {
    console.log(`baseline ${sample}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("http://127.0.0.1:4181/", { waitUntil: "domcontentloaded" });
    const card = page.locator("article").filter({ hasText: sample });
    await card.getByRole("button", { name: "Play now" }).click();
    await page.getByRole("button", { name: /^Play$/ }).waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => window.__objectquest?.get() !== null, undefined, { timeout: 30_000 });
    await page.addStyleTag({ content: ".oq-hud { display: none !important; }" });
    await page.waitForTimeout(750);
    const intervals = await frameIntervals(page, 120, 30);
    const diagnostics = await page.evaluate(() => window.__objectquest?.get() ?? null);
    results.push({
      sample,
      revision: "e857d24",
      frames: intervals.length,
      frameIntervalMs: summarize(intervals),
      rendererLastFrameMs: diagnostics ? diagnostics.lastFrameSeconds * 1000 : null,
      renderedFrames: diagnostics?.renderedFrames ?? null,
      consoleErrors: errors,
    });
    await page.close();
  }

  await writeFile(
    resolve(currentRoot, "docs/evidence/style-render-baseline.json"),
    `${JSON.stringify({
      measuredAt: new Date().toISOString(),
      revision: "e857d24",
      browser: "Playwright Chromium headless",
      viewport: "1280x720@1x",
      method: "Historical app revision with the pre-play HUD hidden; 30 requestAnimationFrame warm-up intervals followed by 120 measured intervals under the same browser and host settings as styled evidence.",
      results,
    }, null, 2)}\n`,
    "utf8",
  );
} finally {
  await browser.close();
  await server.close();
}

async function frameIntervals(page: Page, count: number, warmup: number): Promise<number[]> {
  return page.evaluate(
    async ({ count: sampleCount, warmup: warmupCount }) => {
      const values: number[] = [];
      let previous = performance.now();
      for (let index = 0; index < sampleCount + warmupCount; index += 1) {
        const now = await new Promise<number>((resolveFrame) => requestAnimationFrame(resolveFrame));
        if (index >= warmupCount) values.push(now - previous);
        previous = now;
      }
      return values;
    },
    { count, warmup },
  );
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return {
    mean: round(mean),
    p50: round(percentile(0.5)),
    p95: round(percentile(0.95)),
    max: round(sorted.at(-1) ?? 0),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
