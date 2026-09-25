/**
 * Desert biome definition: the gameplay-facing, data-only half of the biome
 * (palette, light, sky, surface, prop kinds/density/scale, wind, ambience,
 * mission copy, budgets). Its art direction lives in
 * `../assets/biomes/desert.ts`. Conventions: see `../presets.ts`.
 *
 * Owned by the Desert worker from hand-off (ENVIRONMENT_ARCHITECTURE.md §10);
 * keep `budget` within the §8 caps and `props.kinds` to existing kinds.
 */
import type { BiomeDefinition } from "../types.js";

export const DESERT: BiomeDefinition = {
  id: "desert",
  name: "Desert",
  palette: {
    sand: "#e8b46c",
    vegetation: "#6f9a4e",
    rock: "#a9774f",
    wood: "#7d5a3a",
    accent: "#ff7a3d",
    water: "#3aa3b8",
  },
  // Sun-baked: a warmer, slightly stronger sun; warm sky/ground bounce.
  lighting: { sun: "#ffd08a", sky: "#eadbc4", ground: "#e9bd86", intensity: 2.6, ambient: 0.72, direction: [-3, 7, 4] },
  sky: { zenith: "#3f97e0", horizon: "#f4e2c4", fogNear: 1.9, fogFar: 7.8 },
  surface: { color: "#e6c089", blend: 0.48, upwardNormalMin: 0.8, patchCoverage: 0.65 },
  props: { kinds: ["rock", "cactus", "dry-plant", "wood", "windsock"], density: 0.34, scaleRange: [0.6, 2.6] },
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
