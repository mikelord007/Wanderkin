/**
 * Grappling hook against the real controller at the runtime (miniature) body
 * size: which anchor a camera ray picks, the reel's acceleration and arrival,
 * letting go early, the cooldown and state machine, and respawn mid-reel.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type HelperEntity } from "@shared/index.js";
import { boxEntity, floorEntity, makeManifest, standingSpawn, YAW_TOWARD_PLUS_X } from "./fixtures.js";
import {
  GRAPPLE_COOLDOWN_SECONDS,
  GRAPPLE_MIN_RANGE_METERS,
  GRAPPLE_SURFACE_OFFSET,
  HOOK_MAX_FLIGHT_SECONDS,
  HOOK_MIN_FLIGHT_SECONDS,
  REEL_BRAKE,
  REEL_MIN_SPEED,
  REEL_SPEED_RATIO,
  grappleRange,
  hookFlightSeconds,
  mainObjectHeight,
  nextReelSpeed,
  reelSteerPoint,
  segmentHitsProp,
  type GrappleAim,
} from "./grapple.js";
import { initRapier } from "./physicsWorld.js";
import type { PropCollider } from "./propColliders.js";
import { GameSimulation, NEUTRAL_INPUT, type SimulationEvent, type SimulationInput } from "./simulation.js";
import type { Vec3Like } from "./vec.js";

beforeAll(async () => {
  await initRapier();
});

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const H = DEFAULT_MOVEMENT_CONFIG.fixedTimestepSeconds;

/** The "main object": a block 1.2 m tall whose near face is at x = 2. */
const BLOCK_TOP = 1.2;
const BLOCK_FACE_X = 2;
function block(height = BLOCK_TOP, faceX = BLOCK_FACE_X): HelperEntity {
  return boxEntity("block", [2, height, 2], [faceX + 1, height / 2, 0]);
}

async function world(extra: HelperEntity[] = [block()]): Promise<GameSimulation> {
  const manifest = makeManifest({
    entities: [floorEntity("floor", 60, 0), ...extra],
    spawn: standingSpawn(0, 0, 0, YAW_TOWARD_PLUS_X),
  });
  const sim = await GameSimulation.create({ manifest, config: DEFAULT_MOVEMENT_CONFIG, assetGeometry: new Map(), miniature: true });
  for (let i = 0; i < 30; i += 1) sim.stepFixed(NEUTRAL_INPUT);
  return sim;
}

/** A third-person camera ray: from behind and above the player, through `point`. */
function aimAt(sim: GameSimulation, point: Vec3Like): GrappleAim {
  const p = sim.playerPosition;
  const origin = { x: p.x - 0.6, y: p.y + 0.35, z: p.z };
  return { origin, direction: { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z } };
}

function fire(sim: GameSimulation, aim: GrappleAim): SimulationEvent[] {
  sim.stepFixed({ ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X, grapple: true, aim });
  return sim.drainEvents();
}

function step(sim: GameSimulation, steps: number, input: SimulationInput = { ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X }): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  for (let i = 0; i < steps; i += 1) {
    sim.stepFixed(input);
    events.push(...sim.drainEvents());
  }
  return events;
}

function trunk(x: number, z: number, radius: number, height: number): PropCollider {
  const upper = height - radius;
  return {
    id: `trunk-${x}-${z}`,
    shape: { kind: "capsule", radius, halfHeight: upper / 2 },
    position: { x, y: upper / 2, z },
    rotation: IDENTITY,
    baseY: 0,
    height,
    reach: radius,
  };
}

