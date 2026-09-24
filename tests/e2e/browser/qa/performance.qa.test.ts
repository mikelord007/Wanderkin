import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { SceneManifest, StyleId } from "../../../../shared/index.js";
import { SAMPLE_LEVELS } from "../../../../src/scene/samples.js";
import { startApiServer, type ApiServerHandle } from "../../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../../http/helpers/mcpHandlers.js";

interface SampleMetric {
  sample: string;
  style: StyleId;
  loadMilliseconds: number;
  frames: number;
  meanFrameMilliseconds: number;
  p95FrameMilliseconds: number;
  fps: number;
}

let api: ApiServerHandle;
let mcp: FakeMcpServer;
const lostColors = JSON.parse(
  readFileSync(new URL("../../../../shared/fixtures/lost-colors.json", import.meta.url), "utf8"),
) as SceneManifest;

test.beforeAll(async () => {
  mcp = await startFakeMcpServer(defaultMcpHandlers());
  api = await startApiServer({ mcpEndpoint: mcp.url });
  const styles: StyleId[] = ["cartoon", "hand-painted", "watercolor"];
  for (const [sampleIndex, original] of SAMPLE_LEVELS.slice(0, 2).entries()) {
    for (const style of styles) {
      const manifest = structuredClone(original) as SceneManifest;
      manifest.levelId = `qa-perf-${sampleIndex}-${style}`;
      manifest.name = `QA perf ${sampleIndex} ${style}`;
      manifest.experience = {
        ...structuredClone(lostColors.experience!),
        style: { ...lostColors.experience!.style, id: style },
        initialColorRestoration: 1,
      };
      await create(manifest);
    }
  }
}, 30_000);

test.afterAll(async () => {
  await api?.stop();
  await mcp?.close();
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const source = new URL(route.request().url());
    await route.continue({ url: `${api.baseUrl}${source.pathname}${source.search}` });
  });
});

async function create(manifest: SceneManifest) {
  const response = await fetch(`${api.baseUrl}/api/levels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
  expect(response.status).toBe(201);
}

async function openSaved(page: Page, name: string) {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  const started = performance.now();
  await card.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("heading", { name: "Click to play" }).waitFor();
  const loadMilliseconds = performance.now() - started;
  await page.locator(".oq-hud__overlay--invite").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__objectquest?.get()?.renderedFrames ?? 0)).toBeGreaterThan(2);
  return loadMilliseconds;
}

async function sampleTwentySeconds(page: Page) {
  await page.keyboard.down("w");
  try {
    return await page.evaluate(() => new Promise<{ frames: number; intervals: number[] }>((resolve) => {
      const intervals: number[] = [];
      const started = performance.now();
      let previous = started;
      let frames = 0;
      const frame = (now: number) => {
        if (now - started >= 20_000) {
          resolve({ frames, intervals });
          return;
        }
        if (frames > 0) intervals.push(now - previous);
        previous = now;
        frames += 1;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }));
  } finally {
    await page.keyboard.up("w");
  }
}

function summarize(sample: string, style: StyleId, loadMilliseconds: number, frames: number, intervals: number[]): SampleMetric {
  const sorted = [...intervals].sort((a, b) => a - b);
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  return {
    sample,
    style,
    loadMilliseconds,
    frames,
    meanFrameMilliseconds: mean,
    p95FrameMilliseconds: p95,
    fps: 1000 / mean,
  };
}

for (const sampleIndex of [0, 1]) {
  for (const style of ["cartoon", "hand-painted", "watercolor"] as const) {
    test(`20-second movement: ${sampleIndex === 0 ? "Rodin" : "Tripo"} ${style}`, async ({ page }) => {
      test.setTimeout(90_000);
      const load = await openSaved(page, `QA perf ${sampleIndex} ${style}`);
      const sample = await sampleTwentySeconds(page);
      const metric = summarize(sampleIndex === 0 ? "Rodin" : "Tripo", style, load, sample.frames, sample.intervals);
      console.log("W11 performance metric", JSON.stringify(metric));
      expect(metric.frames).toBeGreaterThan(20);
      expect(metric.meanFrameMilliseconds).toBeGreaterThan(0);
      expect(mcp.callsFor("run_capability")).toHaveLength(0);
    });
  }
}
