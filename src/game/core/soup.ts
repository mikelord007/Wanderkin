/**
 * Triangle soup utilities.
 *
 * Every collidable surface in a level ends up as one of these, and the
 * renderer builds its geometry from the *same* soup that the physics
 * collider is built from. That is the mechanism that keeps visible
 * geometry and collision from drifting apart: there is one source of
 * triangles per entity, transformed once.
 */

import type { Transform, Vec3 } from "@shared/index.js";
import { quatFromTuple, rotateByQuat, type Vec3Like } from "./vec.js";

export interface TriangleSoup {
  /** Flat xyz triples. */
  vertices: Float32Array;
  /** Triangle indices into `vertices`. */
  indices: Uint32Array;
}

export interface Bounds {
  min: Vec3Like;
  max: Vec3Like;
}

export function triangleCount(soup: TriangleSoup): number {
  return soup.indices.length / 3;
}

/**
 * Bakes a full position/rotation/scale transform into the vertices.
 *
 * Scale has to be baked rather than applied to the collider because Rapier
 * colliders have no scale; baking position and rotation too keeps a single
 * code path and means the collider sits at the world origin with identity
 * rotation, so there is no second transform that could go stale.
 */
export function transformSoup(soup: TriangleSoup, transform: Transform): TriangleSoup {
  const q = quatFromTuple(transform.rotation);
  const [sx, sy, sz] = transform.scale;
  const [px, py, pz] = transform.position;
  const src = soup.vertices;
  const out = new Float32Array(src.length);
  const scaled: Vec3Like = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < src.length; i += 3) {
    scaled.x = (src[i] ?? 0) * sx;
    scaled.y = (src[i + 1] ?? 0) * sy;
    scaled.z = (src[i + 2] ?? 0) * sz;
    const r = rotateByQuat(scaled, q);
    out[i] = r.x + px;
    out[i + 1] = r.y + py;
    out[i + 2] = r.z + pz;
  }

  return { vertices: out, indices: soup.indices.slice() };
}

export function soupBounds(soup: TriangleSoup): Bounds | null {
  if (soup.vertices.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < soup.vertices.length; i += 3) {
    const x = soup.vertices[i] ?? 0;
    const y = soup.vertices[i + 1] ?? 0;
    const z = soup.vertices[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
  };
}

export function mergeSoups(soups: readonly TriangleSoup[]): TriangleSoup {
  let vertexCount = 0;
  let indexCount = 0;
  for (const s of soups) {
    vertexCount += s.vertices.length;
    indexCount += s.indices.length;
  }

  const vertices = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vOffset = 0;
  let iOffset = 0;

  for (const s of soups) {
    vertices.set(s.vertices, vOffset);
    const base = vOffset / 3;
    for (let i = 0; i < s.indices.length; i += 1) {
      indices[iOffset + i] = (s.indices[i] ?? 0) + base;
    }
    vOffset += s.vertices.length;
    iOffset += s.indices.length;
  }

  return { vertices, indices };
}

/**
 * Axis-aligned box centred on the local origin, with outward-facing
 * winding so the same soup can be rendered directly.
 */
export function boxSoup(dimensions: Vec3): TriangleSoup {
  const hx = dimensions[0] / 2;
  const hy = dimensions[1] / 2;
  const hz = dimensions[2] / 2;

  // prettier-ignore
  const vertices = new Float32Array([
    -hx, -hy, -hz,  hx, -hy, -hz,  hx,  hy, -hz, -hx,  hy, -hz, // -Z face
    -hx, -hy,  hz,  hx, -hy,  hz,  hx,  hy,  hz, -hx,  hy,  hz, // +Z face
  ]);

  // Quads as (a, b, c) + (a, c, d) with counter-clockwise outward winding.
  // prettier-ignore
  const indices = new Uint32Array([
    0, 3, 2, 0, 2, 1, // -Z
    4, 5, 6, 4, 6, 7, // +Z
    0, 4, 7, 0, 7, 3, // -X
    1, 2, 6, 1, 6, 5, // +X
    0, 1, 5, 0, 5, 4, // -Y
    3, 7, 6, 3, 6, 2, // +Y
  ]);

  return { vertices, indices };
}

/**
 * Wedge/ramp centred on its own bounding box: the sloped face rises from
 * the -Z edge at the bottom to the +Z edge at the top, so rotating the
 * entity about +Y aims the ramp. Ten triangles, outward winding.
 */
export function rampSoup(dimensions: Vec3): TriangleSoup {
  const hx = dimensions[0] / 2;
  const hy = dimensions[1] / 2;
  const hz = dimensions[2] / 2;

  // prettier-ignore
  const vertices = new Float32Array([
    -hx, -hy, -hz, //   0 bottom back-left
     hx, -hy, -hz, //   1 bottom back-right
     hx, -hy,  hz, //   2 bottom front-right
    -hx, -hy,  hz, //   3 bottom front-left
    -hx,  hy,  hz, //   4 top front-left
     hx,  hy,  hz, //   5 top front-right
  ]);

  // prettier-ignore
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, // bottom (-Y)
    3, 2, 5, 3, 5, 4, // vertical back face (+Z)
    0, 5, 1, 0, 4, 5, // slope
    0, 3, 4,          // -X side
    1, 5, 2,          // +X side
  ]);

  return { vertices, indices };
}
