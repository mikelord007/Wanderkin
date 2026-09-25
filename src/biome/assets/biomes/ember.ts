/**
 * Ember art: dark, sparse, dramatic. Obsidian spires and basalt boulders,
 * hardy ash-green scrub and charred posts on dark cinder ground, with
 * glowing cracks under some clusters, a lava pool where geometry approved
 * water, and embers rising through warm dusk light. Keep it readable: the
 * glow is an accent, the ground stays dark but never black.
 *
 * Wave 2 baseline by the environment lead on the shared builders; owned by
 * the Ember worker from hand-off (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2
 * addendum).
 */
import { post, scrub, signpost } from "../builders/dry.js";
import { tuft } from "../builders/foliage.js";
import { defaultRockVariants, rock, ROCK_SHAPES, type RockShape } from "../builders/rocks.js";
import { lyingLog } from "../builders/trees.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  foliage: { dark: "#4a5238", base: "#66704c", light: "#8a9468" },
  foliageAlt: { dark: "#50584a", base: "#6c7664", light: "#929a88" },
  trunk: { dark: "#2c231e", base: "#40322a", light: "#5c483c" },
  rock: { dark: "#2a282e", base: "#3e3c44", light: "#5c5a64" },
  soil: { dark: "#3a3230", base: "#524846", light: "#6e6460" },
  dry: { dark: "#6a5a44", base: "#8a7858", light: "#ad9a78" },
  cactus: { dark: "#3e5040", base: "#566a56", light: "#7a8e78" },
  accent: { dark: "#a8401a", base: "#d8602a", light: "#e8966a" },
  stoneTop: { dark: "#403c40", base: "#56525a", light: "#6e6a72" },
  stoneSide: { dark: "#2e2c32", base: "#403e46", light: "#58565e" },
  stoneRecess: { dark: "#1e1d22", base: "#252429", light: "#2e2d33" },
} satisfies BiomeTones;

const rocks = defaultRockVariants("rock");
const up = (x: number, y: number, z: number, offset: number) => ({ normal: [x, y, z] as const, offset });

/** Tall, narrow volcanic glass: steep sheared faces, sharp crown. */
const SPIRE: RockShape = { scale: [0.42, 1.5, 0.38], detail: 0, jitter: 0.1, seed: 81, floor: -0.55, cuts: [up(0.5, 1, 0.2, 0.9), up(-0.8, 0.3, 0.4, 0.62)] };

export const EMBER_ART: BiomeArt = {
  id: "ember",
  tones,
  // Dusk over dark ground: a low, warm sun, more hemisphere fill so dark
  // basalt still reads, a touch more haze, firm contact.
  lighting: { ambientKeep: 0.72, hemisphereShare: 0.7, sunElevation: [18, 40], fogScale: 0.9, contactStrength: 1.1 },
  atmosphere: { water: "lava", particles: "embers" },
  families: {
    spire: {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.34, triangleBudget: 300,
      leanMax: 0.05, mirror: true, embed: [0.02, 0.05],
      variants: [
        rock(SPIRE, { companions: [[ROCK_SHAPES.chip, 0.32, 0.2, 0.3]] }),
        rock({ ...SPIRE, seed: 83, scale: [0.46, 1.4, 0.4] }, { companions: [[{ ...SPIRE, seed: 85 }, -0.28, 0.1, 0.55]] }),
        rock({ ...SPIRE, seed: 87, scale: [0.38, 1.6, 0.36], cuts: [up(-0.3, 1, 0.6, 0.85)] }),
        rock({ ...ROCK_SHAPES.crag, seed: 89, scale: [0.4, 1.3, 0.38] }, { companions: [[ROCK_SHAPES.pebble, 0.22, -0.18, 0.22]] }),
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
    cinder: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.small,
    },
    scrub: {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.68, triangleBudget: 900,
      mirror: true, embed: [0, 0.02],
      variants: [
        scrub({ stems: 5, seed: 1, clumps: 4, ramp: "trunk", leafRamp: "foliageAlt" }),
        scrub({ stems: 6, seed: 2, clumps: 5, ramp: "trunk", leafRamp: "foliage" }),
        scrub({ stems: 4, seed: 3, clumps: 3, ramp: "trunk", leafRamp: "dry" }),
        scrub({ stems: 5, seed: 4, clumps: 4, ramp: "trunk", leafRamp: "foliageAlt" }),
        scrub({ stems: 7, seed: 5, clumps: 5, ramp: "trunk", leafRamp: "dry" }),
      ],
    },
    "ash-grass": {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [
        tuft({ blades: 6, splay: 0.6, seed: 11, ramp: "dry" }),
        tuft({ blades: 5, splay: 0.8, seed: 12, ramp: "foliageAlt", width: 0.035 }),
      ],
    },
    "charred-branch": {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.02, 0.05],
      variants: [lyingLog({ seed: 21, fork: true }), lyingLog({ seed: 22 })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: [post({ seed: 1 }), post({ seed: 2, lean: 0.07 }), signpost({ planks: 1, seed: 3, lean: -0.04 })],
    },
  },
  compositions: {
    cactus: [
      {
        weight: 2,
        preset: {
          id: "spire-group",
          primary: "spire",
          members: [
            { family: "spire", count: [0, 1], ring: [0.55, 0.95], height: [0.35, 0.55] },
            { family: "cinder", count: [1, 3], ring: [0.4, 1], height: [0.04, 0.08] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-spire",
          primary: "spire",
          members: [{ family: "cinder", count: [1, 2], ring: [0.5, 1], height: [0.04, 0.07] }],
        },
      },
    ],
    rock: [
      {
        weight: 2,
        preset: {
          id: "basalt-field",
          primary: "rock-large",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.28, 0.45] },
            { family: "cinder", count: [2, 3], ring: [0.35, 1], height: [0.08, 0.15] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-boulder",
          primary: "rock-large",
          members: [{ family: "cinder", count: [1, 2], ring: [0.5, 1], height: [0.08, 0.14] }],
        },
      },
    ],
    "dry-plant": [
      {
        weight: 1,
        preset: {
          id: "hardy-scrub",
          primary: "scrub",
          members: [
            { family: "ash-grass", count: [1, 2], ring: [0.4, 0.9], height: [0.3, 0.45] },
            { family: "cinder", count: [1, 2], ring: [0.4, 1], height: [0.1, 0.16] },
            { family: "charred-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.35, 0.5], chance: 0.4 },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "charred-post",
          primary: "marker",
          members: [
            { family: "cinder", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
            { family: "charred-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.5 },
          ],
        },
      },
    ],
  },
  wall: {
    // Columnar basalt: few strata, sharp corners, deep notches.
    strata: [2, 3],
    stepping: 0.4,
    rounding: 0.2,
    notches: [1, 3],
    // Columnar basalt: many vertical joints.
    joints: [5, 8],
    seam: 0.8,
    top: tones.stoneTop,
    side: tones.stoneSide,
    recess: "#1c1b20",
    rim: "#8a8590",
  },
  // Ash patches, most of them cracked and glowing like cooling lava.
  ground: {
    contactColor: "#141216",
    contactOpacity: 0.4,
    contactScale: 0.9,
    patchColor: "#2e2826",
    cracks: 0.6,
    crackGlow: "#ff6a1e",
    patches: { tints: [{ color: "#5a504c", weight: 2 }, { color: "#3e3634", weight: 1 }] },
  },
  variation: { toneJitter: 0.04, hueJitterDeg: 3 },
  budgets: { triangles: { standard: 75_000, reduced: 32_000 }, membersPerCluster: { standard: 5, reduced: 3 } },
};
