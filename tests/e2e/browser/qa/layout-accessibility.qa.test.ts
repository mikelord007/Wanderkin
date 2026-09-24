import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createEmptyManifest, migrateSceneManifest, type PublishedLevelVersion } from "../../../../shared/index.js";
import { startApiServer, type ApiServerHandle } from "../../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../../http/helpers/mcpHandlers.js";

let api: ApiServerHandle;
let mcp: FakeMcpServer;
let shareId: string;

async function routeApi(context: BrowserContext) {
  await context.route("**/api/**", async (route) => {
    const source = new URL(route.request().url());
    await route.continue({ url: `${api.baseUrl}${source.pathname}${source.search}` });
  });
}

test.beforeAll(async () => {
  mcp = await startFakeMcpServer(defaultMcpHandlers());
  api = await startApiServer({ mcpEndpoint: mcp.url });
  const base = createEmptyManifest({ levelId: "qa-layout-saved", name: "QA layout saved world", seed: "qa-layout", movementConfigId: "default-v1" });
  base.entities = [{ id: "floor", kind: "floor", transform: { position: [0, -0.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, dimensions: [12, .4, 12], collider: { kind: "box", halfExtents: [6, .2, 6] }, addedBy: "game" }];
  base.spawn = { position: [0, .37, 0], headingRadians: 0 };
  base.checkpoints = [{ id: "checkpoint-1", order: 0, position: [2, .37, 0], triggerRadius: .5, safeRespawn: { position: [2, .37, 0], headingRadians: 0 } }];
  const saved = migrateSceneManifest(base);
  const created = await fetch(`${api.baseUrl}/api/levels`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved),
  });
  expect(created.status).toBe(201);
  const published = await fetch(`${api.baseUrl}/api/levels/${saved.levelId}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: { kind: "completion" } }),
  });
  expect(published.status).toBe(201);
  shareId = ((await published.json()) as PublishedLevelVersion).shareId;
}, 30_000);

test.afterAll(async () => {
  await api?.stop();
  await mcp?.close();
});

test.beforeEach(async ({ context }) => routeApi(context));

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth, `document width at ${dimensions.width}px`).toBeLessThanOrEqual(dimensions.width);
}

async function assertNamedControls(page: Page) {
  const unnamed = await page.locator("button, a[href], input, select, textarea, [role=button]").evaluateAll((elements) =>
    elements.filter((element) => {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      if (style.display === "none" || style.visibility === "hidden" || html.getAttribute("aria-hidden") === "true" || html.getClientRects().length === 0) return false;
      const labelled = html.getAttribute("aria-label") || html.getAttribute("aria-labelledby") || html.getAttribute("title");
      const text = html.textContent?.trim();
      const input = element as HTMLInputElement;
      const labels = input.labels ? Array.from(input.labels).map((label) => label.innerText.trim()).join("") : "";
      return !(labelled || text || labels);
    }).map((element) => element.outerHTML.slice(0, 180)),
  );
  expect(unnamed, "visible interactive controls without an accessible name").toEqual([]);
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
  test(`welcome, capture, and My worlds fit ${viewport.width}x${viewport.height}`, async ({ page }, testInfo: TestInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your everyday objects. Extraordinary little worlds." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "QA layout saved world" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNamedControls(page);
    await page.screenshot({ path: testInfo.outputPath(`welcome-${viewport.width}.png`), fullPage: true });

    await page.getByRole("button", { name: "Create my world" }).first().click();
    await expect(page.getByRole("heading", { name: "What will your world be made of?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose from photos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take a photo" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNamedControls(page);
    await page.screenshot({ path: testInfo.outputPath(`capture-${viewport.width}.png`), fullPage: true });
  });
}

test("coarse-pointer mobile play shows supported-controls notice", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await routeApi(context);
  const page = await context.newPage();
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "The Lost Colors of Teacup Island" }) });
  await card.getByRole("button", { name: "Play now" }).click();
  await expect(page.getByText("Keyboard and mouse are supported. Touch controls are not available yet.")).toBeVisible();
  await expect(page.locator(".oq-hud__overlay--invite").getByRole("button", { name: "Play" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile-touch-controls-notice.png"), fullPage: true });
  await context.close();
});

test("friend landing fits desktop and mobile and exposes named controls", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/share/${shareId}`);
    await expect(page.getByRole("heading", { name: "QA layout saved world" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNamedControls(page);
    await page.screenshot({ path: testInfo.outputPath(`friend-${viewport.width}.png`), fullPage: true });
  }
});
