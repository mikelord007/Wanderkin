import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import {
  averageScale,
  calibratedUniformScale,
  capsuleCenterYAboveSurface,
  degreesToRadians,
  floorAlignDeltaY,
  headingFromQuat,
  quatFromHeading,
  radiansToDegrees,
  surfaceYBelowCapsuleCenter,
  uniformVec3,
} from "./geometry.js";

describe("capsule-center conversion", () => {
  it("round-trips surface Y through capsule-center Y", () => {
    const surfaceY = 1.2;
    const centerY = capsuleCenterYAboveSurface(surfaceY, DEFAULT_MOVEMENT_CONFIG);
    expect(centerY).toBeGreaterThan(surfaceY);
    expect(surfaceYBelowCapsuleCenter(centerY, DEFAULT_MOVEMENT_CONFIG)).toBeCloseTo(surfaceY, 10);
  });

  it("offsets by half-height + radius + skin margin", () => {
    const centerY = capsuleCenterYAboveSurface(0, DEFAULT_MOVEMENT_CONFIG);
    const expected =
      DEFAULT_MOVEMENT_CONFIG.characterHalfHeight + DEFAULT_MOVEMENT_CONFIG.characterRadius + 0.02;
    expect(centerY).toBeCloseTo(expected, 10);
  });
});

describe("heading <-> quaternion", () => {
  it("round-trips a heading through a quaternion", () => {
    for (const degrees of [0, 45, 90, 179, -90, -179]) {
      const radians = degreesToRadians(degrees);
      const quat = quatFromHeading(radians);
      expect(headingFromQuat(quat)).toBeCloseTo(radians, 10);
    }
  });

  it("produces the identity quaternion for a zero heading", () => {
    expect(quatFromHeading(0)).toEqual([0, 0, 0, 1]);
  });

  it("degrees/radians conversion round-trips", () => {
    expect(radiansToDegrees(degreesToRadians(37))).toBeCloseTo(37, 10);
  });
});

describe("floorAlignDeltaY", () => {
  it("returns a positive shift when the object sits below the floor", () => {
    expect(floorAlignDeltaY(-0.5)).toBeCloseTo(0.5, 10);
  });

  it("returns a negative shift when the object floats above the floor", () => {
    expect(floorAlignDeltaY(0.3)).toBeCloseTo(-0.3, 10);
  });

  it("returns zero when already aligned", () => {
    expect(floorAlignDeltaY(0)).toBeCloseTo(0, 10);
  });
});

describe("calibratedUniformScale", () => {
  it("scales proportionally to match a desired real-world measurement", () => {
    // Currently the desk reads 2m wide at scale 1; the user measured it's
    // actually 1m wide in real life -> scale should halve.
    expect(calibratedUniformScale(1, 2, 1)).toBeCloseTo(0.5, 10);
  });

  it("leaves scale unchanged for a non-positive input (avoids division by zero / nonsense scale)", () => {
    expect(calibratedUniformScale(1.5, 0, 2)).toBe(1.5);
    expect(calibratedUniformScale(1.5, 2, 0)).toBe(1.5);
    expect(calibratedUniformScale(1.5, -1, 2)).toBe(1.5);
  });
});

describe("scale vector helpers", () => {
  it("builds a uniform Vec3", () => {
    expect(uniformVec3(2.5)).toEqual([2.5, 2.5, 2.5]);
  });

  it("averages a possibly non-uniform Vec3", () => {
    expect(averageScale([1, 2, 3])).toBeCloseTo(2, 10);
    expect(averageScale(uniformVec3(4))).toBeCloseTo(4, 10);
  });
});
