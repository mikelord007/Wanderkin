/** Capture actual GameView evidence and repeatable headless frame intervals. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { StyleId } from "../../shared/style.js";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "../..");
const evidenceDir = resolve(root, "docs/evidence");
const server = await createServer({
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 4180, strictPort: true },
});
const browser = await chromium.launch({ headless: true });

const samples = [
  { id: "sample-rodin-room-corner", slug: "rodin" },
  { id: "sample-tripo-room-corner", slug: "tripo" },
] as const;
const styles: readonly StyleId[] = ["cartoon", "hand-painted", "watercolor"];
const results: unknown[] = [];

try {
  await server.listen();
  for (const sample of samples) {
    for (const style of styles) {
      console.log(`capture ${sample.slug}/${style}`);
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await openPreview(page, sample.id, style, 1);
      console.log(`ready ${sample.slug}/${style}`);
      await page.locator("canvas").screenshot({
        path: resolve(evidenceDir, `style-${style}-${sample.slug}.png`),
      });
      const intervals = await frameIntervals(page, 120, 30);
      const diagnostics = await page.evaluate(() => window.__objectquest?.get() ?? null);
      results.push({
        sample: sample.id,
        style,
        restoration: 1,
        frames: intervals.length,
        frameIntervalMs: summarize(intervals),
        rendererLastFrameMs: diagnostics ? diagnostics.lastFrameSeconds * 1000 : null,
        renderedFrames: diagnostics?.renderedFrames ?? null,
        consoleErrors: errors,
      });
      await page.close();
    }
  }

  for (const restoration of [0, 1]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await openPreview(page, "sample-rodin-room-corner", "cartoon", restoration);
    await page.locator("canvas").screenshot({
      path: resolve(evidenceDir, `style-restoration-${restoration}.png`),
    });
    await page.close();
  }

  await writeFile(
    resolve(evidenceDir, "style-render-performance.json"),
    `${JSON.stringify({
      measuredAt: new Date().toISOString(),
      browser: "Playwright Chromium headless",
      viewport: "1280x720@1x",
      method: "Actual GameView with the pre-play HUD hidden; 30 requestAnimationFrame warm-up intervals followed by 120 measured intervals. Values are display-scheduled frame intervals, not universal GPU guarantees.",
      results,
    }, null, 2)}\n`,
    "utf8",
  );
} finally {
  await browser.close();
  await server.close();
}

async function openPreview(
  page: Page,
  sample: string,
  style: StyleId,
  restoration: number,
): Promise<void> {
  const url = new URL("http://127.0.0.1:4180/scripts/spike/style-preview.html");
  url.searchParams.set("sample", sample);
  url.searchParams.set("style", style);
  url.searchParams.set("restoration", String(restoration));
  url.searchParams.set("atmosphere", style === "hand-painted" ? "An enchanted forest" : style === "watercolor" ? "A sleepy seaside village" : "A floating island above the clouds");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__STYLE_PREVIEW_READY__ === true, undefined, { timeout: 30_000 });
  // The pre-play invitation intentionally blurs the canvas. Hide only that
  // HTML layer so screenshots and timings measure the gameplay renderer.
  await page.addStyleTag({ content: ".oq-hud { display: none !important; }" });
  await page.waitForTimeout(750);
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
