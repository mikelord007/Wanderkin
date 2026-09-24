/**
 * Turns the authored profiles in `characterDesign.ts` into one skinned mesh.
 *
 * Each part is a *sweep*: a chain of cross-sections carried along the polyline
 * through their own centres, each section perpendicular to the local tangent.
 * That is the whole trick behind the cohesive silhouette — a sweep can pinch at
 * the waist, flare at a boot cuff and taper to a mitten tip continuously, so
 * nothing in the body reads as a box or a ball stuck onto another box.
 *
 * Parts are welded into a single interleaved buffer with one material, one
 * vertex-colour channel and one skeleton, so the character is a single draw
 * call with no material seam anywhere on the body.
 *
 * Everything here is pure arithmetic over plain arrays: it runs, and is tested,
 * in Node with no WebGL context.
 */

import * as THREE from "three";
import {
  CHARACTER_PARTS,
  PALETTE,
  type PartDefinition,
  type Ring,
  type ZoneName,
} from "./characterDesign.js";

/** Flat white corner of the face atlas that every non-face vertex points at. */
export const ATLAS_WHITE_UV: readonly [number, number] = [0.93, 0.93];
/** Sub-rectangle of the face atlas the head's cylindrical UVs are mapped into. */
export const FACE_UV_ORIGIN = 0.1;
export const FACE_UV_SPAN = 0.6;

export interface CharacterMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly skinIndices: Uint16Array;
  readonly skinWeights: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  /** Bone order the skin indices refer to. */
  readonly boneNames: readonly string[];
  /** Vertex ranges per part, for tests and debugging. */
  readonly partRanges: ReadonlyMap<string, { start: number; count: number }>;
}

interface Vec3M {
  x: number;
  y: number;
  z: number;
}

function sub(a: Vec3M, b: Vec3M): Vec3M {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3M, b: Vec3M): Vec3M {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3M, b: Vec3M): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function norm(v: Vec3M): Vec3M {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function ringCentre(ring: Ring): Vec3M {
  return { x: ring.at[0], y: ring.at[1], z: ring.at[2] };
}

/**
 * Cross-section shape. `squareness` of 1 is a plain ellipse; larger values
 * push the outline toward a rounded rectangle by flattening the sides, which
 * is what gives the boots and the padded chest their toy-like read while
 * staying perfectly smooth (no crease anywhere on the curve).
 */
function sectionOffsets(theta: number, squareness: number): [number, number] {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  if (squareness <= 1.0001) return [s, c];
  const p = 2 / squareness;
  return [Math.sign(s) * Math.abs(s) ** p, Math.sign(c) * Math.abs(c) ** p];
}

/**
 * A frame for the cross-section at a point on the sweep. `localZ` is world +Z
 * projected onto the section plane, so an authored `rz` keeps meaning "depth,
 * front to back" for every part in the body. Sweeps that run nearly along +Z
 * (the boot toe is the closest) fall back to world +Y so the frame can never
 * collapse.
 */
export function sectionFrame(tangent: Vec3M): { localX: Vec3M; localZ: Vec3M } {
  const t = norm(tangent);
  const reference: Vec3M =
    Math.abs(t.z) > 0.94 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const projected = {
    x: reference.x - t.x * dot(t, reference),
    y: reference.y - t.y * dot(t, reference),
    z: reference.z - t.z * dot(t, reference),
  };
  const localZ = norm(projected);
  const localX = norm(cross(t, localZ));
  return { localX, localZ };
}

/**
 * How far past its last ring a pole cap sits. Driven by the *narrow* half-extent
 * so a flattened section (a boot sole, a scarf tip) gets a cap that rounds off
 * rather than one that spears out past the silhouette — which on the boots
 * would push the soles through the bottom of the collider.
 */
function poleReach(ring: Ring): number {
  return Math.min(ring.rx, ring.rz ?? ring.rx) * 0.6;
}

function tangentAt(rings: readonly Ring[], index: number): Vec3M {
  const n = rings.length;
  if (n < 2) return { x: 0, y: 1, z: 0 };
  if (index === 0) return norm(sub(ringCentre(rings[1]!), ringCentre(rings[0]!)));
  if (index === n - 1)
    return norm(sub(ringCentre(rings[n - 1]!), ringCentre(rings[n - 2]!)));
  return norm(sub(ringCentre(rings[index + 1]!), ringCentre(rings[index - 1]!)));
}

const ZONE_COLOURS = new Map<ZoneName, THREE.Color>();
function zoneColour(zone: ZoneName): THREE.Color {
  let colour = ZONE_COLOURS.get(zone);
  if (!colour) {
    colour = new THREE.Color(PALETTE[zone]);
    ZONE_COLOURS.set(zone, colour);
  }
  return colour;
}

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  skinIndices: number[];
  skinWeights: number[];
  indices: number[];
}

