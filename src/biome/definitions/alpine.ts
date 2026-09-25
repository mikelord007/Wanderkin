/**
 * Alpine biome definition: the gameplay-facing, data-only half of the biome
 * (palette, light, sky, surface, prop kinds/density/scale, wind, ambience,
 * mission copy, budgets). Its art direction lives in
 * `../assets/biomes/alpine.ts`. Conventions: see `../presets.ts`.
 *
 * Wave 2 baseline by the environment lead; owned by the Alpine worker from
 * hand-off (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2 addendum). Prop kinds are
 * footprint classes: `palm` = tall tree class, `cactus` = tall narrow spire,
 * `shrub`/`rock`/`wood`/`dry-plant` as named. Keep `budget` within the §8
 * caps and `props.kinds` to existing kinds.
 */
import type { BiomeDefinition } from "../types.js";

export const ALPINE: BiomeDefinition = {
  id: "alpine",
  name: "Snowy Alpine",
  palette: {
    // Snow floor: a cool tint so shade reads blue, not grey.
    sand: "#e8f1ff",
    vegetation: "#3f6b56",
    rock: "#8a8f98",
    wood: "#7a5a40",
    accent: "#d9534f",
    // Frozen water ring (lerped toward white by the frozen style): ice blue.
    water: "#8cc6e6",
  },
  // Cool blue-white world under a warm, low winter sun. The Cartoon grade
  // bands floor luminance, so the sun is strong enough to lift sunlit snow
  // (helper floor and scan floor alike) into the top band: white snow in
  // sun, icy blue snow in shade. The sun sits low and behind the camera, so
  // furniture throws long blue shadows away from the player.
  lighting: { sun: "#ffe0b8", sky: "#cfe3f5", ground: "#e8eef5", intensity: 3.4, ambient: 1.0, direction: [-3, 3.4, 5] },
  sky: { zenith: "#6fa8dc", horizon: "#e8f1f8", fogNear: 1.9, fogFar: 7.4 },
  surface: { color: "#f2f6fa", blend: 0.45, upwardNormalMin: 0.8, patchCoverage: 0.6 },
  props: { kinds: ["palm", "shrub", "rock", "wood"], density: 0.5, scaleRange: [0.7, 2.4] },
  wind: { direction: [0.6, -0.8], strength: 0.4 },
  ambient: { effect: "motes", water: true },
  mission: {
    portalTitle: "Wake the summit gate",
    beaconTitle: "Light the summit beacon",
    fragmentName: "frost fragment",
    collectibleColor: "#ffb020",
  },
  budget: { props: 110, patches: 22, particles: 220, drawCalls: 14 },
};
