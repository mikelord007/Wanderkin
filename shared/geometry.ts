/**
 * Coordinate convention for every transform in this codebase: Y-up,
 * right-handed, meters. Renderer, physics, and manifest data all share it,
 * so no axis conversion happens between scene preparation and game runtime.
 */
export const COORDINATE_CONVENTION = "y-up-right-handed-meters" as const;
export type CoordinateConvention = typeof COORDINATE_CONVENTION;

export type Vec3 = readonly [x: number, y: number, z: number];

/** Quaternion, [x, y, z, w] — the same order Three.js and Rapier expect. */
export type Quat = readonly [x: number, y: number, z: number, w: number];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

/**
 * Explicit position/rotation/scale transform. Every entity carries one of
 * these instead of a bare matrix so it stays legible in saved manifest JSON
 * and diffable across edits.
 */
export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: IDENTITY_QUAT, scale: [1, 1, 1] };
}
