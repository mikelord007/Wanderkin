/**
 * Solid biome props against the real controller, at the runtime (miniature)
 * body size: a trunk stops the capsule dead, sliding along one is smooth,
 * a boulder can be jumped onto, a low stone is stepped over, a tall prop is
 * never a mantle target, the camera ignores props, and a prop that appears
 * around the player waits for them to walk clear.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type HelperEntity } from "@shared/index.js";
import { CameraRig } from "../render/cameraRig.js";
import { capsuleHeight } from "./characterScale.js";
import { AUTOSTEP_MAX_HEIGHT_RATIO } from "./constants.js";
import { boxEntity, floorEntity, makeManifest, standingSpawn, YAW_TOWARD_PLUS_X } from "./fixtures.js";
import { initRapier, type RapierModule } from "./physicsWorld.js";
import {
  PROP_ACTIVATION_INTERVAL_STEPS,
  PROP_COLLIDER_BUDGET,
  PROP_WALL_HEIGHT_RATIO,
  classifyPropCollider,
  isPropGroups,
  propActivationRadius,
  type PropCollider,
} from "./propColliders.js";
import { GameSimulation, NEUTRAL_INPUT, type SimulationInput } from "./simulation.js";

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await initRapier();
});

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/** A trunk standing on y = 0: capsule side straight from the ground up. */
function trunk(id: string, x: number, z: number, radius: number, height: number): PropCollider {
  const upper = height - radius;
  return {
    id,
    shape: { kind: "capsule", radius, halfHeight: upper / 2 },
    position: { x, y: upper / 2, z },
    rotation: IDENTITY,
    baseY: 0,
    height,
    reach: radius,
  };
}

/** An axis-aligned boulder or stump standing on y = 0. */
function block(id: string, x: number, z: number, half: { x: number; z: number }, height: number): PropCollider {
  return {
    id,
    shape: { kind: "cuboid", halfExtents: { x: half.x, y: height / 2, z: half.z } },
    position: { x, y: height / 2, z },
    rotation: IDENTITY,
    baseY: 0,
    height,
    reach: Math.hypot(half.x, half.z),
  };
}

async function flatWorld(extra: HelperEntity[] = []): Promise<GameSimulation> {
  const manifest = makeManifest({ entities: [floorEntity("floor", 40, 0), ...extra], spawn: standingSpawn(0, 0, 0, YAW_TOWARD_PLUS_X) });
  const sim = await GameSimulation.create({ manifest, config: DEFAULT_MOVEMENT_CONFIG, assetGeometry: new Map(), miniature: true });
  for (let i = 0; i < 30; i += 1) sim.stepFixed(NEUTRAL_INPUT);
  return sim;
}

const WALK_PLUS_X: SimulationInput = { ...NEUTRAL_INPUT, forward: 1, cameraYaw: YAW_TOWARD_PLUS_X };

function walk(sim: GameSimulation, steps: number, input: SimulationInput = WALK_PLUS_X) {
  const path: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < steps; i += 1) {
    sim.stepFixed(input);
    path.push(sim.playerPosition);
  }
  return path;
}

