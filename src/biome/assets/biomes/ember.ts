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
import { lyingLog } from "../builders/trees.js";
import { emberRocks, emberSpires } from "../ember/rocks.js";
import type { BiomeArt, BiomeTones } from "../types.js";

const tones = {
  foliage: { dark: "#4a5238", base: "#66704c", light: "#8a9468" },
  foliageAlt: { dark: "#50584a", base: "#6c7664", light: "#929a88" },
  trunk: { dark: "#2c231e", base: "#40322a", light: "#5c483c" },
  // Basalt: dark, faintly violet so shade reads cool under the warm dusk sun.
  rock: { dark: "#26242b", base: "#3b3842", light: "#625d68" },
  soil: { dark: "#3a3230", base: "#524846", light: "#6e6460" },
  dry: { dark: "#6a5a44", base: "#8a7858", light: "#ad9a78" },
  cactus: { dark: "#3e5040", base: "#566a56", light: "#7a8e78" },
  accent: { dark: "#a8401a", base: "#d8602a", light: "#e8966a" },
  stoneTop: { dark: "#5c5756", base: "#77716e", light: "#9a9390" },
  stoneSide: { dark: "#28262d", base: "#3a3740", light: "#57525c" },
  stoneRecess: { dark: "#1a191e", base: "#222126", light: "#2c2a30" },
  /** Pale ash settled on column tops, rims and ledges. */
  ash: { dark: "#5e5958", base: "#7c7674", light: "#a49d98" },
  /** Volcanic glass: near-black, violet sheen. */
  obsidian: { dark: "#1c1a24", base: "#2c283a", light: "#5e5676" },
  /** Porous rust-brown cinder and scoria. */
  scoria: { dark: "#3a2420", base: "#5a3428", light: "#86503a" },
  /** Cooled lava crust. */
  crust: { dark: "#221d20", base: "#332c2e", light: "#564a48" },
  /** Still-molten rock (crater floors, lobe toes): deep red, never the collectible's cyan. */
  magma: { dark: "#94261a", base: "#d0402a", light: "#e88466" },
} satisfies BiomeTones;

const rocks = emberRocks();

export const EMBER_ART: BiomeArt = {
  id: "ember",
  tones,
  // Dusk over dark ground: a low, warm sun, more hemisphere fill so dark
  // basalt still reads, a touch more haze, firm contact.
  lighting: { ambientKeep: 0.72, hemisphereShare: 0.7, sunElevation: [18, 40], fogScale: 0.9, contactStrength: 1.1 },
  atmosphere: { water: "lava", particles: "embers" },
  families: {
    // Basalt column stacks and obsidian spires (tall, narrow footprint).
    spire: {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.34, triangleBudget: 400,
      leanMax: 0.04, mirror: true, embed: [0.01, 0.03],
      variants: emberSpires(),
    },
    // Causeway packs, cinder cones, crust lobes, obsidian outcrop, scoria.
    "rock-large": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.01, 0.04], alignToNormal: 0.4,
      variants: rocks.hero,
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.02, 0.06], alignToNormal: 0.6,
      variants: rocks.supporting,
    },
    cinder: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.dressing,
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
    // Columnar basalt: one or two tall courses (the columns run the full
    // height), every perimeter column pushed in or out on its own, sharp
    // corners, dark vertical joints, and many shadowed "crack" columns so
    // the faces break into a rhythm of uneven prisms rather than planks.
    // Pale ash-dusted tops, a warm-lit rim.
    strata: [1, 2],
    // Stepping 0.8 / rounding 0.3: the chamfer clears the column jitter at
    // the corners (stepping 1 turns corner faces inside out on some seeds).
    stepping: 0.8,
    rounding: 0.3,
    notches: [4, 7],
    joints: [8, 12],
    seam: 0.9,
    top: tones.stoneTop,
    side: tones.stoneSide,
    recess: "#16151a",
    rim: "#b3a69c",
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
