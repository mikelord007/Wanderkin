/**
 * Tropical Island art: bright, lush, playful, warm. Palms with drooping
 * serrated fronds, layered bushes, broad-leaf plants, weathered grey-beige
 * stones, driftwood and a few pink blossoms, grouped into palm oases, bush
 * patches and rock clusters with open sand between them.
 *
 * Baseline by the environment lead on the shared builders; owned by the
 * Tropical worker from hand-off (see ENVIRONMENT_ARCHITECTURE.md §10).
 */
import { bush, flowers, leafRosette, tuft } from "../builders/foliage.js";
import { defaultRockVariants } from "../builders/rocks.js";
import { post, signpost } from "../builders/dry.js";
import { fallenFrond, lyingLog, palm } from "../builders/trees.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  foliage: { dark: "#2e7a3e", base: "#43a04f", light: "#85c95c" },
  foliageAlt: { dark: "#3f7a2c", base: "#62a73d", light: "#a9d066" },
  trunk: { dark: "#6a4a30", base: "#98704a", light: "#c9a172" },
  rock: { dark: "#69665f", base: "#928d84", light: "#c1baad" },
  soil: { dark: "#b98f5e", base: "#d8b27f", light: "#efd4a4" },
  dry: { dark: "#8c7545", base: "#b69a5b", light: "#dcc68c" },
  cactus: { dark: "#3c6e3a", base: "#55924a", light: "#88b86a" },
  accent: { dark: "#b0446f", base: "#d9669a", light: "#efb2cb" },
  stoneTop: { dark: "#c9b48c", base: "#e0cda4", light: "#f1e2bf" },
  stoneSide: { dark: "#8f8577", base: "#b3a894", light: "#d2c7b0" },
  stoneRecess: { dark: "#5f574d", base: "#766c60", light: "#8c8274" },
  driftwood: { dark: "#9a8b76", base: "#c2b39b", light: "#e3d8c4" },
} satisfies BiomeTones;

const rocks = defaultRockVariants("rock");

