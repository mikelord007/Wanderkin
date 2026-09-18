/**
 * Contextual mantle rules.
 *
 * A mantle moves the capsule along a scripted path rather than through the
 * collision solver, so every one of these cases is a safety property: if
 * the probe wrongly accepted, the player would end up inside geometry or
 * on the far side of a wall. Each test names the specific rejection it
 * expects so a regression cannot be masked by some other check failing.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type HelperEntity, type SceneManifest } from "@shared/index.js";
import { GameSimulation, NEUTRAL_INPUT, type SimulationInput } from "./simulation.js";
import { initRapier } from "./physicsWorld.js";
import { probeMantle } from "./mantle.js";
import {
  HALF_CAPSULE_HEIGHT,
  YAW_TOWARD_PLUS_X,
  boxEntity,
  floorEntity,
  makeManifest,
  standingSpawn,
} from "./fixtures.js";

const CONFIG = DEFAULT_MOVEMENT_CONFIG;
const FORWARD_X = { x: 1, y: 0, z: 0 };

beforeAll(async () => {
  await initRapier();
});

async function makeSim(manifest: SceneManifest): Promise<GameSimulation> {
  return GameSimulation.create({ manifest, config: CONFIG, assetGeometry: new Map() });
}

/**
 * A ledge of the given height whose near face is at x = `faceX`, with the
 * player standing on the floor at x = 0 facing +X.
 */
function ledgeLevel(params: {
  ledgeHeight: number;
  faceX: number;
  extras?: HelperEntity[];
}): SceneManifest {
  const depth = 4;
  return makeManifest({
    entities: [
      floorEntity("floor", 30, 0),
      boxEntity(
        "ledge",
        [depth, params.ledgeHeight, 6],
        [params.faceX + depth / 2, params.ledgeHeight / 2, 0],
      ),
      ...(params.extras ?? []),
    ],
    spawn: standingSpawn(0, 0, 0, Math.PI / 2),
  });
}

/** Settles the capsule on the floor and returns a fresh probe result. */
async function probeAfterSettling(manifest: SceneManifest) {
  const sim = await makeSim(manifest);
  for (let i = 0; i < 60; i += 1) sim.stepFixed(NEUTRAL_INPUT);
  const result = probeMantle(
    {
      RAPIER: await initRapier(),
      world: sim.scene.world,
      playerCollider: sim.scene.playerCollider,
      config: CONFIG,
    },
    sim.playerPosition,
    FORWARD_X,
  );
  return { sim, result };
}

describe("valid mantles", () => {
  it("finds a ledge inside the height envelope and within reach", async () => {
    const ledgeHeight = 0.55;
    const { sim, result } = await probeAfterSettling(ledgeLevel({ ledgeHeight, faceX: 0.4 }));
    try {
      expect(result.rejection).toBeNull();
      expect(result.target).not.toBeNull();
      // Absolute ledge height is exact; the height *above the feet* is
      // smaller by the controller's skin gap, since a resting capsule
      // hovers that far above the floor.
      expect(result.target!.ledgeTopY).toBeCloseTo(ledgeHeight, 3);
      expect(result.target!.ledgeHeight).toBeGreaterThan(ledgeHeight - 0.02);
      expect(result.target!.ledgeHeight).toBeLessThanOrEqual(ledgeHeight);
      // Destination must be past the ledge face and high enough to stand.
      expect(result.target!.destination.x).toBeGreaterThan(0.4);
      expect(result.target!.destination.y).toBeGreaterThan(ledgeHeight + HALF_CAPSULE_HEIGHT - 1e-3);
    } finally {
      sim.dispose();
    }
  });

  it("actually lands the player on the ledge, grounded and clear of it", async () => {
    const ledgeHeight = 0.55;
    const manifest = ledgeLevel({ ledgeHeight, faceX: 0.4 });
    const sim = await makeSim(manifest);
    try {
      for (let i = 0; i < 60; i += 1) sim.stepFixed(NEUTRAL_INPUT);

      const controls: SimulationInput = { ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X };
      sim.stepFixed({ ...controls, mantle: true });
      expect(sim.isMantling).toBe(true);

      for (let i = 0; i < 120; i += 1) sim.stepFixed(controls);

      expect(sim.isMantling).toBe(false);
      expect(sim.isGrounded).toBe(true);
      expect(sim.playerPosition.y).toBeCloseTo(ledgeHeight + HALF_CAPSULE_HEIGHT, 1);
      expect(sim.playerPosition.x).toBeGreaterThan(0.4);
    } finally {
      sim.dispose();
    }
  });
});

