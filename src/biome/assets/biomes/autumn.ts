/**
 * Autumn art: warm, dense, layered. Round broadleaf crowns in amber, gold
 * and crimson, bracken and berry shrubs, mossy grey stones and fallen logs,
 * with leaf litter scattered on the ground patches. Colour carries the
 * biome, so rocks and trunks stay quiet and cool.
 *
 * Wave 2 baseline by the environment lead on the shared builders; owned by
 * the Autumn worker from hand-off (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2
 * addendum).
 */
import { post, signpost } from "../builders/dry.js";
import { bush, leafRosette, tuft } from "../builders/foliage.js";
import { defaultRockVariants } from "../builders/rocks.js";
import { lyingLog } from "../builders/trees.js";
import { autumnTree } from "../autumn/trees.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  // Amber (the biome's main canopy), gold, rust and a yellow-green olive for
  // leaves that have not turned yet. Restrained saturation: the character's
  // orange suit and the teal collectible stay the most saturated things.
  foliage: { dark: "#8c4418", base: "#c0702a", light: "#e0a04e" },
  foliageAlt: { dark: "#8a6619", base: "#bd942c", light: "#dfc062" },
  // Rust stays brick-warm, not red: the warm sun pushes reds toward crimson.
  rust: { dark: "#6a3020", base: "#9a4a2c", light: "#c47a50" },
  olive: { dark: "#4d5724", base: "#737d36", light: "#a2a85a" },
  crimson: { dark: "#6e2319", base: "#9c3525", light: "#c65a40" },
  // Warm grey-brown bark: dark enough to anchor the crowns, never black.
  trunk: { dark: "#4a3527", base: "#6a4d38", light: "#93735a" },
  birch: { dark: "#8e897e", base: "#c4beb0", light: "#e4dfd2" },
  rock: { dark: "#5b5a52", base: "#7e7b71", light: "#a6a296" },
  soil: { dark: "#58402a", base: "#78583a", light: "#9e7c58" },
  dry: { dark: "#76552e", base: "#9c7646", light: "#c29e70" },
  cactus: { dark: "#3f5530", base: "#5a7542", light: "#86a064" },
  accent: { dark: "#7e2440", base: "#a8385a", light: "#cf6a86" },
  stoneTop: { dark: "#5c6a3c", base: "#79894e", light: "#9dac6e" },
  stoneSide: { dark: "#68645b", base: "#888377", light: "#aba598" },
  stoneRecess: { dark: "#3c3934", base: "#48443e", light: "#56524b" },
} satisfies BiomeTones;

const rocks = defaultRockVariants("rock");