describe("solid biome props", () => {
  it("stops the capsule against a trunk: no creeping through, no jitter", async () => {
    const open = await flatWorld();
    const blocked = await flatWorld();
    try {
      const radius = blocked.config.characterRadius;
      const stats = blocked.setPropColliders([trunk("palm", 0.6, 0, 0.03, 0.5)]);
      expect(stats).toEqual({ installed: 1, active: 1, walls: 1, deferred: 0 });

      // Control: the same walk with nothing in the way goes straight past.
      walk(open, 120);
      expect(open.playerPosition.x).toBeGreaterThan(1.5);

      const path = walk(blocked, 120);
      const last = path.slice(-60);
      const contactX = 0.6 - 0.03 - radius;
      expect(blocked.playerPosition.x).toBeLessThan(contactX + 0.005);
      expect(blocked.playerPosition.x).toBeGreaterThan(contactX - 0.02);
      // Pressed against the trunk for a whole second: the horizontal position
      // delta is zero. Vertically only the controller's own sub-millimetre
      // ground-snap ripple remains, the same as against any wall.
      for (let i = 1; i < last.length; i += 1) {
        expect(Math.abs(last[i]!.x - last[i - 1]!.x)).toBeLessThan(1e-4);
        expect(Math.abs(last[i]!.z - last[i - 1]!.z)).toBeLessThan(1e-4);
        expect(Math.abs(last[i]!.y - last[i - 1]!.y)).toBeLessThan(1e-3);
      }
      expect(blocked.measuredHorizontalSpeed).toBeLessThan(0.01);
    } finally {
      open.dispose();
      blocked.dispose();
    }
  });

  it("slides smoothly around a trunk hit off-centre, without jitter or bobbing", async () => {
    const sim = await flatWorld();
    const control = await flatWorld();
    try {
      // Offset so the contact is ~40° off head-on: a glancing hit.
      sim.setPropColliders([trunk("palm", 0.6, 0.05, 0.03, 0.5)]);
      const y0 = sim.playerPosition.y;
      const path = walk(sim, 150);
      const open = walk(control, 150);
      // It gets round the trunk (to the side away from it) and carries on.
      expect(sim.playerPosition.x).toBeGreaterThan(0.8);
      // Sideways motion only ever goes one way: no back-and-forth.
      let reversals = 0;
      for (let i = 2; i < path.length; i += 1) {
        const a = path[i - 1]!.z - path[i - 2]!.z;
        const b = path[i]!.z - path[i - 1]!.z;
        if (Math.abs(a) > 5e-4 && Math.abs(b) > 5e-4 && Math.sign(a) !== Math.sign(b)) reversals += 1;
      }
      expect(reversals).toBe(0);
      expect(Math.min(...path.map((p) => p.z))).toBeLessThan(-0.01);
      // Forward progress never goes backwards either.
      for (let i = 1; i < path.length; i += 1) expect(path[i]!.x).toBeGreaterThanOrEqual(path[i - 1]!.x - 1e-5);
      // No bobbing beyond what the controller does on open ground anyway.
      const bob = (points: typeof path) => Math.max(...points.map((p) => Math.abs(p.y - y0)));
      expect(bob(path)).toBeLessThanOrEqual(bob(open) + 1e-3);
    } finally {
      sim.dispose();
      control.dispose();
    }
  });

  it("slides along a rock face at an angle exactly like along a wall", async () => {
    // The same slab as a prop, and as level geometry.
    const sim = await flatWorld();
    const wall = await flatWorld([boxEntity("wall", [0.2, 0.3, 8], [0.5, 0.15, 0])]);
    try {
      sim.setPropColliders([block("rock", 0.5, 0, { x: 0.1, z: 4 }, 0.3)]);
      const input = { ...NEUTRAL_INPUT, forward: 1, cameraYaw: YAW_TOWARD_PLUS_X - Math.PI / 6 };
      const path = walk(sim, 150, input);
      const reference = walk(wall, 150, input);
      const face = 0.4 - sim.config.characterRadius;
      expect(path.filter((p) => p.x > face - 0.01).length).toBeGreaterThan(60);
      for (const point of path) expect(point.x).toBeLessThan(face + 0.005);
      path.forEach((point, i) => {
        expect(Math.abs(point.x - reference[i]!.x)).toBeLessThan(1e-4);
        expect(Math.abs(point.z - reference[i]!.z)).toBeLessThan(1e-4);
      });
    } finally {
      sim.dispose();
      wall.dispose();
    }
  });

  it("walks over props lower than a step, and can jump onto a boulder", async () => {
    const sim = await flatWorld();
    try {
      const step = sim.config.characterRadius * AUTOSTEP_MAX_HEIGHT_RATIO;
      const stats = sim.setPropColliders([
        block("pebble", 0.3, 0, { x: 0.02, z: 0.02 }, step * 0.8),
        block("boulder", 1.5, 0, { x: 1, z: 0.5 }, 0.2),
      ]);
      // The pebble is not installed: the capsule would step over it anyway.
      expect(stats).toEqual({ installed: 1, active: 1, walls: 0, deferred: 0 });
      walk(sim, 20);
      expect(sim.playerPosition.x).toBeGreaterThan(0.35);
      // Run and jump: the boulder's top is a floor.
      let jumped = false;
      for (let i = 0; i < 150; i += 1) {
        const jump = !jumped && sim.playerPosition.x > 0.3;
        if (jump) jumped = true;
        sim.stepFixed({ ...WALK_PLUS_X, forward: sim.playerPosition.x > 1.6 ? 0 : 1, jump });
      }
      const feet = sim.playerPosition.y - sim.config.characterHalfHeight - sim.config.characterRadius;
      expect(sim.isGrounded).toBe(true);
      expect(feet).toBeGreaterThan(0.19);
      expect(feet).toBeLessThan(0.23);
    } finally {
      sim.dispose();
    }
  });

  it("offers a mantle onto a low prop but never onto a tall one", async () => {
    const body = capsuleHeight((await flatWorld()).config);
    const ledge = await flatWorld();
    const wall = await flatWorld();
    try {
      // Both are wide enough to stand on and inside the mantle envelope; only
      // the class differs.
      const ledgeHeight = body * PROP_WALL_HEIGHT_RATIO - 0.02;
      const wallHeight = body * PROP_WALL_HEIGHT_RATIO + 0.08;
      expect(classifyPropCollider(ledgeHeight, 0.02, body)).toBe("ledge");
      expect(classifyPropCollider(wallHeight, 0.02, body)).toBe("wall");
      ledge.setPropColliders([block("stump", 0.5, 0, { x: 0.2, z: 0.2 }, ledgeHeight)]);
      wall.setPropColliders([block("trunk", 0.5, 0, { x: 0.2, z: 0.2 }, wallHeight)]);
      const facing = { ...NEUTRAL_INPUT, cameraYaw: YAW_TOWARD_PLUS_X };
      for (let i = 0; i < 6; i += 1) {
        ledge.stepFixed(facing);
        wall.stepFixed(facing);
      }
      expect(ledge.mantleTarget).not.toBeNull();
      expect(wall.mantleTarget).toBeNull();
      // Pressing mantle climbs the low one.
      ledge.stepFixed({ ...facing, mantle: true });
      for (let i = 0; i < 40; i += 1) ledge.stepFixed(facing);
      const feet = ledge.playerPosition.y - ledge.config.characterHalfHeight - ledge.config.characterRadius;
      expect(feet).toBeGreaterThan(ledgeHeight - 0.01);
    } finally {
      ledge.dispose();
      wall.dispose();
    }
  });

  it("never pulls the camera in for a prop", async () => {
    const withProp = await flatWorld();
    const withWall = await flatWorld([boxEntity("wall", [0.1, 2, 2], [-0.3, 1, 0])]);
    try {
      // The same slab behind the player: a prop, or real level geometry.
      withProp.setPropColliders([block("rock", -0.3, 0, { x: 0.05, z: 1 }, 2)]);
      const pose = (sim: GameSimulation) =>
        new CameraRig(RAPIER, sim.config).update(sim.scene.world, sim.scene.playerCollider, sim.playerPosition, YAW_TOWARD_PLUS_X, 0.2, 1 / 60);
      expect(pose(withWall).occluded).toBe(true);
      const free = pose(withProp);
      expect(free.occluded).toBe(false);
      expect(free.distance).toBeCloseTo(withProp.config.camera.distance, 6);
    } finally {
      withProp.dispose();
      withWall.dispose();
    }
  });

  it("holds back a prop that appears around the player until they walk clear", async () => {
    const sim = await flatWorld();
    try {
      const here = sim.playerPosition;
      const stats = sim.setPropColliders([trunk("palm", here.x, here.z, 0.03, 0.5)]);
      expect(stats).toEqual({ installed: 0, active: 0, walls: 0, deferred: 1 });
      walk(sim, 60);
      // Installed once clear (and, by now, out of range, so not yet enabled).
      expect(sim.propColliderStats).toMatchObject({ installed: 1, walls: 1, deferred: 0 });
      // Now it blocks: walking back stops short of it.
      walk(sim, 120, { ...NEUTRAL_INPUT, forward: 1, cameraYaw: -YAW_TOWARD_PLUS_X });
      expect(sim.playerPosition.x).toBeGreaterThan(here.x + 0.03 + sim.config.characterRadius - 0.005);
    } finally {
      sim.dispose();
    }
  });

  it("replaces the prop set as a whole, never touches level collision, and honours the budget", async () => {
    const sim = await flatWorld();
    try {
      const world = sim.scene.world;
      const level = world.colliders.len();
      const many = Array.from({ length: PROP_COLLIDER_BUDGET + 50 }, (_, i) => trunk(`t${i}`, 2 + (i % 30) * 0.2, 2 + Math.floor(i / 30) * 0.2, 0.02, 0.4));
      expect(sim.setPropColliders(many).installed).toBe(PROP_COLLIDER_BUDGET);
      expect(world.colliders.len()).toBe(level + PROP_COLLIDER_BUDGET);
      sim.setPropColliders(many.slice(0, 10));
      expect(world.colliders.len()).toBe(level + 10);
      sim.setPropColliders([]);
      expect(world.colliders.len()).toBe(level);
      expect(sim.propColliderStats).toEqual({ installed: 0, active: 0, walls: 0, deferred: 0 });
      // Invalid data is ignored rather than handed to Rapier.
      const broken = { ...trunk("nan", 1, 1, 0.03, 0.4), position: { x: Number.NaN, y: 0, z: 0 } };
      expect(sim.setPropColliders([broken]).installed).toBe(0);
      // Only props answer a props-only query.
      sim.setPropColliders([trunk("palm", 1, 0, 0.03, 0.5)]);
      const onlyProps = (collider: { collisionGroups(): number }) => isPropGroups(collider.collisionGroups());
      const hit = world.castRay(new RAPIER.Ray({ x: 0.5, y: 0.1, z: 0 }, { x: 1, y: 0, z: 0 }), 5, true, undefined, undefined, undefined, undefined, onlyProps);
      expect(hit?.timeOfImpact).toBeCloseTo(0.47, 3);
      const floor = world.castRay(new RAPIER.Ray({ x: 0.5, y: 0.1, z: 0 }, { x: 0, y: -1, z: 0 }), 5, true, undefined, undefined, undefined, undefined, onlyProps);
      expect(floor).toBeNull();
    } finally {
      sim.dispose();
    }
  });

  it("enables only the props near the player, and keeps up as they move or respawn", async () => {
    const sim = await flatWorld();
    try {
      const reach = propActivationRadius(sim.config);
      // A row of trunks off to the side, from near the spawn to far away.
      const row = Array.from({ length: 12 }, (_, i) => trunk(`t${i}`, i * 0.5, 0.3, 0.03, 0.5));
      const near = (x: number) => row.filter((t) => Math.abs(t.position.x - x) <= reach + 0.03 + 0.3).length;
      expect(sim.setPropColliders(row).active).toBeLessThanOrEqual(near(0));
      expect(sim.propColliderStats.active).toBeLessThan(row.length);
      expect(sim.propColliderStats.installed).toBe(row.length);
      // Walk down the row: the enabled set follows, and every trunk the path
      // brushes past is solid when reached.
      for (let i = 0; i < 150; i += 1) {
        sim.stepFixed(WALK_PLUS_X);
        const p = sim.playerPosition;
        for (const t of row) {
          if (Math.hypot(t.position.x - p.x, t.position.z - p.z) < reach - 0.3) {
            expect(sim.propColliderStats.active).toBeGreaterThan(0);
          }
        }
      }
      expect(sim.playerPosition.x).toBeGreaterThan(4);
      const farEnd = sim.propColliderStats.active;
      expect(farEnd).toBeGreaterThan(0);
      // Respawning back at the start re-enables the start's props at once.
      sim.respawn("manual");
      expect(sim.propColliderStats.active).toBe(row.filter((t) => Math.hypot(t.position.x - sim.playerPosition.x, t.position.z - sim.playerPosition.z) - t.reach <= reach).length);
      // Refreshes are periodic, not every step.
      expect(PROP_ACTIVATION_INTERVAL_STEPS).toBeGreaterThan(1);
    } finally {
      sim.dispose();
    }
  });

  it("a disabled far prop still blocks once the player walks up to it", async () => {
    const sim = await flatWorld();
    try {
      const far = 3;
      expect(propActivationRadius(sim.config)).toBeLessThan(far);
      sim.setPropColliders([trunk("far", far, 0, 0.03, 0.5)]);
      expect(sim.propColliderStats.active).toBe(0);
      walk(sim, 150);
      expect(sim.propColliderStats.active).toBe(1);
      expect(sim.playerPosition.x).toBeLessThan(far - 0.03 - sim.config.characterRadius + 0.005);
    } finally {
      sim.dispose();
    }
  });
});
