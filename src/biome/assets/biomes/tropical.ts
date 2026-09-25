/**
 * Tropical Island art: bright, lush, playful, warm. Segmented, leaning
 * palms under feathered crowns; leafy bushes (dark masses in a shingled
 * leaf fringe), elephant-ear clumps and ferns; pale mossy limestone and
 * dark angular coastal basalt; driftwood, coconuts, bamboo markers and a
 * few pink blossoms. Grouped into palm oases, beach palms, bush patches,
 * fern glades, rock clusters and coastal outcrops with open sand between.
 *
 * Builders live in `../tropical/`. Owned by the Tropical worker (see
 * ENVIRONMENT_ARCHITECTURE.md §10).
 */
import { leafRosette } from "../builders/foliage.js";
import { signpost } from "../builders/dry.js";
import { lyingLog } from "../builders/trees.js";
import { broadleafClump, leafyBush, tropicalFlowers, tropicalGrass } from "../tropical/bush.js";
import { fallenPalmFrond, palmSprout, tropicalPalm } from "../tropical/palm.js";
import { bambooPoles } from "../tropical/marker.js";
import { fallenCoconuts, TROPICAL_ROCK_SHAPES, tropicalRock } from "../tropical/rocks.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  foliage: { dark: "#2e7a3e", base: "#43a04f", light: "#85c95c" },
  foliageAlt: { dark: "#3f7a2c", base: "#62a73d", light: "#a9d066" },
  trunk: { dark: "#6a4a30", base: "#98704a", light: "#c9a172" },
  // Pale weathered limestone; rockDark is the cool coastal basalt.
  rock: { dark: "#7a7468", base: "#a39b8b", light: "#d3cab5" },
  rockDark: { dark: "#454c4f", base: "#677074", light: "#979f9d" },
  soil: { dark: "#b98f5e", base: "#d8b27f", light: "#efd4a4" },
  dry: { dark: "#8c7545", base: "#b69a5b", light: "#dcc68c" },
  cactus: { dark: "#3c6e3a", base: "#55924a", light: "#88b86a" },
  accent: { dark: "#b0446f", base: "#d9669a", light: "#efb2cb" },
  stoneTop: { dark: "#c9b48c", base: "#e0cda4", light: "#f1e2bf" },
  stoneSide: { dark: "#8f8577", base: "#b3a894", light: "#d2c7b0" },
  stoneRecess: { dark: "#5f574d", base: "#766c60", light: "#8c8274" },
  driftwood: { dark: "#9a8b76", base: "#c2b39b", light: "#e3d8c4" },
  foliageDeep: { dark: "#1f5e3a", base: "#2f7f4a", light: "#5aa55f" },
  bamboo: { dark: "#6f7d34", base: "#9aa954", light: "#cbd28c" },
  // Young green coconuts: well clear of the orange collectible hue.
  nut: { dark: "#3f5226", base: "#5e7536", light: "#8aa052" },
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