// Hero broadleaf trees (native units, ≈ 1 tall; crowns kept within the palm
// footprint class, radius ≤ 0.62 of the height).
const TREES = [
  // Round oak: stout trunk, broad amber dome, a gold crown on top.
  autumnTree({
    trunk: { height: 0.42, lean: 0.03, baseRadius: 0.07 },
    crown: {
      ramp: "foliage", leaves: 52,
      clumps: [
        { c: [0, 0.62, 0], r: 0.25 },
        { c: [0.26, 0.55, 0.06], r: 0.2 },
        { c: [-0.24, 0.56, -0.08], r: 0.21, bias: -0.05 },
        { c: [0.05, 0.54, -0.26], r: 0.19 },
        { c: [-0.06, 0.55, 0.25], r: 0.19, bias: -0.05 },
        { c: [0.1, 0.82, 0.05], r: 0.19, noLimb: true, bias: 0.12 },
        { c: [-0.12, 0.78, -0.1], r: 0.17, noLimb: true, ramp: "foliageAlt", bias: 0.05 },
      ],
    },
    seed: 1,
  }),
  // Tall oval beech in gold; an olive clump low on one side (not yet turned).
  autumnTree({
    trunk: { height: 0.5, lean: -0.02, baseRadius: 0.06 },
    crown: {
      ramp: "foliageAlt", leaves: 50,
      clumps: [
        { c: [0, 0.64, 0], r: 0.2 },
        { c: [0.15, 0.6, 0.06], r: 0.16, ramp: "olive" },
        { c: [-0.14, 0.62, -0.07], r: 0.16 },
        { c: [0.02, 0.62, -0.16], r: 0.15, bias: -0.05 },
        { c: [0.08, 0.82, 0.04], r: 0.18, noLimb: true },
        { c: [-0.08, 0.84, -0.03], r: 0.16, noLimb: true, bias: 0.05 },
        { c: [0.01, 1.0, 0.01], r: 0.14, noLimb: true, bias: 0.15 },
      ],
    },
    seed: 2,
  }),
  // Spreading maple: short forked trunk under a wide, flat rust canopy.
  autumnTree({
    trunk: { height: 0.34, lean: 0.02, baseRadius: 0.065, roots: 5 },
    crown: {
      ramp: "rust", leaves: 54, hang: 0.6,
      clumps: [
        { c: [0, 0.6, 0], r: 0.22, squash: 0.7 },
        { c: [0.27, 0.52, 0.05], r: 0.18, squash: 0.7 },
        { c: [-0.26, 0.53, -0.09], r: 0.18, squash: 0.7, bias: -0.05 },
        { c: [0.07, 0.5, -0.27], r: 0.17, squash: 0.7 },
        { c: [-0.09, 0.51, 0.26], r: 0.17, squash: 0.7 },
        { c: [0.14, 0.7, 0.14], r: 0.15, squash: 0.72, noLimb: true, ramp: "foliage", bias: 0.1 },
        { c: [-0.13, 0.71, -0.13], r: 0.14, squash: 0.72, noLimb: true, bias: 0.1 },
      ],
    },
    seed: 3,
  }),
  // Leaning birch: slim pale marked trunk, airy gold crown with olive.
  autumnTree({
    trunk: { height: 0.6, lean: 0.14, bow: 2, baseRadius: 0.042, ramp: "birch", marks: true, roots: 3 },
    crown: {
      ramp: "foliageAlt", leaves: 44, leafSize: 0.65,
      clumps: [
        { c: [0.14, 0.72, 0], r: 0.16 },
        { c: [0.27, 0.66, 0.08], r: 0.13 },
        { c: [0.03, 0.68, -0.08], r: 0.13, bias: -0.05 },
        { c: [0.18, 0.88, -0.02], r: 0.14, noLimb: true, bias: 0.1 },
        { c: [0.09, 0.62, 0.13], r: 0.11, ramp: "olive" },
        { c: [0.22, 1.0, 0.02], r: 0.1, noLimb: true, bias: 0.15 },
      ],
    },
    seed: 4,
  }),
  // Turning tree: olive low, amber and gold in the middle, rust on top.
  autumnTree({
    trunk: { height: 0.44, lean: -0.03, baseRadius: 0.065 },
    crown: {
      ramp: "foliage", leaves: 52,
      clumps: [
        { c: [0, 0.64, 0], r: 0.23 },
        { c: [0.24, 0.56, 0.04], r: 0.19, ramp: "olive" },
        { c: [-0.23, 0.57, -0.06], r: 0.19, ramp: "olive", bias: -0.05 },
        { c: [0.02, 0.55, -0.24], r: 0.18, ramp: "foliageAlt" },
        { c: [-0.04, 0.56, 0.24], r: 0.18 },
        { c: [0.06, 0.84, 0.02], r: 0.18, noLimb: true, ramp: "rust", bias: 0.1 },
      ],
    },
    seed: 5,
  }),
  // Late autumn: bare limbs and twigs, a few rust clumps left at the tips.
  autumnTree({
    trunk: { height: 0.46, lean: 0.02, baseRadius: 0.06 },
    crown: {
      ramp: "rust", leaves: 30, hang: 0.75, twigs: 6, swell: 1,
      clumps: [
        { c: [0.26, 0.78, 0.05], r: 0.14 },
        { c: [-0.22, 0.74, -0.1], r: 0.13, ramp: "foliage" },
        { c: [0.04, 0.92, -0.02], r: 0.14, bias: 0.1 },
        { c: [-0.02, 0.7, 0.24], r: 0.12 },
        { c: [0.12, 0.66, -0.22], r: 0.11, ramp: "foliage" },
      ],
    },
    seed: 6,
  }),
];

