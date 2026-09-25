/**
 * Markers are visuals only: these pin down that they are seated and sized for
 * the running body, and that the footprint they draw is exactly where the
 * real, unchanged trigger fires for a grounded character.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type MovementConfig, type SceneManifest, type Vec3 } from "@shared/index.js";
import { capsuleHeight, toMiniatureScale } from "../core/characterScale.js";
import { createCheckpointState, updateCheckpoints } from "../core/checkpoints.js";
import { SAMPLE_LEVELS } from "../../scene/samples.js";
import { EXPLORE_SAMPLE } from "../bundledSamples.js";
import {
  MARKER_CORE_DIAMETER_IN_HEIGHTS,
  checkpointMarkerLayout,
  destinationMarkerLayout,
} from "./markerLayout.js";

const AUTHORED = DEFAULT_MOVEMENT_CONFIG;
const MINIATURE = toMiniatureScale(AUTHORED);
const SKIN = 0.02;

/** A config whose body is `height` metres tall, shrunk the way the game does. */
function bodyOf(height: number): MovementConfig {
  const factor = height / capsuleHeight(AUTHORED);
  return {
    ...AUTHORED,
    characterRadius: AUTHORED.characterRadius * factor,
    characterHalfHeight: AUTHORED.characterHalfHeight * factor,
  };
}

/** Stored capsule centre for the authored body standing on `surfaceY`. */
function storedOn(x: number, surfaceY: number, z: number): Vec3 {
  return [x, surfaceY + AUTHORED.characterHalfHeight + AUTHORED.characterRadius + SKIN, z];
}

/** Collects checkpoint `position` with the real gameplay trigger code. */
function triggerFires(position: Vec3, triggerRadius: number, playerCenter: { x: number; y: number; z: number }) {
  const manifest = {
    checkpoints: [{ id: "c", order: 0, position, triggerRadius, safeRespawn: { position, headingRadians: 0 } }],
  } as unknown as SceneManifest;
  return updateCheckpoints(createCheckpointState(manifest), playerCenter).collectedId === "c";
}

