import type { Transform, Vec3 } from "../../shared/geometry.js";
import { IDENTITY_QUAT } from "../../shared/geometry.js";
import type { HelperEntity } from "../../shared/manifest.js";
import {
  quatFromYaw,
  rotateVectorByQuat,
  transformTriangleSoup,
} from "./transform.js";
import type { Bounds, TriangleSoup } from "./types.js";

/**
 * Helper geometry — the floor, boxes, and ramps the game *adds* so an
 * imperfect generated mesh is playable. Always recorded in the manifest as
 * `addedBy: "game"`; none of it claims to be reconstructed room architecture.
 *
 * Convention for every helper: `dimensions` are full extents [x, y, z] in the
 * helper's own local frame, and `transform.position` is the CENTRE of that
 * local bounding box (matching the centre-position convention used by
 * `SpawnPoint`/`Checkpoint`). A ramp is a real triangular prism inscribed in
 * that box, rising along local +Z — the collider and the rendered wedge come
 * from the same eight triangles, so a ramp can never look solid where it is
 * not.
 */

/** Steepest slope a ramp is allowed to have. Beyond this the character
 * controller slides instead of walking, so a steeper "helper" would be a trap
 * rather than an aid. */
export const MAX_WALKABLE_SLOPE_RADIANS = (32 * Math.PI) / 180;

const DEFAULT_FLOOR_THICKNESS = 0.4;

/** Local-space triangles for a helper, before its transform is applied. */
export function helperLocalTriangles(
  kind: HelperEntity["kind"]!,
  dimensions: Vec3,
): TriangleSoup {
  const [w, h, d] = dimensions;
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;

  if (kind === "ramp") {
    // Wedge inscribed in the bounding box: flat bottom, slope rising from the
    // -Z edge up to the +Z edge, vertical back face at +Z.
    const A: Vec3 = [-x, -y, -z];
    const B: Vec3 = [x, -y, -z];
    const C: Vec3 = [x, -y, z];
    const D: Vec3 = [-x, -y, z];
    const E: Vec3 = [x, y, z];
    const F: Vec3 = [-x, y, z];
    return soupFromTriangles([
      [A, C, D], // bottom
      [A, B, C],
      [A, E, B], // slope (the walkable face)
      [A, F, E],
      [D, C, E], // vertical back
      [D, E, F],
      [A, D, F], // -X side
      [B, E, C], // +X side
    ]);
  }

  // "floor" and "box" are both closed boxes; the distinction is semantic and
  // used by the editor/UI, not by collision.
  const p: [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3] = [
    [-x, -y, -z],
    [x, -y, -z],
    [x, -y, z],
    [-x, -y, z],
    [-x, y, -z],
    [x, y, -z],
    [x, y, z],
    [-x, y, z],
  ];
  return soupFromTriangles([
    [p[0]!, p[2]!, p[3]!], // -Y
    [p[0]!, p[1]!, p[2]!],
    [p[4]!, p[6]!, p[5]!], // +Y
    [p[4]!, p[7]!, p[6]!],
    [p[0]!, p[5]!, p[1]!], // -Z
    [p[0]!, p[4]!, p[5]!],
    [p[3]!, p[6]!, p[7]!], // +Z
    [p[3]!, p[2]!, p[6]!],
    [p[0]!, p[7]!, p[4]!], // -X
    [p[0]!, p[3]!, p[7]!],
    [p[1]!, p[6]!, p[2]!], // +X
    [p[1]!, p[5]!, p[6]!],
  ]);
}

/** World-space triangles for a helper entity — the exact geometry the player
 * collides with. */
export function helperEntityTriangles(entity: HelperEntity): TriangleSoup {
  return transformTriangleSoup(
    helperLocalTriangles(entity.kind, entity.dimensions),
    entity.transform,
  );
}

type Triangle = readonly [Vec3, Vec3, Vec3];

function soupFromTriangles(triangles: readonly Triangle[]): TriangleSoup {
  const positions = new Float32Array(triangles.length * 9);
  triangles.forEach((triangle, t) => {
    for (let v = 0; v < 3; v += 1) {
      const vertex = triangle[v as 0 | 1 | 2]!;
      positions[t * 9 + v * 3] = vertex[0]!;
      positions[t * 9 + v * 3 + 1] = vertex[1]!;
      positions[t * 9 + v * 3 + 2] = vertex[2]!;
    }
  });
  return { positions, triangleCount: triangles.length };
}

/**
 * Neutral game floor sized to the normalized asset footprint plus a margin.
 * The samples reconstruct no floor at all, so every level gets one and the
 * manifest marks it as added geometry.
 */
export function createGameFloor(params: {
  id?: string;
  bounds: Bounds;
  margin?: number;
  thickness?: number;
  /** Floor surface height. Defaults to 0, where `normalizeAsset` puts the
   * asset's lowest vertex. */
  surfaceY?: number;
}): HelperEntity {
  const margin = params.margin ?? 2;
  const thickness = params.thickness ?? DEFAULT_FLOOR_THICKNESS;
  const surfaceY = params.surfaceY ?? 0;
  const width = params.bounds.max[0]! - params.bounds.min[0]! + margin * 2;
  const depth = params.bounds.max[2]! - params.bounds.min[2]! + margin * 2;
  const centerX = (params.bounds.min[0]! + params.bounds.max[0]!) / 2;
  const centerZ = (params.bounds.min[2]! + params.bounds.max[2]!) / 2;

  return {
    id: params.id ?? "helper-floor",
    kind: "floor",
    transform: {
      position: [centerX, surfaceY - thickness / 2, centerZ],
      rotation: IDENTITY_QUAT,
      scale: [1, 1, 1],
    },
    dimensions: [width, thickness, depth],
    collider: { kind: "box", halfExtents: [width / 2, thickness / 2, depth / 2] },
    addedBy: "game",
  };
}

