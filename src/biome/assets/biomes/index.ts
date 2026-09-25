/**
 * Biome id → art direction. Original has none (it draws nothing). Each
 * biome's art lives in its own module so biome workers never share a file;
 * adding a biome is one line here.
 */
import { getBiomeDefinition } from "../../presets.js";
import type { BiomeId } from "../../types.js";
import type { BiomeArt } from "../types.js";
import { legacyArt } from "./legacy.js";

const FACTORIES: Partial<Record<BiomeId, () => BiomeArt>> = {
  tropical: () => legacyArt(getBiomeDefinition("tropical")),
  desert: () => legacyArt(getBiomeDefinition("desert")),
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
