/**
 * Minimal vector helpers shared by the headless simulation core.
 *
 * These deliberately use Rapier's plain `{ x, y, z }` shape rather than
 * `THREE.Vector3` so the whole physics/mantle/checkpoint core can be
 * imported and unit-tested in a Node environment without pulling in the
 * renderer.
 */

import type { Quat, Vec3 } from "@shared/index.js";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const UP: Readonly<Vec3Like> = Object.freeze({ x: 0, y: 1, z: 0 });

export function vec3(x = 0, y = 0, z = 0): Vec3Like {
  return { x, y, z };
}

export function fromTuple(t: Vec3): Vec3Like {
  return { x: t[0], y: t[1], z: t[2] };
}

export function toTuple(v: Vec3Like): Vec3 {
  return [v.x, v.y, v.z];
}

export function quatFromTuple(q: Quat): QuatLike {
  return { x: q[0], y: q[1], z: q[2], w: q[3] };
}

export function copy(v: Vec3Like): Vec3Like {
  return { x: v.x, y: v.y, z: v.z };
}

export function set(out: Vec3Like, x: number, y: number, z: number): Vec3Like {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3Like, s: number): Vec3Like {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function addScaled(a: Vec3Like, b: Vec3Like, s: number): Vec3Like {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length(v: Vec3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function horizontalLength(v: Vec3Like): number {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

export function distance(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function normalize(v: Vec3Like): Vec3Like {
  const len = length(v);
  if (len <= 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent approach toward a target. `rate` is the
 * exponential convergence rate in 1/seconds; the result is identical for
 * any `dt` split, which matters because the controller runs on a fixed
 * timestep that may execute several sub-steps per rendered frame.
 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Rotates `v` by unit quaternion `q` (x, y, z, w order). */
export function rotateByQuat(v: Vec3Like, q: QuatLike): Vec3Like {
  // t = 2 * (q.xyz x v); v' = v + q.w * t + (q.xyz x t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Horizontal forward direction for a heading measured around +Y from +Z. */
export function headingForward(yawRadians: number): Vec3Like {
  return { x: Math.sin(yawRadians), y: 0, z: Math.cos(yawRadians) };
}

/**
 * Horizontal right-hand direction for a heading, i.e. `forward x up` in
 * this Y-up right-handed convention.
 */
export function headingRight(yawRadians: number): Vec3Like {
  return { x: -Math.cos(yawRadians), y: 0, z: Math.sin(yawRadians) };
}

/** Yaw (around +Y, measured from +Z) of a horizontal direction. */
export function yawOf(direction: Vec3Like): number {
  return Math.atan2(direction.x, direction.z);
}

/** Shortest signed angular difference `to - from`, wrapped to [-pi, pi]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