const BUSHES = [
  // Round leafy bush.
  leafyBush({
    masses: [{ c: [0, 0.3, 0], r: 0.3 }, { c: [0.22, 0.2, 0.1], r: 0.22 }, { c: [-0.2, 0.22, -0.1], r: 0.22, ramp: "foliage" }, { c: [0.02, 0.18, -0.24], r: 0.19 }],
    leaves: 30, leafSize: 1.05, seed: 1,
  }),
  // Low, wide mound.
  leafyBush({
    masses: [{ c: [0, 0.22, 0], r: 0.28, squash: 0.8 }, { c: [0.22, 0.16, 0.06], r: 0.2 }, { c: [-0.2, 0.16, 0.08], r: 0.2, ramp: "foliage" }, { c: [0.02, 0.15, -0.2], r: 0.18 }],
    leaves: 30, leafSize: 1.0, lift: 0.95, seed: 2,
  }),
  // Tall, tiered shrub.
  leafyBush({
    masses: [{ c: [0, 0.24, 0], r: 0.24 }, { c: [0.05, 0.48, 0.03], r: 0.2, ramp: "foliage" }, { c: [-0.03, 0.7, -0.02], r: 0.15, ramp: "foliage", bias: 0 }, { c: [0.15, 0.18, -0.08], r: 0.17 }],
    leaves: 30, leafSize: 1.05, lift: 0.6, seed: 3,
  }),
  // Flowering (hibiscus-like), used sparingly.
  leafyBush({
    masses: [{ c: [0, 0.28, 0], r: 0.28 }, { c: [-0.13, 0.18, 0.07], r: 0.19, ramp: "foliage" }, { c: [0.12, 0.2, -0.06], r: 0.2 }],
    leaves: 26, leafSize: 1.0, seed: 4, flowers: 5,
  }),
  // Elephant-ear clump: big heart-shaped leaves on arching stems.
  broadleafClump({ leaves: 7, leafLength: 0.4, leafWidth: 0.42, seed: 5 }),
  // Dense, dark leafy dome with pale new growth on top.
  leafyBush({
    masses: [{ c: [0, 0.32, 0], r: 0.3 }, { c: [0.16, 0.2, 0.14], r: 0.2 }, { c: [-0.16, 0.2, 0.12], r: 0.2 }, { c: [0.0, 0.52, -0.02], r: 0.17, ramp: "foliageAlt", bias: 0.1 }],
    leaves: 30, leafSize: 0.95, lift: 0.85, leafWidth: 0.45, seed: 6,
  }),
];

const SMALL_BUSHES = [
  leafyBush({ masses: [{ c: [0, 0.22, 0], r: 0.26 }, { c: [0.15, 0.15, 0.07], r: 0.18, ramp: "foliage" }, { c: [-0.13, 0.15, -0.09], r: 0.18 }], leaves: 18, leafSize: 1.05, seed: 11 }),
  leafyBush({ masses: [{ c: [0, 0.2, 0], r: 0.24, squash: 0.8 }, { c: [0.18, 0.14, -0.05], r: 0.18 }], leaves: 16, leafSize: 1.05, lift: 0.9, seed: 12 }),
  broadleafClump({ leaves: 4, leafLength: 0.46, leafWidth: 0.3, seed: 13, split: 0.55 }),
];

const S = TROPICAL_ROCK_SHAPES;

// Rounded, weathered pale stones, mossy on top, with companion stones.
const ROUND_ROCKS = [
  tropicalRock({ moss: 0.8, bodies: [{ shape: S.dome }, { shape: S.pebble, at: [0.62, 0.18], size: 0.22 }, { shape: S.chip, at: [-0.3, 0.58], size: 0.16 }] }),
  tropicalRock({ moss: 0.85, bodies: [{ shape: { ...S.dome, seed: 131, scale: [0.72, 0.86, 0.7] } }, { shape: S.loaf, at: [0.5, -0.25], size: 0.55 }, { shape: S.pebble, at: [-0.5, 0.35], size: 0.2 }] }),
  tropicalRock({ bodies: [{ shape: S.knob }, { shape: { ...S.knob, seed: 133 }, at: [0.5, 0.35], size: 0.5 }, { shape: S.pebble, at: [-0.5, -0.4], size: 0.18 }] }),
  tropicalRock({ moss: 0.75, bodies: [{ shape: S.wedge }, { shape: S.chip, at: [0.58, 0.32], size: 0.22 }] }),
];

// Angular, dark coastal rock: crags and tilted slabs leaning together.
const COASTAL_ROCKS = [
  tropicalRock({ ramp: "rockDark", bodies: [{ shape: S.crag }, { shape: { ...S.crag, seed: 141 }, at: [0.42, 0.2], size: 0.58, tilt: [0.25, -0.3] }, { shape: S.chip, at: [-0.4, 0.4], size: 0.2 }] }),
  tropicalRock({ ramp: "rockDark", bodies: [{ shape: { ...S.slab, scale: [0.85, 0.55, 0.7] }, tilt: [0.08, 0.8] }, { shape: { ...S.slab, seed: 143, scale: [0.85, 0.55, 0.7] }, at: [-0.22, 0.28], size: 0.8, tilt: [0.12, 0.9], yaw: 0.35 }, { shape: S.chip, at: [0.42, -0.3], size: 0.2 }] }),
  tropicalRock({ ramp: "rockDark", moss: 0.9, bodies: [{ shape: { ...S.crag, scale: [0.8, 0.9, 0.62], seed: 145 }, tilt: [0.15, 0.3] }, { shape: S.slab, at: [0.5, -0.1], size: 0.45, tilt: [0, 0.4] }] }),
];

