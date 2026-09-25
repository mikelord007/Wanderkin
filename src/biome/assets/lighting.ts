/**
 * Resolves a biome's optional {@link LightingAdjust} into bounded values.
 * Defaults reproduce the framework's standard themed rig, so a biome that
 * sets nothing looks exactly as before. Original never reaches this code.
 */
import type { LightingAdjust } from "./types.js";

export interface ResolvedBiomeLighting {
  ambientKeep: number;
  hemisphereShare: number;
  /** Radians, min <= max. */
  sunElevation: readonly [number, number];
  fogScale: number;
  contactStrength: number;
}

export const LIGHTING_DEFAULTS: ResolvedBiomeLighting = {
  ambientKeep: 0.62,
  hemisphereShare: 0.45,
  sunElevation: [(24 * Math.PI) / 180, (52 * Math.PI) / 180],
  fogScale: 1,
  contactStrength: 1,
};

function clamp(value: number | undefined, low: number, high: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
}

export function resolveBiomeLighting(adjust: LightingAdjust | undefined): ResolvedBiomeLighting {
  if (!adjust) return LIGHTING_DEFAULTS;
  const degrees = adjust.sunElevation;
  const low = clamp(degrees?.[0], 15, 65, 24);
  const high = clamp(degrees?.[1], 15, 65, 52);
  return {
    ambientKeep: clamp(adjust.ambientKeep, 0.3, 1, LIGHTING_DEFAULTS.ambientKeep),
    hemisphereShare: clamp(adjust.hemisphereShare, 0, 1, LIGHTING_DEFAULTS.hemisphereShare),
    sunElevation: [(Math.min(low, high) * Math.PI) / 180, (Math.max(low, high) * Math.PI) / 180],
    fogScale: clamp(adjust.fogScale, 0.6, 1.6, 1),
    contactStrength: clamp(adjust.contactStrength, 0, 1.5, 1),
  };
}
