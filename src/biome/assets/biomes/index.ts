/**
 * Biome id → art direction. Original has none (it draws nothing). Each
 * biome's art lives in its own module so biome workers never share a file;
 * adding a biome is one line here.
 */
import type { BiomeId } from "../../types.js";
import type { BiomeArt } from "../types.js";
import { DESERT_ART } from "./desert.js";
import { TROPICAL_ART } from "./tropical.js";

/**
 * One line per biome. A biome without its own art yet can use
 * `legacyArt(getBiomeDefinition(id))` from `./legacy.js` (the v1 props).
 */
const FACTORIES: Partial<Record<BiomeId, () => BiomeArt>> = {
  tropical: () => TROPICAL_ART,
  desert: () => DESERT_ART,
};

const cache = new Map<BiomeId, BiomeArt>();

/** The art for a biome, built once per session; null for Original/unknown. */
export function getBiomeArt(id: BiomeId): BiomeArt | null {
  const cached = cache.get(id);
  if (cached) return cached;
  const factory = FACTORIES[id];
  if (!factory) return null;
  const art = factory();
  cache.set(id, art);
  return art;
}

/** Every registered art, for framework-wide guardrail tests. */
export function registeredBiomeArt(): BiomeArt[] {
  return (Object.keys(FACTORIES) as BiomeId[]).map((id) => getBiomeArt(id)!);
}
