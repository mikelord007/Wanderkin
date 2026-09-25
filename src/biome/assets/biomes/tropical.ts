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
import { lyingLog } from "../builders/trees.js";
import { fallenPalmFrond, tropicalPalm } from "../tropical/palm.js";
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
  foliageDeep: { dark: "#1f5e3a", base: "#2f7f4a", light: "#5aa55f" },
  nut: { dark: "#5a4526", base: "#7d6435", light: "#a88a4f" },
} satisfies BiomeTones;

const PALMS = [
  // Leaning coconut palm: long lean, full crown, a dry frond, coconuts.
  tropicalPalm({
    trunk: { height: 0.72, lean: 0.22, bow: 1.8, segments: 8, baseRadius: 0.05 },
    crown: { fronds: 6, lower: 3, young: 2, dry: 1, length: 0.46, leaflets: 7, rise: 0.6, droop: 1.1, coconuts: 3, seed: 3 },
  }),
  // Tall S-curve palm, slimmer crown.
  tropicalPalm({
    trunk: { height: 0.82, lean: 0.08, wiggle: 0.04, segments: 9, baseRadius: 0.046 },
    crown: { fronds: 6, lower: 3, young: 2, length: 0.47, leaflets: 7, rise: 0.62, droop: 1.2, coconuts: 2, seed: 7 },
  }),
  // Short, upright and full.
  tropicalPalm({
    trunk: { height: 0.6, lean: 0.05, segments: 7, baseRadius: 0.056 },
    crown: { fronds: 7, lower: 3, young: 3, dry: 1, length: 0.43, leaflets: 7, rise: 0.58, droop: 1.15, coconuts: 4, seed: 11 },
  }),
  // Banana curve: bows out low, then turns up under the crown.
  tropicalPalm({
    trunk: { height: 0.7, lean: 0.26, bow: 2.4, segments: 8, baseRadius: 0.05 },
    crown: { fronds: 6, lower: 3, young: 2, dry: 1, length: 0.45, leaflets: 7, rise: 0.62, droop: 1.25, coconuts: 2, seed: 19 },
  }),
  // Twin palm: two trunks from one base, leaning apart.
  tropicalPalm({
    trunk: { height: 0.8, lean: 0.13, leanYaw: 0.2, segments: 8, baseRadius: 0.042 },
    crown: { fronds: 5, lower: 2, young: 1, length: 0.38, leaflets: 6, rise: 0.6, droop: 1.15, coconuts: 2, seed: 23, knob: 0.034 },
    twin: {
      offset: [-0.03, 0.025],
      trunk: { height: 0.56, lean: 0.15, leanYaw: Math.PI + 0.4, segments: 6, baseRadius: 0.036 },
      crown: { fronds: 5, lower: 1, young: 1, length: 0.34, leaflets: 6, rise: 0.62, droop: 1.15, seed: 29, knob: 0.03 },
    },
  }),
];

const YOUNG_PALMS = [
  tropicalPalm({
    trunk: { height: 0.42, lean: 0.06, segments: 4, baseRadius: 0.05 },
    crown: { fronds: 6, young: 2, length: 0.4, leaflets: 6, rise: 0.75, droop: 1.15, seed: 31 },
  }),
  tropicalPalm({
    trunk: { height: 0.34, lean: 0.1, bow: 2, segments: 3, baseRadius: 0.052 },
    crown: { fronds: 5, lower: 2, young: 2, length: 0.4, leaflets: 6, rise: 0.8, droop: 1.25, seed: 37 },
  }),
];

const rocks = defaultRockVariants("rock");

export const TROPICAL_ART: BiomeArt = {
  id: "tropical",
  tones,
  families: {
    palm: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 1300,
      leanMax: 0.06, mirror: true, embed: [0.01, 0.02],
      variants: PALMS,
    },
    "palm-young": {
      category: "tree", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.9, triangleBudget: 700,
      leanMax: 0.08, mirror: true, embed: [0.01, 0.02],
      variants: YOUNG_PALMS,
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
      variants: [fallenPalmFrond(1), fallenPalmFrond(2), fallenPalmFrond(3, true)],
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
            { family: "fallen-frond", count: [1, 1], ring: [0.4, 0.85], height: [0.25, 0.35], chance: 0.4 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          // A lone palm on open sand: driftwood, a shed frond, a few stones.
          id: "beach-palm",
          primary: "palm",
          primaryOffset: 0.1,
          members: [
            { family: "fallen-frond", count: [1, 2], ring: [0.35, 0.85], height: [0.26, 0.38] },
            { family: "driftwood", count: [1, 1], ring: [0.5, 0.9], height: [0.22, 0.32], chance: 0.6 },
            { family: "pebble", count: [1, 3], ring: [0.35, 0.95], height: [0.03, 0.06] },
            { family: "tuft", count: [0, 1], ring: [0.2, 0.6], height: [0.05, 0.09] },
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
