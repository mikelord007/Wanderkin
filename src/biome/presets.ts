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
 */
import type { BiomeDefinition, BiomeId, EffectsQuality } from "./types.js";

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

const TROPICAL: BiomeDefinition = {
  id: "tropical",
  name: "Tropical Island",
  palette: {
    sand: "#f3cda2",
    vegetation: "#3fae5a",
    rock: "#8f8a80",
    wood: "#9a6b3f",
    accent: "#ffb347",
    water: "#2fb6c9",
  },
  lighting: { sun: "#ffe2a6", sky: "#d6ecee", ground: "#f0d9a8", intensity: 2.35, ambient: 0.78, direction: [4, 7, 5] },
  sky: { zenith: "#4fb4f5", horizon: "#d9f3ff", fogNear: 2.3, fogFar: 9.5 },
  surface: { color: "#f0d59a", blend: 0.42, upwardNormalMin: 0.82, patchCoverage: 0.55 },
  props: { kinds: ["palm", "shrub", "rock", "wood"], density: 0.6, scaleRange: [0.8, 3.2] },
  wind: { direction: [0.8, 0.6], strength: 0.35 },
  ambient: { effect: "motes", water: true },
  mission: {
    portalTitle: "Wake the island gate",
    beaconTitle: "Light the lagoon beacon",
    fragmentName: "sun fragment",
    collectibleColor: "#ffb347",
  },
  budget: { props: 140, patches: 20, particles: 90, drawCalls: 14 },
};

const DESERT: BiomeDefinition = {
  id: "desert",
  name: "Desert",
  palette: {
    sand: "#e3bf85",
    vegetation: "#6f9a4e",
    rock: "#a9774f",
    wood: "#7d5a3a",
    accent: "#ff7a3d",
    water: "#3aa3b8",
  },
  lighting: { sun: "#ffd89a", sky: "#e9dccb", ground: "#e8c08c", intensity: 2.5, ambient: 0.72, direction: [-3, 7, 4] },
  sky: { zenith: "#3f97e0", horizon: "#f4e2c4", fogNear: 1.9, fogFar: 7.8 },
  surface: { color: "#e6c089", blend: 0.48, upwardNormalMin: 0.8, patchCoverage: 0.65 },
  props: { kinds: ["rock", "cactus", "dry-plant", "wood", "windsock"], density: 0.45, scaleRange: [0.6, 2.6] },
  wind: { direction: [-0.6, 0.8], strength: 0.6 },
  ambient: { effect: "dust", water: false },
  mission: {
    portalTitle: "Awaken the oasis gate",
    beaconTitle: "Reach the oasis beacon",
    fragmentName: "relic fragment",
    collectibleColor: "#ff7a3d",
  },
  budget: { props: 110, patches: 24, particles: 260, drawCalls: 14 },
};

const DEFINITIONS: Readonly<Record<BiomeId, BiomeDefinition>> = {
  original: ORIGINAL,
  tropical: TROPICAL,
  desert: DESERT,
};

export const BIOME_IDS: readonly BiomeId[] = ["original", "tropical", "desert"];

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