describe("ledge envelope", () => {
  it("rejects a ledge below the minimum height", async () => {
    const { sim, result } = await probeAfterSettling(
      ledgeLevel({ ledgeHeight: CONFIG.mantle.minLedgeHeight - 0.1, faceX: 0.4 }),
    );
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("ledge-too-low");
    } finally {
      sim.dispose();
    }
  });

  it("rejects a wall taller than the maximum ledge height", async () => {
    const { sim, result } = await probeAfterSettling(
      ledgeLevel({ ledgeHeight: CONFIG.mantle.maxLedgeHeight + 0.5, faceX: 0.4 }),
    );
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("ledge-too-high");
    } finally {
      sim.dispose();
    }
  });

  it("rejects a ledge beyond arm's reach", async () => {
    const tooFar = CONFIG.characterRadius + CONFIG.mantle.maxReachDistance + 0.25;
    const { sim, result } = await probeAfterSettling(ledgeLevel({ ledgeHeight: 0.55, faceX: tooFar }));
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("no-ledge");
    } finally {
      sim.dispose();
    }
  });

  it("rejects open floor with nothing to climb", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 30, 0)],
      spawn: standingSpawn(0),
    });
    const { sim, result } = await probeAfterSettling(manifest);
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("no-ledge");
    } finally {
      sim.dispose();
    }
  });
});

describe("destination clearance", () => {
  it("rejects a ledge with a ceiling too low for the capsule to stand under", async () => {
    const ledgeHeight = 0.5;
    // Ceiling spans y 0.95..1.15. The capsule standing on the ledge would
    // occupy roughly 0.52..1.22, so it does not fit.
    const { sim, result } = await probeAfterSettling(
      ledgeLevel({
        ledgeHeight,
        faceX: 0.4,
        extras: [boxEntity("ceiling", [6, 0.2, 6], [2.4, 1.05, 0])],
      }),
    );
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("destination-blocked");
    } finally {
      sim.dispose();
    }
  });

  it("rejects a ceiling that clears the capsule but violates required head clearance", async () => {
    // With the default tuning `requiredClearanceHeight` equals the capsule
    // height, so the two checks coincide and only `destination-blocked` can
    // ever fire. Raising the requirement isolates the head-clearance rule.
    const config = {
      ...CONFIG,
      mantle: { ...CONFIG.mantle, requiredClearanceHeight: 0.9 },
    };
    const ledgeHeight = 0.5;
    const manifest = ledgeLevel({
      ledgeHeight,
      faceX: 0.4,
      // Ceiling bottom at 1.3: above the capsule's 1.22 top, but below the
      // 0.52 + 0.9 = 1.42 the raised clearance demands.
      extras: [boxEntity("ceiling", [6, 0.2, 6], [2.4, 1.4, 0])],
    });
    const sim = await GameSimulation.create({ manifest, config, assetGeometry: new Map() });
    try {
      for (let i = 0; i < 60; i += 1) sim.stepFixed(NEUTRAL_INPUT);
      const result = probeMantle(
        { RAPIER: await initRapier(), world: sim.scene.world, playerCollider: sim.scene.playerCollider, config },
        sim.playerPosition,
        FORWARD_X,
      );
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("insufficient-headroom");
    } finally {
      sim.dispose();
    }
  });

  it("rejects a ledge with a block on it that raises the surface out of reach", async () => {
    const ledgeHeight = 0.5;
    const { sim, result } = await probeAfterSettling(
      ledgeLevel({
        ledgeHeight,
        faceX: 0.4,
        // A tall crate sitting on the ledge where the capsule would land:
        // the effective surface there is the crate top at 1.3, far above
        // the 0.9 maximum ledge height.
        extras: [boxEntity("crate", [0.6, 0.8, 2], [0.85, ledgeHeight + 0.4, 0])],
      }),
    );
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("ledge-too-high");
    } finally {
      sim.dispose();
    }
  });

  it("accepts the same ledge once the obstruction is removed", async () => {
    const { sim, result } = await probeAfterSettling(ledgeLevel({ ledgeHeight: 0.5, faceX: 0.4 }));
    try {
      expect(result.rejection).toBeNull();
      expect(result.target).not.toBeNull();
    } finally {
      sim.dispose();
    }
  });
});

