import { describe, expect, it } from "vitest";
import {
  HOOK_ARC_RATIO,
  REEL_FOV_KICK_DEGREES,
  ROPE_SAG_RATIO,
  hookPosition,
  reelCameraEffect,
  reticleState,
  ropePoints,
  ropeSag,
} from "./grappleVisuals.js";

const hand = { x: 0, y: 0, z: 0 };
const target = { x: 4, y: 0, z: 0 };

describe("grapple visuals", () => {
  it("flies the hook along a slight arc and parks it on the anchor", () => {
    expect(hookPosition(hand, { phase: "flying", target, progress: 0 })).toEqual(hand);
    const mid = hookPosition(hand, { phase: "flying", target, progress: 0.5 })!;
    expect(mid.x).toBeCloseTo(2);
    expect(mid.y).toBeCloseTo(HOOK_ARC_RATIO * 4);
    expect(hookPosition(hand, { phase: "reeling", target, progress: 1 })).toEqual(target);
    expect(hookPosition(hand, { phase: "idle", target: null, progress: 0 })).toBeNull();
  });

  it("sags slack rope and straightens it as the reel tenses", () => {
    expect(ropeSag("flying", 4, 0)).toBeCloseTo(ROPE_SAG_RATIO * 4);
    expect(ropeSag("reeling", 4, 0.5)).toBeCloseTo(ROPE_SAG_RATIO * 2);
    expect(ropeSag("reeling", 4, 1)).toBe(0);
    const points = ropePoints(hand, target, 0.4, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual(hand);
    expect(points[4]).toEqual(target);
    expect(points[2]!.y).toBeCloseTo(-0.4);
    // Reuses the output array.
    expect(ropePoints(hand, target, 0, 4, points)).toBe(points);
  });

  it("kicks the FOV with tension and shakes briefly on the bite", () => {
    const bite = reelCameraEffect("reeling", 1, 0, 0.175, false);
    expect(bite.fovKick).toBe(REEL_FOV_KICK_DEGREES);
    expect(bite.shake).toBeGreaterThan(0);
    expect(reelCameraEffect("reeling", 1, 1, 0.175, false).shake).toBe(0);
    expect(reelCameraEffect("flying", 1, 0, 0.175, false)).toEqual({ fovKick: 0, shake: 0 });
  });

  it("drops the kick and shake under reduced motion, keeping the reel", () => {
    expect(reelCameraEffect("reeling", 1, 0, 0.175, true)).toEqual({ fovKick: 0, shake: 0 });
  });

  it("shows the reticle only in play, locked over an anchor, busy while the hook is out", () => {
    expect(reticleState(false, true, true)).toBe("hidden");
    expect(reticleState(true, false, true)).toBe("busy");
    expect(reticleState(true, true, true)).toBe("locked");
    expect(reticleState(true, true, false)).toBe("open");
  });
});
