import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import { boxEntity, floorEntity, makeManifest, standingSpawn } from "../core/fixtures.js";
import { initRapier, type RapierModule } from "../core/physicsWorld.js";
import { GameSimulation, NEUTRAL_INPUT } from "../core/simulation.js";
import { headingRight } from "../core/vec.js";
import {
  AIM_EASE_IN_SECONDS,
  AIM_EASE_OUT_SECONDS,
  AIM_SHOULDER_HEIGHTS,
  AIM_ZOOM_DEGREES,
  advanceAimBlend,
  aimFieldOfView,
  aimFrameOffset,
  chooseShoulder,
  easeAimBlend,
} from "./aimFraming.js";
import { CameraRig } from "./cameraRig.js";
import { characterHeight } from "./PlayerAvatar.js";

let RAPIER: RapierModule;
beforeAll(async () => {
  RAPIER = await initRapier();
});

describe("aim framing maths", () => {
  it("eases in over ~180 ms and out over ~250 ms", () => {
    let blend = 0;
    for (let t = 0; t < AIM_EASE_IN_SECONDS - 0.02; t += 0.01) blend = advanceAimBlend(blend, true, 0.01, false);
    expect(blend).toBeLessThan(1);
    blend = advanceAimBlend(blend, true, 0.05, false);
    expect(blend).toBe(1);
    blend = advanceAimBlend(blend, false, AIM_EASE_OUT_SECONDS / 2, false);
    expect(blend).toBeCloseTo(0.5);
    expect(easeAimBlend(0)).toBe(0);
    expect(easeAimBlend(1)).toBe(1);
  });

  it("cuts instantly and drops the zoom under reduced motion", () => {
    expect(advanceAimBlend(0, true, 0.001, true)).toBe(1);
    expect(advanceAimBlend(1, false, 0.001, true)).toBe(0);
    expect(aimFieldOfView(72, 1, true)).toBe(72);
    expect(aimFieldOfView(72, 1, false)).toBe(72 - AIM_ZOOM_DEGREES);
  });

  it("keeps its shoulder while there is room, else mirrors, else takes what fits", () => {
    expect(chooseShoulder(1, 1, 1, 0.35)).toEqual({ side: 1, lateral: 0.35 });
    expect(chooseShoulder(1, 0.1, 1, 0.35)).toEqual({ side: -1, lateral: 0.35 });
    // Once left, stays left while it has room even if the right clears.
    expect(chooseShoulder(-1, 1, 1, 0.35)).toEqual({ side: -1, lateral: 0.35 });
    expect(chooseShoulder(1, 0.1, 0.2, 0.35)).toEqual({ side: -1, lateral: 0.2 });
  });

  it("offsets the look-at point to the camera's right and up, scaled by the blend", () => {
    const yaw = 0.7;
    const right = headingRight(yaw);
    const offset = aimFrameOffset(yaw, 0.35, 0.1, 1);
    expect(offset.x).toBeCloseTo(right.x * 0.35);
    expect(offset.z).toBeCloseTo(right.z * 0.35);
    expect(offset.y).toBeCloseTo(0.1);
    expect(aimFrameOffset(yaw, -0.35, 0.1, 0.5).x).toBeCloseTo(-right.x * 0.35 * 0.5);
  });
});

describe("camera rig over the shoulder", () => {
  async function open(extra: ReturnType<typeof boxEntity>[] = []) {
    const manifest = makeManifest({ entities: [floorEntity("floor", 40, 0), ...extra], spawn: standingSpawn(0) });
    const sim = await GameSimulation.create({ manifest, config: DEFAULT_MOVEMENT_CONFIG, assetGeometry: new Map(), miniature: true });
    for (let i = 0; i < 30; i += 1) sim.stepFixed(NEUTRAL_INPUT);
    return sim;
  }

  it("slides the camera right of the explorer, keeping the boom length and target height rules", async () => {
    const sim = await open();
    try {
      const rig = new CameraRig(RAPIER, sim.config);
      const bodyHeight = characterHeight(sim.config);
      const base = rig.update(sim.scene.world, sim.scene.playerCollider, sim.playerPosition, 0, 0.3, 1 / 60);
      const aimed = rig.update(sim.scene.world, sim.scene.playerCollider, sim.playerPosition, 0, 0.3, 1 / 60, { blend: 1, bodyHeight, reducedMotion: true });
      expect(aimed.shoulder).toBe(1);
      expect(aimed.lateral).toBeCloseTo(AIM_SHOULDER_HEIGHTS * bodyHeight);
      // Yaw 0 looks along +Z, so the camera's right is -X.
      expect(aimed.target.x - base.target.x).toBeCloseTo(-AIM_SHOULDER_HEIGHTS * bodyHeight);
      expect(aimed.target.y).toBeGreaterThan(base.target.y);
      expect(aimed.distance).toBeCloseTo(base.distance);
    } finally {
      sim.dispose();
    }
  });

  it("mirrors to the left shoulder when a wall blocks the right", async () => {
    // Wall just to the explorer's right (-X at yaw 0).
    const sim = await open([boxEntity("wall", [0.2, 2, 4], [-0.18, 1, 0])]);
    try {
      const rig = new CameraRig(RAPIER, sim.config);
      const bodyHeight = characterHeight(sim.config);
      const aimed = rig.update(sim.scene.world, sim.scene.playerCollider, sim.playerPosition, 0, 0.3, 1 / 60, { blend: 1, bodyHeight, reducedMotion: true });
      expect(aimed.shoulder).toBe(-1);
      expect(aimed.lateral).toBeCloseTo(-AIM_SHOULDER_HEIGHTS * bodyHeight);
      expect(aimed.target.x).toBeGreaterThan(sim.playerPosition.x);
    } finally {
      sim.dispose();
    }
  });

  it("ignores biome props when choosing a shoulder, like the boom does", async () => {
    const sim = await open();
    try {
      sim.setPropColliders([{
        id: "trunk", shape: { kind: "capsule", radius: 0.05, halfHeight: 0.5 },
        position: { x: -0.15, y: 0.55, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, baseY: 0, height: 1.1, reach: 0.05,
      }]);
      const rig = new CameraRig(RAPIER, sim.config);
      const aimed = rig.update(sim.scene.world, sim.scene.playerCollider, sim.playerPosition, 0, 0.3, 1 / 60, { blend: 1, bodyHeight: characterHeight(sim.config), reducedMotion: true });
      expect(aimed.shoulder).toBe(1);
    } finally {
      sim.dispose();
    }
  });
});