export interface RampSpec {
  id: string;
  /** Centre of the ramp's bottom edge, sitting on the lower surface. */
  start: Vec3;
  /** Centre of the ramp's top edge, level with the upper surface. */
  end: Vec3;
  width: number;
}

export interface RampResult {
  entity: HelperEntity;
  slopeRadians: number;
  /** True when the requested rise/run was too steep and the ramp was
   * lengthened to stay walkable. */
  lengthened: boolean;
  /** Where the lengthened ramp's bottom edge actually ended up. */
  actualStart: Vec3;
}

/**
 * Builds a ramp whose slope face runs exactly from `start` to `end`.
 *
 * If the requested run is too steep to walk, the ramp is extended backwards
 * along its own direction until the slope is walkable instead of silently
 * producing a wall the player cannot climb; the caller gets the moved start
 * back so it can re-check clearance.
 */
export function createRamp(spec: RampSpec): RampResult {
  const dx = spec.end[0]! - spec.start[0]!;
  const dz = spec.end[2]! - spec.start[2]!;
  const rise = spec.end[1]! - spec.start[1]!;
  let run = Math.hypot(dx, dz);
  const maxSlope = Math.tan(MAX_WALKABLE_SLOPE_RADIANS);

  let lengthened = false;
  if (rise > 0 && (run <= 1e-6 || rise / run > maxSlope)) {
    run = rise / maxSlope;
    lengthened = true;
  }
  const horizontalLength = Math.hypot(dx, dz);
  // A purely vertical request has no direction to preserve; point the ramp
  // along +Z so it is still a real, walkable wedge.
  const unitX = horizontalLength > 1e-6 ? dx / horizontalLength : 0;
  const unitZ = horizontalLength > 1e-6 ? dz / horizontalLength : 1;

  const actualStart: Vec3 = [
    spec.end[0]! - unitX * run,
    spec.end[1]! - rise,
    spec.end[2]! - unitZ * run,
  ];

  // Local +Z must point from the bottom edge toward the top edge.
  const yaw = Math.atan2(unitX, unitZ);
  const dimensions: Vec3 = [spec.width, Math.max(rise, 1e-3), Math.max(run, 1e-3)];
  const transform: Transform = {
    position: [
      (actualStart[0]! + spec.end[0]!) / 2,
      (actualStart[1]! + spec.end[1]!) / 2,
      (actualStart[2]! + spec.end[2]!) / 2,
    ],
    rotation: quatFromYaw(yaw),
    scale: [1, 1, 1],
  };

  return {
    entity: {
      id: spec.id,
      kind: "ramp",
      transform,
      dimensions,
      // A wedge is not a box: the collider must be the wedge's own triangles,
      // or the player would walk on an invisible ceiling above the slope.
      collider: { kind: "triangle-mesh" },
      addedBy: "game",
    },
    slopeRadians: Math.atan2(rise, run),
    lengthened,
    actualStart,
  };
}

/**
 * True when `point` is strictly inside the helper's solid.
 *
 * Surface sampling works on triangles, which cannot tell "on the floor" from
 * "inside a block standing on the floor" — the floor's top face is still there
 * underneath. Helpers have exact analytic volumes, so buried patches can be
 * discarded outright instead of becoming phantom standing spots.
 */
export function helperContainsPoint(
  entity: HelperEntity,
  point: Vec3,
  margin = 0,
): boolean {
  const local = toHelperLocal(entity, point);
  const [w, h, d] = entity.dimensions;
  const hx = w / 2 - margin;
  const hy = h / 2 - margin;
  const hz = d / 2 - margin;
  if (
    local[0]! < -hx ||
    local[0]! > hx ||
    local[1]! < -hy ||
    local[1]! > hy ||
    local[2]! < -hz ||
    local[2]! > hz
  ) {
    return false;
  }
  if (entity.kind !== "ramp") return true;
  // Under the slope plane, which rises from the -Z edge to the +Z edge.
  const slopeY = -h / 2 + (h * (local[2]! + d / 2)) / d;
  return local[1]! <= slopeY - margin;
}

function toHelperLocal(entity: HelperEntity, point: Vec3): Vec3 {
  const { position, rotation, scale } = entity.transform;
  const dx = point[0]! - position[0]!;
  const dy = point[1]! - position[1]!;
  const dz = point[2]! - position[2]!;
  const inverse: [number, number, number, number] = [
    -rotation[0]!,
    -rotation[1]!,
    -rotation[2]!,
    rotation[3]!,
  ];
  const rotated = rotateVectorByQuat([dx, dy, dz], inverse);
  return [rotated[0]! / scale[0]!, rotated[1]! / scale[1]!, rotated[2]! / scale[2]!];
}

/** Visible helper platform: a solid box whose top face sits at `surfaceY`. */
export function createPlatform(params: {
  id: string;
  center: Vec3;
  size: Vec3;
}): HelperEntity {
  return {
    id: params.id,
    kind: "box",
    transform: {
      position: params.center,
      rotation: IDENTITY_QUAT,
      scale: [1, 1, 1],
    },
    dimensions: params.size,
    collider: {
      kind: "box",
      halfExtents: [params.size[0]! / 2, params.size[1]! / 2, params.size[2]! / 2],
    },
    addedBy: "game",
  };
}
