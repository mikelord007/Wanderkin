/**
 * Physics invariants for the capsule controller.
 *
 * These drive the real `GameSimulation` against small synthetic levels, so
 * a failure here is a controller defect, not a mesh defect. Every
 * assertion corresponds to a stated requirement: stable grounding, no
 * walking through solids, no tunnelling through thin surfaces at normal
 * speeds, working jump, automatic respawn on falling out of the level, and
 * strictly ordered checkpoint triggers.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import { GameSimulation, NEUTRAL_INPUT, type SimulationInput } from "./simulation.js";
import { initRapier } from "./physicsWorld.js";
import {
  HALF_CAPSULE_HEIGHT,
  YAW_TOWARD_MINUS_X,
  YAW_TOWARD_PLUS_X,
  boxEntity,
  checkpointAt,
  floorEntity,
  makeManifest,
  rampEntity,
  standingSpawn,
} from "./fixtures.js";
import type { Quat, SceneManifest } from "@shared/index.js";

const CONFIG = DEFAULT_MOVEMENT_CONFIG;
const H = CONFIG.fixedTimestepSeconds;
const CONTROLLER_SKIN = CONFIG.characterRadius * 0.06;

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return { ...NEUTRAL_INPUT, ...overrides };
}

async function makeSim(manifest: SceneManifest): Promise<GameSimulation> {
  return GameSimulation.create({ manifest, config: CONFIG, assetGeometry: new Map() });
}

function run(sim: GameSimulation, steps: number, controls: SimulationInput = NEUTRAL_INPUT): void {
  for (let i = 0; i < steps; i += 1) sim.stepFixed(controls);
}

beforeAll(async () => {
  await initRapier();
});

describe("grounding", () => {
  it("settles on the floor without sinking into it or hovering above it", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 120);

      expect(sim.isGrounded).toBe(true);
      const restY = sim.playerPosition.y;
      // Feet must not be below the surface, and must not float more than a
      // few skin widths above it.
      expect(restY).toBeGreaterThanOrEqual(HALF_CAPSULE_HEIGHT - 1e-3);
      expect(restY).toBeLessThanOrEqual(HALF_CAPSULE_HEIGHT + CONTROLLER_SKIN * 4);
    } finally {
      sim.dispose();
    }
  });

  it("does not jitter while standing still", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 120); // settle

      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 300; i += 1) {
        sim.stepFixed(NEUTRAL_INPUT);
        const y = sim.playerPosition.y;
        if (y < min) min = y;
        if (y > max) max = y;
      }

      expect(max - min).toBeLessThan(1e-3);
      expect(sim.isGrounded).toBe(true);
    } finally {
      sim.dispose();
    }
  });

  it("stays grounded while walking across flat ground", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      let airborneSteps = 0;
      for (let i = 0; i < 180; i += 1) {
        sim.stepFixed(input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
        if (!sim.isGrounded) airborneSteps += 1;
      }
      expect(airborneSteps).toBe(0);
      expect(sim.playerPosition.x).toBeGreaterThan(4);
    } finally {
      sim.dispose();
    }
  });
});

describe("jump", () => {
  it("reaches approximately the configured jump height and lands again", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 120);
      const restY = sim.playerPosition.y;

      sim.stepFixed(input({ jump: true }));
      let apex = sim.playerPosition.y;
      for (let i = 0; i < 40; i += 1) {
        sim.stepFixed(NEUTRAL_INPUT);
        apex = Math.max(apex, sim.playerPosition.y);
      }

      const rise = apex - restY;
      expect(rise).toBeGreaterThan(CONFIG.jumpHeight * 0.8);
      expect(rise).toBeLessThan(CONFIG.jumpHeight * 1.2);

      run(sim, 120);
      expect(sim.isGrounded).toBe(true);
      expect(sim.playerPosition.y).toBeCloseTo(restY, 2);
    } finally {
      sim.dispose();
    }
  });

  it("cannot jump again while airborne", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 120);
      const restY = sim.playerPosition.y;

      sim.stepFixed(input({ jump: true }));
      // Hold jump through the whole arc; coyote time has long expired.
      let apex = -Infinity;
      for (let i = 0; i < 40; i += 1) {
        sim.stepFixed(input({ jump: true }));
        apex = Math.max(apex, sim.playerPosition.y);
      }

      expect(apex - restY).toBeLessThan(CONFIG.jumpHeight * 1.2);
    } finally {
      sim.dispose();
    }
  });
});

describe("solid collision", () => {
  it("cannot walk through a wall", async () => {
    const wallX = 2;
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0), boxEntity("wall", [0.5, 2, 10], [wallX, 1, 0])],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      run(sim, 240, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));

      const stopX = wallX - 0.25 - CONFIG.characterRadius;
      expect(sim.playerPosition.x).toBeLessThanOrEqual(stopX + CONTROLLER_SKIN * 3);
      // Sanity: it actually travelled up to the wall rather than failing early.
      expect(sim.playerPosition.x).toBeGreaterThan(stopX - 0.1);
      expect(sim.isGrounded).toBe(true);
    } finally {
      sim.dispose();
    }
  });

  it("does not tunnel through a thin plate when falling at speed", async () => {
    const plateTopY = 2.01;
    const manifest = makeManifest({
      entities: [
        floorEntity("floor", 40, -10),
        boxEntity("plate", [6, 0.02, 6], [0, 2, 0]),
      ],
      spawn: { position: [0, 8, 0], headingRadians: 0 },
    });
    const sim = await makeSim(manifest);
    try {
      // Falls ~5.6m, reaching well over 8 m/s — far more than the plate's
      // 2cm thickness per 1/60s step.
      let peakFallSpeed = 0;
      for (let i = 0; i < 400; i += 1) {
        sim.stepFixed(NEUTRAL_INPUT);
        peakFallSpeed = Math.max(peakFallSpeed, -sim.playerVelocity.y);
        if (sim.isGrounded) break;
      }

      expect(peakFallSpeed * H).toBeGreaterThan(0.02);
      expect(sim.isGrounded).toBe(true);
      expect(sim.playerPosition.y).toBeGreaterThan(plateTopY + HALF_CAPSULE_HEIGHT - 1e-2);
      expect(sim.playerPosition.y).toBeLessThan(plateTopY + HALF_CAPSULE_HEIGHT + 0.05);
    } finally {
      sim.dispose();
    }
  });

  it("does not pass through a ceiling when jumping into it", async () => {
    const ceilingBottomY = 0.9;
    const manifest = makeManifest({
      entities: [
        floorEntity("floor", 20, 0),
        boxEntity("ceiling", [6, 0.3, 6], [0, ceilingBottomY + 0.15, 0]),
      ],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      let apex = -Infinity;
      sim.stepFixed(input({ jump: true }));
      for (let i = 0; i < 60; i += 1) {
        sim.stepFixed(NEUTRAL_INPUT);
        apex = Math.max(apex, sim.playerPosition.y);
      }
      // Capsule top must stay below the ceiling.
      expect(apex + HALF_CAPSULE_HEIGHT).toBeLessThanOrEqual(ceilingBottomY + 1e-2);
    } finally {
      sim.dispose();
    }
  });
});

describe("terrain traversal", () => {
  // The capsule's rounded base rolls over obstacles up to roughly its own
  // radius; taller ones stop it and must be jumped or mantled. These lock
  // that boundary in so a tuning change cannot silently make the character
  // walk over things it should have to climb.
  it("walks over small lips without leaving the ground", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0), boxEntity("lip", [6, 0.09, 6], [3, 0.045, 0])],
      spawn: standingSpawn(0, -2, 0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      run(sim, 200, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
      expect(sim.playerPosition.x).toBeGreaterThan(1);
      expect(sim.isGrounded).toBe(true);
    } finally {
      sim.dispose();
    }
  });

  it("is stopped by an obstacle taller than the capsule radius", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0), boxEntity("step", [6, 0.25, 6], [3, 0.125, 0])],
      spawn: standingSpawn(0, -2, 0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      run(sim, 240, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
      expect(sim.playerPosition.x).toBeLessThan(0);
      expect(sim.measuredHorizontalSpeed).toBeLessThan(0.05);
    } finally {
      sim.dispose();
    }
  });

  it("walks up a ramp onto an elevated surface", async () => {
    // Ramp geometry rises along its local +Z; rotate +90 degrees about Y so
    // it rises along world +X, from y=0 at x=0 to y=0.4 at x=1.2.
    const riseTowardPlusX: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const manifest = makeManifest({
      entities: [
        floorEntity("floor", 20, 0),
        rampEntity("ramp", [2, 0.4, 1.2], [0.6, 0.2, 0], riseTowardPlusX),
        boxEntity("ledge", [4, 0.4, 4], [3.2, 0.2, 0]),
      ],
      spawn: standingSpawn(0, -2, 0),
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      let reachedLedgeHeight = false;
      for (let i = 0; i < 200; i += 1) {
        sim.stepFixed(input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
        if (sim.playerPosition.x > 1.5 && sim.playerPosition.x < 5) {
          reachedLedgeHeight ||= Math.abs(sim.playerPosition.y - (0.4 + HALF_CAPSULE_HEIGHT)) < 0.05;
        }
      }
      expect(reachedLedgeHeight).toBe(true);
    } finally {
      sim.dispose();
    }
  });
});

describe("respawn", () => {
  it("automatically respawns at the spawn point after falling out of the level", async () => {
    const spawn = standingSpawn(0);
    const manifest = makeManifest({
      entities: [floorEntity("floor", 2, 0)],
      spawn,
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      let respawned = false;
      for (let i = 0; i < 600 && !respawned; i += 1) {
        sim.stepFixed(input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
        respawned = sim.drainEvents().some((e) => e.type === "respawn" && e.reason === "fell");
      }

      expect(respawned).toBe(true);
      expect(sim.playerPosition.x).toBeCloseTo(spawn.position[0], 5);
      expect(sim.playerPosition.y).toBeCloseTo(spawn.position[1], 5);
      expect(sim.playerVelocity.y).toBe(0);
    } finally {
      sim.dispose();
    }
  });

  it("respawns at the last activated checkpoint, not the spawn", async () => {
    const spawn = standingSpawn(0, 0, 0);
    const respawnPose = standingSpawn(0, 3, 0, 1.25);
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn,
      checkpoints: [checkpointAt("cp-1", 0, [3, HALF_CAPSULE_HEIGHT, 0], 0.6, respawnPose)],
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      run(sim, 200, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
      expect(sim.checkpointsCollected).toBe(1);

      sim.drainEvents();
      sim.stepFixed(input({ respawn: true }));

      const events = sim.drainEvents();
      expect(events.some((e) => e.type === "respawn" && e.reason === "manual")).toBe(true);
      expect(sim.playerPosition.x).toBeCloseTo(respawnPose.position[0], 5);
      expect(sim.playerPosition.y).toBeCloseTo(respawnPose.position[1], 5);
    } finally {
      sim.dispose();
    }
  });
});

describe("checkpoint sequencing in a live level", () => {
  it("only triggers checkpoints in manifest order and completes on the last", async () => {
    const y = HALF_CAPSULE_HEIGHT;
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
      checkpoints: [
        // Deliberately out of spatial order: the player walks past "second"
        // before reaching "first".
        checkpointAt("first", 0, [3, y, 0], 0.5),
        checkpointAt("second", 1, [1.5, y, 0], 0.5),
        checkpointAt("third", 2, [4.5, y, 0], 0.5),
      ],
    });
    const sim = await makeSim(manifest);
    const collected: string[] = [];
    let completed = false;

    const drive = (steps: number, controls: SimulationInput) => {
      for (let i = 0; i < steps; i += 1) {
        sim.stepFixed(controls);
        for (const event of sim.drainEvents()) {
          if (event.type === "checkpoint") collected.push(event.id);
          if (event.type === "complete") completed = true;
        }
      }
    };

    try {
      run(sim, 60);

      // Walk +X past "second" (x=1.5) and on to "first" (x=3).
      drive(150, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
      expect(collected).toEqual(["first"]);
      expect(sim.nextCheckpointId).toBe("second");

      // Walk back -X to collect "second".
      drive(150, input({ forward: 1, cameraYaw: YAW_TOWARD_MINUS_X }));
      expect(collected).toEqual(["first", "second"]);
      expect(completed).toBe(false);

      // Forward again past "first" to "third".
      drive(300, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));

      expect(collected).toEqual(["first", "second", "third"]);
      expect(completed).toBe(true);
      expect(sim.completed).toBe(true);
      expect(sim.checkpointsCollected).toBe(3);
      expect(sim.nextCheckpointId).toBeNull();
    } finally {
      sim.dispose();
    }
  });

  it("reset() restores the spawn and clears collected checkpoints for replay", async () => {
    const spawn = standingSpawn(0);
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn,
      checkpoints: [checkpointAt("only", 0, [3, HALF_CAPSULE_HEIGHT, 0], 0.6)],
    });
    const sim = await makeSim(manifest);
    try {
      run(sim, 60);
      run(sim, 200, input({ forward: 1, cameraYaw: YAW_TOWARD_PLUS_X }));
      expect(sim.completed).toBe(true);

      sim.reset();

      expect(sim.completed).toBe(false);
      expect(sim.checkpointsCollected).toBe(0);
      expect(sim.nextCheckpointId).toBe("only");
      expect(sim.playerPosition.x).toBeCloseTo(spawn.position[0], 5);
      expect(sim.drainEvents()).toEqual([]);
    } finally {
      sim.dispose();
    }
  });
});

describe("fixed timestep accumulator", () => {
  it("runs a bounded number of sub-steps regardless of frame delta", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      expect(sim.advance(NEUTRAL_INPUT, H * 2.5)).toBe(2);
      // A long stall must not be paid back all at once.
      expect(sim.advance(NEUTRAL_INPUT, 10)).toBe(CONFIG.maxSubSteps);
      // The backlog is dropped rather than carried into later frames.
      expect(sim.advance(NEUTRAL_INPUT, 0)).toBe(0);
    } finally {
      sim.dispose();
    }
  });

  it("does not lose a jump pressed during a frame that runs no fixed step", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
    });
    const sim = await makeSim(manifest);
    try {
      for (let i = 0; i < 20; i += 1) sim.advance(NEUTRAL_INPUT, H);
      const restY = sim.playerPosition.y;

      // Zero-length frame: the press cannot be consumed yet.
      expect(sim.advance(input({ jump: true }), 0)).toBe(0);
      expect(sim.playerPosition.y).toBeCloseTo(restY, 6);

      sim.advance(NEUTRAL_INPUT, H);
      expect(sim.drainEvents().some((e) => e.type === "jump")).toBe(true);
    } finally {
      sim.dispose();
    }
  });
});