export const TROPICAL_ART: BiomeArt = {
  id: "tropical",
  tones,
  families: {
    palm: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 1300,
      leanMax: 0.06, mirror: true, embed: [0.01, 0.02],
      variants: [
        palm({ trunk: 0.84, bend: 0.06, fronds: 10, frondLength: 0.47, frondRise: 0.5, droop: 1.05, seed: 3 }),
        palm({ trunk: 0.8, bend: 0.1, wiggle: 0.03, fronds: 9, frondLength: 0.48, frondRise: 0.6, droop: 1.2, seed: 7, coconuts: 4 }),
        palm({ trunk: 0.88, bend: 0.04, fronds: 11, frondLength: 0.5, frondRise: 0.42, droop: 0.95, seed: 11, segments: 8 }),
        palm({ trunk: 0.78, bend: 0.05, wiggle: -0.03, fronds: 9, frondLength: 0.46, frondRise: 0.55, droop: 1.3, seed: 19, coconuts: 2 }),
      ],
    },
    "palm-young": {
      category: "tree", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.65, triangleBudget: 1100,
      leanMax: 0.08, mirror: true, embed: [0.01, 0.02],
      variants: [
        palm({ trunk: 0.6, bend: 0.06, fronds: 8, frondLength: 0.35, frondRise: 0.75, droop: 1.15, seed: 23, coconuts: 0, segments: 5 }),
        palm({ trunk: 0.55, bend: 0.08, fronds: 7, frondLength: 0.34, frondRise: 0.85, droop: 1.25, seed: 29, coconuts: 0, segments: 4 }),
      ],
    },
    bush: {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.8, triangleBudget: 900,
      mirror: true, embed: [0.02, 0.04],
      variants: [
        bush({ lobes: 7, spread: 0.5, height: 1.1, seed: 1, newGrowth: true }),
        bush({ lobes: 5, spread: 0.48, height: 1.0, seed: 2 }),
        bush({ lobes: 9, spread: 0.56, height: 1.15, seed: 3, newGrowth: true }),
        bush({ lobes: 6, spread: 0.44, height: 1.35, seed: 4 }),
        bush({ lobes: 8, spread: 0.5, height: 1.1, seed: 5, blossoms: 4 }),
        bush({ lobes: 4, spread: 0.46, height: 1.0, seed: 6, newGrowth: true }),
      ],
    },
    broadleaf: {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.5, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: [
        leafRosette({ leaves: 6, length: 1.3, width: 0.13, rise: 0.95, droop: 0.9, seed: 1 }),
        leafRosette({ leaves: 5, length: 1.5, width: 0.16, rise: 0.8, droop: 1.0, seed: 2, serrate: 0.45 }),
        leafRosette({ leaves: 7, length: 1.1, width: 0.1, rise: 1.1, droop: 0.7, seed: 3, ramp: "foliageAlt" }),
      ],
    },
    "rock-large": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.6,
      variants: [...rocks.large, ...rocks.clustered],
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.08], alignToNormal: 0.7,
      variants: [...rocks.medium, ...rocks.layered],
    },
    pebble: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.small,
    },
    tuft: {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [tuft({ blades: 7, splay: 0.5, seed: 1 }), tuft({ blades: 9, splay: 0.7, seed: 2, ramp: "foliageAlt" }), tuft({ blades: 5, splay: 0.35, seed: 3 })],
    },
    "fallen-frond": {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0, 0.01],
      variants: [fallenFrond(1), fallenFrond(2)],
    },
    driftwood: {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.02, 0.05],
      variants: [lyingLog({ seed: 1, ramp: "driftwood" }), lyingLog({ seed: 2, ramp: "driftwood", fork: true })],
    },
    flowers: {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 240,
      variants: [flowers({ stems: 3, seed: 1 }), flowers({ stems: 4, seed: 2 })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: [signpost({ planks: 2, seed: 1 }), signpost({ planks: 1, seed: 2, lean: -0.05 }), post({ seed: 3 })],
    },
  },
  compositions: {
    palm: [
      {
        weight: 3,
        preset: {
          id: "palm-oasis",
          primary: "palm",
          primaryOffset: 0.12,
          members: [
            { family: "bush", count: [1, 2], ring: [0.45, 0.8], height: [0.22, 0.38] },
            { family: "broadleaf", count: [0, 1], ring: [0.4, 0.75], height: [0.35, 0.5] },
            { family: "pebble", count: [1, 3], ring: [0.3, 0.9], height: [0.04, 0.08] },
            { family: "tuft", count: [1, 3], ring: [0.25, 0.85], height: [0.06, 0.11] },
            { family: "fallen-frond", count: [1, 1], ring: [0.35, 0.8], height: [0.28, 0.4], chance: 0.55 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "palm-pair",
          primary: "palm",
          primaryOffset: 0.2,
          members: [
            { family: "palm-young", count: [1, 1], ring: [0.5, 0.75], height: [0.45, 0.6] },
            { family: "tuft", count: [1, 2], ring: [0.2, 0.8], height: [0.06, 0.1] },
            { family: "pebble", count: [0, 2], ring: [0.3, 0.9], height: [0.04, 0.07] },
          ],
        },
      },
    ],
    shrub: [
      {
        weight: 3,
        preset: {
          id: "bush-patch",
          primary: "bush",
          members: [
            { family: "bush", count: [1, 2], ring: [0.5, 0.85], height: [0.5, 0.72] },
            { family: "flowers", count: [1, 1], ring: [0.3, 0.8], height: [0.25, 0.35], chance: 0.35 },
            { family: "tuft", count: [1, 2], ring: [0.3, 0.9], height: [0.2, 0.3] },
            { family: "pebble", count: [0, 2], ring: [0.4, 0.95], height: [0.1, 0.16] },
          ],
        },
      },
      {
        weight: 2,
        preset: {
          id: "leafy-pocket",
          primary: "bush",
          primaryOffset: 0.2,
          members: [
            { family: "broadleaf", count: [1, 2], ring: [0.45, 0.85], height: [0.8, 1] },
            { family: "tuft", count: [1, 2], ring: [0.3, 0.9], height: [0.2, 0.3] },
          ],
        },
      },
    ],
    rock: [
      {
        weight: 1,
        preset: {
          id: "rock-cluster",
          primary: "rock-large",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.3, 0.5] },
            { family: "pebble", count: [2, 4], ring: [0.35, 1], height: [0.08, 0.16] },
            { family: "tuft", count: [1, 2], ring: [0.3, 0.9], height: [0.15, 0.25] },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "beach-marker",
          primary: "marker",
          members: [
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
            { family: "driftwood", count: [1, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.5 },
            { family: "tuft", count: [0, 1], ring: [0.3, 0.8], height: [0.08, 0.12] },
          ],
        },
      },
    ],
  },
  wall: {
    strata: [2, 3],
    stepping: 0.5,
    rounding: 0.7,
    notches: [0, 1],
    top: { dark: "#cdb98f", base: "#e0cda4", light: "#f0e0bb" },
    side: { dark: "#8f8577", base: "#b3a894", light: "#d2c7b0" },
    recess: "#6f665a",
    rim: "#f5ead0",
  },
  ground: { contactColor: "#5a4a32", contactOpacity: 0.42, contactScale: 0.95, patchColor: "#caa877" },
  variation: { toneJitter: 0.05, hueJitterDeg: 5 },
  budgets: { triangles: { standard: 110_000, reduced: 45_000 }, membersPerCluster: { standard: 8, reduced: 4 } },
};
