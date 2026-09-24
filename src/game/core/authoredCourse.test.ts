/**
 * Verifies that the authored sample route is traversable by this
 * controller.
 *
 * The scene-preparation worker authored a climb onto the Rodin furniture
 * as three helper steps. Euclidean proximity is not proof of reachability,
 * so this drives the real controller up that exact geometry and checks it
 * arrives. The step geometry is reproduced here as plain helper entities
 * rather than imported from `src/scene/samples.ts`, which lives on another
 * worker's branch — the numbers, not the module, are what matters.
 *
 * If these numbers change on the scene side, this test should be updated
 * to match; a failure here means the authored course is not completable
 * with the shared movement limits.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import { GameSimulation, NEUTRAL_INPUT, type SimulationInput } from "./simulation.js";
import { initRapier } from "./physicsWorld.js";
import { HALF_CAPSULE_HEIGHT, boxEntity, checkpointAt, floorEntity, makeManifest } from "./fixtures.js";

const CONFIG = DEFAULT_MOVEMENT_CONFIG;

// Authored Rodin climb: helper steps spanning x 1.56..3.00, ascending in
// -Z towards the furniture surface at y = 1.286.
const STEP_X_CENTRE = 2.28;
const STEP_WIDTH = 1.44;
const LOWER_STEP = { top: 0.4287, minZ: 1.974, maxZ: 2.694 };
const UPPER_STEP = { top: 0.8573, minZ: 1.254, maxZ: 1.974 };
const FURNITURE_TOP = 1.286;
const FURNITURE_MAX_Z = 1.074;

/** Camera yaw that makes "forward" point along -Z, towards the climb. */
const YAW_TOWARD_MINUS_Z = Math.PI;

function authoredLevel() {
  const manifest = makeManifest({
    entities: [
      floorEntity("game-floor", 40, 0),
      boxEntity(
        "step-lower",
        [STEP_WIDTH, LOWER_STEP.top, LOWER_STEP.maxZ - LOWER_STEP.minZ],
        [STEP_X_CENTRE, LOWER_STEP.top / 2, (LOWER_STEP.minZ + LOWER_STEP.maxZ) / 2],
      ),
      boxEntity(
        "step-upper",
        [STEP_WIDTH, UPPER_STEP.top, UPPER_STEP.maxZ - UPPER_STEP.minZ],
        [STEP_X_CENTRE, UPPER_STEP.top / 2, (UPPER_STEP.minZ + UPPER_STEP.maxZ) / 2],
      ),
      // Stand-in for the furniture surface the climb leads onto.
      boxEntity(
        "furniture-top",
        [4, FURNITURE_TOP, FURNITURE_MAX_Z + 1],
        [STEP_X_CENTRE, FURNITURE_TOP / 2, (FURNITURE_MAX_Z - 1) / 2],
      ),
    ],
    spawn: { position: [STEP_X_CENTRE, HALF_CAPSULE_HEIGHT + 0.02, 2.874], headingRadians: Math.PI },
    checkpoints: [
      checkpointAt("checkpoint-2", 0, [2.28, 0.37, 2.874], 0.5),
      checkpointAt("checkpoint-3", 1, [2.1, 1.656, 0.354], 0.5),
    ],
  });
  return manifest;
}

beforeAll(async () => {
  await initRapier();
});

describe("authored Rodin climb", () => {
  it("has step rises inside the mantle envelope", () => {
    const rises = [LOWER_STEP.top, UPPER_STEP.top - LOWER_STEP.top, FURNITURE_TOP - UPPER_STEP.top];
    for (const rise of rises) {
      expect(rise).toBeGreaterThanOrEqual(CONFIG.mantle.minLedgeHeight);
      expect(rise).toBeLessThanOrEqual(CONFIG.mantle.maxLedgeHeight);
    }
  });

  // Run the same climb at both scales. The miniature case is the one that
  // matters for the tiny-character work: it is direct evidence that shrinking
  // the body did not make an authored course unclimbable.
  it.each([
    { label: "at the authored capsule scale", miniature: false },
    { label: "at miniature capsule scale", miniature: true },
  ])("climbs onto the furniture surface using the contextual mantle $label", async ({
    miniature,
  }) => {
    const simulation = await GameSimulation.create({
      manifest: authoredLevel(),
      config: CONFIG,
      assetGeometry: new Map(),
      miniature,
    });

    // Derived from the config the simulation is actually running, not from the
    // authored one: at miniature scale the capsule's centre sits half as far
    // above the surface it is standing on.
    const halfCapsule =
      simulation.config.characterHalfHeight + simulation.config.characterRadius;

    try {
      for (let i = 0; i < 60; i += 1) simulation.stepFixed(NEUTRAL_INPUT);

      let mantlesPerformed = 0;
      const heightsReached: number[] = [];

      // Walk towards the climb, taking every mantle the controller offers.
      for (let i = 0; i < 1400; i += 1) {
        const offered = simulation.mantleTarget !== null && !simulation.isMantling;
        const controls: SimulationInput = {
          ...NEUTRAL_INPUT,
          forward: 1,
          cameraYaw: YAW_TOWARD_MINUS_Z,
          mantle: offered,
        };
        simulation.stepFixed(controls);

        for (const event of simulation.drainEvents()) {
          if (event.type === "mantle-end") {
            mantlesPerformed += 1;
            heightsReached.push(simulation.playerPosition.y);
          }
          expect(event.type).not.toBe("respawn");
        }

        if (simulation.playerPosition.y > FURNITURE_TOP + halfCapsule - 0.05) break;
      }

      // The loop exits mid-mantle, before the controller has resolved
      // grounding on the new surface; let it settle before asserting.
      for (let i = 0; i < 60; i += 1) simulation.stepFixed(NEUTRAL_INPUT);
      simulation.drainEvents();

      // Observed: the climb is completed in two mantles, not three. The
      // landing inset carries the capsule far enough onto the lower step
      // that the next probe already sees the upper step, so one mantle
      // covers both. That is fine — what the authored course has to
      // guarantee is that the surface is reached, not how many presses it
      // takes — so the assertion is on arrival, with the count recorded
      // only to catch the route degrading into a scramble.
      expect(mantlesPerformed).toBeGreaterThanOrEqual(2);
      expect(mantlesPerformed).toBeLessThanOrEqual(4);
      expect(simulation.isGrounded).toBe(true);
      expect(simulation.playerPosition.y).toBeGreaterThan(FURNITURE_TOP + halfCapsule - 0.05);
      expect(heightsReached.at(-1)).toBeGreaterThan(UPPER_STEP.top);
    } finally {
      simulation.dispose();
    }
  }, 30_000);

  it("collects the floor checkpoint then the elevated one, in order", async () => {
    const simulation = await GameSimulation.create({
      manifest: authoredLevel(),
      config: CONFIG,
      assetGeometry: new Map(),
    });

    try {
      const collected: string[] = [];
      let completed = false;

      for (let i = 0; i < 1600; i += 1) {
        const offered = simulation.mantleTarget !== null && !simulation.isMantling;
        simulation.stepFixed({
          ...NEUTRAL_INPUT,
          forward: 1,
          cameraYaw: YAW_TOWARD_MINUS_Z,
          mantle: offered,
        });
        for (const event of simulation.drainEvents()) {
          if (event.type === "checkpoint") collected.push(event.id);
          if (event.type === "complete") completed = true;
        }
        if (completed) break;
      }

      expect(collected).toEqual(["checkpoint-2", "checkpoint-3"]);
      expect(completed).toBe(true);
    } finally {
      simulation.dispose();
    }
  }, 30_000);
});