describe("grapple tuning", () => {
  it("reaches 2.5x the main object's height, never less than a metre", () => {
    expect(grappleRange(3.5)).toBeCloseTo(8.75);
    expect(grappleRange(0.2)).toBe(GRAPPLE_MIN_RANGE_METERS);
    expect(grappleRange(Number.NaN)).toBe(GRAPPLE_MIN_RANGE_METERS);
  });

  it("measures the tallest generated mesh, falling back to the scene", () => {
    const scene = { min: { x: 0, y: -1, z: 0 }, max: { x: 1, y: 2, z: 1 } };
    expect(mainObjectHeight([{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 3.4, z: 1 } }], scene)).toBeCloseTo(3.4);
    expect(mainObjectHeight([], scene)).toBeCloseTo(3);
  });

  it("flies the hook in 0.15-0.3 s whatever the distance", () => {
    expect(hookFlightSeconds(0.1)).toBe(HOOK_MIN_FLIGHT_SECONDS);
    expect(hookFlightSeconds(100)).toBe(HOOK_MAX_FLIGHT_SECONDS);
  });

  it("accelerates to 3.5x walk speed and brakes into the target", () => {
    const walk = DEFAULT_MOVEMENT_CONFIG.walkSpeed;
    let speed = 0;
    const speeds: number[] = [];
    for (let i = 0; i < 30; i += 1) speeds.push((speed = nextReelSpeed(speed, 10, walk, H)));
    for (let i = 1; i < speeds.length; i += 1) expect(speeds[i]!).toBeGreaterThanOrEqual(speeds[i - 1]!);
    expect(speeds.at(-1)).toBeCloseTo(walk * REEL_SPEED_RATIO);
    expect(nextReelSpeed(walk * REEL_SPEED_RATIO, 0.05, walk, H)).toBeCloseTo(Math.max(REEL_MIN_SPEED, Math.sqrt(2 * REEL_BRAKE * 0.05)));
  });

  it("lofts the path above the target, converging on it", () => {
    const target = { x: 4, y: 1, z: 0 };
    expect(reelSteerPoint({ x: 0, y: 0, z: 0 }, target).y).toBeGreaterThan(target.y + 1);
    expect(reelSteerPoint({ x: 4, y: 0.5, z: 0 }, target)).toEqual(target);
  });
});

describe("grapple aim selection", () => {
  it("hooks the main object's top and pulls toward standing on it", async () => {
    const sim = await world();
    try {
      const shot = sim.previewGrapple(aimAt(sim, { x: BLOCK_FACE_X + 0.4, y: BLOCK_TOP, z: 0 }));
      expect(shot.rejection).toBeNull();
      expect(["surface", "ledge"]).toContain(shot.anchor!.kind);
      // Standing on the top, whichever face the rope caught.
      const halfTotal = sim.config.characterHalfHeight + sim.config.characterRadius;
      expect(shot.anchor!.target.y).toBeCloseTo(BLOCK_TOP + halfTotal, 1);
      expect(shot.anchor!.target.x).toBeGreaterThan(BLOCK_FACE_X);
    } finally {
      sim.dispose();
    }
  });

  it("offsets the hook off the surface along its normal", async () => {
    const sim = await world([block(4)]);
    try {
      const shot = sim.previewGrapple(aimAt(sim, { x: BLOCK_FACE_X, y: 1, z: 0 }));
      expect(shot.anchor?.kind).toBe("wall");
      expect(shot.anchor!.normal.x).toBeCloseTo(-1);
      expect(shot.anchor!.point.x).toBeCloseTo(BLOCK_FACE_X - GRAPPLE_SURFACE_OFFSET, 4);
      // The capsule is pulled to hang just off the face, never into it.
      expect(shot.anchor!.target.x).toBeLessThan(BLOCK_FACE_X - sim.config.characterRadius);
    } finally {
      sim.dispose();
    }
  });

  it("refuses a surface beyond range, the open sky and the player's own feet", async () => {
    const sim = await world([block(BLOCK_TOP, 9)]);
    try {
      expect(sim.grappleRange).toBeLessThan(9);
      expect(sim.previewGrapple(aimAt(sim, { x: 9, y: 0.6, z: 0 })).rejection).toBe("out-of-range");
      const sky = sim.previewGrapple(aimAt(sim, { x: 1, y: 30, z: 0 }));
      expect(sky.rejection).toBe("no-surface");
      expect(sky.aimPoint).not.toBeNull();
      expect(sim.previewGrapple(aimAt(sim, { x: 0.05, y: 0, z: 0 })).rejection).toBe("too-close");
      expect(sim.previewGrapple(null).rejection).toBe("no-aim");
    } finally {
      sim.dispose();
    }
  });

  it("never hooks a biome prop: the ray looks through it, and a prop in the rope's way blocks the shot", async () => {
    const sim = await world();
    try {
      sim.setPropColliders([trunk(1, 0, 0.12, 1.5)]);
      const throughTrunk = sim.previewGrapple(aimAt(sim, { x: 1, y: 0.5, z: 0 }));
      expect(throughTrunk.anchor).toBeNull();
      expect(throughTrunk.rejection).toBe("blocked");

      // With nothing behind it, a trunk alone is not an anchor either.
      sim.setPropColliders([trunk(1, 1.5, 0.12, 1.5)]);
      const trunkOnly = sim.previewGrapple(aimAt(sim, { x: 1, y: 1.2, z: 1.5 }));
      expect(trunkOnly.anchor).toBeNull();
      expect(trunkOnly.rejection).not.toBeNull();

      // A trunk too far away to be enabled in physics still blocks the rope.
      sim.setPropColliders([trunk(BLOCK_FACE_X - 0.3, 0, 0.12, 3)]);
      expect(sim.propColliderStats.active).toBe(0);
      const farTrunk = sim.previewGrapple(aimAt(sim, { x: BLOCK_FACE_X, y: 0.6, z: 0 }));
      expect(farTrunk.rejection).toBe("blocked");
    } finally {
      sim.dispose();
    }
  });

  it("tests the rope against a prop's upright footprint", () => {
    const prop = { position: { x: 1, y: 0.5, z: 0 }, reach: 0.1, baseY: 0, height: 1 };
    expect(segmentHitsProp({ x: 0, y: 0.5, z: 0 }, { x: 2, y: 0.5, z: 0 }, prop)).toBe(true);
    expect(segmentHitsProp({ x: 0, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }, prop)).toBe(false);
    expect(segmentHitsProp({ x: 0, y: 0.5, z: 0.3 }, { x: 2, y: 0.5, z: 0.3 }, prop)).toBe(false);
    expect(segmentHitsProp({ x: 0, y: 0.5, z: 0 }, { x: 0.8, y: 0.5, z: 0 }, prop)).toBe(false);
  });
});