function pushVertex(
  build: Builder,
  boneIndex: Map<string, number>,
  position: Vec3M,
  uv: readonly [number, number],
  ring: Ring,
): number {
  const index = build.positions.length / 3;
  build.positions.push(position.x, position.y, position.z);
  build.normals.push(0, 0, 0);
  build.uvs.push(uv[0], uv[1]);
  const colour = zoneColour(ring.zone);
  build.colors.push(colour.r, colour.g, colour.b);

  const sorted = [...ring.weights].sort((a, b) => b.weight - a.weight).slice(0, 4);
  const total = sorted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  for (let slot = 0; slot < 4; slot += 1) {
    const entry = sorted[slot];
    if (!entry) {
      build.skinIndices.push(0);
      build.skinWeights.push(0);
      continue;
    }
    const bone = boneIndex.get(entry.bone);
    if (bone === undefined) {
      throw new Error(`Character design references unknown bone "${entry.bone}".`);
    }
    build.skinIndices.push(bone);
    build.skinWeights.push(entry.weight / total);
  }
  return index;
}

function buildPart(
  build: Builder,
  boneIndex: Map<string, number>,
  part: PartDefinition,
): { start: number; count: number } {
  const start = build.positions.length / 3;
  const rings = part.rings;
  const columns = part.sides + 1; // duplicate seam column so UVs can wrap
  const ringStarts: number[] = [];

  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r]!;
    const centre = ringCentre(ring);
    const tangent = tangentAt(rings, r);
    const { localX, localZ } = sectionFrame(tangent);
    const rx = ring.rx;
    const rz = ring.rz ?? ring.rx;
    const squareness = ring.squareness ?? 1;
    const offsetZ = ring.offsetZ ?? 0;
    const v = part.faceMapped
      ? FACE_UV_ORIGIN + (r / Math.max(rings.length - 1, 1)) * FACE_UV_SPAN
      : ATLAS_WHITE_UV[1];

    ringStarts.push(build.positions.length / 3);
    for (let c = 0; c < columns; c += 1) {
      // theta = 0 is the character's front (+localZ), so the face lands on the
      // middle of the atlas' art region rather than across its seam.
      const theta = (c / part.sides) * Math.PI * 2 - Math.PI;
      const [sx, sz] = sectionOffsets(theta, squareness);
      const position: Vec3M = {
        x: centre.x + localX.x * sx * rx + localZ.x * (sz * rz + offsetZ),
        y: centre.y + localX.y * sx * rx + localZ.y * (sz * rz + offsetZ),
        z: centre.z + localX.z * sx * rx + localZ.z * (sz * rz + offsetZ),
      };
      const u = part.faceMapped
        ? FACE_UV_ORIGIN + (c / part.sides) * FACE_UV_SPAN
        : ATLAS_WHITE_UV[0];
      pushVertex(build, boneIndex, position, [u, v], ring);
    }
  }

  for (let r = 0; r < rings.length - 1; r += 1) {
    const a = ringStarts[r]!;
    const b = ringStarts[r + 1]!;
    for (let c = 0; c < part.sides; c += 1) {
      // Wound so the face normal points away from the sweep's axis: the
      // section frame is left-handed by construction (see `sectionFrame`), so
      // this ordering is the outward one for every part.
      build.indices.push(a + c, a + c + 1, b + c);
      build.indices.push(a + c + 1, b + c + 1, b + c);
    }
  }

  if (part.startCap === "pole") {
    const ring = rings[0]!;
    const tangent = tangentAt(rings, 0);
    const reach = poleReach(ring);
    const centre = ringCentre(ring);
    const pole = pushVertex(
      build,
      boneIndex,
      {
        x: centre.x - tangent.x * reach,
        y: centre.y - tangent.y * reach,
        z: centre.z - tangent.z * reach,
      },
      part.faceMapped ? [FACE_UV_ORIGIN + FACE_UV_SPAN / 2, FACE_UV_ORIGIN] : ATLAS_WHITE_UV,
      ring,
    );
    const a = ringStarts[0]!;
    for (let c = 0; c < part.sides; c += 1) {
      build.indices.push(pole, a + c + 1, a + c);
    }
  }

  if (part.endCap === "pole") {
    const last = rings.length - 1;
    const ring = rings[last]!;
    const tangent = tangentAt(rings, last);
    const reach = poleReach(ring);
    const centre = ringCentre(ring);
    const pole = pushVertex(
      build,
      boneIndex,
      {
        x: centre.x + tangent.x * reach,
        y: centre.y + tangent.y * reach,
        z: centre.z + tangent.z * reach,
      },
      part.faceMapped
        ? [FACE_UV_ORIGIN + FACE_UV_SPAN / 2, FACE_UV_ORIGIN + FACE_UV_SPAN]
        : ATLAS_WHITE_UV,
      ring,
    );
    const a = ringStarts[last]!;
    for (let c = 0; c < part.sides; c += 1) {
      build.indices.push(pole, a + c, a + c + 1);
    }
  }

  return { start, count: build.positions.length / 3 - start };
}

/** Area-weighted vertex normals, then a seam weld so the duplicated UV column
 * shares its neighbour's normal and the wrap is invisible under lighting. */
