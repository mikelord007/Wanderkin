import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { SceneManifest, StyleId } from "../../../../shared/index.js";
import { startApiServer, type ApiServerHandle } from "../../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../../http/helpers/mcpHandlers.js";

interface Diagnostics {
  playerPosition: readonly [number, number, number];
  cameraYaw: number;
  mantleAvailable: boolean;
  checkpointsCollected: number;
  nextCheckpointPosition: readonly [number, number, number] | null;
}

interface ImageMetrics {
  averageSaturation: number;
  histogram: number[];
}

type Point = readonly [number, number];
type MovementKey = "w" | "a" | "s" | "d";

let api: ApiServerHandle;
let mcp: FakeMcpServer;
const lostColorsFixture = JSON.parse(
  readFileSync(new URL("../../../../shared/fixtures/lost-colors.json", import.meta.url), "utf8"),
) as SceneManifest;

test.beforeAll(async () => {
  mcp = await startFakeMcpServer(defaultMcpHandlers());
  api = await startApiServer({ mcpEndpoint: mcp.url });
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

async function diagnostics(page: Page): Promise<Diagnostics | null> {
  return page.evaluate(() => window.__objectquest?.get() as Diagnostics | null ?? null);
}

function distance(position: readonly [number, number, number], target: Point): number {
  return Math.hypot(position[0] - target[0], position[2] - target[1]);
}

function keysToward(current: Diagnostics, target: Point): Set<MovementKey> {
  const dx = target[0] - current.playerPosition[0];
  const dz = target[1] - current.playerPosition[2];
  const length = Math.hypot(dx, dz) || 1;
  const x = dx / length;
  const z = dz / length;
  const forward = x * Math.sin(current.cameraYaw) + z * Math.cos(current.cameraYaw);
  const right = x * -Math.cos(current.cameraYaw) + z * Math.sin(current.cameraYaw);
  const keys = new Set<MovementKey>();
  if (forward > 0.18) keys.add("w");
  else if (forward < -0.18) keys.add("s");
  if (right > 0.18) keys.add("d");
  else if (right < -0.18) keys.add("a");
  return keys;
}

async function setKeys(page: Page, held: Set<MovementKey>, wanted: Set<MovementKey>) {
  for (const key of [...held]) {
    if (!wanted.has(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  }
  for (const key of wanted) {
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
  }
}

async function drive(
  page: Page,
  target: Point,
  options: { radius?: number; mantle?: boolean; timeout?: number } = {},
) {
  const held = new Set<MovementKey>();
  const deadline = Date.now() + (options.timeout ?? 30_000);
  let previous = Infinity;
  let stagnant = 0;
  try {
    while (Date.now() < deadline) {
      const current = await diagnostics(page);
      if (!current) return;
      const remaining = distance(current.playerPosition, target);
      if (remaining <= (options.radius ?? 0.27)) return;
      if (options.mantle && current.mantleAvailable) {
        await page.keyboard.press("e");
        await page.waitForTimeout(350);
        continue;
      }
      await setKeys(page, held, keysToward(current, target));
      await page.waitForTimeout(90);
      stagnant = remaining >= previous - 0.012 ? stagnant + 1 : 0;
      previous = remaining;
      if (stagnant > 10) {
        await page.keyboard.press("Space");
        stagnant = 0;
      }
    }
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
  throw new Error(`Timed out driving to ${target}; ${JSON.stringify(await diagnostics(page))}`);
}

async function openCard(page: Page, name: string, saved = false) {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name }) }).last();
  await card.getByRole("button", { name: saved ? "Play" : "Play now", exact: true }).click();
  await page.getByRole("heading", { name: "Click to play" }).waitFor();
  await page.locator(".oq-hud__overlay--invite").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await expect.poll(() => diagnostics(page)).not.toBeNull();
  await page.waitForTimeout(500);
}

async function imageMetrics(page: Page, png: Buffer): Promise<ImageMetrics> {
  const source = `data:image/png;base64,${png.toString("base64")}`;
  return page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not create a 2D analysis context");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const histogram = Array.from({ length: 64 }, () => 0);
    let saturation = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index]! / 255;
      const g = pixels[index + 1]! / 255;
      const b = pixels[index + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      saturation += max === 0 ? 0 : (max - min) / max;
      const bin = (Math.min(3, Math.floor(r * 4)) * 16)
        + (Math.min(3, Math.floor(g * 4)) * 4)
        + Math.min(3, Math.floor(b * 4));
      histogram[bin] += 1;
      count += 1;
    }
    return {
      averageSaturation: saturation / count,
      histogram: histogram.map((value) => value / count),
    };
  }, source);
}

