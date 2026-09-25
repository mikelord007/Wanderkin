import { expect, test } from "@playwright/test";
import { installCreationMock } from "./objectquest-v2.creation-scenarios.js";

/**
 * Regression coverage for a routing defect: `clearActiveCreationId` existed
 * but was never called, so backing out of the creation journey from its
 * very first step (before any photo/job exists) left the
 * `objectquest:v2:active-creation` pointer dangling. The next visit to "/"
 * — a cold load or a reload, not just an in-app `go()` — resolved that
 * stale pointer back into the Create screen instead of the landing page,
 * even though the user had explicitly backed out of it. See
 * `resolveSyncScreen`'s "start"/"worlds" case in src/App.tsx.
 */
test("backing out of a just-started creation draft does not hijack the next visit to /", async ({ page }) => {
  await installCreationMock(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your sofa is a mountain range." })).toBeVisible();

  await page.getByRole("button", { name: "Create my world" }).first().click();
  await expect(page.getByRole("heading", { name: "What will your world be made of?" })).toBeVisible();

  // Back out before choosing a photo — the only exit this screen offers
  // back to the top-level router, and the only point in the journey where
  // no photo or job has been submitted yet. (CaptureScreen's own "Back"
  // button only appears once a photo is selected; before that, the frame
  // header's "← Back" is the sole way out.)
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.getByRole("heading", { name: "Your sofa is a mountain range." })).toBeVisible();

  // The actual regression: a fresh load of "/" after backing out must show
  // the landing page directly, not silently reopen Create.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your sofa is a mountain range." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What will your world be made of?" })).toHaveCount(0);

  // The abandoned draft is not lost — it stays reachable through the
  // existing explicit affordance in My worlds.
  await page.getByRole("button", { name: "My worlds" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});

test("an in-progress build still resumes straight to its progress screen on reload", async ({ page }) => {
  // Companion check: the fix must not touch the deliberately-preserved
  // resume behavior for durable, already-submitted work (see B10).
  await installCreationMock(page, { shapeState: "generating" });
  await page.goto("/");
  await page.getByRole("button", { name: "Create my world" }).first().click();
  await page.locator('input[type="file"]').setInputFiles("public/samples/photo-4.jpg");
  await page.getByRole("button", { name: "Use this photo" }).click();
  await page.getByRole("button", { name: "Looks good" }).click();
  await page.getByRole("button", { name: "Preview my world" }).click();
  await expect(page.getByRole("button", { name: "Use this preview" })).toBeEnabled();
  await page.getByRole("button", { name: "Use this preview" }).click();
  await page.getByRole("button", { name: "Build my world" }).click();
  await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible();
});
