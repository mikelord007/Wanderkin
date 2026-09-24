import { expect, test, type Page, type TestInfo } from "@playwright/test";

interface Diagnostics {
  playerPosition: readonly [number, number, number];
  grounded: boolean;
  mantling: boolean;
  mantleAvailable: boolean;
  checkpointsCollected: number;
  nextCheckpointPosition: readonly [number, number, number] | null;
  cameraYaw: number;
}
type Point = readonly [number, number];
type MovementKey = "w" | "a" | "s" | "d";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/levels", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
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
  if (forward > .18) keys.add("w"); else if (forward < -.18) keys.add("s");
  if (right > .18) keys.add("d"); else if (right < -.18) keys.add("a");
  return keys;
}

async function setKeys(page: Page, held: Set<MovementKey>, wanted: Set<MovementKey>) {
  for (const key of [...held]) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}

async function drive(page: Page, target: Point, options: { radius?: number; mantle?: boolean; timeout?: number } = {}) {
  const held = new Set<MovementKey>();
  const deadline = Date.now() + (options.timeout ?? 25_000);
  let stagnant = 0;
  let last = Infinity;
  try {
    while (Date.now() < deadline) {
      const current = await diagnostics(page);
      if (!current) return;
      const remaining = distance(current.playerPosition, target);
      if (remaining <= (options.radius ?? .25)) return;
      if (options.mantle && current.mantleAvailable) {
        await page.keyboard.press("e");
        await page.waitForTimeout(350);
        continue;
      }
      await setKeys(page, held, keysToward(current, target));
      await page.waitForTimeout(90);
      stagnant = remaining >= last - .012 ? stagnant + 1 : 0;
      last = remaining;
      if (stagnant > 10) { await page.keyboard.press("Space"); stagnant = 0; }
    }
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
  throw new Error(`Timed out driving to ${target}; ${JSON.stringify(await diagnostics(page))}`);
}

async function openSample(page: Page, name: string) {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name }) });
  await card.getByRole("button", { name: "Play now" }).click();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await expect.poll(() => diagnostics(page)).not.toBeNull();
}

async function driveNextCheckpoint(page: Page, expected: number, mantle = false) {
  const current = await diagnostics(page);
  if (!current?.nextCheckpointPosition) throw new Error("Missing next checkpoint position");
  await drive(page, [current.nextCheckpointPosition[0], current.nextCheckpointPosition[2]], { mantle });
  await expect.poll(async () => (await diagnostics(page))?.checkpointsCollected ?? expected).toBe(expected);
}

test("Lost Colors completes, preserves respawn state, restarts cleanly, and produces Race results", async ({ page }, testInfo: TestInfo) => {
  testInfo.setTimeout(300_000);
  await openSample(page, "The Lost Colors of Teacup Island");
  await expect(page.getByText(/Colors found 0/)).toBeVisible();
  await drive(page, [-4.02, 2.154]);
  await expect(page.getByText(/Colors found 1/)).toBeVisible();

  await page.keyboard.press("r");
  await expect(page.getByText(/Colors found 1/)).toBeVisible();
  await drive(page, [-4.02, 2.154]);
  await expect(page.getByText(/Colors found 1/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Restart course" }).click();
  await expect(page.getByText(/Colors found 0/)).toBeVisible();

  await drive(page, [-4.02, 2.154]);
  await drive(page, [2.46, 3.594], { timeout: 30_000 });
  await expect(page.getByText(/Colors found 2/)).toBeVisible();
  await drive(page, [2.1, .354], { mantle: true, timeout: 35_000 });
  await drive(page, [.3, -.006], { timeout: 20_000 });
  await expect(page.getByText(/Colors found 3/)).toBeVisible();
  await expect(page.getByText(/portal is awake/i)).toBeVisible();
  await drive(page, [-1.14, -2.166], { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "You brought the colors back." })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("lost-colors-complete.png"), fullPage: true });

  await page.getByRole("button", { name: "Try Race mode" }).click();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator(".oq-hud__countdown")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("race-countdown.png"), fullPage: true });
  await expect(page.locator(".oq-hud__countdown")).toBeHidden({ timeout: 6_000 });
  await driveNextCheckpoint(page, 1);
  await driveNextCheckpoint(page, 2);
  await driveNextCheckpoint(page, 3, true);
  await driveNextCheckpoint(page, 4);
  await driveNextCheckpoint(page, 5);
  await drive(page, [-1.14, -2.166], { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Race finished!" })).toBeVisible();
  await expect(page.getByText("Your time")).toBeVisible();
  await expect(page.getByText("Personal best")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("race-results.png"), fullPage: true });
});

test("Explore has destinations and no timer", async ({ page }, testInfo: TestInfo) => {
  testInfo.setTimeout(180_000);
  await openSample(page, "Teacup Island Wander");
  await expect(page.getByText("Explore", { exact: true })).toBeVisible();
  await expect(page.locator(".oq-hud__objective")).not.toContainText(/\d+:\d{2}\.\d/);
  await page.screenshot({ path: testInfo.outputPath("explore-no-timer.png"), fullPage: true });
  await driveNextCheckpoint(page, 1);
  await driveNextCheckpoint(page, 2);
  await driveNextCheckpoint(page, 3, true);
  await driveNextCheckpoint(page, 4);
  await driveNextCheckpoint(page, 5);
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
});