function histogramDistance(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + Math.abs(value - (right[index] ?? 0)), 0) / 2;
}

async function captureCanvas(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  const png = await page.locator("canvas").first().screenshot({ path });
  return { path, metrics: await imageMetrics(page, png) };
}

async function returnToWorlds(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Leave level" }).click();
  await expect(page.getByRole("heading", { name: "Your everyday objects. Extraordinary little worlds." })).toBeVisible();
}

async function saveStyleWorld(style: StyleId) {
  const manifest = structuredClone(lostColorsFixture) as unknown as SceneManifest;
  manifest.levelId = `qa-style-${style}`;
  manifest.name = `QA ${style}`;
  if (!manifest.experience) throw new Error("Lost Colors fixture has no experience block");
  manifest.experience.style = { ...manifest.experience.style, id: style };
  manifest.experience.initialColorRestoration = 1;
  const response = await fetch(`${api.baseUrl}/api/levels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
  expect(response.status).toBe(201);
}

test("B2 Lost Colors restoration is visually progressive and completes through the portal", async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000);
  await openCard(page, "The Lost Colors of Teacup Island");
  const evidence: Array<{ fragments: number; path: string; metrics: ImageMetrics }> = [];

  const snap = async (fragments: number) => {
    await page.waitForTimeout(400);
    const capture = await captureCanvas(page, testInfo, `lost-colors-${fragments}.png`);
    evidence.push({ fragments, ...capture });
  };

  await snap(0);
  await drive(page, [-4.02, 2.154]);
  await expect(page.getByText(/Colors found 1/)).toBeVisible();
  await page.keyboard.press("r");
  await snap(1);

  await drive(page, [2.46, 3.594], { timeout: 40_000 });
  await expect(page.getByText(/Colors found 2/)).toBeVisible();
  await page.keyboard.press("r");
  await snap(2);

  await drive(page, [2.1, 0.354], { mantle: true, timeout: 45_000 });
  await drive(page, [0.3, -0.006], { timeout: 25_000 });
  await expect(page.getByText(/Colors found 3/)).toBeVisible();
  await expect(page.getByText(/portal is awake/i)).toBeVisible();
  await page.keyboard.press("r");
  await snap(3);

  const saturation = evidence.map((entry) => entry.metrics.averageSaturation);
  console.log("W11 Lost Colors saturation", JSON.stringify(saturation));
  for (let index = 1; index < saturation.length; index += 1) {
    expect(saturation[index]!, `saturation at ${index} fragments`).toBeGreaterThan(saturation[index - 1]!);
  }

  await drive(page, [-1.14, -2.166], { timeout: 40_000 });
  await expect(page.getByRole("heading", { name: "You brought the colors back." })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("lost-colors-completion.png"), fullPage: true });
});

test("B3 Cartoon, Hand-painted, and Watercolor produce distinct gameplay pixels", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  for (const style of ["cartoon", "hand-painted", "watercolor"] as const) await saveStyleWorld(style);

  const captures = new Map<StyleId, ImageMetrics>();
  for (const style of ["cartoon", "hand-painted", "watercolor"] as const) {
    await openCard(page, `QA ${style}`, true);
    const capture = await captureCanvas(page, testInfo, `style-${style}.png`);
    captures.set(style, capture.metrics);
    await returnToWorlds(page);
  }

  const distances = {
    cartoonToPainted: histogramDistance(captures.get("cartoon")!.histogram, captures.get("hand-painted")!.histogram),
    cartoonToWatercolor: histogramDistance(captures.get("cartoon")!.histogram, captures.get("watercolor")!.histogram),
    paintedToWatercolor: histogramDistance(captures.get("hand-painted")!.histogram, captures.get("watercolor")!.histogram),
  };
  console.log("W11 style histogram distances", JSON.stringify(distances));
  for (const [pair, value] of Object.entries(distances)) {
    expect(value, `${pair} normalized RGB-histogram distance`).toBeGreaterThan(0.03);
  }
  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});
