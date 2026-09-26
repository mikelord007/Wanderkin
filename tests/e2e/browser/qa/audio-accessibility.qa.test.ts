import { expect, test, type TestInfo } from "@playwright/test";
import { startApiServer, type ApiServerHandle } from "../../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../../http/helpers/mcpHandlers.js";

let api: ApiServerHandle;
let mcp: FakeMcpServer;

test.beforeAll(async () => {
  mcp = await startFakeMcpServer(defaultMcpHandlers());
  api = await startApiServer({ mcpEndpoint: mcp.url });
}, 30_000);

test.afterAll(async () => {
  await api?.stop();
  await mcp?.close();
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", async (route) => {
    const source = new URL(route.request().url());
    await route.continue({ url: `${api.baseUrl}${source.pathname}${source.search}` });
  });
});

test("B14 audio starts on gesture, settings persist, and no narration or subtitle ever plays", async ({ page }, testInfo: TestInfo) => {
  testInfo.setTimeout(120_000);
  const audioRequests: string[] = [];
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/audio\/[^/]+\.wav$/.test(path)) audioRequests.push(path);
  });
  await page.goto("/");
  expect(audioRequests).toEqual([]);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

  const sample = page.getByRole("button", { name: "Play a sample" }).first();
  await expect(sample).toBeEnabled();
  await sample.focus();
  await expect(sample).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Click to play" }).waitFor();
  expect(audioRequests).toEqual([]);

  const play = page.locator(".oq-hud__overlay--invite").getByRole("button", { name: "Play", exact: true });
  await play.focus();
  await page.keyboard.press("Enter");
  const narration = page.getByText(/Welcome to Teacup Island\. Find the three lost colors/);
  await expect(page.locator(".oq-hud__intro")).toBeVisible();
  await expect(narration).toHaveCount(0);
  await expect(page.locator(".oq-hud__subtitle, .oq-kit-subtitle")).toHaveCount(0);

  const sound = page.getByRole("button", { name: "Sound" });
  await sound.focus();
  await expect(sound).toBeFocused();
  await expect(sound).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Sound" })).toBeVisible();
  for (const channel of ["Master", "Music", "Effects"]) {
    await expect(page.getByLabel(channel)).toBeVisible();
  }
  await expect(page.getByLabel("Voice")).toHaveCount(0);

  const mute = page.getByRole("button", { name: "Mute sound" });
  await mute.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unmute sound" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Music").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByLabel("Music")).toHaveValue("49");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("objectquest:audio-settings:v1") ?? "null")))
    .toMatchObject({ muted: true, music: 49 });

  await page.screenshot({ path: testInfo.outputPath("audio-controls-reduced-motion.png"), fullPage: true });

  await page.keyboard.press("r");
  await page.waitForTimeout(800);
  await expect(narration).toHaveCount(0);
  const pause = page.getByRole("button", { name: "Pause game" });
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Restart course" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1_000);
  await expect(narration).toHaveCount(0);

  console.log("W11 audio requests", JSON.stringify(audioRequests));
  console.log("W11 audio runtime errors", JSON.stringify(runtimeErrors));
  expect(audioRequests.length, "bundled audio network requests after explicit Play").toBeGreaterThanOrEqual(3);
  expect(audioRequests.filter((path) => /narration/.test(path)), "narration requests across play, respawn and restart")
    .toHaveLength(0);
  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});
