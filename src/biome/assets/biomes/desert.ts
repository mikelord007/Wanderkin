/**
 * Desert art: warm, sun-baked, spacious. Ribbed column and branching cacti,
 * barrels, pads and agave, red sandstone boulders and layered slabs, twiggy
 * scrub and dry grass, with fewer members per cluster than Tropical so the
 * sand keeps its negative space.
 *
 * Baseline by the environment lead on the shared builders; owned by the
 * Desert worker from hand-off (see ENVIRONMENT_ARCHITECTURE.md §10).
 */
import { post, scrub, signpost } from "../builders/dry.js";
import { tuft } from "../builders/foliage.js";
import { agave, barrel, echeveria, organPipe, pricklyPear, saguaro } from "../desert/cacti.js";
import { defaultRockVariants, rock, ROCK_SHAPES } from "../builders/rocks.js";
import { lyingLog } from "../builders/trees.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  foliage: { dark: "#55703a", base: "#748e49", light: "#a3b56a" },
  foliageAlt: { dark: "#6b7a3e", base: "#8c9a55", light: "#b8c07c" },
  trunk: { dark: "#6c5035", base: "#93704c", light: "#c09b72" },
  rock: { dark: "#8a5236", base: "#b0714a", light: "#d69d6d" },
  soil: { dark: "#c69260", base: "#dfb07a", light: "#f0cf9c" },
  dry: { dark: "#9a7b4c", base: "#c2a26a", light: "#e0c794" },
  cactus: { dark: "#3d6a39", base: "#588a4a", light: "#8ab468" },
  accent: { dark: "#ad4a74", base: "#d86c9c", light: "#eeb3cb" },
  stoneTop: { dark: "#d2a874", base: "#e6c28e", light: "#f3dbb0" },
  stoneSide: { dark: "#a5613c", base: "#c78652", light: "#e2aa72" },
  stoneRecess: { dark: "#6e3f28", base: "#824c31", light: "#98603f" },
  succulent: { dark: "#3e6658", base: "#5b8a78", light: "#8fb5a0" },
  fruit: { dark: "#8a3050", base: "#bd4b6d", light: "#dd7b98" },
} satisfies BiomeTones;

const rocks = defaultRockVariants("rock");
const S = ROCK_SHAPES;

