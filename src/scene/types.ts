import type { Transform, Vec3 } from "../../shared/geometry.js";

/**
 * A flat triangle soup: 9 floats per triangle (v0.xyz, v1.xyz, v2.xyz).
 *
 * This is the single geometry representation shared by scene preparation and
 * the game runtime. Preparation produces it once, the manifest transform is
 * baked into it (see {@link transformTriangleSoup}), and the *same* array is
 * handed to the physics trimesh collider. Nothing re-parses the GLB, so the
 * collider can never drift out of sync with the rendered mesh.
 */
export interface TriangleSoup {
  /** Length is `triangleCount * 9`. */
  readonly positions: Float32Array;
  readonly triangleCount: number;
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * Numeric buffer read through a bounds-free accessor.
 *
 * The project builds with `noUncheckedIndexedAccess`, so every `array[i]` is
 * `number | undefined`. That is the right default for maps and variable-length
 * arrays, but in the geometry loops below every index is derived from the
 * buffer's own length or from a triangle count that was used to allocate it.
 * {@link read} states that once, at the read site, instead of scattering
 * non-null assertions through the vertex maths.
 */
export type NumericBuffer = ArrayLike<number>;

/** Indexed read from a buffer whose bounds the caller has already established. */
export function read(buffer: NumericBuffer, index: number): number {
  return buffer[index] as number;
}

export type Axis = "x" | "y" | "z";

/**
 * Data-driven assessment of which axis the asset treats as "up", derived from
 * the surface-area distribution of triangle normals. Generated meshes carry no
 * reliable orientation metadata, so this is a measurement with an explicit
 * confidence, not an assumption.
 */
export interface UpAxisAssessment {
  /** Axis carrying the largest single-direction flat-surface area. */
  readonly detected: Axis;
  /** `positiveAreaFraction[axis]` = fraction of total triangle area whose
   * normal points within `flatNormalToleranceDegrees` of that axis' +direction. */
  readonly positiveAreaFraction: Readonly<Record<Axis, number>>;
  /**
   * `detected`'s share divided by the next-best axis' share. 1 means a tie
   * (no information); large values mean an unambiguous up axis.
   */
  readonly confidenceRatio: number;
  /** True when `detected === "y"` and `confidenceRatio` clears the threshold. */
  readonly agreesWithGltfYUp: boolean;
  readonly notes: string;
}

export interface GeometryInspection {
  readonly triangleCount: number;
  readonly degenerateTriangleCount: number;
  readonly bounds: Bounds;
  /** `max - min` per axis, asset units. */
  readonly extents: Vec3;
  /** Area-weighted centroid, asset units. */
  readonly centroid: Vec3;
  readonly totalArea: number;
  readonly upAxis: UpAxisAssessment;
  /**
   * Yaw (radians about +Y) of the footprint's dominant horizontal axis, from
   * a principal-component fit of the area-weighted horizontal extent.
   */
  readonly footprintPrincipalYawRadians: number;
  /** Longest horizontal (XZ) extent after snapping yaw to the nearest 90°. */
  readonly longestHorizontalExtent: number;
}

/** Options for {@link normalizeAsset}. */
export interface NormalizeOptions {
  /** Longest horizontal extent, in game meters, after normalization. */
  readonly targetExtentMeters: number;
  /**
   * Snap the footprint's dominant axis to world +X. Rotates by a multiple of
   * 90° only — never an arbitrary yaw — so an asset is never subtly skewed.
   */
  readonly alignFootprintToX?: boolean;
  /** Override the measured up axis (e.g. from a creator's manual control). */
  readonly upAxisOverride?: Axis;
  /** Extra yaw applied after alignment, radians. Creator-facing control. */
  readonly extraYawRadians?: number;
}

export interface NormalizationResult {
  /** Entity transform. Renderer and collider both apply exactly this. */
  readonly transform: Transform;
  /** Bounds after `transform` is applied — floor-aligned, XZ-centered. */
  readonly normalizedBounds: Bounds;
  readonly uniformScale: number;
  readonly appliedYawRadians: number;
  readonly upAxisUsed: Axis;
  /** Human-readable account of every decision, surfaced in docs/UI. */
  readonly notes: string[];
}
