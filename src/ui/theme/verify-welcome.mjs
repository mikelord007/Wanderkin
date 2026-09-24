// Run with Vite on 5191: node src/ui/theme/verify-welcome.mjs
// Library API is stubbed empty/unavailable; sample GLBs and gameplay load for real.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const base = process.env.OQ_DESIGN_URL ?? "http://127.0.0.1:5191";
await mkdir("test-results/design", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/api/levels", route => route.fulfill({ json: [] }));
await page.route("**/api/capabilities", route => route.fulfill({ json: [] }));
try {
  await page.goto(base);
  await expect(page.locator(".oq-welcome__model canvas")).toBeVisible();
  await expect(page.getByText("Opening the little world…")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your everyday objects. Extraordinary little worlds." })).toBeVisible();
  await page.screenshot({ path: "test-results/design/start-desktop.png" });
  await page.getByRole("button", { name: "My worlds", exact: true }).click();
  await expect(page.locator("#my-worlds")).toBeFocused();
  await page.getByRole("button", { name: "Create my world", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Add your photos" })).toBeVisible();
  await page.getByRole("button", { name: "← Back" }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Play now", exact: true }).nth(i).click();
    await expect(page.locator(".oq-hud__overlay--invite")).toBeVisible({ timeout: 60000 });
    await page.goto(base);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".oq-welcome__model canvas")).toBeVisible();
  await expect(page.getByText("Opening the little world…")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".oq-welcome").evaluate(el => el.getBoundingClientRect().height >= el.scrollHeight - 1)).toBe(true);
  await page.screenshot({ path: "test-results/design/start-mobile.png", fullPage: true });
  await page.getByText("Already have a world? Import it here.").click();
  await expect(page.getByRole("button", { name: "Import a 3D object" })).toBeVisible();
  await page.route("**/api/levels", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("saved worlds couldn’t load");
  await expect(page.getByRole("button", { name: "Play a sample", exact: true })).toBeEnabled();
  // Preview fallback remains useful if WebGL or asset loading is unavailable.
  await page.route("**/samples/rodin.glb", route => route.abort());
  await page.reload();
  await expect(page.getByText("The 3D preview couldn’t load. You can still try the sample below.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Create my world", exact: true })).toBeEnabled();
  // React reports deliberately injected preview load failures to pageerror in some versions.
  expect(errors.filter(message => !message.includes("Could not load") && !message.includes("Failed to fetch"))).toEqual([]);
  console.log("PASS: real sample preview, both sample launch paths reach gameplay entry, create/back, My worlds focus, imports, 375px layout and full background, isolated library errors and preview failure fallback.");
} finally { await browser.close(); }