const SAPLINGS = [
  autumnTree({
    trunk: { height: 0.55, lean: 0.02, baseRadius: 0.036, roots: 3 },
    crown: { ramp: "foliageAlt", leaves: 22, clumps: [{ c: [0, 0.72, 0], r: 0.15 }, { c: [0.07, 0.87, 0.02], r: 0.12, noLimb: true, bias: 0.1 }, { c: [-0.07, 0.67, 0.05], r: 0.11 }] },
    seed: 21,
  }),
  autumnTree({
    trunk: { height: 0.5, lean: 0.05, baseRadius: 0.036, roots: 3 },
    crown: { ramp: "rust", leaves: 22, clumps: [{ c: [0.04, 0.66, 0], r: 0.15 }, { c: [0.1, 0.8, -0.03], r: 0.12, noLimb: true }, { c: [-0.06, 0.62, -0.06], r: 0.1, ramp: "foliage" }] },
    seed: 22,
  }),
  autumnTree({
    trunk: { height: 0.52, lean: -0.03, baseRadius: 0.034, ramp: "birch", marks: true, roots: 3 },
    crown: { ramp: "olive", leaves: 20, clumps: [{ c: [0, 0.7, 0], r: 0.14, ramp: "foliageAlt" }, { c: [-0.05, 0.84, 0.02], r: 0.11, noLimb: true }, { c: [0.07, 0.64, -0.04], r: 0.1 }] },
    seed: 23,
  }),
];