// Dressing stones (largest dimension = 1).
const MEDIUM_ROCKS = [
  tropicalRock({ fit: "size", moss: 0.85, bodies: [{ shape: { ...S.dome, seed: 151 } }] }),
  tropicalRock({ fit: "size", bodies: [{ shape: { ...S.loaf, seed: 153 } }] }),
  tropicalRock({ fit: "size", ramp: "rockDark", bodies: [{ shape: { ...S.crag, seed: 155, scale: [0.8, 0.7, 0.6] }, tilt: [0.2, 0.35] }] }),
  tropicalRock({ fit: "size", ramp: "rockDark", bodies: [{ shape: { ...S.slab, seed: 157 } }] }),
];
const PEBBLES = [
  tropicalRock({ fit: "size", sink: 0.05, bodies: [{ shape: S.pebble }] }),
  tropicalRock({ fit: "size", sink: 0.05, bodies: [{ shape: { ...S.pebble, seed: 161, scale: [0.8, 0.6, 1.2] } }] }),
  tropicalRock({ fit: "size", sink: 0.05, ramp: "rockDark", bodies: [{ shape: S.chip }] }),
];

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
      variants: BUSHES,
      weights: [1, 1, 1, 0.6, 0.8, 0.8],
    },
    "bush-small": {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.84, triangleBudget: 600,
      mirror: true, embed: [0.02, 0.04],
      variants: SMALL_BUSHES,
    },
    broadleaf: {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.5, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: [
        leafRosette({ leaves: 6, length: 1.3, width: 0.13, rise: 0.95, droop: 0.9, seed: 1 }),
        leafRosette({ leaves: 5, length: 1.5, width: 0.16, rise: 0.8, droop: 1.0, seed: 2, serrate: 0.45 }),
        broadleafClump({ leaves: 5, leafLength: 0.46, leafWidth: 0.3, seed: 7, fit: "size" }),
      ],
    },
    fern: {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.5, triangleBudget: 600,
      mirror: true, embed: [0, 0.02],
      variants: [
        palmSprout({ fronds: 7, length: 0.5, rise: 0.7, droop: 1.0, leaflets: 5, seed: 41, fit: "size" }),
        palmSprout({ fronds: 6, length: 0.5, rise: 0.95, droop: 1.1, leaflets: 5, seed: 43, fit: "size" }),
      ],
    },
    "rock-round": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.99, triangleBudget: 400,
      mirror: true, embed: [0.03, 0.06], alignToNormal: 0.6,
      variants: ROUND_ROCKS,
    },
    "rock-coastal": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.95, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.5,
      variants: COASTAL_ROCKS,
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.08], alignToNormal: 0.7,
      variants: MEDIUM_ROCKS,
    },
    pebble: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: PEBBLES,
    },
    coconuts: {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 80,
      mirror: true, embed: [0.03, 0.06],
      variants: [fallenCoconuts({ count: 2, seed: 1 }), fallenCoconuts({ count: 3, seed: 2 })],
    },
    tuft: {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.85, triangleBudget: 120,
      mirror: true, embed: [0, 0.02],
      variants: [
        tropicalGrass({ blades: 7, splay: 0.45, seed: 1 }),
        tropicalGrass({ blades: 9, splay: 0.65, seed: 2, ramp: "foliageAlt" }),
        tropicalGrass({ blades: 5, splay: 0.3, seed: 3, width: 0.09 }),
      ],
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
      variants: [tropicalFlowers({ stems: 3, seed: 1 }), tropicalFlowers({ stems: 2, seed: 2 })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: [
        signpost({ planks: 2, seed: 1 }),
        signpost({ planks: 1, seed: 2, lean: -0.05 }),
        bambooPoles({ poles: [[0, 0, 0.95, 0.02], [0.07, 0.04, 0.72, 0.05], [-0.05, 0.06, 0.58, 0.06]], seed: 1 }),
        bambooPoles({ poles: [[0, 0, 0.9, 0.04], [0.06, -0.05, 0.8, 0.03]], lash: 0.8, seed: 2 }),
      ],
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
            { family: "bush-small", count: [1, 2], ring: [0.45, 0.8], height: [0.24, 0.38] },
            { family: "broadleaf", count: [0, 1], ring: [0.4, 0.75], height: [0.35, 0.5] },
            { family: "fern", count: [0, 1], ring: [0.4, 0.85], height: [0.25, 0.35], chance: 0.5 },
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
            { family: "coconuts", count: [1, 1], ring: [0.3, 0.7], height: [0.08, 0.12], chance: 0.5 },
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
            { family: "bush-small", count: [1, 2], ring: [0.5, 0.85], height: [0.45, 0.7] },
            { family: "fern", count: [0, 1], ring: [0.45, 0.9], height: [0.3, 0.45] },
            { family: "flowers", count: [1, 1], ring: [0.35, 0.8], height: [0.18, 0.26], chance: 0.25 },
            { family: "tuft", count: [1, 2], ring: [0.3, 0.9], height: [0.14, 0.22] },
            { family: "pebble", count: [0, 2], ring: [0.45, 0.95], height: [0.08, 0.14] },
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
            { family: "broadleaf", count: [1, 2], ring: [0.45, 0.85], height: [0.55, 0.8] },
            { family: "fern", count: [0, 1], ring: [0.4, 0.9], height: [0.35, 0.5], chance: 0.6 },
            { family: "tuft", count: [1, 2], ring: [0.3, 0.9], height: [0.14, 0.22] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          // Low ground foliage around a single bush: ferns, a shed frond, stones.
          id: "fern-glade",
          primary: "bush",
          primaryOffset: 0.15,
          members: [
            { family: "fern", count: [2, 3], ring: [0.4, 0.9], height: [0.35, 0.5] },
            { family: "fallen-frond", count: [1, 1], ring: [0.4, 0.85], height: [0.3, 0.42], chance: 0.4 },
            { family: "pebble", count: [1, 2], ring: [0.4, 0.95], height: [0.07, 0.12] },
          ],
        },
      },
    ],
    rock: [
      {
        weight: 2,
        preset: {
          // Rounded pale boulder, companion stones, plants tucked at its foot.
          id: "rock-cluster",
          primary: "rock-round",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.25, 0.45] },
            { family: "pebble", count: [2, 4], ring: [0.35, 1], height: [0.07, 0.14] },
            { family: "fern", count: [0, 1], ring: [0.45, 0.9], height: [0.35, 0.5], chance: 0.5 },
            { family: "tuft", count: [1, 2], ring: [0.3, 0.9], height: [0.14, 0.22] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          // Dark angular coastal outcrop with driftwood.
          id: "coastal-outcrop",
          primary: "rock-coastal",
          primaryOffset: 0.1,
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.22, 0.4] },
            { family: "pebble", count: [2, 3], ring: [0.4, 1], height: [0.06, 0.12] },
            { family: "driftwood", count: [1, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.45 },
            { family: "tuft", count: [0, 1], ring: [0.3, 0.9], height: [0.12, 0.2] },
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
  ground: { contactColor: "#5a4a32", contactOpacity: 0.42, contactScale: 0.95, patchColor: "#a8875a" },
  variation: { toneJitter: 0.05, hueJitterDeg: 5 },
  budgets: { triangles: { standard: 110_000, reduced: 45_000 }, membersPerCluster: { standard: 8, reduced: 4 } },
};
