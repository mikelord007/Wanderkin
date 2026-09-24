/**
 * In-scene camera framing at miniature scale.
 *
 * The studio preview shows what the character looks like; this drives the real
 * `CameraRig` against a real Rapier world, because the thing that actually
 * breaks when a character shrinks is the camera, not the model. The boom is a
 * fixed length in metres and the space the character now plays in — under a
 * sofa, between its feet — is the same size it always was, so the questions are
 * whether the boom still fits into those gaps, whether it pulls in rather than
 * clipping through them, and whether it ever ends up inside the character.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import { GameSimulation, NEUTRAL_INPUT } from "../core/simulation.js";
import { initRapier, type RapierModule } from "../core/physicsWorld.js";
import { boxEntity, floorEntity, makeManifest } from "../core/fixtures.js";
import { capsuleHeight } from "../core/characterScale.js";
import { CAMERA_MIN_DISTANCE_RATIO, CAMERA_TARGET_LIFT_RATIO } from "../core/constants.js";
import { CameraRig } from "./cameraRig.js";

const AUTHORED = DEFAULT_MOVEMENT_CONFIG;

/** Underside of a sofa: a low ceiling with open floor beneath it. */
const CLEARANCE = 0.55;

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await initRapier();
});

async function underTheSofa(miniature: boolean) {
  const manifest = makeManifest({
    entities: [
      floorEntity("game-floor", 40, 0),
      // A slab whose underside is CLEARANCE above the floor, spanning the area
      // the character stands in.
      boxEntity("sofa-underside", [8, 2, 6], [0, CLEARANCE + 1, 0]),
    ],
    spawn: { position: [0, capsuleHeight(AUTHORED) / 2 + 0.02, 0], headingRadians: 0 },
  });
  const simulation = await GameSimulation.create({
    manifest,
    config: AUTHORED,
    assetGeometry: new Map(),
    miniature,
  });
  for (let i = 0; i < 60; i += 1) simulation.stepFixed(NEUTRAL_INPUT);
  return simulation;
}

describe("camera framing under furniture at miniature scale", () => {
  it("keeps the character standing in a gap the authored capsule could not enter", async () => {
    // The premise of the whole scale change, stated as a physics fact rather
    // than as a screenshot: 0.55 m of clearance is headroom for the small
    // character and a ceiling on the head of the old one.
    expect(capsuleHeight(AUTHORED)).toBeGreaterThan(CLEARANCE);

    const simulation = await underTheSofa(true);
    try {
      expect(capsuleHeight(simulation.config)).toBeLessThan(CLEARANCE);
      expect(simulation.isGrounded).toBe(true);
      const feet = simulation.playerPosition.y - capsuleHeight(simulation.config) / 2;
      expect(feet).toBeGreaterThan(-1e-3);
      expect(feet).toBeLessThan(0.05);
    } finally {
      simulation.dispose();
    }
  }, 30_000);

  it("pulls the boom in instead of clipping through the furniture above", async () => {
    const simulation = await underTheSofa(true);
    try {
      const config = simulation.config;
      const rig = new CameraRig(RAPIER, config);
      const position = simulation.playerPosition;

      // Looking down on the character from above: the boom runs straight into
      // the underside of the sofa.
      let pose = rig.update(
        simulation.scene.world,
        simulation.scene.playerCollider,
        position,
        0,
        1.1,
        1 / 60,
      );

      expect(pose.occluded).toBe(true);
      expect(pose.distance).toBeLessThan(config.camera.distance);
      // Never inside the slab.
      expect(pose.position.y).toBeLessThan(CLEARANCE);
      // Never inside the character either.
      expect(pose.distance).toBeGreaterThanOrEqual(
        config.characterRadius * CAMERA_MIN_DISTANCE_RATIO - 1e-6,
      );

      // Level with the character, along the open span of the floor, there is
      // nothing in the way and the boom eases back out to full length.
      for (let i = 0; i < 240; i += 1) {
        pose = rig.update(
          simulation.scene.world,
          simulation.scene.playerCollider,
          position,
          0,
          0,
          1 / 60,
        );
      }
      expect(pose.occluded).toBe(false);
      expect(pose.distance).toBeCloseTo(config.camera.distance, 3);
    } finally {
      simulation.dispose();
    }
  }, 30_000);

  it("frames the character the same way it framed the larger one", async () => {
    // Framing is a ratio, not a distance: the boom and the look-at lift both
    // scale with the capsule, so the character subtends the same angle and the
    // furniture around it is what changes size on screen.
    const miniature = await underTheSofa(true);
    const authored = await underTheSofa(false);
    try {
      const ratio = (config: typeof AUTHORED) => ({
        boomInHeights: config.camera.distance / capsuleHeight(config),
        liftInHeights: (config.characterRadius * CAMERA_TARGET_LIFT_RATIO) / capsuleHeight(config),
        minBoomInHeights:
          (config.characterRadius * CAMERA_MIN_DISTANCE_RATIO) / capsuleHeight(config),
      });
      const small = ratio(miniature.config);
      const large = ratio(authored.config);
      expect(small.boomInHeights).toBeCloseTo(large.boomInHeights, 9);
      expect(small.liftInHeights).toBeCloseTo(large.liftInHeights, 9);
      expect(small.minBoomInHeights).toBeCloseTo(large.minBoomInHeights, 9);
    } finally {
      miniature.dispose();
      authored.dispose();
    }
  }, 30_000);

  it("fits its boom into a gap that the authored camera could not have used", async () => {
    // The concrete camera win from the smaller scale: at 2.5 m the boom is
    // longer than the sofa is deep, so the old camera was permanently shoved
    // against geometry underneath furniture. At 1.25 m it has room.
    const miniature = await underTheSofa(true);
    const authored = await underTheSofa(false);
    try {
      expect(miniature.config.camera.distance).toBeLessThan(authored.config.camera.distance);
      expect(miniature.config.camera.collisionPadding).toBeLessThan(
        authored.config.camera.collisionPadding,
      );

      const framedHeight = (config: typeof AUTHORED) =>
        capsuleHeight(config) / config.camera.distance;
      expect(framedHeight(miniature.config)).toBeCloseTo(framedHeight(authored.config), 9);
    } finally {
      miniature.dispose();
      authored.dispose();
    }
  }, 30_000);
});
