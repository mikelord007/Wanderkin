/**
 * The miniature-scale contract.
 *
 * The risk with shrinking the character is not that it looks wrong — it is that
 * it quietly makes existing saved courses unplayable, or that the visible body
 * and the collider drift apart and the "tiny character" turns out to be a
 * rendering trick. These pin down both.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type MovementConfig } from "@shared/index.js";
import { deriveMovementLimits } from "../../scene/route.js";
import { defaultSurfaceOptions } from "../../scene/surfaces.js";
import { capsuleCenterYAboveSurface } from "../../editor/geometry.js";
import {
  MINIATURE_CAPSULE_HEIGHT,
  capsuleHeight,
  isMiniatureScale,
  reseatCapsuleCentre,
  toMiniatureScale,
} from "./characterScale.js";
import { GameSimulation, NEUTRAL_INPUT } from "./simulation.js";
import { initRapier } from "./physicsWorld.js";
import { floorEntity, makeManifest } from "./fixtures.js";

const AUTHORED = DEFAULT_MOVEMENT_CONFIG;
const MINIATURE = toMiniatureScale(AUTHORED);

// The surface sampling the planner uses. Derived per config, so each scale is
// measured with the sampling it would really be validated with.
const authoredSurface = defaultSurfaceOptions(AUTHORED);
const miniatureSurface = defaultSurfaceOptions(MINIATURE);

describe("toMiniatureScale", () => {
  it("shrinks the capsule to the miniature standing height", () => {
    expect(capsuleHeight(AUTHORED)).toBeCloseTo(0.7, 6);
    expect(capsuleHeight(MINIATURE)).toBeCloseTo(MINIATURE_CAPSULE_HEIGHT, 6);
    expect(MINIATURE.characterRadius).toBeLessThan(AUTHORED.characterRadius);
    expect(MINIATURE.characterHalfHeight).toBeLessThan(AUTHORED.characterHalfHeight);
  });

  it("keeps the capsule's proportions, so the authored character still fits it", () => {
    const authoredAspect = AUTHORED.characterRadius / capsuleHeight(AUTHORED);
    const miniatureAspect = MINIATURE.characterRadius / capsuleHeight(MINIATURE);
    expect(miniatureAspect).toBeCloseTo(authoredAspect, 9);
  });

  it("leaves the movement capability envelope exactly as authored", () => {
    // This is the whole reason existing courses survive: nothing the
    // reachability model depends on for *distance* is touched.
    for (const key of [
      "schemaVersion",
      "id",
      "fixedTimestepSeconds",
      "maxSubSteps",
      "gravity",
      "walkSpeed",
      "airControl",
      "groundFriction",
      "jumpHeight",
    ] as const) {
      expect(MINIATURE[key], key).toEqual(AUTHORED[key]);
    }
    expect(MINIATURE.mantle.minLedgeHeight).toBe(AUTHORED.mantle.minLedgeHeight);
    expect(MINIATURE.mantle.maxLedgeHeight).toBe(AUTHORED.mantle.maxLedgeHeight);
    expect(MINIATURE.mantle.maxReachDistance).toBe(AUTHORED.mantle.maxReachDistance);
  });

  it("holds the documented clearance contract", () => {
    // shared/movement.ts: requiredClearanceHeight must be >= the capsule's
    // total height, or a mantle destination is not guaranteed to fit.
    expect(MINIATURE.mantle.requiredClearanceHeight).toBeGreaterThanOrEqual(
      capsuleHeight(MINIATURE),
    );
    expect(AUTHORED.mantle.requiredClearanceHeight).toBeGreaterThanOrEqual(
      capsuleHeight(AUTHORED),
    );
  });

  it("pulls the camera in by the same factor, so framing is unchanged", () => {
    const factor = capsuleHeight(MINIATURE) / capsuleHeight(AUTHORED);
    expect(MINIATURE.camera.distance).toBeCloseTo(AUTHORED.camera.distance * factor, 9);
    expect(MINIATURE.camera.collisionPadding).toBeCloseTo(
      AUTHORED.camera.collisionPadding * factor,
      9,
    );
    // Camera boom measured in character heights is identical.
    expect(MINIATURE.camera.distance / capsuleHeight(MINIATURE)).toBeCloseTo(
      AUTHORED.camera.distance / capsuleHeight(AUTHORED),
      9,
    );
  });

  it("is a no-op on a config that is already miniature", () => {
    // So that moving these numbers into the shared tuning set later cannot
    // shrink the character a second time.
    expect(isMiniatureScale(AUTHORED)).toBe(false);
    expect(isMiniatureScale(MINIATURE)).toBe(true);
    expect(toMiniatureScale(MINIATURE)).toBe(MINIATURE);
    expect(toMiniatureScale(toMiniatureScale(AUTHORED))).toEqual(MINIATURE);
  });

  it("does not mutate the config it is given", () => {
    const snapshot: MovementConfig = JSON.parse(JSON.stringify(AUTHORED));
    toMiniatureScale(AUTHORED);
    expect(AUTHORED).toEqual(snapshot);
  });
});

describe("course reachability under miniature scale", () => {
  const authoredLimits = deriveMovementLimits(AUTHORED, authoredSurface);
  const miniatureLimits = deriveMovementLimits(MINIATURE, miniatureSurface);

  it("leaves every crossing distance the validator uses untouched", () => {
    // `src/scene/route.ts` decides whether a gap can be crossed at all from
    // these. If any of them shrank, a saved course that passed validation
    // could stop being completable — the failure this split exists to prevent.
    expect(miniatureLimits.jumpHeight).toBe(authoredLimits.jumpHeight);
    expect(miniatureLimits.flatJumpRange).toBeCloseTo(authoredLimits.flatJumpRange, 9);
    expect(miniatureLimits.walkSpeed).toBe(authoredLimits.walkSpeed);
    expect(miniatureLimits.stepHeight).toBe(authoredLimits.stepHeight);
    expect(miniatureLimits.gravity).toBe(authoredLimits.gravity);
    expect(miniatureLimits.mantle.minLedgeHeight).toBe(authoredLimits.mantle.minLedgeHeight);
    expect(miniatureLimits.mantle.maxLedgeHeight).toBe(authoredLimits.mantle.maxLedgeHeight);
    expect(miniatureLimits.mantle.maxReachDistance).toBe(authoredLimits.mantle.maxReachDistance);
  });

  it("moves the clearance limits only in the permissive direction", () => {
    // A narrower, shorter body fits through strictly more gaps, and a lower
    // required clearance accepts strictly more mantle destinations.
    expect(miniatureLimits.characterRadius).toBeLessThan(authoredLimits.characterRadius);
    expect(miniatureLimits.characterHeight).toBeLessThan(authoredLimits.characterHeight);
    expect(miniatureLimits.mantle.requiredClearanceHeight).toBeLessThan(
      authoredLimits.mantle.requiredClearanceHeight,
    );
  });

  it("keeps every previously-walkable gap well inside the unchanged jump range", () => {
    // The one limit that does shrink: the planner sizes its surface sampling
    // cells from the character's radius, so `walkMaxSpan` halves with it and a
    // gap that used to be crossed by a walk edge may now need a jump edge.
    // That is only safe because the old walk span is a fraction of the jump
    // range, which did not move.
    expect(miniatureLimits.walkMaxSpan).toBeLessThan(authoredLimits.walkMaxSpan);
    expect(authoredLimits.walkMaxSpan).toBeLessThan(miniatureLimits.flatJumpRange * 0.75);
  });
});

describe("reseatCapsuleCentre", () => {
  it("lands the feet exactly where the author placed them", () => {
    // Saved spawns and checkpoint respawns record the capsule's *centre* for
    // the authored capsule. A shorter capsule at the same centre would start
    // in mid-air and drop on every respawn.
    for (const surfaceY of [0, 0.4287, 1.286, -2.5]) {
      const authoredCentre = capsuleCenterYAboveSurface(surfaceY, AUTHORED);
      const seated = reseatCapsuleCentre(
        { x: 1.5, y: authoredCentre, z: -3.25 },
        AUTHORED,
        MINIATURE,
      );
      expect(seated.y).toBeCloseTo(capsuleCenterYAboveSurface(surfaceY, MINIATURE), 9);
      // Feet at the same height either way.
      const authoredFeet = authoredCentre - capsuleHeight(AUTHORED) / 2;
      const seatedFeet = seated.y - capsuleHeight(MINIATURE) / 2;
      expect(seatedFeet).toBeCloseTo(authoredFeet, 9);
      // Horizontal placement is never touched.
      expect(seated.x).toBe(1.5);
      expect(seated.z).toBe(-3.25);
    }
  });

  it("is a no-op when nothing was scaled", () => {
    const position = { x: 2, y: 3, z: 4 };
    expect(reseatCapsuleCentre(position, AUTHORED, AUTHORED)).toEqual(position);
    expect(reseatCapsuleCentre(position, AUTHORED, AUTHORED)).not.toBe(position);
  });
});

describe("the live simulation at miniature scale", () => {
  beforeAll(async () => {
    await initRapier();
  });

  it("stands the smaller capsule on the floor without dropping in or sinking", async () => {
    const FLOOR_Y = 0;
    const manifest = makeManifest({
      entities: [floorEntity("game-floor", 40, FLOOR_Y)],
      spawn: { position: [0, capsuleCenterYAboveSurface(FLOOR_Y, AUTHORED), 0], headingRadians: 0 },
    });
    const simulation = await GameSimulation.create({
      manifest,
      config: AUTHORED,
      assetGeometry: new Map(),
    });

    try {
      expect(capsuleHeight(simulation.config)).toBeCloseTo(MINIATURE_CAPSULE_HEIGHT, 6);
      expect(simulation.authoredConfig).toBe(AUTHORED);

      // Seated on the surface from the very first frame: no spawn-time drop.
      const halfCapsule = capsuleHeight(simulation.config) / 2;
      expect(simulation.playerPosition.y - halfCapsule).toBeCloseTo(FLOOR_Y + 0.02, 6);

      for (let i = 0; i < 120; i += 1) simulation.stepFixed(NEUTRAL_INPUT);

      const feet = simulation.playerPosition.y - halfCapsule;
      expect(simulation.isGrounded).toBe(true);
      expect(feet).toBeGreaterThanOrEqual(FLOOR_Y - 1e-3);
      // Resting within the controller's own skin width of the floor rather
      // than hovering a whole authored-capsule's worth above it.
      expect(feet).toBeLessThan(FLOOR_Y + simulation.config.characterRadius * 0.2);
    } finally {
      simulation.dispose();
    }
  }, 30_000);

  it("can be opted out of, for tooling that needs the authored numbers", async () => {
    const manifest = makeManifest({
      entities: [floorEntity("game-floor", 40, 0)],
      spawn: { position: [0, capsuleCenterYAboveSurface(0, AUTHORED), 0], headingRadians: 0 },
    });
    const simulation = await GameSimulation.create({
      manifest,
      config: AUTHORED,
      assetGeometry: new Map(),
      miniature: false,
    });
    try {
      expect(simulation.config).toBe(AUTHORED);
      expect(capsuleHeight(simulation.config)).toBeCloseTo(0.7, 6);
    } finally {
      simulation.dispose();
    }
  }, 30_000);
});
