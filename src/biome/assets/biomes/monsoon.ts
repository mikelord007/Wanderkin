/**
 * Monsoon art: a drenched green marsh on the furniture. Rain palms and
 * banana clumps hang heavy with water, taro and ferns crowd their feet,
 * dark river boulders wear moss cushions, reed beds lean downwind, and
 * wooden stilt huts stand above glossy puddles. Low cloud and steady rain
 * (with splashes on every surface) tie it together; the only warm notes are
 * red rain lanterns and the gold rain pearls you collect.
 *
 * Builders live in `../monsoon/`. Rain is `atmosphere.rain` (render/rain.ts).
 */
import { monsoonMarkerVariants } from "../monsoon/huts.js";
import { bananaVariants, fallenLeaf, gingerLily, monsoonBushVariants, rainPalmVariants, reedVariants, youngPalmVariants } from "../monsoon/plants.js";
import { monsoonRocks } from "../monsoon/rocks.js";
import { MONSOON_WALL } from "../monsoon/wall.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  // Deep wet greens: dark enough to hold against the grey sky.
  foliage: { dark: "#1d3a2a", base: "#2d573d", light: "#4a7f5c" },
  // Banana and young growth: a fresher yellow-green.
  foliageAlt: { dark: "#2a4a28", base: "#41703b", light: "#6d9a58" },
  trunk: { dark: "#2f2823", base: "#4d4238", light: "#716353" },
  // Rain-darkened basalt and river stone.
  rock: { dark: "#2b3230", base: "#454f4c", light: "#66716d" },
  moss: { dark: "#2a4526", base: "#3d6236", light: "#5c874c" },
  soil: { dark: "#39413b", base: "#525c55", light: "#707b73" },
  // Dead fronds and fallen leaves: wet straw.
  dry: { dark: "#4f4a2f", base: "#6f6843", light: "#908760" },
  reed: { dark: "#44552f", base: "#637646", light: "#879a63" },
  cattail: { dark: "#2c2018", base: "#46332a", light: "#654c3d" },
  stem: { dark: "#355a31", base: "#4f7a45", light: "#739c63" },
  cactus: { dark: "#2a4a36", base: "#3c6648", light: "#5f8a68" },
  // Ginger-lily pink: far from the gold collectible.
  accent: { dark: "#7e3656", base: "#b85e86", light: "#d98fb0" },
  // Red paper lanterns (≈ 4°; the pearls are ≈ 41° gold).
  lantern: { dark: "#7a2a26", base: "#a83a33", light: "#cc5b4f" },
  plank: { dark: "#3c3129", base: "#5a4a3b", light: "#7d6a55" },
  thatch: { dark: "#4d4531", base: "#6c6245", light: "#8e8461" },
  stoneTop: { dark: "#6a5a47", base: "#86745d", light: "#a08c72" },
  stoneSide: { dark: "#3a3028", base: "#5d4d3d", light: "#8f7c64" },
  stoneRecess: { dark: "#241d18", base: "#2c241e", light: "#352c25" },
} satisfies BiomeTones;

const rocks = monsoonRocks();

