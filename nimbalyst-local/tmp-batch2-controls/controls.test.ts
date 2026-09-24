/**
 * Batch-2 verification: item 13 — gameplay controls while pointer-locked.
 *
 * Read-only against product source. Exercises the real production bundle in
 * a real Chrome: real `requestPointerLock()`, real key events, real mouse
 * input. `document.pointerLockElement` is observed, never faked, and no
 * internal game state is forced.
 *
 * Run headless for the default pass; run with OQ_BATCH2_HEADED=1 for the
 * capture happy path (headless Chrome cannot encode canvas.captureStream).
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const AUDIO_KEY = "objectquest:audio-settings:v1";
const SAMPLE = "The desk & sofa adventure";
const HEADED = Boolean(process.env.OQ_BATCH2_HEADED);

interface Diagnostics {
  playerPosition: readonly [number, number, number];
  cameraYaw: number;
  collisionTriangles: number;
}

const trace: string[] = [];

test.beforeEach(async ({ page }) => {
  trace.length = 0;
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") trace.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => trace.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => trace.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText}`));
  await page.route("**/api/levels", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
});

test.afterEach(async () => {
  console.log(trace.length ? `--- page trace ---\n${trace.join("\n")}\n---` : "--- page trace: clean ---");
});

const diagnostics = (page: Page) => page.evaluate(() => (window as any).__objectquest?.get() ?? null);
const locked = (page: Page) => page.evaluate(() => document.pointerLockElement !== null);
const mutedFlag = (page: Page) =>
  page.evaluate((k) => {
    try {
      return (JSON.parse(localStorage.getItem(k) ?? "null") as { muted?: boolean } | null)?.muted ?? null;
    } catch {
      return null;
    }
  }, AUDIO_KEY);

async function openAndLock(page: Page): Promise<Diagnostics> {
  const started = Date.now();
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: SAMPLE }) });
  await card.getByRole("button", { name: "Play now" }).click();
  await page.getByRole("button", { name: /^Play$/ }).waitFor();
  await page.getByRole("button", { name: /^Play$/ }).click();

  await expect.poll(() => locked(page)).toBe(true);
  await expect.poll(() => diagnostics(page)).not.toBeNull();
  const snapshot = (await diagnostics(page)) as Diagnostics;
  expect(snapshot.collisionTriangles).toBeGreaterThan(0);
  console.log(
    `READINESS: real pointer lock + first frame in ${Date.now() - started} ms, collisionTriangles=${snapshot.collisionTriangles}`,
  );
  return snapshot;
}

/** Proves the lock is a live gameplay lock, not just a DOM flag. */
async function proveLockIsLive(page: Page, before: Diagnostics): Promise<void> {
  await page.keyboard.down("w");
  await expect
    .poll(async () => {
      const now = (await diagnostics(page)) as Diagnostics | null;
      if (!now) return 0;
      return Math.hypot(now.playerPosition[0] - before.playerPosition[0], now.playerPosition[2] - before.playerPosition[2]);
    })
    .toBeGreaterThan(0.05);
  await page.keyboard.up("w");

  const yaw = ((await diagnostics(page)) as Diagnostics).cameraYaw;
  await page.mouse.move(640, 360);
  await page.mouse.move(760, 360);
  await expect.poll(async () => ((await diagnostics(page)) as Diagnostics).cameraYaw).not.toBe(yaw);
  console.log("LOCK IS LIVE: WASD moved the player and raw mouse motion turned the camera while locked");
}

async function stayLocked(page: Page, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    expect(await locked(page)).toBe(true);
    await page.waitForTimeout(100);
  }
}