export const DESERT_ART: BiomeArt = {
  id: "desert",
  tones,
  families: {
    "cactus-tall": {
      category: "cactus", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.34, triangleBudget: 1300,
      leanMax: 0.04, mirror: true, embed: [0.01, 0.03],
      variants: [
        saguaro({ seed: 1, arms: [{ at: 0.44, angle: 0, reach: 0.1, rise: 0.26 }, { at: 0.58, angle: Math.PI, reach: 0.08, rise: 0.2 }] }),
        saguaro({ seed: 2, radius: 0.125, curve: 0.03, arms: [{ at: 0.52, angle: 0.5, reach: 0.11, rise: 0.3 }], blossoms: 3 }),
        saguaro({ seed: 3, radius: 0.11, arms: [{ at: 0.36, angle: 0.2, reach: 0.09, rise: 0.22 }, { at: 0.55, angle: 2.8, reach: 0.1, rise: 0.3 }, { at: 0.7, angle: 4.5, reach: 0.06, rise: 0.12, thickness: 0.55 }] }),
        saguaro({ seed: 4, radius: 0.13, curve: -0.04, arms: [] }),
        organPipe({ stems: 5, seed: 5 }),
      ],
    },
    "cactus-small": {
      category: "cactus", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.55, triangleBudget: 900,
      mirror: true, embed: [0.02, 0.04],
      variants: [
        barrel({ ribs: 14, squat: 0.8, flowers: 5, seed: 1 }),
        barrel({ ribs: 12, squat: 0.66, flowers: 0, seed: 2 }),
        pricklyPear({ pads: 5, fruits: 3, seed: 3 }),
        pricklyPear({ pads: 4, fruits: 2, seed: 8 }),
        agave({ leaves: 11, seed: 4 }),
        echeveria({ leaves: 10, seed: 6 }),
      ],
    },
    "rock-large": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.6,
      variants: [
        ...rocks.large,
        rock(S.slab, {
          layers: [
            { shape: { ...S.slab, seed: 81, scale: [0.8, 0.55, 0.68] }, y: 0, shift: [0, 0] },
            { shape: { ...S.slab, seed: 83, scale: [0.7, 0.5, 0.58] }, y: 0.36, shift: [-0.06, 0.05] },
            { shape: { ...S.slab, seed: 85, scale: [0.55, 0.45, 0.48] }, y: 0.68, shift: [0.05, -0.03] },
          ],
          companions: [[S.chip, 0.62, 0.3, 0.26]],
        }),
      ],
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
    scrub: {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.68, triangleBudget: 900,
      mirror: true, embed: [0, 0.02],
      variants: [
        scrub({ stems: 6, seed: 1, clumps: 6, leafRamp: "foliageAlt" }),
        scrub({ stems: 5, seed: 2, clumps: 4, leafRamp: "foliage" }),
        scrub({ stems: 7, seed: 3, clumps: 7, leafRamp: "dry" }),
        scrub({ stems: 4, seed: 4, clumps: 4, leafRamp: "foliageAlt" }),
        scrub({ stems: 6, seed: 5, clumps: 5, leafRamp: "dry" }),
      ],
    },
    "dry-grass": {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [
        tuft({ blades: 8, splay: 0.55, seed: 11, ramp: "dry" }),
        tuft({ blades: 6, splay: 0.8, seed: 12, ramp: "dry", width: 0.035 }),
        tuft({ blades: 9, splay: 0.4, seed: 13, ramp: "foliageAlt", width: 0.04 }),
      ],
    },
    "dry-branch": {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.02, 0.05],
      variants: [lyingLog({ seed: 5, ramp: "dry", fork: true }), lyingLog({ seed: 6, ramp: "trunk", fork: true })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: [post({ seed: 1 }), post({ seed: 2, lean: -0.06 }), signpost({ planks: 1, seed: 3 })],
    },
  },
  compositions: {
    cactus: [
      {
        weight: 3,
        preset: {
          id: "cactus-group",
          primary: "cactus-tall",
          members: [
            { family: "cactus-small", count: [0, 1], ring: [0.6, 0.95], height: [0.2, 0.32] },
            { family: "pebble", count: [1, 3], ring: [0.45, 1], height: [0.04, 0.08] },
            { family: "dry-grass", count: [0, 2], ring: [0.45, 0.95], height: [0.07, 0.12] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-cactus",
          primary: "cactus-tall",
          members: [{ family: "pebble", count: [1, 2], ring: [0.5, 1], height: [0.04, 0.07] }],
        },
      },
    ],
    rock: [
      {
        weight: 2,
        preset: {
          id: "sandstone-cluster",
          primary: "rock-large",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.28, 0.45] },
            { family: "pebble", count: [2, 3], ring: [0.35, 1], height: [0.08, 0.15] },
            { family: "dry-grass", count: [0, 1], ring: [0.4, 0.9], height: [0.2, 0.3] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-boulder",
          primary: "rock-large",
          members: [{ family: "pebble", count: [1, 2], ring: [0.5, 1], height: [0.08, 0.14] }],
        },
      },
    ],
    "dry-plant": [
      {
        weight: 3,
        preset: {
          id: "sparse-scrub",
          primary: "scrub",
          members: [
            { family: "dry-grass", count: [1, 2], ring: [0.4, 0.9], height: [0.3, 0.45] },
            { family: "pebble", count: [1, 2], ring: [0.4, 1], height: [0.1, 0.16] },
            { family: "dry-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.35, 0.5], chance: 0.45 },
          ],
        },
      },
      {
        weight: 2,
        preset: {
          id: "succulent-patch",
          primary: "cactus-small",
          members: [
            { family: "pebble", count: [1, 3], ring: [0.5, 1], height: [0.1, 0.18] },
            { family: "dry-grass", count: [0, 1], ring: [0.5, 0.9], height: [0.3, 0.45] },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "desert-post",
          primary: "marker",
          members: [
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
            { family: "dry-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.5 },
          ],
        },
      },
    ],
  },
  wall: {
    strata: [3, 5],
    stepping: 0.8,
    rounding: 0.6,
    notches: [1, 2],
    top: { dark: "#d2a874", base: "#e6c28e", light: "#f3dbb0" },
    side: { dark: "#a5613c", base: "#c78652", light: "#e2aa72" },
    recess: "#7a452c",
    rim: "#f6e1bb",
  },
  ground: { contactColor: "#6b3f22", contactOpacity: 0.38, contactScale: 0.9, patchColor: "#d7a86f" },
  variation: { toneJitter: 0.05, hueJitterDeg: 4 },
  budgets: { triangles: { standard: 80_000, reduced: 35_000 }, membersPerCluster: { standard: 6, reduced: 3 } },
};
