/** Pins the disposal contract the renderer relies on: once a world is freed,
 * `isDisposed` reports it and stepping never touches Rapier again. */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import { GameSimulation, NEUTRAL_INPUT } from "./simulation.js";
import { initRapier } from "./physicsWorld.js";
import { floorEntity, makeManifest, standingSpawn } from "./fixtures.js";

beforeAll(async () => {
  await initRapier();
});

describe("GameSimulation disposal", () => {
  it("reports isDisposed only after dispose(), and stepping afterwards is a no-op", async () => {
    const sim = await GameSimulation.create({
      manifest: makeManifest({ entities: [floorEntity("floor", 20, 0)], spawn: standingSpawn(0) }),
      config: DEFAULT_MOVEMENT_CONFIG,
      assetGeometry: new Map(),
      miniature: false,
    });
    expect(sim.isDisposed).toBe(false);
    sim.stepFixed(NEUTRAL_INPUT);
    const steps = sim.fixedStepsRun;
    expect(steps).toBe(1);

    sim.dispose();
    expect(sim.isDisposed).toBe(true);
    expect(() => sim.stepFixed(NEUTRAL_INPUT)).not.toThrow();
    expect(sim.advance(NEUTRAL_INPUT, 1 / 30)).toBe(0);
    expect(sim.fixedStepsRun).toBe(steps);
    expect(() => sim.dispose()).not.toThrow();
    expect(sim.isDisposed).toBe(true);
  });
});
