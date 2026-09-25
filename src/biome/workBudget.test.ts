import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type SceneManifest } from "@shared/index.js";
import { toMiniatureScale } from "../game/core/characterScale.js";
import { prepareAdventure } from "./adventures.js";
import { BiomeGeometryError } from "./geometry.js";
import { sampleScanFixture } from "./geometryFixtures.js";
import { ADVENTURE_TIME_BUDGET_MS, AdventureBudgetExhaustedError, WorkDeadline } from "./workBudget.js";

// Worst case on a real scan: every structure trial and every publish check is
// computed for real and then refused, so generation walks every loop of both
// attempts before giving up. Only this file sees the refusals.
const force = vi.hoisted(() => ({ on: false }));
vi.mock("../game/placementValidation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../game/placementValidation.js")>();
  return {
    ...actual,
    validateExperiencePlacements: (...args: Parameters<typeof actual.validateExperiencePlacements>) => {
      const result = actual.validateExperiencePlacements(...args);
      if (!force.on) return result;
      return { ok: false, validation: { ...result.validation, status: "failed" }, issues: [{ entityId: "forced", kind: "checkpoint", code: "unreachable", message: "Forced refusal." }] };
    },
  };
});
vi.mock("../scene/route.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scene/route.js")>();
  return {
    ...actual,
    findRoute: (...args: Parameters<typeof actual.findRoute>) => {
      const route = actual.findRoute(...args);
      return force.on ? null : route;
    },
  };
});

const RUNTIME = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);

describe("WorkDeadline", () => {
  it("allows work up to the limit and then refuses with the stage it stopped before", () => {
    let t = 0;
    const deadline = new WorkDeadline(2, () => t);
    t = 2;
    expect(() => deadline.check("a")).not.toThrow();
    t = 2.5;
    let thrown: unknown;
    try {
      deadline.check("the publish check");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AdventureBudgetExhaustedError);
    // Mapped to the contract's "no-playable-layout" refusal.
    expect(thrown).toBeInstanceOf(BiomeGeometryError);
    expect((thrown as AdventureBudgetExhaustedError).stage).toBe("the publish check");
    expect(deadline.checkCount).toBe(2);
    expect(ADVENTURE_TIME_BUDGET_MS).toBe(2000);
  });
});

describe("worst-case refusal on a real scan", () => {
  it("refuses a floorless Rodin scan whose every layout is refused, keeping the source", () => {
    const fixture = sampleScanFixture("sample-rodin-room-corner", false);
    // No floor entity: a refusal on the scan runs the game-floor attempt too.
    const manifest: SceneManifest = { ...fixture.manifest, entities: fixture.manifest.entities.filter((e) => e.kind === "generated-mesh") };
    const source = JSON.stringify(manifest);
    const request = { manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal" as const, seed: "worst" };

    force.on = true;
    try {
      // The production limit on a clock that never advances, so every loop of
      // both attempts runs and is refused. With the wall clock, a loaded
      // machine let the 2 s budget stop it after as few as 11 checks, making
      // the check count below depend on CPU contention. The budget itself is
      // covered with an injected clock above and in adventures.test.ts.
      const deadline = new WorkDeadline(ADVENTURE_TIME_BUDGET_MS, () => 0);
      const started = performance.now();
      const outcome = prepareAdventure(request, deadline);
      const elapsed = performance.now() - started;
      console.info(`worst-case refusal: ${Math.round(elapsed)} ms, ${deadline.checkCount} checks`);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("no-playable-layout");
        expect(outcome.manifest).toBe(manifest);
      }
      expect(JSON.stringify(manifest)).toBe(source);
      // Both attempts are exhausted (about 60 checks, 1.2–1.3 s here). The
      // bound is the budget plus a generous margin; it absorbs a loaded
      // machine without making this a timing test.
      expect(deadline.checkCount).toBeGreaterThan(10);
      expect(elapsed).toBeLessThan(ADVENTURE_TIME_BUDGET_MS + 8000);
    } finally {
      force.on = false;
    }
  }, 60_000);
});