export const MONSOON_ART: BiomeArt = {
  id: "monsoon",
  tones,
  // Overcast: more flat ambient and sky fill than sunny looks (shade never
  // crushes), a soft sun kept fairly high, closer fog for low cloud, and
  // slightly deeper contact under dripping plants.
  lighting: { ambientKeep: 0.7, hemisphereShare: 0.6, sunElevation: [26, 46], fogScale: 0.9, contactStrength: 1.1 },
  atmosphere: { water: "liquid", particleTint: "#a9b9c4", rain: { intensity: 1, wetness: 0.6, tint: "#b8c7d2" } },
  families: {
    "rain-palm": {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 1300,
      leanMax: 0.04, mirror: true, embed: [0.01, 0.03],
      variants: rainPalmVariants(),
    },
    banana: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 1300,
      leanMax: 0.03, mirror: true, embed: [0.01, 0.03],
      variants: bananaVariants(),
    },
    "young-palm": {
      category: "tree", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.95, triangleBudget: 900,
      mirror: true, embed: [0.01, 0.03],
      variants: youngPalmVariants(),
    },
    "taro-fern": {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.8, triangleBudget: 900,
      mirror: true, embed: [0.01, 0.03],
      variants: monsoonBushVariants(),
    },
    ginger: {
      category: "dressing", role: "supporting", shading: "smooth", castShadow: false, unitRadius: 0.65, triangleBudget: 400,
      mirror: true, embed: [0.01, 0.03],
      variants: [gingerLily({ stems: 3, seed: 361 }), gingerLily({ stems: 2, seed: 362 })],
    },
    "rock-large": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.4,
      variants: rocks.hero,
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.08], alignToNormal: 0.6,
      variants: rocks.supporting,
    },
    pebble: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.dressing,
    },
    reeds: {
      category: "grass", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.68, triangleBudget: 500,
      mirror: true, embed: [0.02, 0.04],
      variants: reedVariants(),
    },
    "reed-tuft": {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.8, triangleBudget: 500,
      mirror: true, embed: [0.02, 0.04],
      variants: reedVariants(),
    },
    "fallen-leaf": {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 80,
      mirror: true, embed: [0, 0.01], alignToNormal: 1,
      variants: [fallenLeaf(371), fallenLeaf(372), fallenLeaf(373)],
    },
    hut: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.39, triangleBudget: 600,
      embed: [0.01, 0.02],
      variants: monsoonMarkerVariants(),
      weights: [2, 2, 2, 1],
    },
  },
  compositions: {
    palm: [
      {
        weight: 3,
        preset: {
          id: "rain-palm-grove",
          primary: "rain-palm",
          primaryOffset: 0.15,
          members: [
            { family: "young-palm", count: [0, 1], ring: [0.55, 0.95], height: [0.28, 0.45], chance: 0.6 },
            { family: "taro-fern", count: [0, 1], ring: [0.5, 0.9], height: [0.22, 0.34], chance: 0.6 },
            { family: "fallen-leaf", count: [1, 1], ring: [0.4, 0.9], height: [0.14, 0.2] },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.03, 0.05] },
          ],
        },
      },
      {
        weight: 2,
        preset: {
          id: "banana-patch",
          primary: "banana",
          primaryOffset: 0.1,
          members: [
            { family: "ginger", count: [0, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.6 },
            { family: "fallen-leaf", count: [1, 2], ring: [0.4, 0.95], height: [0.16, 0.24] },
            { family: "reed-tuft", count: [0, 1], ring: [0.55, 0.95], height: [0.14, 0.2], chance: 0.4 },
          ],
        },
      },
    ],
    shrub: [
      {
        weight: 3,
        preset: {
          id: "taro-bed",
          primary: "taro-fern",
          members: [
            { family: "ginger", count: [0, 1], ring: [0.5, 0.9], height: [0.45, 0.6], chance: 0.5 },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.08, 0.14] },
            { family: "fallen-leaf", count: [0, 1], ring: [0.5, 0.95], height: [0.25, 0.35], chance: 0.4 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "fern-stone",
          primary: "taro-fern",
          members: [
            { family: "rock-medium", count: [1, 1], ring: [0.55, 0.9], height: [0.25, 0.4] },
            { family: "pebble", count: [1, 2], ring: [0.4, 1], height: [0.06, 0.12] },
          ],
        },
      },
    ],
    rock: [
      {
        weight: 2,
        preset: {
          id: "mossy-boulders",
          primary: "rock-large",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.28, 0.45] },
            { family: "pebble", count: [1, 2], ring: [0.35, 1], height: [0.08, 0.15] },
            { family: "taro-fern", count: [0, 1], ring: [0.5, 0.9], height: [0.3, 0.45], chance: 0.4 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "river-stones",
          primary: "rock-large",
          members: [
            { family: "pebble", count: [2, 3], ring: [0.4, 1], height: [0.08, 0.14] },
            { family: "reed-tuft", count: [0, 1], ring: [0.5, 0.9], height: [0.4, 0.6], chance: 0.6 },
          ],
        },
      },
    ],
    "dry-plant": [
      {
        weight: 1,
        preset: {
          id: "reed-bed",
          primary: "reeds",
          members: [
            { family: "reed-tuft", count: [1, 2], ring: [0.45, 0.9], height: [0.5, 0.8] },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.06, 0.1] },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "stilt-hut",
          primary: "hut",
          members: [
            { family: "pebble", count: [1, 2], ring: [0.45, 0.95], height: [0.05, 0.08] },
            { family: "reed-tuft", count: [0, 1], ring: [0.55, 0.95], height: [0.22, 0.35], chance: 0.6 },
          ],
        },
      },
    ],
  },
  wall: MONSOON_WALL,
  // Deep, cool contact under dripping plants; mud patches and puddles.
  ground: {
    contactColor: "#1c2622",
    contactOpacity: 0.4,
    contactScale: 0.9,
    patchColor: "#3d4842",
    // Puddles of grey-blue rain water (glossy via `rain.wetness`) among
    // darker mud: never a bright halo on the dark wet floor.
    patches: { tints: [{ color: "#56646a", weight: 3 }, { color: "#4b585c", weight: 2 }, { color: "#5a5848", weight: 1 }] },
  },
  variation: { toneJitter: 0.04, hueJitterDeg: 3 },
  budgets: { triangles: { standard: 80_000, reduced: 35_000 }, membersPerCluster: { standard: 5, reduced: 3 } },
};
