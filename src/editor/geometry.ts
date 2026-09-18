import type { MovementConfig } from "@shared/index.js";
import type { Quat, Vec3 } from "@shared/index.js";

/** Small clearance above a standing surface so the capsule doesn't start
 * embedded in geometry — matches the convention documented on
 * shared/manifest.ts SpawnPoint.position. */
export const SKIN_MARGIN_METERS = 0.02;

/**
 * shared/manifest.ts SpawnPoint/Checkpoint positions are the capsule
 * CENTER, not the standing surface. Given a surface Y (e.g. a raycast hit
 * against the preview mesh) and the movement config in effect, returns the
 * capsule-center Y that puts the capsule's feet exactly on that surface
 * with a small skin margin.
 */
export function capsuleCenterYAboveSurface(surfaceY: number, movement: MovementConfig): number {
  return surfaceY + movement.characterHalfHeight + movement.characterRadius + SKIN_MARGIN_METERS;
}

/** Inverse of capsuleCenterYAboveSurface — the standing-surface Y implied
 * by a capsule-center Y, for displaying "this checkpoint stands on
 * roughly Y=…" in the editor. */
export function surfaceYBelowCapsuleCenter(capsuleCenterY: number, movement: MovementConfig): number {
  return capsuleCenterY - movement.characterHalfHeight - movement.characterRadius - SKIN_MARGIN_METERS;
}

/** Quaternion for a pure heading rotation around +Y, matching
 * SpawnPoint.headingRadians ("measured around +Y from +Z"). */
export function quatFromHeading(headingRadians: number): Quat {
  const half = headingRadians / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/** Inverse of quatFromHeading — extracts the heading angle from a
 * quaternion, assuming it's a pure Y-axis rotation (true for every
 * transform this editor itself produces; an asset's original rotation may
 * not be, in which case this is a best-effort approximation). */
export function headingFromQuat(quat: Quat): number {
  const [, y, , w] = quat;
  return 2 * Math.atan2(y, w);
}

/** Degrees <-> radians, for numeric inputs (people think in degrees). */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * How much to shift transform.position.y so the object's current
 * world-space bounding-box bottom sits exactly on the floor (y = 0).
 * `worldBoundingBoxMinY` must already reflect the CURRENT transform (i.e.
 * measured from the loaded/positioned preview object), so this is simply
 * the delta that cancels out however far below/above zero it currently is.
 */
export function floorAlignDeltaY(worldBoundingBoxMinY: number): number {
  return -worldBoundingBoxMinY;
}

/**
 * Recomputes a uniform scale factor from a user-supplied real-world
 * measurement of some recognizable feature. `currentFeatureExtentMeters`
 * is how large that same feature currently measures in the preview at
 * `currentScale`; `desiredMeters` is what the user says it should be.
 * Keeps the mesh's proportions (uniform scale only, matching how
 * DEFAULT_ASSUMED_EXTENT_METERS normalization was applied at generation
 * time).
 */
export function calibratedUniformScale(
  currentScale: number,
  currentFeatureExtentMeters: number,
  desiredMeters: number,
): number {
  if (currentFeatureExtentMeters <= 0 || desiredMeters <= 0) {
    return currentScale;
  }
  return currentScale * (desiredMeters / currentFeatureExtentMeters);
}

export function uniformVec3(scale: number): Vec3 {
  return [scale, scale, scale];
}

/** Average of a Vec3's components — used to read back a "uniform scale"
 * number for display even if a transform was set non-uniformly elsewhere. */
export function averageScale(scale: Vec3): number {
  return (scale[0] + scale[1] + scale[2]) / 3;
}