describe("grapple reel", () => {
  it("flies, attaches, accelerates, and lands the character on top of the object", async () => {
    const sim = await world();
    try {
      const events = fire(sim, aimAt(sim, { x: BLOCK_FACE_X + 0.5, y: BLOCK_TOP, z: 0 }));
      expect(events).toContainEqual({ type: "grapple-fire", hit: true });
      expect(sim.grappleView.phase).toBe("flying");

      const later = step(sim, Math.ceil(HOOK_MAX_FLIGHT_SECONDS / H) + 1);
      expect(later.some((event) => event.type === "grapple-attach")).toBe(true);
      expect(sim.isReeling).toBe(true);

      const speeds: number[] = [];
      const released: SimulationEvent[] = [];
      for (let i = 0; i < 240 && sim.isReeling; i += 1) {
        sim.stepFixed({ ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X });
        speeds.push(sim.measuredHorizontalSpeed);
        released.push(...sim.drainEvents());
        expect(sim.playerPosition.x).toBeLessThan(BLOCK_FACE_X + 2 + 0.1);
      }
      expect(sim.isReeling).toBe(false);
      expect(Math.max(...speeds)).toBeGreaterThan(DEFAULT_MOVEMENT_CONFIG.walkSpeed * 1.5);
      expect(Math.max(...speeds)).toBeLessThanOrEqual(DEFAULT_MOVEMENT_CONFIG.walkSpeed * REEL_SPEED_RATIO + 1e-6);
      expect(released.find((event) => event.type === "grapple-release")).toBeDefined();

      step(sim, 90);
      const feet = sim.playerPosition.y - sim.config.characterHalfHeight - sim.config.characterRadius;
      expect(sim.isGrounded).toBe(true);
      expect(feet).toBeGreaterThan(BLOCK_TOP - 0.02);
      expect(sim.playerPosition.x).toBeGreaterThan(BLOCK_FACE_X);
    } finally {
      sim.dispose();
    }
  });

  it("clears a desk's overhanging top rather than reeling in under it", async () => {
    // A 1.2 m desk: a thin top overhanging its legs, nothing underneath.
    const topY = 1.2;
    const desk = [
      boxEntity("top", [2, 0.06, 2], [3, topY - 0.03, 0]),
      boxEntity("leg-a", [0.08, topY - 0.06, 0.08], [2.3, (topY - 0.06) / 2, -0.8]),
      boxEntity("leg-b", [0.08, topY - 0.06, 0.08], [2.3, (topY - 0.06) / 2, 0.8]),
      boxEntity("leg-c", [0.08, topY - 0.06, 0.08], [3.9, (topY - 0.06) / 2, -0.8]),
      boxEntity("leg-d", [0.08, topY - 0.06, 0.08], [3.9, (topY - 0.06) / 2, 0.8]),
    ];
    const sim = await world(desk);
    try {
      const shot = sim.previewGrapple(aimAt(sim, { x: 2.2, y: topY, z: 0 }));
      expect(shot.anchor).not.toBeNull();
      fire(sim, aimAt(sim, { x: 2.2, y: topY, z: 0 }));
      step(sim, 300);
      const feet = sim.playerPosition.y - sim.config.characterHalfHeight - sim.config.characterRadius;
      expect(sim.isGrounded).toBe(true);
      expect(feet).toBeGreaterThan(topY - 0.02);
    } finally {
      sim.dispose();
    }
  });

  it("stops at a tall wall without entering it, then drops with a hop", async () => {
    const sim = await world([block(4)]);
    try {
      fire(sim, aimAt(sim, { x: BLOCK_FACE_X, y: 0.9, z: 0 }));
      const events = step(sim, 240);
      const release = events.find((event) => event.type === "grapple-release");
      expect(release).toMatchObject({ reason: "arrived" });
      expect(sim.playerPosition.x).toBeLessThan(BLOCK_FACE_X - sim.config.characterRadius * 0.9);
      step(sim, 120);
      expect(sim.isGrounded).toBe(true);
      expect(sim.playerPosition.x).toBeLessThan(BLOCK_FACE_X);
    } finally {
      sim.dispose();
    }
  });

  it("letting go mid-reel keeps the momentum, then gravity takes over", async () => {
    const sim = await world([block(BLOCK_TOP, 5)]);
    try {
      fire(sim, aimAt(sim, { x: 5.5, y: BLOCK_TOP, z: 0 }));
      step(sim, Math.ceil(HOOK_MAX_FLIGHT_SECONDS / H) + 18);
      expect(sim.isReeling).toBe(true);
      const before = sim.playerVelocity;

      sim.stepFixed({ ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X, grapple: true });
      expect(sim.drainEvents()).toContainEqual({ type: "grapple-release", reason: "player" });
      expect(sim.isReeling).toBe(false);
      expect(sim.horizontalSpeed).toBeGreaterThan(DEFAULT_MOVEMENT_CONFIG.walkSpeed);
      expect(sim.horizontalSpeed).toBeGreaterThan(Math.hypot(before.x, before.z) * 0.8);

      const vy = sim.playerVelocity.y;
      step(sim, 10);
      expect(sim.playerVelocity.y).toBeLessThan(vy);
    } finally {
      sim.dispose();
    }
  });

  it("jump lets go without also jumping", async () => {
    const sim = await world([block(BLOCK_TOP, 5)]);
    try {
      fire(sim, aimAt(sim, { x: 5.5, y: BLOCK_TOP, z: 0 }));
      step(sim, Math.ceil(HOOK_MAX_FLIGHT_SECONDS / H) + 10);
      expect(sim.isReeling).toBe(true);
      sim.stepFixed({ ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X, jump: true });
      const events = sim.drainEvents();
      expect(events).toContainEqual({ type: "grapple-release", reason: "player" });
      expect(events.some((event) => event.type === "jump")).toBe(false);
    } finally {
      sim.dispose();
    }
  });
});