/** Raw CDP mouse click at a element's centre — no actionability hit-test, i.e. what a real mouse does. */
async function rawClickCentre(page: Page, selectorText: string): Promise<void> {
  const box = await page.getByRole("button", { name: selectorText }).boundingBox();
  if (!box) throw new Error(`No bounding box for "${selectorText}"`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe("item 13 — controls usable while pointer-locked", () => {
  test("keyboard controls (M, C, Escape) work while pointer-locked", async ({ page }, testInfo: TestInfo) => {
    const initial = await openAndLock(page);
    await proveLockIsLive(page, initial);

    // ---- M: mute/unmute without leaving the game ------------------------
    await page.keyboard.press("m");
    await expect.poll(() => mutedFlag(page)).toBe(true);
    expect(await locked(page)).toBe(true);
    await page.keyboard.press("m");
    await expect.poll(() => mutedFlag(page)).toBe(false);
    await stayLocked(page, 500);
    console.log("PASS M: mute toggled on and off, pointer lock retained throughout");

    // ---- C: start capture without leaving the game ----------------------
    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
    await stayLocked(page, 800);
    await page.screenshot({ path: testInfo.outputPath("capture-recording-locked.png") });
    console.log("PASS C(start): capture began while locked, pointer lock retained");

    // ---- C: stop capture ------------------------------------------------
    await page.keyboard.press("c");
    if (HEADED) {
      await expect(page.getByText("Gameplay highlight ready")).toBeVisible({ timeout: 30_000 });
      expect(await locked(page)).toBe(true);
      console.log("PASS C(stop): highlight produced in-page while locked (kept in memory, not downloaded)");
    } else {
      // Headless Chrome cannot encode canvas.captureStream, so this exercises
      // the product's *error* path instead. Recorded, not asserted as success.
      const ready = page.getByText("Gameplay highlight ready");
      const stuck = page.getByText("Finishing gameplay highlight…");
      await expect(ready.or(stuck)).toBeVisible({ timeout: 30_000 });
      const failed = await stuck.isVisible();
      console.log(
        failed
          ? `OBSERVED (headless-only): capture stop ended in error — "${await page.getByRole("alert").innerText()}"`
          : "PASS C(stop): highlight produced in-page while locked",
      );
      if (failed) {
        // Does the product recover? Press C again and see.
        await page.keyboard.press("c");
        await page.waitForTimeout(1_000);
        console.log(
          `FOLLOW-UP after capture error: still showing "Finishing gameplay highlight…" = ${await stuck.isVisible()}; ` +
            `"Start gameplay capture" offered again = ${await page.getByRole("button", { name: "Start gameplay capture" }).isVisible()}`,
        );
      }
    }

    // ---- Escape pauses and releases; Resume re-locks ---------------------
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect.poll(() => locked(page)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("paused-unlocked.png"), fullPage: true });
    await page.getByRole("button", { name: "Resume" }).click();
    await expect.poll(() => locked(page)).toBe(true);
    console.log("PASS Escape/Resume: lock released on pause and re-acquired on resume");
  });

  test("HUD button clicks: what actually happens while locked, and after release", async ({ page }, testInfo: TestInfo) => {
    const initial = await openAndLock(page);
    await proveLockIsLive(page, initial);

    // ---- Probe: a real mouse click on Sound while the pointer IS locked --
    const soundPanel = page.getByRole("group", { name: "Sound" });
    await rawClickCentre(page, "Sound");
    await page.waitForTimeout(600);
    const openedWhileLocked = await soundPanel.isVisible();
    const stillLocked = await locked(page);
    console.log(
      `PROBE (pointer locked): raw click on "Sound" → panel opened = ${openedWhileLocked}, still locked = ${stillLocked}`,
    );

    const captureProbe = page.getByRole("button", { name: "Start gameplay capture" });
    if (await captureProbe.isVisible()) {
      const box = await captureProbe.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
      console.log(
        `PROBE (pointer locked): raw click on "Start gameplay capture" → recording = ` +
          `${await page.getByRole("button", { name: "Stop gameplay capture" }).isVisible()}, still locked = ${await locked(page)}`,
      );
    }

    // ---- Documented path: Escape releases the lock, then the HUD works ---
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect.poll(() => locked(page)).toBe(false);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect.poll(() => locked(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => locked(page)).toBe(false);

    await page.getByRole("button", { name: "Sound" }).click();
    await expect(soundPanel).toBeVisible();
    expect(await locked(page)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("sound-panel-open-unlocked.png"), fullPage: true });

    const mute = page.getByRole("button", { name: /^(Mute|Unmute) sound$/ });
    await mute.click();
    await expect.poll(() => mutedFlag(page)).not.toBeNull();
    console.log("PASS HUD (lock released): Sound panel opens, mute button operable, no silent re-lock");

    const start = page.getByRole("button", { name: "Start gameplay capture" });
    if (await start.isVisible()) {
      await start.click();
      await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
      expect(await locked(page)).toBe(false);
      console.log("PASS HUD (lock released): Start gameplay capture button click lands and begins recording");
      await page.getByRole("button", { name: "Stop gameplay capture" }).click();
      await page.waitForTimeout(2_000);
      console.log(`capture stop via button → ready = ${await page.getByText("Gameplay highlight ready").isVisible()}`);
    }
  });
});
