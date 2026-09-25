/**
 * Bakes composed cluster members into a few merged, static bucket geometries
 * so the number of draw calls does not grow with the number of variants.
 *
 * Buckets split by shading (faceted | smooth) and by whether they cast into
 * the sun's shadow map. World-space positions are baked; the shared prop
 * shader reads `aPivot` (member base xyz, member world height) for wind sway
 * and the near-camera fade, and `aSway` for how much each vertex bends.
 */
import * as THREE from "three";
import type { ComposedCluster, ComposedMember } from "./compose.js";
import type { AssetShading } from "./types.js";

export type BucketKey = `${AssetShading}:${"cast" | "nocast"}`;

export const BUCKET_ORDER: readonly BucketKey[] = ["faceted:cast", "smooth:cast", "faceted:nocast", "smooth:nocast"];

export interface PropBucket {
  key: BucketKey;
  shading: AssetShading;
  castShadow: boolean;
  geometry: THREE.BufferGeometry;
  members: number;
  triangles: number;
}

export function bucketKeyOf(member: ComposedMember, shadows: boolean): BucketKey {
  const cast = shadows && member.family.castShadow && member.role !== "micro";
  return `${member.family.shading}:${cast ? "cast" : "nocast"}`;
}

/** Groups members by bucket, in a stable order. */
export function groupMembers(clusters: readonly ComposedCluster[], shadows: boolean): Map<BucketKey, ComposedMember[]> {
  const groups = new Map<BucketKey, ComposedMember[]>();
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      const key = bucketKeyOf(member, shadows);
      const list = groups.get(key) ?? [];
      list.push(member);
      groups.set(key, list);
    }
  }
  return new Map(BUCKET_ORDER.filter((key) => groups.has(key)).map((key) => [key, groups.get(key)!]));
}

/** One merged, indexed geometry for a bucket's members. Caller owns it. */
export function bakeBucket(key: BucketKey, members: readonly ComposedMember[]): PropBucket {
  let vertexCount = 0;
  let indexCount = 0;
  for (const member of members) {
    vertexCount += member.mesh.positions.length / 3;
    indexCount += member.mesh.index.length;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const sway = new Float32Array(vertexCount);
  const pivots = new Float32Array(vertexCount * 4);
  const index = new Uint32Array(indexCount);
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const member of members) {
    const { mesh, matrix, tone, base, height } = member;
    normalMatrix.getNormalMatrix(matrix);
    const count = mesh.positions.length / 3;
    for (let i = 0; i < count; i += 1) {
      const o = (vertexOffset + i) * 3;
      v.fromArray(mesh.positions, i * 3).applyMatrix4(matrix);
      positions[o] = v.x;
      positions[o + 1] = v.y;
      positions[o + 2] = v.z;
      n.fromArray(mesh.normals, i * 3).applyMatrix3(normalMatrix).normalize();
      normals[o] = n.x;
      normals[o + 1] = n.y;
      normals[o + 2] = n.z;
      const r = mesh.colors[i * 3]!;
      const g = mesh.colors[i * 3 + 1]!;
      const b = mesh.colors[i * 3 + 2]!;
      colors[o] = Math.max(0, tone[0]! * r + tone[1]! * g + tone[2]! * b);
      colors[o + 1] = Math.max(0, tone[3]! * r + tone[4]! * g + tone[5]! * b);
      colors[o + 2] = Math.max(0, tone[6]! * r + tone[7]! * g + tone[8]! * b);
      sway[vertexOffset + i] = mesh.sway[i]!;
      const p = (vertexOffset + i) * 4;
      pivots[p] = base[0];
      pivots[p + 1] = base[1];
      pivots[p + 2] = base[2];
      pivots[p + 3] = height;
    }
    // A mirrored member flips handedness; reverse its winding so it is not
    // culled inside out.
    const flip = matrix.determinant() < 0;
    for (let i = 0; i < mesh.index.length; i += 3) {
      const a = mesh.index[i]! + vertexOffset;
      const b = mesh.index[i + 1]! + vertexOffset;
      const c = mesh.index[i + 2]! + vertexOffset;
      index[indexOffset + i] = a;
      index[indexOffset + i + 1] = flip ? c : b;
      index[indexOffset + i + 2] = flip ? b : c;
    }
    vertexOffset += count;
    indexOffset += mesh.index.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));
  geometry.setAttribute("aPivot", new THREE.BufferAttribute(pivots, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const [shading, cast] = key.split(":") as [AssetShading, "cast" | "nocast"];
  return { key, shading, castShadow: cast === "cast", geometry, members: members.length, triangles: indexCount / 3 };
}
