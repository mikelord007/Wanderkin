import { expect, test, type Page } from "@playwright/test";

interface Diagnostics {
  playerPosition: readonly [number, number, number];
  playerVelocity: readonly [number, number, number];
  grounded: boolean;
  mantling: boolean;
  mantleAvailable: boolean;
  mantleRejection: string | null;
  checkpointsCollected: number;
  checkpointsTotal: number;
  nextCheckpointId: string | null;
  nextCheckpointPosition: readonly [number, number, number] | null;
  completed: boolean;
  cameraYaw: number;
  fixedStepsRun: number;
  collisionTriangles: number;
  warnings: readonly string[];
}

type Point = readonly [number, number];
type MovementKey = "w" | "a" | "s" | "d";

async function readDiagnostics(page: Page): Promise<Diagnostics | null> {
  return page.evaluate(() => window.__objectquest?.get() ?? null);
}

async function openSample(page: Page, name: string): Promise<Diagnostics> {
  await page.goto("/");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name }),
  });
  await card.getByRole("button", { name: "Play now" }).click();
  await page.getByRole("button", { name: /^Play$/ }).waitFor();
  await page.getByRole("button", { name: /^Play$/ }).click();

  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await expect.poll(() => readDiagnostics(page)).not.toBeNull();
  const diagnostics = await readDiagnostics(page);
  expect(diagnostics?.collisionTriangles).toBeGreaterThan(0);
  return diagnostics!;
}

function horizontalDistance(position: readonly [number, number, number], target: Point): number {
  return Math.hypot(position[0] - target[0], position[2] - target[1]);
}

function keysToward(diagnostics: Diagnostics, target: Point): Set<MovementKey> {
  const dx = target[0] - diagnostics.playerPosition[0];
  const dz = target[1] - diagnostics.playerPosition[2];
  const length = Math.hypot(dx, dz) || 1;
  const x = dx / length;
  const z = dz / length;
  const yaw = diagnostics.cameraYaw;
  const forward = x * Math.sin(yaw) + z * Math.cos(yaw);
  const right = x * -Math.cos(yaw) + z * Math.sin(yaw);
  const keys = new Set<MovementKey>();
  if (forward > 0.18) keys.add("w");
  else if (forward < -0.18) keys.add("s");
  if (right > 0.18) keys.add("d");
  else if (right < -0.18) keys.add("a");
  return keys;
}