export const AUTUMN_ART: BiomeArt = {
  id: "autumn",
  tones,
  // Golden-hour woodland: warm, softer shadows (more fill), slightly closer
  // haze so the layered crowns recede.
  lighting: { ambientKeep: 0.6, hemisphereShare: 0.5, sunElevation: [22, 46], fogScale: 0.94, contactStrength: 1.05 },
  families: {
    broadleaf: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.66, triangleBudget: 1600,
      leanMax: 0.04, mirror: true, embed: [0.01, 0.03],
      variants: TREES,
      // The bare late-autumn tree is a rarer accent.
      weights: [1, 1, 1, 0.9, 1, 0.6],
    },
    sapling: {
      category: "tree", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 800,
      leanMax: 0.05, mirror: true, embed: [0.01, 0.03],
      variants: SAPLINGS,
    },
    shrub: {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.8, triangleBudget: 900,
      mirror: true, embed: [0, 0.03],
      variants: [
        bush({ lobes: 6, spread: 0.52, height: 1.25, seed: 1, ramp: "crimson", altRamp: "foliage" }),
        bush({ lobes: 5, spread: 0.48, height: 1.2, seed: 2, ramp: "foliageAlt" }),
        bush({ lobes: 7, spread: 0.5, height: 1.35, seed: 3, blossoms: 4 }),
        bush({ lobes: 4, spread: 0.44, height: 1.2, seed: 4, ramp: "foliage", altRamp: "crimson" }),
        bush({ lobes: 6, spread: 0.5, height: 1.3, seed: 5, ramp: "foliageAlt", altRamp: "foliage" }),
      ],
    },
    "berry-bush": {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.68, triangleBudget: 900,
      mirror: true, embed: [0, 0.03],
      variants: [
        bush({ lobes: 5, spread: 0.4, height: 1.35, seed: 11, ramp: "foliageAlt", altRamp: "crimson", blossoms: 5 }),
        bush({ lobes: 4, spread: 0.38, height: 1.3, seed: 12, ramp: "crimson", blossoms: 4 }),
        bush({ lobes: 5, spread: 0.42, height: 1.4, seed: 13, ramp: "foliage", blossoms: 5 }),
      ],
    },
    bracken: {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.68, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: [
        leafRosette({ leaves: 9, length: 0.62, width: 0.1, rise: 0.8, droop: 0.45, seed: 31, ramp: "dry", serrate: 0.5 }),
        leafRosette({ leaves: 7, length: 0.6, width: 0.12, rise: 0.9, droop: 0.4, seed: 32, ramp: "foliage", serrate: 0.5 }),
        leafRosette({ leaves: 8, length: 0.58, width: 0.11, rise: 0.85, droop: 0.5, seed: 33, ramp: "foliageAlt", serrate: 0.4 }),
      ],
    },
    "rock-large": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.4,
      variants: [...rocks.large, ...rocks.clustered],
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.08], alignToNormal: 0.6,
      variants: [...rocks.medium, ...rocks.layered],
    },
    pebble: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.small,
    },
    grass: {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [
        tuft({ blades: 8, splay: 0.5, seed: 41, ramp: "dry" }),
        tuft({ blades: 7, splay: 0.7, seed: 42, ramp: "foliageAlt", width: 0.035 }),
      ],
    },
    log: {
      category: "dressing", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.02, 0.05],
      variants: [lyingLog({ seed: 51, fork: true }), lyingLog({ seed: 52 }), lyingLog({ seed: 53, ramp: "dry", fork: true })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: [post({ seed: 1 }), post({ seed: 2, lean: -0.05 }), signpost({ planks: 2, seed: 3 })],
    },
  },
  compositions: {
    palm: [
      {
        weight: 3,
        preset: {
          id: "grove",
          primary: "broadleaf",
          primaryOffset: 0.15,
          members: [
            { family: "sapling", count: [0, 1], ring: [0.55, 0.95], height: [0.4, 0.6] },
            { family: "shrub", count: [0, 1], ring: [0.55, 0.95], height: [0.18, 0.26] },
            { family: "pebble", count: [1, 2], ring: [0.45, 1], height: [0.03, 0.06] },
            { family: "log", count: [1, 1], ring: [0.5, 0.9], height: [0.14, 0.2], chance: 0.4 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-tree",
          primary: "broadleaf",
          members: [{ family: "grass", count: [1, 2], ring: [0.45, 0.95], height: [0.05, 0.08] }],
        },
      },
    ],
    shrub: [
      {
        weight: 2,
        preset: {
          id: "berry-thicket",
          primary: "shrub",
          members: [
            { family: "bracken", count: [0, 1], ring: [0.5, 0.95], height: [0.45, 0.6] },
            { family: "pebble", count: [1, 2], ring: [0.5, 1], height: [0.1, 0.16] },
            { family: "grass", count: [1, 2], ring: [0.45, 0.95], height: [0.25, 0.35] },
          ],
        },
      },
    ],
    "dry-plant": [
      {
        weight: 2,
        preset: {
          id: "bracken-patch",
          primary: "berry-bush",
          members: [
            { family: "bracken", count: [1, 2], ring: [0.5, 0.95], height: [0.35, 0.5] },
            { family: "grass", count: [1, 2], ring: [0.4, 0.9], height: [0.3, 0.45] },
            { family: "pebble", count: [0, 1], ring: [0.4, 1], height: [0.1, 0.16] },
          ],
        },
      },
    ],
    rock: [
      {
        weight: 2,
        preset: {
          id: "mossy-stones",
          primary: "rock-large",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.28, 0.45] },
            { family: "pebble", count: [1, 3], ring: [0.35, 1], height: [0.08, 0.15] },
            { family: "bracken", count: [0, 1], ring: [0.45, 0.9], height: [0.3, 0.42], chance: 0.5 },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "trail-post",
          primary: "marker",
          members: [
            { family: "log", count: [1, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.6 },
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
          ],
        },
      },
    ],
  },
  wall: {
    // Mossy fieldstone: blocky strata, moss on the walkable tops.
    strata: [3, 5],
    stepping: 0.7,
    rounding: 0.55,
    notches: [1, 2],
    // Fieldstone courses: block joints.
    joints: [3, 5],
    top: tones.stoneTop,
    side: tones.stoneSide,
    recess: "#443f38",
    rim: "#b7c283",
  },
  // Rich dark earth under clusters; ground patches strewn with fallen leaves.
  ground: {
    contactColor: "#3a2618",
    contactOpacity: 0.4,
    contactScale: 0.9,
    patchColor: "#6a4a2e",
    patches: {
      tints: [{ color: "#7a5636", weight: 2 }, { color: "#8a6a3a", weight: 1 }],
      litter: ["#c2622a", "#9c3525", "#c89a34"],
    },
  },
  variation: { toneJitter: 0.05, hueJitterDeg: 5 },
  budgets: { triangles: { standard: 90_000, reduced: 40_000 }, membersPerCluster: { standard: 6, reduced: 3 } },
};
