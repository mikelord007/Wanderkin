import type { Quat, Transform, Vec3 } from "../../shared/geometry.js";
import { IDENTITY_QUAT } from "../../shared/geometry.js";
import type { Bounds, TriangleSoup } from "./types.js";

/** Quaternion for a rotation of `radians` about +Y, in [x, y, z, w] order. */
export function quatFromYaw(radians: number): Quat {
  const half = radians / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/** Quaternion for a rotation of `radians` about an arbitrary unit axis. */
export function quatFromAxisAngle(axis: Vec3, radians: number): Quat {
  const length = Math.hypot(axis[0]!, axis[1]!, axis[2]!) || 1;
  const half = radians / 2;
  const s = Math.sin(half) / length;
  return [axis[0]! * s, axis[1]! * s, axis[2]! * s, Math.cos(half)];
}

/** Hamilton product `a * b` — applies `b` first, then `a`. */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function rotateVectorByQuat(v: Vec3, q: Quat): Vec3 {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  // t = 2 * cross(q.xyz, v); v' = v + qw * t + cross(q.xyz, t)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Applies scale, then rotation, then translation — the same order Three.js
 * and Rapier compose a TRS transform, so renderer and collider agree. */
export function applyTransformToPoint(t: Transform, point: Vec3): Vec3 {
  const scaled: Vec3 = [
    point[0]! * t.scale[0]!,
    point[1]! * t.scale[1]!,
    point[2]! * t.scale[2]!,
  ];
  const rotated = rotateVectorByQuat(scaled, t.rotation);
  return [
    rotated[0]! + t.position[0]!,
    rotated[1]! + t.position[1]!,
    rotated[2]! + t.position[2]!,
  ];
}

export function identityQuat(): Quat {
  return IDENTITY_QUAT;
}

export function emptyBounds(): Bounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

export function computeBounds(soup: TriangleSoup): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const { positions } = soup;
  const length = soup.triangleCount * 9;
  for (let i = 0; i < length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (soup.triangleCount === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function boundsExtents(bounds: Bounds): Vec3 {
  return [
    bounds.max[0]! - bounds.min[0]!,
    bounds.max[1]! - bounds.min[1]!,
    bounds.max[2]! - bounds.min[2]!,
  ];
}

export function boundsCenter(bounds: Bounds): Vec3 {
  return [
    (bounds.min[0]! + bounds.max[0]!) / 2,
    (bounds.min[1]! + bounds.max[1]!) / 2,
    (bounds.min[2]! + bounds.max[2]!) / 2,
  ];
}

/**
 * Bakes `transform` into a new triangle soup.
 *
 * This is the bridge between preparation and the game runtime: the renderer
 * applies `transform` to the GLB scene graph, and physics builds its trimesh
 * from the array this returns. Because both come from one transform there is
 * no separate collider transform that can drift.
 */
export function transformTriangleSoup(
  soup: TriangleSoup,
  transform: Transform,
): TriangleSoup {
  const count = soup.triangleCount;
  const out = new Float32Array(count * 9);
  const [sx, sy, sz] = transform.scale;
  const [qx, qy, qz, qw] = transform.rotation;
  const [px, py, pz] = transform.position;
  const src = soup.positions;

  for (let i = 0; i < count * 9; i += 3) {
    const x = src[i]! * sx;
    const y = src[i + 1]! * sy;
    const z = src[i + 2]! * sz;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    out[i] = x + qw * tx + (qy * tz - qz * ty) + px;
    out[i + 1] = y + qw * ty + (qz * tx - qx * tz) + py;
    out[i + 2] = z + qw * tz + (qx * ty - qy * tx) + pz;
  }
  return { positions: out, triangleCount: count };
}

/** Concatenates soups into one array — used to fold helper geometry into the
 * same collision set as the generated mesh. */
export function mergeTriangleSoups(soups: readonly TriangleSoup[]): TriangleSoup {
  let total = 0;
  for (const soup of soups) total += soup.triangleCount;
  const positions = new Float32Array(total * 9);
  let cursor = 0;
  for (const soup of soups) {
    positions.set(soup.positions.subarray(0, soup.triangleCount * 9), cursor);
    cursor += soup.triangleCount * 9;
  }
  return { positions, triangleCount: total };
}

/**
 * Converts a triangle soup into the indexed `(vertices, indices)` pair Rapier's
 * trimesh collider and three.js' BufferGeometry both accept. Vertices are not
 * welded — soup triangles are already independent, and welding would risk
 * changing the surface the player stands on.
 */
export function toIndexedMesh(soup: TriangleSoup): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  const vertexCount = soup.triangleCount * 3;
  const indices = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) indices[i] = i;
  return {
    vertices: soup.positions.subarray(0, soup.triangleCount * 9),
    indices,
  };
}
