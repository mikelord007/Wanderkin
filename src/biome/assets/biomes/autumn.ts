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
import { broadleafTree, defaultBroadleafVariants, lyingLog } from "../builders/trees.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  foliage: { dark: "#8a3f18", base: "#bd6128", light: "#e0964e" },
  foliageAlt: { dark: "#8a661c", base: "#bb952e", light: "#dcbd66" },
  crimson: { dark: "#6e2319", base: "#9c3525", light: "#c65a40" },
  trunk: { dark: "#3c2b22", base: "#5a4132", light: "#80614f" },
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

export const AUTUMN_ART: BiomeArt = {
  id: "autumn",
  tones,
  // Golden-hour woodland: warm, softer shadows (more fill), slightly closer
  // haze so the layered crowns recede.
  lighting: { ambientKeep: 0.6, hemisphereShare: 0.5, sunElevation: [22, 46], fogScale: 0.94, contactStrength: 1.05 },
  families: {
    broadleaf: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 1400,
      leanMax: 0.04, mirror: true, embed: [0.01, 0.03],
      variants: defaultBroadleafVariants([["foliage", "foliageAlt"], ["crimson", "foliage"], ["foliageAlt", "crimson"]]),
    },
    sapling: {
      category: "tree", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 900,
      mirror: true, embed: [0.01, 0.03],
      variants: [
        broadleafTree({ trunk: 0.5, lean: 0.03, masses: 4, crownWidth: 0.5, seed: 21, branches: 1, crown: ["foliageAlt", "foliage"] }),
        broadleafTree({ trunk: 0.46, lean: -0.03, masses: 4, crownWidth: 0.46, seed: 22, branches: 1, crown: ["crimson", "crimson"] }),
      ],
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
