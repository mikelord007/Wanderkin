import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installCreationMock } from "./objectquest-v2.creation-scenarios.js";

const evidenceDir = "test-results/creation";

test("screens 2–7 mocked creation walkthrough", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await installCreationMock(page, { shapeState: "ready" });
  await page.goto("/");
  await page.getByRole("button", { name: "Create my world" }).first().click();
  await expect(page.getByRole("heading", { name: "What will your world be made of?" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/02-capture.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${evidenceDir}/02-capture-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator('input[type="file"]').setInputFiles("public/samples/photo-4.jpg");
  await page.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("button", { name: "Looks good" })).toBeEnabled();
  await page.screenshot({ path: `${evidenceDir}/03-review.png`, fullPage: true });

  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.getByRole("heading", { name: "What kind of adventure is this?" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/04-customize.png`, fullPage: true });

  await page.locator(".oq-kit-choice").filter({ hasText: "Watercolor" }).click();
  await page.getByPlaceholder("A floating island above the clouds…").fill("A cloud garden at sunset");
  // Look → Biome (locked in) → Preview.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Where will it grow?" })).toBeVisible();
  await page.locator(".oq-kit-choice").filter({ hasText: "Monsoon Marsh" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Use this preview" })).toBeEnabled();
  await page.screenshot({ path: `${evidenceDir}/05-preview.png`, fullPage: true });

  await page.getByRole("button", { name: "Use this preview" }).click();
  await page.getByRole("button", { name: "Build my world" }).click();
  await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare my course" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/06-progress.png`, fullPage: true });

  await page.getByRole("button", { name: "Prepare my course" }).click();
  await expect(page.getByRole("heading", { name: /Welcome to/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".oq-world-ready__scene canvas")).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${evidenceDir}/07-ready.png`, fullPage: true });
});