describe("checkpoint marker layout", () => {
  it("matches the stored trigger exactly at the authored body size", () => {
    const position = storedOn(1, 0.5, -2);
    const layout = checkpointMarkerLayout(position, 0.4, AUTHORED, AUTHORED);
    expect(layout.surface[1]).toBeCloseTo(0.5, 9);
    expect(layout.footprintRadius).toBeCloseTo(0.4, 9);
    expect(layout.bodyHeight).toBeCloseTo(0.7, 9);
  });

  it("seats the miniature marker on the same surface, sized to the tiny body", () => {
    const position = storedOn(1, 1.286, -2);
    const layout = checkpointMarkerLayout(position, 0.4, AUTHORED, MINIATURE);
    const height = capsuleHeight(MINIATURE);

    expect(layout.surface).toEqual([1, expect.closeTo(1.286, 9), -2]);
    expect(layout.bodyHeight).toBeCloseTo(0.175, 6);

    // The old gem was 0.27 m across, ~1.55 body heights. Now it is under half.
    expect(layout.coreRadius * 2).toBeCloseTo(MARKER_CORE_DIAMETER_IN_HEIGHTS * height, 9);
    expect(layout.coreRadius * 2).toBeLessThan(height * 0.5);
    expect(layout.coreRadius * 2).toBeGreaterThan(height * 0.35);

    // Hovers just clear of the head, even at the bottom of its bob, and far
    // below the authored capsule-centre height it used to float at.
    const headTop = height + SKIN;
    const lowest = layout.coreLift - layout.coreRadius - layout.bobAmplitude;
    expect(lowest).toBeGreaterThan(headTop);
    expect(layout.coreLift + layout.coreRadius + layout.bobAmplitude).toBeLessThan(SKIN + height * 1.8);
    expect(layout.surface[1] + layout.coreLift).toBeLessThan(position[1]);
  });

  it("draws the footprint exactly where the unchanged trigger fires on foot", () => {
    const position = storedOn(0, 0, 0);
    for (const runtime of [AUTHORED, bodyOf(0.35), MINIATURE, bodyOf(0.12)]) {
      const layout = checkpointMarkerLayout(position, 0.4, AUTHORED, runtime);
      const standingY = layout.surface[1] + capsuleHeight(runtime) / 2 + SKIN;
      expect(layout.footprintRadius).toBeGreaterThan(0);
      expect(layout.footprintRadius).toBeLessThanOrEqual(0.4 + 1e-9);
      expect(triggerFires(position, 0.4, { x: layout.footprintRadius - 0.002, y: standingY, z: 0 })).toBe(true);
      expect(triggerFires(position, 0.4, { x: layout.footprintRadius + 0.002, y: standingY, z: 0 })).toBe(false);
    }
    // At the shipped size the on-foot reach is about 0.30 m, not 0.40 m.
    expect(checkpointMarkerLayout(position, 0.4, AUTHORED, MINIATURE).footprintRadius).toBeCloseTo(0.302, 3);
  });

  it("reports no footprint when a grounded body could never reach the trigger", () => {
    const layout = checkpointMarkerLayout(storedOn(0, 0, 0), 0.2, AUTHORED, MINIATURE);
    expect(layout.footprintRadius).toBe(0);
  });

  it("scales with any body height and never double-shrinks", () => {
    const position = storedOn(0, 0, 0);
    const half = checkpointMarkerLayout(position, 0.4, AUTHORED, bodyOf(0.35));
    const quarter = checkpointMarkerLayout(position, 0.4, AUTHORED, MINIATURE);
    expect(half.coreRadius / quarter.coreRadius).toBeCloseTo(2, 6);
    // Lift is measured from the feet, which stand a fixed skin off the surface.
    expect((half.coreLift - SKIN) / (quarter.coreLift - SKIN)).toBeCloseTo(2, 6);
    expect(half.surface[1]).toBeCloseTo(quarter.surface[1], 9);

    // Positions authored for the miniature body need no re-seating at all.
    const tinyStored: Vec3 = [0, 0.5 + capsuleHeight(MINIATURE) / 2 + SKIN, 0];
    const native = checkpointMarkerLayout(tinyStored, 0.4, MINIATURE, MINIATURE);
    expect(native.surface[1]).toBeCloseTo(0.5, 9);
    expect(native.footprintRadius).toBeCloseTo(0.4, 9);
    expect(native.coreRadius).toBeCloseTo(quarter.coreRadius, 9);

    // Deterministic, and the inputs are never written to.
    const frozen = Object.freeze([...position]) as unknown as Vec3;
    expect(checkpointMarkerLayout(frozen, 0.4, AUTHORED, MINIATURE)).toEqual(quarter);
    expect(checkpointMarkerLayout(frozen, 0.4, AUTHORED, MINIATURE)).toEqual(quarter);
  });

  it("leaves the shipped course's stored checkpoints untouched and seats every marker on real furniture", () => {
    const rodin = SAMPLE_LEVELS.find((sample) => sample.levelId === "sample-rodin-room-corner")!;
    const before = JSON.stringify(rodin.checkpoints);
    for (const checkpoint of rodin.checkpoints) {
      const layout = checkpointMarkerLayout(checkpoint.position, checkpoint.triggerRadius, AUTHORED, MINIATURE);
      expect(layout.footprintRadius).toBeGreaterThan(0.25);
      // Either the floor or the elevated sofa seat, where the author put it.
      const surfaceY = layout.surface[1];
      expect(Math.min(Math.abs(surfaceY), Math.abs(surfaceY - 1.286))).toBeLessThan(0.01);
    }
    expect(JSON.stringify(rodin.checkpoints)).toBe(before);
  });
});

describe("explore destination layout", () => {
  it("seats the pad on the same surface as a checkpoint, sized to the body", () => {
    const mode = EXPLORE_SAMPLE.experience.mode;
    if (mode.kind !== "explore") throw new Error("explore sample expected");
    const before = JSON.stringify(mode.destinations);
    for (const destination of mode.destinations) {
      const pad = destinationMarkerLayout(destination.position, AUTHORED, MINIATURE);
      const checkpoint = checkpointMarkerLayout(destination.position, 0.4, AUTHORED, MINIATURE);
      pad.surface.forEach((value, axis) => expect(value).toBeCloseTo(checkpoint.surface[axis]!, 9));
      expect(pad.padRadius).toBeGreaterThan(capsuleHeight(MINIATURE));
      expect(pad.padRadius).toBeLessThan(capsuleHeight(MINIATURE) * 1.5);
      expect(pad.padThickness).toBeLessThan(0.03);
    }
    expect(JSON.stringify(mode.destinations)).toBe(before);

    const big = destinationMarkerLayout(storedOn(0, 0, 0), AUTHORED, AUTHORED);
    const small = destinationMarkerLayout(storedOn(0, 0, 0), AUTHORED, MINIATURE);
    expect(big.padRadius / small.padRadius).toBeCloseTo(4, 6);
    big.surface.forEach((value, axis) => expect(value).toBeCloseTo(small.surface[axis]!, 9));
  });
});
