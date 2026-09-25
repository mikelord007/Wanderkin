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
    // Cool ash grey: under the warm dusk sun the floor reads as a pale
    // mauve-ash field that the dark basalt and charred snags stand out on,
    // and it keeps every floor region in one Cartoon band (no dark rings).
    sand: "#7a7e8c",
    vegetation: "#7d8a5c",
    rock: "#3b3a40",
    wood: "#3a2a22",
    accent: "#ff6a2a",
    // Lava ring (BiomeArt.atmosphere.water = "lava"): deep red-orange seams.
    water: "#f0562a",
  },
  // Dusk over dark basalt: a low warm sun from the front-left so furniture
  // faces the camera sees stay lit (a back sun sank the Tripo sofa under the
  // Cartoon floor band), cool violet sky fill in the shadows, and a warm
  // lava-glow bounce from below.
  lighting: { sun: "#ffb27a", sky: "#8e84a8", ground: "#a0604a", intensity: 2.4, ambient: 0.96, direction: [-4, 3.2, 3.5] },
  sky: { zenith: "#4a4a6e", horizon: "#e7a37a", fogNear: 1.6, fogFar: 6.8 },
  surface: { color: "#6a5650", blend: 0.45, upwardNormalMin: 0.8, patchCoverage: 0.55 },
  // `palm` = charred snags (tall tree class), `cactus` = basalt/obsidian spires.
  // Density 0.5 over [0.8, 2.6]: about 70-80 clusters (Desert ~60, Tropical
  // ~85) with open ash between groves, and no tiny props.
  props: { kinds: ["palm", "cactus", "rock", "dry-plant", "wood"], density: 0.5, scaleRange: [0.8, 2.6] },
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
