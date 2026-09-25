/**
 * Autumn biome definition: the gameplay-facing, data-only half of the biome
 * (palette, light, sky, surface, prop kinds/density/scale, wind, ambience,
 * mission copy, budgets). Its art direction lives in
 * `../assets/biomes/autumn.ts`. Conventions: see `../presets.ts`.
 *
 * Wave 2 baseline by the environment lead; owned by the Autumn worker from
 * hand-off (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2 addendum). Prop kinds are
 * footprint classes: `palm` = tall tree class, `cactus` = tall narrow spire,
 * `shrub`/`rock`/`wood`/`dry-plant` as named. Keep `budget` within the §8
 * caps and `props.kinds` to existing kinds.
 */
import type { BiomeDefinition } from "../types.js";

export const AUTUMN: BiomeDefinition = {
  id: "autumn",
  name: "Autumn Forest",
  palette: {
    sand: "#8c786c",
    vegetation: "#c8792e",
    rock: "#8c8677",
    wood: "#6e4a2e",
    accent: "#c2412f",
    water: "#6a9aa8",
  },
  // Soft golden light through a light mist.
  lighting: { sun: "#ffd79a", sky: "#e9dcc4", ground: "#c9a878", intensity: 2.2, ambient: 0.82, direction: [4, 5.5, -3] },
  // A warm golden haze a little closer in, so far groves soften into mist.
  sky: { zenith: "#8aa9c4", horizon: "#efdcb8", fogNear: 1.3, fogFar: 5.8 },
  surface: { color: "#9c8674", blend: 0.36, upwardNormalMin: 0.8, patchCoverage: 0.6 },
  props: { kinds: ["palm", "shrub", "rock", "wood", "dry-plant"], density: 0.55, scaleRange: [0.8, 3.1] },
  wind: { direction: [-0.8, -0.6], strength: 0.3 },
  ambient: { effect: "motes", water: false },
  mission: {
    portalTitle: "Open the hollow gate",
    beaconTitle: "Light the hollow beacon",
    fragmentName: "ember-leaf fragment",
    collectibleColor: "#3fc9d6",
  },
  budget: { props: 100, patches: 22, particles: 120, drawCalls: 14 },
};
