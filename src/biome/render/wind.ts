/**
 * One shared wind for everything that moves: foliage sway, drifting dust,
 * the windsock. Convention (see `presets.ts`): `direction` is a unit XZ
 * vector pointing DOWNWIND.
 */
import * as THREE from "three";
import type { BiomeDefinition } from "../types.js";

export interface WindUniforms {
  uWindTime: { value: number };
  /** Unit XZ downwind direction. */
  uWindDir: { value: THREE.Vector2 };
  /** 0..1 */
  uWindStrength: { value: number };
  /** Motion multiplier: 0 freezes every wind-driven animation. */
  uWindMotion: { value: number };
}

export function normalizedWind(direction: readonly [number, number]): [number, number] {
  const [x, z] = direction;
  const length = Math.hypot(x, z);
  if (!Number.isFinite(length) || length < 1e-6) return [1, 0];
  return [x / length, z / length];
}

export function clampWindStrength(strength: number): number {
  return Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
}

/**
 * Yaw (rotation about +Y) that turns local +X onto the downwind direction.
 * three.js rotates +X by `yaw` onto (cos yaw, 0, -sin yaw).
 */
export function downwindYaw(direction: readonly [number, number]): number {
  const [x, z] = normalizedWind(direction);
  return Math.atan2(-z, x);
}

export function createWindUniforms(wind: BiomeDefinition["wind"], reducedMotion: boolean): WindUniforms {
  const [x, z] = normalizedWind(wind.direction);
  return {
    uWindTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(x, z) },
    uWindStrength: { value: clampWindStrength(wind.strength) },
    uWindMotion: { value: reducedMotion ? 0 : 1 },
  };
}
