/** Saves the batch-2 item-13 screenshot evidence into nimbalyst-local/screenshots/batch2-controls/. */
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const OUT = join(process.cwd(), "nimbalyst-local", "screenshots", "batch2-controls");
const SAMPLE = "The desk & sofa adventure";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/levels", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
});

async function openAndLock(page: Page): Promise<void> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: SAMPLE }) });
  await card.getByRole("button", { name: "Play now" }).click();
  await page.getByRole("button", { name: /^Play$/ }).waitFor();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__objectquest?.get() ?? null)).not.toBeNull();
}

test("evidence screenshots", async ({ page }) => {
  await openAndLock(page);
  await page.screenshot({ path: join(OUT, "01-pointer-locked-gameplay.png") });

  await page.keyboard.press("c");
  await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await page.screenshot({ path: join(OUT, "02-capture-started-by-C-still-locked.png") });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.screenshot({ path: join(OUT, "03-paused-overlay-covers-sound-button.png") });

  // Keyboard is the only working route to the Sound panel here.
  let reached = false;
  for (let i = 0; i < 25 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim() === "Sound");
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Sound" })).toBeVisible();
  await page.screenshot({ path: join(OUT, "04-sound-panel-opened-via-keyboard.png") });
});
