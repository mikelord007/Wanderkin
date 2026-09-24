/**
 * Batch-2 focused regression tests for the two defects found in
 * `nimbalyst-local/playtest-checkpoints/batch2-controls.md`:
 *
 * 1. `.oq-hud__top-actions` (Sound / Pause) had no stacking level and sat
 *    behind the pause overlay, so a mouse click on "Sound" while paused
 *    never reached the button. Fixed in `src/game/hud/hud.css` by giving
 *    the top-actions row `z-index: 4` (matching `.oq-hud__sound`).
 * 2. `PlayScreen.tsx`'s capture state callback never left `captureState`
 *    at `"stopping"` after a recorder `"error"`, permanently killing the
 *    "Start gameplay capture" button/`C` key for the rest of the session.
 *    Fixed by resetting `captureState` to `"idle"` on error.
 *
 * Both are exercised in the real production bundle via a real Chrome
 * (`channel: "chrome"`), against real `requestPointerLock()` and real
 * click/keyboard input — no internal game state is forced.
 */
import { expect, test, type Page } from "@playwright/test";

const SAMPLE = "The desk & sofa adventure";

/**
 * Deterministic recorder fixture for the capture-failure regression: a
 * `MediaRecorder` stand-in that never delivers a `dataavailable` event,
 * so the production code's own `blob.size === 0` guard
 * (`src/capture/recorder.ts` `finish()`) fails every run, on every
 * browser/headless combination — instead of relying on headless Chrome's
 * incidental inability to encode `canvas.captureStream()`, which the
 * checkpoint observed can also succeed or fail on real hardware depending
 * on window occlusion.
 */
const INSTALL_FAKE_MEDIA_RECORDER = `
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = (options && options.mimeType) || "video/webm";
      this.state = "inactive";
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
    }
    start() { this.state = "recording"; }
    requestData() { /* deliberately never emits a dataavailable event */ }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => { if (this.onstop) this.onstop(); });
    }
  }
  window.MediaRecorder = FakeMediaRecorder;
`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/levels", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
});

const locked = (page: Page) => page.evaluate(() => document.pointerLockElement !== null);
const mutedFlag = (page: Page) =>
  page.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem("objectquest:audio-settings:v1") ?? "null") as { muted?: boolean } | null)
        ?.muted ?? null;
    } catch {
      return null;
    }
  });

async function openAndLock(page: Page): Promise<void> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: SAMPLE }) });
  await card.getByRole("button", { name: "Play now" }).click();
  await page.getByRole("button", { name: /^Play$/ }).waitFor();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => locked(page)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__objectquest?.get() ?? null)).not.toBeNull();
}

test.describe("Finding 1 fix — Sound button reachable through the pause overlay", () => {
  test("raw mouse click opens the Sound panel while paused, controls operate, no accidental relock", async ({ page }) => {
    await openAndLock(page);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect.poll(() => locked(page)).toBe(false);

    // Raw click at the button's centre — no actionability gate, i.e. exactly
    // what a physical mouse does. This previously landed on `.oq-hud__overlay`
    // instead of the button because the overlay painted on top.
    const soundButton = page.getByRole("button", { name: "Sound" });
    const box = await soundButton.boundingBox();
    if (!box) throw new Error("No bounding box for the Sound button");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const soundPanel = page.getByRole("group", { name: "Sound" });
    await expect(soundPanel).toBeVisible();
    // Opening the panel released nothing new — the pointer was already
    // released by Escape, and it must not have silently reacquired the lock.
    expect(await locked(page)).toBe(false);

    // The panel itself must be interactive above the overlay, not just visible.
    const before = await mutedFlag(page);
    await page.getByRole("button", { name: /^(Mute|Unmute) sound$/ }).click();
    await expect.poll(() => mutedFlag(page)).not.toBe(before);
    expect(await locked(page)).toBe(false);

    // Resume is the only thing that should relock — explicitly, not as a
    // side effect of interacting with the Sound panel.
    await page.getByRole("button", { name: "Resume" }).click();
    await expect.poll(() => locked(page)).toBe(true);
  });
});

test.describe("Finding 2 fix — a failed capture can be retried", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTALL_FAKE_MEDIA_RECORDER);
  });

  test("capture error surfaces, the start control returns, and a second attempt can begin", async ({ page }) => {
    await openAndLock(page);

    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
    expect(await locked(page)).toBe(true);

    // Deterministically fails: the fake recorder never emits a
    // dataavailable event, so `finish()`'s own `blob.size === 0` guard in
    // `src/capture/recorder.ts` fires "error" every time.
    await page.keyboard.press("c");
    await expect(page.getByRole("alert")).toHaveText(/empty gameplay recording/i);

    // Before the fix: captureState stayed stuck at "stopping" forever —
    // "Finishing gameplay highlight…" never went away and the start
    // control never came back.
    await expect(page.getByText("Finishing gameplay highlight…")).toHaveCount(0);
    const retryButton = page.getByRole("button", { name: "Start gameplay capture" });
    await expect(retryButton).toBeVisible();
    expect(await locked(page)).toBe(true);

    // The retry must actually work, via the `C` key while still locked...
    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
    expect(await locked(page)).toBe(true);

    // ...and a second failure must recover the same way, proving this
    // isn't a one-shot fix that only clears the very first error.
    await page.keyboard.press("c");
    await expect(page.getByRole("alert")).toHaveText(/empty gameplay recording/i);
    await expect(retryButton).toBeVisible();
  });

  test("the button (not just the C key) can start a second recording after an error", async ({ page }) => {
    await openAndLock(page);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect.poll(() => locked(page)).toBe(false);

    const startButton = page.getByRole("button", { name: "Start gameplay capture" });
    await startButton.click();
    await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();

    await page.getByRole("button", { name: "Stop gameplay capture" }).click();
    await expect(page.getByRole("alert")).toHaveText(/empty gameplay recording/i);
    await expect(startButton).toBeVisible();

    // Second attempt via the button itself.
    await startButton.click();
    await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
  });
});