describe("grapple state machine", () => {
  it("cools down for 0.6 s after letting go, and a miss also costs the cooldown", async () => {
    const sim = await world();
    try {
      const aim = aimAt(sim, { x: BLOCK_FACE_X + 0.5, y: BLOCK_TOP, z: 0 });
      fire(sim, aim);
      step(sim, 2);
      sim.stepFixed({ ...NEUTRAL_INPUT, grapple: true }); // cancel in flight
      expect(sim.drainEvents()).toContainEqual({ type: "grapple-release", reason: "player" });
      expect(sim.grappleView.phase).toBe("idle");
      expect(sim.grappleReady).toBe(false);

      const blocked = fire(sim, aim);
      expect(blocked).toEqual([]);
      step(sim, Math.ceil(GRAPPLE_COOLDOWN_SECONDS / H));
      expect(sim.grappleReady).toBe(true);

      const miss = fire(sim, aimAt(sim, { x: 1, y: 30, z: 0 }));
      expect(miss).toContainEqual({ type: "grapple-fire", hit: false });
      expect(sim.grappleView.phase).toBe("missed");
      expect(sim.grappleView.target).not.toBeNull();
      step(sim, Math.ceil((HOOK_MAX_FLIGHT_SECONDS + 0.2) / H) + 1);
      expect(sim.grappleView.phase).toBe("idle");
      expect(sim.isReeling).toBe(false);
      step(sim, Math.ceil(GRAPPLE_COOLDOWN_SECONDS / H));
      expect(sim.grappleReady).toBe(true);
    } finally {
      sim.dispose();
    }
  });

  it("releasing a held aim over nothing cancels: no whiff, no cooldown", async () => {
    const sim = await world();
    try {
      const sky = aimAt(sim, { x: 1, y: 30, z: 0 });
      sim.stepFixed({ ...NEUTRAL_INPUT, grapple: true, grappleRequireAnchor: true, aim: sky });
      expect(sim.drainEvents().some((event) => event.type === "grapple-fire")).toBe(false);
      expect(sim.grappleView.phase).toBe("idle");
      expect(sim.grappleReady).toBe(true);

      // The same release over a valid anchor fires.
      sim.stepFixed({ ...NEUTRAL_INPUT, grapple: true, grappleRequireAnchor: true, aim: aimAt(sim, { x: BLOCK_FACE_X + 0.5, y: BLOCK_TOP, z: 0 }) });
      expect(sim.drainEvents()).toContainEqual({ type: "grapple-fire", hit: true });
    } finally {
      sim.dispose();
    }
  });

  it("cannot fire while mantling", async () => {
    // A 0.5 m ledge right in front: E mantles, F is ignored until it ends.
    const sim = await world([boxEntity("ledge", [1, 0.5, 2], [0.62, 0.25, 0]), block()]);
    try {
      step(sim, 1, { ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X, mantle: true });
      expect(sim.isMantling).toBe(true);
      expect(sim.grappleReady).toBe(false);
      const events = fire(sim, aimAt(sim, { x: BLOCK_FACE_X + 0.5, y: BLOCK_TOP, z: 0 }));
      expect(events.some((event) => event.type === "grapple-fire")).toBe(false);
      expect(sim.grappleView.phase).toBe("idle");
    } finally {
      sim.dispose();
    }
  });

  it("respawning mid-reel cancels the hook and lands at the spawn", async () => {
    const sim = await world();
    try {
      const spawn = sim.playerPosition;
      fire(sim, aimAt(sim, { x: BLOCK_FACE_X + 0.5, y: BLOCK_TOP, z: 0 }));
      step(sim, Math.ceil(HOOK_MAX_FLIGHT_SECONDS / H) + 12);
      expect(sim.isReeling).toBe(true);

      sim.stepFixed({ ...NEUTRAL_INPUT, respawn: true });
      const events = sim.drainEvents();
      expect(events).toContainEqual({ type: "grapple-release", reason: "cancelled" });
      expect(events.some((event) => event.type === "respawn")).toBe(true);
      expect(sim.isReeling).toBe(false);
      expect(sim.grappleView.phase).toBe("idle");
      expect(Math.hypot(sim.playerPosition.x - spawn.x, sim.playerPosition.z - spawn.z)).toBeLessThan(0.01);
      step(sim, 60);
      expect(sim.isGrounded).toBe(true);
      expect(Math.hypot(sim.playerPosition.x - spawn.x, sim.playerPosition.z - spawn.z)).toBeLessThan(0.01);
    } finally {
      sim.dispose();
    }
  });

  it("restart clears a hook and its cooldown", async () => {
    const sim = await world();
    try {
      fire(sim, aimAt(sim, { x: BLOCK_FACE_X + 0.5, y: BLOCK_TOP, z: 0 }));
      step(sim, 20);
      sim.reset();
      expect(sim.grappleView.phase).toBe("idle");
      expect(sim.grappleReady).toBe(true);
    } finally {
      sim.dispose();
    }
  });
});
