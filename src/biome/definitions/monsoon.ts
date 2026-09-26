/**
 * Monsoon biome definition: the gameplay-facing, data-only half of the biome
 * (palette, light, sky, surface, prop kinds/density/scale, wind, ambience,
 * mission copy, budgets). Its art direction lives in
 * `../assets/biomes/monsoon.ts`. Conventions: see `../presets.ts`.
 *
 * A drenched green marsh under low cloud: rain palms and banana plants,
 * mossy boulders, reed beds, taro and ferns, wooden stilt huts, glossy
 * puddles and steady rain that splashes on every surface. Prop kinds are
 * footprint classes: `palm` = tall tree class, `dry-plant` = reed beds,
 * `wood` = stilt huts and rain lanterns.
 */
import type { BiomeDefinition } from "../types.js";

export const MONSOON: BiomeDefinition = {
  id: "monsoon",
  name: "Monsoon Marsh",
  palette: {
    // Soaked olive-grey mud. Its display luma sits mid-band (≈0.41) so the
    // Cartoon floor bands keep every floor region on one band: dark enough
    // to read wet, never crushed to black in furniture shade, and neutral
    // enough that the greens of the plants stand off it.
    sand: "#6a6a5c",
    vegetation: "#3f6b4a",
    rock: "#48524f",
    wood: "#5c4a38",
    accent: "#b85e86",
    // Flood water around the scene: murky teal under grey sky.
    water: "#4f7f86",
  },
  // Overcast monsoon light: a cool, soft sun from the front-left (the side
  // the camera looks from), a bright grey-blue sky filling the shade with a
  // cool edge on every silhouette, and a green bounce off the wet ground. A
  // back or side sun sank the Tripo sofa into a black cutout (the failure
  // Autumn fixed in 7488d5d), so there is no back rim light.
  lighting: { sun: "#dfe9f0", sky: "#a9bccb", ground: "#8a9486", intensity: 2.4, ambient: 1.15, direction: [-3.5, 3.6, 4.5] },
  // Low cloud: grey-blue sky and close fog, so the far room melts into rain.
  sky: { zenith: "#6d7f8c", horizon: "#b9c6cb", fogNear: 1.3, fogFar: 6.0 },
  surface: { color: "#6c6d60", blend: 0.36, upwardNormalMin: 0.8, patchCoverage: 0.6 },
  props: { kinds: ["palm", "shrub", "rock", "dry-plant", "wood"], density: 0.5, scaleRange: [0.7, 2.3] },
  // Wind leans the rain and sways the fronds.
  wind: { direction: [0.6, 0.8], strength: 0.45 },
  // Motes restyled as fine drifting spray (art `particleTint`) under the rain.
  ambient: { effect: "motes", water: true, rain: true },
  mission: {
    portalTitle: "Open the rain gate",
    beaconTitle: "Light the lantern beacon",
    fragmentName: "rain pearl",
    // Warm lantern gold: the one warm, saturated note in a cool wet world.
    collectibleColor: "#ffc23a",
  },
  budget: { props: 110, patches: 22, particles: 120, drawCalls: 14 },
};