async function setMovementKeys(page: Page, held: Set<MovementKey>, wanted: Set<MovementKey>): Promise<void> {
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

async function releaseMovementKeys(page: Page, held: Set<MovementKey>): Promise<void> {
  for (const key of held) await page.keyboard.up(key);
  held.clear();
}

async function driveToPoint(
  page: Page,
  target: Point,
  options: { radius?: number; mantle?: boolean; timeoutMs?: number } = {},
): Promise<{ mantleObserved: boolean; maxY: number }> {
  const radius = options.radius ?? 0.28;
  const timeoutAt = Date.now() + (options.timeoutMs ?? 15_000);
  const held = new Set<MovementKey>();
  let mantleObserved = false;
  let maxY = -Infinity;
  let lastDistance = Infinity;
  let stagnantTicks = 0;

  try {
    while (Date.now() < timeoutAt) {
      const diagnostics = await readDiagnostics(page);
      if (!diagnostics) {
        if (await page.getByText("Course complete", { exact: true }).isVisible()) {
          return { mantleObserved, maxY };
        }
        throw new Error("Game diagnostics disappeared before the target was reached");
      }
      maxY = Math.max(maxY, diagnostics.playerPosition[1]);
      const distance = horizontalDistance(diagnostics.playerPosition, target);
      if (distance <= radius) return { mantleObserved, maxY };

      if (options.mantle && diagnostics.mantleAvailable) {
        // Keep the approach keys held while pressing E. The simulation does a
        // fresh mantle probe on the key edge using the current movement-facing
        // direction, so releasing movement first can legitimately reject the
        // mantle even though the previous read advertised one.
        await page.keyboard.press("e");
        const sampleUntil = Date.now() + 380;
        while (Date.now() < sampleUntil) {
          const transition = await readDiagnostics(page);
          if (transition) {
            mantleObserved ||= transition.mantling;
            maxY = Math.max(maxY, transition.playerPosition[1]);
          }
          await page.waitForTimeout(25);
        }
        continue;
      }

      await setMovementKeys(page, held, keysToward(diagnostics, target));
      await page.waitForTimeout(100);

      if (distance >= lastDistance - 0.015) stagnantTicks += 1;
      else stagnantTicks = 0;
      lastDistance = distance;
      if (stagnantTicks >= 10) {
        await page.keyboard.press("Space");
        stagnantTicks = 0;
      }
    }
  } finally {
    await releaseMovementKeys(page, held);
  }

  const final = await readDiagnostics(page);
  throw new Error(`Timed out driving to ${target.join(",")}; final diagnostics: ${JSON.stringify(final)}`);
}

async function collectNextCheckpoint(
  page: Page,
  expectedCount: number,
  options: { mantle?: boolean; timeoutMs?: number } = {},
): Promise<{ mantleObserved: boolean; maxY: number }> {
  const initial = await readDiagnostics(page);
  if (!initial?.nextCheckpointPosition) throw new Error("No next checkpoint was published");
  const target: Point = [initial.nextCheckpointPosition[0], initial.nextCheckpointPosition[2]];
  const result = await driveToPoint(page, target, { ...options, radius: 0.24 });
  await expect
    .poll(async () => {
      const current = await readDiagnostics(page);
      if (current) return current.checkpointsCollected;
      return (await page.getByText("Course complete", { exact: true }).isVisible()) ? expectedCount : -1;
    })
    .toBe(expectedCount);
  return result;
}

async function verifyPauseAndResume(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
}

async function verifyJump(page: Page): Promise<void> {
  const before = await readDiagnostics(page);
  if (!before) throw new Error("No diagnostics before jump");
  await page.keyboard.press("Space");
  let apex = before.playerPosition[1];
  await expect
    .poll(async () => {
      const current = await readDiagnostics(page);
      if (current) apex = Math.max(apex, current.playerPosition[1]);
      return apex;
    })
    .toBeGreaterThan(before.playerPosition[1] + 0.25);
  await expect.poll(async () => (await readDiagnostics(page))?.grounded ?? false).toBe(true);
}

async function verifyManualRespawn(page: Page, expectedCount: number): Promise<void> {
  const checkpoint = await readDiagnostics(page);
  if (!checkpoint) throw new Error("No diagnostics before respawn check");
  const safePosition = checkpoint.playerPosition;
  await driveToPoint(page, [safePosition[0] + 1.0, safePosition[2]], { radius: 0.2 });
  await page.keyboard.press("r");
  await expect
    .poll(async () => {
      const current = await readDiagnostics(page);
      return current ? horizontalDistance(current.playerPosition, [safePosition[0], safePosition[2]]) : Infinity;
    })
    .toBeLessThan(0.35);
  expect((await readDiagnostics(page))?.checkpointsCollected).toBe(expectedCount);
}

async function verifyFallRespawn(page: Page, outwardTarget: Point, expectedCount: number): Promise<void> {
  const checkpoint = await readDiagnostics(page);
  if (!checkpoint) throw new Error("No diagnostics before fall check");
  const safePosition = checkpoint.playerPosition;
  const held = new Set<MovementKey>();
  let fellBelowFloor = false;
  const deadline = Date.now() + 8_000;
  try {
    while (Date.now() < deadline) {
      const current = await readDiagnostics(page);
      if (!current) throw new Error("Diagnostics disappeared during fall check");
      if (current.playerPosition[1] < -0.5) fellBelowFloor = true;
      if (
        fellBelowFloor &&
        current.grounded &&
        horizontalDistance(current.playerPosition, [safePosition[0], safePosition[2]]) < 0.45
      ) {
        expect(current.checkpointsCollected).toBe(expectedCount);
        return;
      }
      await setMovementKeys(page, held, keysToward(current, outwardTarget));
      await page.waitForTimeout(100);
    }
  } finally {
    await releaseMovementKeys(page, held);
  }
  throw new Error(`Did not observe fall + automatic respawn; diagnostics: ${JSON.stringify(await readDiagnostics(page))}`);
}

async function finishAndReplay(page: Page): Promise<void> {
  await expect(page.getByText("Course complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play again" }).click();
  await page.getByRole("button", { name: /^Play$/ }).waitFor();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await expect.poll(async () => (await readDiagnostics(page))?.checkpointsCollected ?? -1).toBe(0);
}

test.describe("real browser gameplay input", () => {
  test("completes and replays the Rodin sample with keyboard and mouse", async ({ page }) => {
    const initial = await openSample(page, "The desk & sofa adventure");
    const yawBefore = initial.cameraYaw;
    await page.mouse.move(640, 360);
    await page.mouse.move(720, 360);
    await expect.poll(async () => (await readDiagnostics(page))?.cameraYaw ?? yawBefore).not.toBe(yawBefore);

    await collectNextCheckpoint(page, 1);
    await verifyPauseAndResume(page);
    await verifyManualRespawn(page, 1);
    await verifyJump(page);
    await verifyFallRespawn(page, [-4.02, 7.5], 1);

    await collectNextCheckpoint(page, 2, { timeoutMs: 20_000 });
    const elevated = await collectNextCheckpoint(page, 3, { mantle: true, timeoutMs: 25_000 });
    expect(elevated.mantleObserved).toBe(true);
    expect(elevated.maxY).toBeGreaterThan(1.4);
    await collectNextCheckpoint(page, 4, { timeoutMs: 15_000 });
    await collectNextCheckpoint(page, 5, { timeoutMs: 20_000 });
    await finishAndReplay(page);
  });

  test("completes and replays the Tripo sample with the same controls", async ({ page }) => {
    await openSample(page, "A different perspective");
    await collectNextCheckpoint(page, 1, { timeoutMs: 20_000 });
    await verifyPauseAndResume(page);
    await verifyJump(page);

    await driveToPoint(page, [4.2, -3.42], { timeoutMs: 15_000 });
    await collectNextCheckpoint(page, 2, { timeoutMs: 20_000 });
    const elevated = await collectNextCheckpoint(page, 3, { mantle: true, timeoutMs: 25_000 });
    expect(elevated.mantleObserved).toBe(true);
    expect(elevated.maxY).toBeGreaterThan(1.6);
    await collectNextCheckpoint(page, 4, { timeoutMs: 20_000 });
    await collectNextCheckpoint(page, 5, { timeoutMs: 25_000 });
    await finishAndReplay(page);
  });
});
