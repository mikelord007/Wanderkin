/**
 * Tropical biome definition: the gameplay-facing, data-only half of the biome
 * (palette, light, sky, surface, prop kinds/density/scale, wind, ambience,
 * mission copy, budgets). Its art direction lives in
 * `../assets/biomes/tropical.ts`. Conventions: see `../presets.ts`.
 *
 * Owned by the Tropical worker from hand-off (ENVIRONMENT_ARCHITECTURE.md §10);
 * keep `budget` within the §8 caps and `props.kinds` to existing kinds.
 */
import type { BiomeDefinition } from "../types.js";

export const TROPICAL: BiomeDefinition = {
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
  // A light sand tint: dark furniture (the Rodin desk) must stay recognisable.
  surface: { color: "#f0d59a", blend: 0.3, upwardNormalMin: 0.82, patchCoverage: 0.55 },
  props: { kinds: ["palm", "shrub", "rock", "wood"], density: 0.6, scaleRange: [0.8, 3.2] },
  wind: { direction: [0.8, 0.6], strength: 0.35 },
  ambient: { effect: "motes", water: true },
  mission: {
    portalTitle: "Wake the island gate",
    beaconTitle: "Light the lagoon beacon",
    fragmentName: "sun fragment",
    collectibleColor: "#ffb347",
  },
  // Real surfaces are space-limited below this; the cap keeps very large
  // surfaces from crowding, and reduced effects get 56 clusters, not 70.
  budget: { props: 112, patches: 20, particles: 90, drawCalls: 14 },
};