function computeNormals(build: Builder): void {
  const { positions, normals, indices } = build;
  for (let i = 0; i < normals.length; i += 1) normals[i] = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const ax = positions[ib]! - positions[ia]!;
    const ay = positions[ib + 1]! - positions[ia + 1]!;
    const az = positions[ib + 2]! - positions[ia + 2]!;
    const bx = positions[ic]! - positions[ia]!;
    const by = positions[ic + 1]! - positions[ia + 1]!;
    const bz = positions[ic + 2]! - positions[ia + 2]!;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    normals[ia] = normals[ia]! + nx;
    normals[ia + 1] = normals[ia + 1]! + ny;
    normals[ia + 2] = normals[ia + 2]! + nz;
    normals[ib] = normals[ib]! + nx;
    normals[ib + 1] = normals[ib + 1]! + ny;
    normals[ib + 2] = normals[ib + 2]! + nz;
    normals[ic] = normals[ic]! + nx;
    normals[ic + 1] = normals[ic + 1]! + ny;
    normals[ic + 2] = normals[ic + 2]! + nz;
  }

  // Weld coincident positions so the seam column and any two parts that share
  // a boundary light continuously.
  const buckets = new Map<string, number[]>();
  // Quantise through an integer so a coordinate that lands on the far side of
  // zero by 1e-16 — which is exactly what the seam column does — cannot end up
  // in a different bucket as "-0.00000".
  const quantise = (value: number): string => {
    const units = Math.round(value * 1e5);
    return (units === 0 ? 0 : units / 1e5).toFixed(5);
  };
  for (let v = 0; v < positions.length / 3; v += 1) {
    const key = `${quantise(positions[v * 3]!)},${quantise(positions[v * 3 + 1]!)},${quantise(positions[v * 3 + 2]!)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(v);
    else buckets.set(key, [v]);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const v of bucket) {
      sx += normals[v * 3]!;
      sy += normals[v * 3 + 1]!;
      sz += normals[v * 3 + 2]!;
    }
    for (const v of bucket) {
      normals[v * 3] = sx;
      normals[v * 3 + 1] = sy;
      normals[v * 3 + 2] = sz;
    }
  }

  for (let v = 0; v < positions.length / 3; v += 1) {
    const x = normals[v * 3]!;
    const y = normals[v * 3 + 1]!;
    const z = normals[v * 3 + 2]!;
    const l = Math.hypot(x, y, z);
    if (l < 1e-9) {
      normals[v * 3] = 0;
      normals[v * 3 + 1] = 1;
      normals[v * 3 + 2] = 0;
      continue;
    }
    normals[v * 3] = x / l;
    normals[v * 3 + 1] = y / l;
    normals[v * 3 + 2] = z / l;
  }
}

export function buildCharacterMeshData(
  boneNames: readonly string[],
  parts: readonly PartDefinition[] = CHARACTER_PARTS,
): CharacterMeshData {
  const boneIndex = new Map(boneNames.map((name, index) => [name, index]));
  const build: Builder = {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    skinIndices: [],
    skinWeights: [],
    indices: [],
  };
  const partRanges = new Map<string, { start: number; count: number }>();
  for (const part of parts) {
    partRanges.set(part.name, buildPart(build, boneIndex, part));
  }
  computeNormals(build);

  return {
    positions: new Float32Array(build.positions),
    normals: new Float32Array(build.normals),
    uvs: new Float32Array(build.uvs),
    colors: new Float32Array(build.colors),
    skinIndices: new Uint16Array(build.skinIndices),
    skinWeights: new Float32Array(build.skinWeights),
    indices: new Uint32Array(build.indices),
    vertexCount: build.positions.length / 3,
    boneNames: [...boneNames],
    partRanges,
  };
}

export function toBufferGeometry(data: CharacterMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals.slice(), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs.slice(), 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(data.colors.slice(), 3));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(data.skinIndices.slice(), 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(data.skinWeights.slice(), 4));
  geometry.setIndex(new THREE.BufferAttribute(data.indices.slice(), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Back-face hull used as a contour. Pushing every vertex out along its own
 * (welded) normal keeps the outline an even width around the whole silhouette
 * instead of thinning out on the limbs the way a uniform scale would.
 */
export function toOutlineGeometry(
  data: CharacterMeshData,
  thickness: number,
): THREE.BufferGeometry {
  const positions = data.positions.slice();
  for (let v = 0; v < data.vertexCount; v += 1) {
    positions[v * 3] = positions[v * 3]! + data.normals[v * 3]! * thickness;
    positions[v * 3 + 1] = positions[v * 3 + 1]! + data.normals[v * 3 + 1]! * thickness;
    positions[v * 3 + 2] = positions[v * 3 + 2]! + data.normals[v * 3 + 2]! * thickness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals.slice(), 3));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(data.skinIndices.slice(), 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(data.skinWeights.slice(), 4));
  geometry.setIndex(new THREE.BufferAttribute(data.indices.slice(), 1));
  geometry.computeBoundingSphere();
  return geometry;
}
