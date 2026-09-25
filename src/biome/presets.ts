/**
 * Deterministic biome presets. Everything a model may pick is one of these
 * ids; nothing here is derived from model output or user text.
 *
 * Units and conventions (see `src/biome/types.ts` for the shared shape):
 *  - `lighting.direction` points FROM the scene TOWARD the sun (any length).
 *  - `sky.fogNear` / `sky.fogFar` are multiples of the scene's bounding
 *    radius, so haze reads the same on a countertop and on a whole room.
 *  - `wind.direction` is a unit XZ vector pointing DOWNWIND (where the air
 *    goes). Foliage leans, dust drifts and the windsock's tail points along
 *    it; `strength` is 0..1.
 *  - `surface.blend` is the strongest tint any texel of the scan may receive
 *    (0..1); `patchCoverage` caps the share of approved support patches used.
 *  - `props.scaleRange` is relative to the character height, for geometry.
 *  - `budget` is the standard-quality ceiling; reduced quality lowers it
 *    further via {@link effectiveBudget}.
 *
 * Each themed biome's definition lives in `./definitions/<id>.ts` (one owner
 * per file); its renderer-only art direction in `./assets/biomes/<id>.ts`.
 */
import type { BiomeDefinition, BiomeId, EffectsQuality } from "./types.js";
import { ALPINE } from "./definitions/alpine.js";
import { AUTUMN } from "./definitions/autumn.js";
import { DESERT } from "./definitions/desert.js";
import { EMBER } from "./definitions/ember.js";
import { TROPICAL } from "./definitions/tropical.js";

const ORIGINAL: BiomeDefinition = {
  id: "original",
  name: "Original",
  palette: {
    sand: "#d8c6a0",
    vegetation: "#6bcb77",
    rock: "#9a948c",
    wood: "#8a6440",
    accent: "#9b5de5",
    water: "#5aa9e6",
  },
  lighting: { sun: "#fff1a8", sky: "#9ed9ff", ground: "#c9b99a", intensity: 2.1, ambient: 0.85, direction: [5, 8, 4] },
  sky: { zenith: "#8ed8ff", horizon: "#ddf5ff", fogNear: 1.7, fogFar: 7.2 },
  surface: { color: "#d8c6a0", blend: 0, upwardNormalMin: 0.8, patchCoverage: 0 },
  props: { kinds: [], density: 0, scaleRange: [1, 1] },
  wind: { direction: [1, 0], strength: 0 },
  ambient: { effect: "none", water: false },
  mission: {
    portalTitle: "Open the portal",
    beaconTitle: "Reach the beacon",
    fragmentName: "energy fragment",
    collectibleColor: "#9b5de5",
  },
  budget: { props: 0, patches: 0, particles: 0, drawCalls: 0 },
};



const DEFINITIONS: Readonly<Record<BiomeId, BiomeDefinition>> = {
  original: ORIGINAL,
  tropical: TROPICAL,
  desert: DESERT,
  alpine: ALPINE,
  autumn: AUTUMN,
  ember: EMBER,
};

export const BIOME_IDS: readonly BiomeId[] = ["original", "tropical", "desert", "alpine", "autumn", "ember"];

export function isBiomeId(value: unknown): value is BiomeId {
  return typeof value === "string" && (BIOME_IDS as readonly string[]).includes(value);
}

/** Unknown ids fall back to Original rather than throwing. */
export function getBiomeDefinition(id: BiomeId): BiomeDefinition {
  return DEFINITIONS[id] ?? ORIGINAL;
}

/** Reduced quality roughly halves props and cuts particles to a third. */
export function effectiveBudget(
  definition: BiomeDefinition,
  quality: EffectsQuality,
): BiomeDefinition["budget"] {
  const { props, patches, particles, drawCalls } = definition.budget;
  if (quality === "standard") return definition.budget;
  return {
    props: Math.floor(props * 0.5),
    patches: Math.floor(patches * 0.6),
    particles: Math.floor(particles * 0.35),
    drawCalls: Math.max(0, drawCalls - 3),
  };
}