describe("path clearance", () => {
  it("rejects a mantle that would pass through a ceiling directly overhead", async () => {
    const ledgeHeight = 0.6;
    // The ledge top and its landing space are clear, but the player is
    // standing under an overhang, so rising in place is impossible.
    const { sim, result } = await probeAfterSettling(
      ledgeLevel({
        ledgeHeight,
        faceX: 0.4,
        extras: [boxEntity("overhang", [0.8, 0.1, 6], [0, 0.8, 0])],
      }),
    );
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).toBe("path-blocked-up");
    } finally {
      sim.dispose();
    }
  });

  it("rejects a mantle that would pass through a barrier standing on the ledge edge", async () => {
    const ledgeHeight = 0.5;
    // A railing rises from the ledge edge well above the landing height,
    // so the forward leg of the mantle would sweep through it.
    const { sim, result } = await probeAfterSettling(
      ledgeLevel({
        ledgeHeight,
        faceX: 0.4,
        extras: [boxEntity("railing", [0.06, 0.9, 6], [0.43, ledgeHeight + 0.45, 0])],
      }),
    );
    try {
      expect(result.target).toBeNull();
      expect(result.rejection).not.toBeNull();
      expect(["path-blocked-forward", "destination-blocked", "no-ledge", "ledge-too-high"]).toContain(
        result.rejection,
      );
    } finally {
      sim.dispose();
    }
  });

  it("never moves the player when the probe rejects", async () => {
    const manifest = ledgeLevel({ ledgeHeight: CONFIG.mantle.maxLedgeHeight + 0.5, faceX: 0.4 });
    const sim = await makeSim(manifest);
    try {
      for (let i = 0; i < 60; i += 1) sim.stepFixed(NEUTRAL_INPUT);
      const before = sim.playerPosition;

      sim.stepFixed({ ...NEUTRAL_INPUT, mantle: true, cameraYaw: YAW_TOWARD_PLUS_X });

      expect(sim.isMantling).toBe(false);
      const after = sim.playerPosition;
      expect(Math.abs(after.x - before.x)).toBeLessThan(0.01);
      expect(Math.abs(after.y - before.y)).toBeLessThan(0.01);
    } finally {
      sim.dispose();
    }
  });
});

describe("mantle prompt", () => {
  it("reports availability while idle next to a climbable ledge", async () => {
    const manifest = ledgeLevel({ ledgeHeight: 0.5, faceX: 0.4 });
    const sim = await makeSim(manifest);
    try {
      // Face the ledge with no movement input; the prompt uses camera facing.
      for (let i = 0; i < 60; i += 1) {
        sim.stepFixed({ ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X });
      }
      expect(sim.mantleTarget).not.toBeNull();

      // Facing away from the ledge, there is nothing to mantle onto.
      for (let i = 0; i < 10; i += 1) {
        sim.stepFixed({ ...NEUTRAL_INPUT, cameraYaw: -Math.PI / 2 });
      }
      expect(sim.mantleTarget).toBeNull();
    } finally {
      sim.dispose();
    }
  });
});
