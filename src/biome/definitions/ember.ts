/**
 * Ember biome definition: the gameplay-facing, data-only half of the biome
 * (palette, light, sky, surface, prop kinds/density/scale, wind, ambience,
 * mission copy, budgets). Its art direction lives in
 * `../assets/biomes/ember.ts`. Conventions: see `../presets.ts`.
 *
 * Wave 2 baseline by the environment lead; owned by the Ember worker from
 * hand-off (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2 addendum). Prop kinds are
 * footprint classes: `palm` = tall tree class, `cactus` = tall narrow spire,
 * `shrub`/`rock`/`wood`/`dry-plant` as named. Keep `budget` within the §8
 * caps and `props.kinds` to existing kinds.
 */
import type { BiomeDefinition } from "../types.js";

export const EMBER: BiomeDefinition = {
  id: "ember",
  name: "Volcanic Ember",
  palette: {
    sand: "#6c6a74",
    vegetation: "#7d8a5c",
    rock: "#3b3a40",
    wood: "#3a2a22",
    accent: "#ff6a2a",
    water: "#ff7a2a",
  },
  // Dusk over dark basalt: a low warm rim light, cool shadows.
  lighting: { sun: "#ffb27a", sky: "#8a7a9a", ground: "#5a4640", intensity: 2.4, ambient: 0.92, direction: [-5, 3.5, -2] },
  sky: { zenith: "#4a4a6e", horizon: "#e7a37a", fogNear: 1.6, fogFar: 6.8 },
  surface: { color: "#6a5650", blend: 0.45, upwardNormalMin: 0.8, patchCoverage: 0.55 },
  // `palm` = charred snags (tall tree class), `cactus` = basalt/obsidian spires.
  props: { kinds: ["palm", "cactus", "rock", "dry-plant", "wood"], density: 0.4, scaleRange: [0.7, 2.8] },
  wind: { direction: [0.6, 0.8], strength: 0.35 },
  ambient: { effect: "dust", water: true },
  mission: {
    portalTitle: "Awaken the obsidian gate",
    beaconTitle: "Reach the obsidian beacon",
    fragmentName: "cinder fragment",
    collectibleColor: "#62d8ff",
  },
  budget: { props: 105, patches: 22, particles: 220, drawCalls: 14 },
};
