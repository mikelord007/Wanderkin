/**
 * Geometry plumbing shared by biome decoration and adventure generation.
 *
 * Two body sizes are in play and they must never be confused:
 *
 *  - The AUTHORED body (`DEFAULT_MOVEMENT_CONFIG`, 0.70 m capsule). Every
 *    manifest spawn, checkpoint and objective position is its capsule centre,
 *    `surface + halfHeight + radius + 0.02` = surface + 0.37 m. The surface
 *    sampler, route validator and the publish gate all analyse at this size:
 *    it is the stricter one for clearance, the crossing envelope is identical,
 *    and its 0.36 m sampling cell is what keeps real scans cheap.
 *  - The RUNTIME body (`toMiniatureScale`, 0.175 m). `GameSimulation` re-seats
 *    authored centres down by the half-height difference; prop sizes follow
 *    this body so a palm reads as a palm next to the toy hero.
 *
 * The APIs receive the runtime config (see `types.ts`) and recover the
 * authored one here, once.
 */
import {
  DEFAULT_MOVEMENT_CONFIG,
  type HelperEntity,
  type MovementConfig,
  type SceneManifest,
  type Vec3,
} from "@shared/index.js";
import { capsuleHeight, isMiniatureScale } from "../game/core/characterScale.js";
import { buildCollisionTriangles, type AssetGeometryMap } from "../scene/collision.js";
import { insideAnyHelper } from "../scene/course.js";
import { deriveMovementLimits, type MovementLimits } from "../scene/route.js";
import type { LoadedSceneAsset } from "../scene/runtime.js";
import type { TriangleGrid } from "../scene/spatial.js";
import {
  defaultSurfaceOptions,
  sampleSurfaces,
  type SurfaceMap,
  type SurfaceOptions,
} from "../scene/surfaces.js";
import type { TriangleSoup } from "../scene/types.js";

/** Matches `standingCenter`/`surfaceFromCenter` in `src/scene/surfaces.ts`. */
export const CENTRE_SKIN = 0.02;

/** Hard ceiling on collision size analysed synchronously. Real scans are
 * ~50k triangles (~60 ms to sample); anything far beyond that is refused
 * rather than stalling the UI thread. */
export const MAX_ANALYSED_TRIANGLES = 400_000;

export class BiomeGeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BiomeGeometryError";
  }
}

/**
 * Recovers the authored tuning set from the runtime one.
 *
 * `toMiniatureScale` only shrinks the body (radius, half-height, mantle
 * clearance, camera); the capability envelope is left as authored. So the
 * authored config is the runtime envelope with the default authored body put
 * back. A config that is not miniature is already authored.
 */
export function authoredMovementFor(runtime: MovementConfig): MovementConfig {
  if (!isMiniatureScale(runtime)) return runtime;
  if (runtime.id === DEFAULT_MOVEMENT_CONFIG.id) return DEFAULT_MOVEMENT_CONFIG;
  return {
    ...runtime,
    characterRadius: DEFAULT_MOVEMENT_CONFIG.characterRadius,
    characterHalfHeight: DEFAULT_MOVEMENT_CONFIG.characterHalfHeight,
    mantle: {
      ...runtime.mantle,
      requiredClearanceHeight: DEFAULT_MOVEMENT_CONFIG.mantle.requiredClearanceHeight,
    },
    camera: DEFAULT_MOVEMENT_CONFIG.camera,
  };
}

/** Authored capsule centre for a character standing on `surface`. */
export function authoredCentreFromSurface(surface: Vec3, authored: MovementConfig): Vec3 {
  return [
    surface[0],
    surface[1] + authored.characterHalfHeight + authored.characterRadius + CENTRE_SKIN,
    surface[2],
  ];
}

/** Support surface under an authored capsule centre. */
export function surfaceFromAuthoredCentre(centre: Vec3, authored: MovementConfig): Vec3 {
  return [
    centre[0],
    centre[1] - authored.characterHalfHeight - authored.characterRadius - CENTRE_SKIN,
    centre[2],
  ];
}

/** Where `GameSimulation` actually puts the runtime capsule centre for an
 * authored centre (mirrors `reseatCapsuleCentre`). */
export function runtimeCentreFromAuthored(
  centre: Vec3,
  authored: MovementConfig,
  runtime: MovementConfig,
): Vec3 {
  const drop = (capsuleHeight(authored) - capsuleHeight(runtime)) / 2;
  return [centre[0], centre[1] - drop, centre[2]];
}

/**
 * Horizontal radius within which a GROUNDED runtime character standing on the
 * surface under an authored-centre trigger actually fires a sphere trigger of
 * `triggerRadius`. Zero when it can only be reached by jumping.
 */
export function groundedTriggerReach(
  triggerRadius: number,
  authored: MovementConfig,
  runtime: MovementConfig,
): number {
  const drop = (capsuleHeight(authored) - capsuleHeight(runtime)) / 2;
  return drop < triggerRadius ? Math.sqrt(triggerRadius * triggerRadius - drop * drop) : 0;
}

/** Rapier-style indexed mesh → flat soup (9 floats per triangle). */
export function soupFromIndexed(mesh: {
  vertices: Float32Array;
  indices: Uint32Array;
}): TriangleSoup {
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const positions = new Float32Array(triangleCount * 9);
  for (let t = 0; t < triangleCount; t += 1) {
    for (let v = 0; v < 3; v += 1) {
      const index = mesh.indices[t * 3 + v]!;
      positions[t * 9 + v * 3] = mesh.vertices[index * 3]!;
      positions[t * 9 + v * 3 + 1] = mesh.vertices[index * 3 + 1]!;
      positions[t * 9 + v * 3 + 2] = mesh.vertices[index * 3 + 2]!;
    }
  }
  return { positions, triangleCount };
}

/** The runtime's loaded assets as the asset-local soups collision expects. */
export function assetGeometryFromLoaded(
  assets: ReadonlyMap<string, LoadedSceneAsset>,
): AssetGeometryMap {
  const map = new Map<string, TriangleSoup>();
  for (const [assetId, asset] of assets) map.set(assetId, soupFromIndexed(asset.collision));
  return map;
}

export function helperEntitiesOf(manifest: SceneManifest): HelperEntity[] {
  return manifest.entities.filter(
    (entity): entity is HelperEntity => entity.kind !== "generated-mesh",
  );
}

/** Everything the surface/route analysis needs, computed once per geometry. */
export interface SceneAnalysis {
  authored: MovementConfig;
  runtime: MovementConfig;
  collision: TriangleSoup;
  surfaceOptions: SurfaceOptions;
  surfaces: SurfaceMap;
  grid: TriangleGrid;
  limits: MovementLimits;
  helpers: HelperEntity[];
}

export function analyzeScene(
  collision: TriangleSoup,
  helpers: readonly HelperEntity[],
  runtime: MovementConfig,
): SceneAnalysis {
  if (collision.triangleCount > MAX_ANALYSED_TRIANGLES) {
    throw new BiomeGeometryError(
      `Scene has ${collision.triangleCount} collision triangles; more than ${MAX_ANALYSED_TRIANGLES} is not analysed synchronously.`,
    );
  }
  const authored = authoredMovementFor(runtime);
  const surfaceOptions: SurfaceOptions = {
    ...defaultSurfaceOptions(authored),
    insideSolid: insideAnyHelper(helpers),
  };
  const surfaces = sampleSurfaces(collision, surfaceOptions);
  return {
    authored,
    runtime,
    collision,
    surfaceOptions,
    surfaces,
    grid: surfaces.grid,
    limits: deriveMovementLimits(authored, surfaceOptions),
    helpers: [...helpers],
  };
}

export function analyzeManifest(
  manifest: SceneManifest,
  geometry: AssetGeometryMap,
  runtime: MovementConfig,
): SceneAnalysis {
  return analyzeScene(
    buildCollisionTriangles(manifest, geometry),
    helperEntitiesOf(manifest),
    runtime,
  );
}

export interface RayHit {
  point: Vec3;
  /** Unit normal, flipped to face the ray origin. */
  normal: Vec3;
  distance: number;
}

/**
 * First triangle hit by a vertical ray cast straight down from `from`.
 * Möller–Trumbore restricted to the one grid column the ray occupies.
 */
export function raycastDown(grid: TriangleGrid, from: Vec3, maxDistance: number): RayHit | null {
  const [ox, oy, oz] = from;
  const p = grid.soup.positions;
  let best: RayHit | null = null;
  const eps = 1e-4;
  grid.forEachNear(ox - eps, oz - eps, ox + eps, oz + eps, (t) => {
    const o = t * 9;
    const ax = p[o]!;
    const ay = p[o + 1]!;
    const az = p[o + 2]!;
    const e1x = p[o + 3]! - ax;
    const e1y = p[o + 4]! - ay;
    const e1z = p[o + 5]! - az;
    const e2x = p[o + 6]! - ax;
    const e2y = p[o + 7]! - ay;
    const e2z = p[o + 8]! - az;
    // Direction d = (0,-1,0): pvec = d × e2 = (-e2z, 0, e2x)
    const px = -e2z;
    const pz = e2x;
    const det = e1x * px + e1z * pz;
    if (Math.abs(det) < 1e-12) return;
    const inv = 1 / det;
    const sx = ox - ax;
    const sy = oy - ay;
    const sz = oz - az;
    const u = (sx * px + sz * pz) * inv;
    if (u < -1e-7 || u > 1 + 1e-7) return;
    // qvec = s × e1
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = -qy * inv;
    if (v < -1e-7 || u + v > 1 + 1e-7) return;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (distance < 0 || distance > maxDistance) return;
    if (best && distance >= best.distance) return;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    best = { point: [ox, oy - distance, oz], normal: [nx, ny, nz], distance };
  });
  return best;
}

/** Shortest distance from `point` to segment `a`–`b`. */
export function distanceToSegment(point: Vec3, a: Vec3, b: Vec3): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lengthSquared > 1e-12) {
    t = ((point[0] - a[0]) * abx + (point[1] - a[1]) * aby + (point[2] - a[2]) * abz) / lengthSquared;
    t = Math.min(1, Math.max(0, t));
  }
  return Math.hypot(
    point[0] - (a[0] + abx * t),
    point[1] - (a[1] + aby * t),
    point[2] - (a[2] + abz * t),
  );
}

/** Short stable hash for ids derived from seeds. */
export function hash32(value: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
