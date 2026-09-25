/**
 * Ember art: a dusk-lit miniature volcanic field. Basalt column packs,
 * obsidian blades, cinder cones and cooled lava lobes; charred snags and
 * stumps; wiry ash scrub, grey tussocks and dark ember ferns with red tips;
 * the odd fire lily. Glowing cracks under some clusters, a lava pool where
 * geometry approved water, embers rising through warm dusk light. Keep it
 * readable: glow is an accent, the ash fields stay open, the ground stays
 * dark but never black.
 *
 * Wave 2 baseline by the environment lead; built out by the Ember worker
 * (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2 addendum). Builders live in
 * `../ember/`.
 */
import { tuft } from "../builders/foliage.js";
import { lyingLog } from "../builders/trees.js";
import { emberBushes, emberSnags, emberStumps, fireLily } from "../ember/plants.js";
import { emberRocks, emberSpires, emberVents } from "../ember/rocks.js";
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
  // Fire-lily petals and ember-fern tips: deep red, never the collectible's cyan.
  accent: { dark: "#8c2a22", base: "#c23a30", light: "#e0705e" },
  stoneTop: { dark: "#5c5756", base: "#77716e", light: "#9a9390" },
  // Basalt wall sides: lifted well above the dark recess (#16151a) so the
  // column joints, crack columns and courses separate under dusk light.
  stoneSide: { dark: "#3a3742", base: "#5a5563", light: "#857e8e" },
  stoneRecess: { dark: "#1a191e", base: "#222126", light: "#2c2a30" },
  /** Pale ash settled on column tops, rims and ledges; bleached snags. */
  ash: { dark: "#5e5958", base: "#7c7674", light: "#a49d98" },
  /** Volcanic glass: near-black, violet sheen. */
  obsidian: { dark: "#1c1a24", base: "#2c283a", light: "#5e5676" },
  /** Porous rust-brown cinder and scoria. */
  scoria: { dark: "#3a2420", base: "#5a3428", light: "#86503a" },
  /** Cooled lava crust. */
  crust: { dark: "#221d20", base: "#332c2e", light: "#564a48" },
  /** Still-molten rock (crater floors, lobe toes, smouldering roots). */
  magma: { dark: "#94261a", base: "#d0402a", light: "#e88466" },
  /** Charred wood: near-black, warm. */
  char: { dark: "#1e1a1a", base: "#2e2826", light: "#4c423e" },
  /** Grey-sage leaves of the hardy ash plants. */
  ashleaf: { dark: "#3c463e", base: "#56624f", light: "#7a8870" },
  /** Grey tussock and ash grass. */
  ashgrass: { dark: "#58564e", base: "#7a776c", light: "#a29e90" },
  /** Dark ember-fern fronds. */
  fern: { dark: "#2e3228", base: "#444a3a", light: "#62684e" },
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
    // Charred snags (the tall tree footprint).
    snag: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.62, triangleBudget: 900,
      leanMax: 0.05, mirror: true, embed: [0.01, 0.03],
      variants: emberSnags(),
    },
    // Charred, splintered stumps.
    stump: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.39, triangleBudget: 500,
      leanMax: 0.04, mirror: true, embed: [0.02, 0.05],
      variants: emberStumps(),
    },
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
    // Ember vents: low scoria rings round a glowing throat. Micro, so reduced
    // effects drop them first (fewer glow points).
    vent: {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 200,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 1,
      variants: emberVents(),
    },
    // Ash scrub, grey tussocks and ember ferns.
    "ash-bush": {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.72, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: emberBushes(),
    },
    // Fire lilies: the one bright accent, a supporting member only.
    "fire-lily": {
      category: "dressing", role: "supporting", shading: "smooth", castShadow: false, unitRadius: 0.6, triangleBudget: 400,
      mirror: true, embed: [0, 0.02],
      variants: [fireLily({ stems: 2, leaves: 6, seed: 1 }), fireLily({ stems: 3, leaves: 4, seed: 2 }), fireLily({ stems: 1, leaves: 5, seed: 3 })],
    },
    "ash-grass": {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [
        tuft({ blades: 7, splay: 0.6, seed: 11, ramp: "ashgrass" }),
        tuft({ blades: 5, splay: 0.85, seed: 12, ramp: "ashgrass", width: 0.035 }),
        tuft({ blades: 6, splay: 0.45, seed: 13, ramp: "ashleaf", width: 0.04 }),
      ],
    },
    "charred-branch": {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.02, 0.05],
      variants: [lyingLog({ seed: 21, ramp: "char", fork: true }), lyingLog({ seed: 22, ramp: "char" }), lyingLog({ seed: 23, ramp: "ash", fork: true })],
    },
  },
  compositions: {
    // Dead grove: a snag over scoria, a fallen limb, sometimes an ash plant.
    palm: [
      {
        weight: 3,
        preset: {
          id: "dead-grove",
          primary: "snag",
          primaryOffset: 0.2,
          members: [
            { family: "ash-bush", count: [0, 1], ring: [0.55, 0.9], height: [0.22, 0.34] },
            { family: "charred-branch", count: [1, 1], ring: [0.4, 0.85], height: [0.22, 0.34], chance: 0.6 },
            { family: "cinder", count: [1, 2], ring: [0.3, 0.9], height: [0.04, 0.07] },
            { family: "ash-grass", count: [0, 1], ring: [0.35, 0.8], height: [0.07, 0.11] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-snag",
          primary: "snag",
          members: [
            { family: "cinder", count: [1, 2], ring: [0.3, 0.9], height: [0.04, 0.07] },
            { family: "ash-grass", count: [0, 1], ring: [0.35, 0.8], height: [0.07, 0.1] },
          ],
        },
      },
    ],
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
            { family: "ash-grass", count: [0, 1], ring: [0.4, 0.9], height: [0.18, 0.26] },
            { family: "vent", count: [1, 1], ring: [0.5, 0.95], height: [0.22, 0.32], chance: 0.3 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-boulder",
          primary: "rock-large",
          members: [
            { family: "cinder", count: [1, 2], ring: [0.5, 1], height: [0.08, 0.14] },
            { family: "vent", count: [1, 1], ring: [0.55, 0.95], height: [0.2, 0.3], chance: 0.25 },
          ],
        },
      },
    ],
    "dry-plant": [
      {
        weight: 3,
        preset: {
          id: "ash-scrub",
          primary: "ash-bush",
          members: [
            { family: "ash-grass", count: [1, 2], ring: [0.4, 0.9], height: [0.3, 0.45] },
            { family: "cinder", count: [1, 2], ring: [0.4, 1], height: [0.1, 0.16] },
            { family: "charred-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.35, 0.5], chance: 0.35 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          // A rare splash of colour: fire lilies sheltering by an ash plant.
          id: "fire-lily-pocket",
          primary: "ash-bush",
          members: [
            { family: "fire-lily", count: [1, 1], ring: [0.5, 0.85], height: [0.42, 0.6] },
            { family: "cinder", count: [1, 2], ring: [0.4, 1], height: [0.1, 0.16] },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "charred-stump",
          primary: "stump",
          members: [
            { family: "charred-branch", count: [1, 1], ring: [0.5, 0.95], height: [0.4, 0.6], chance: 0.6 },
            { family: "cinder", count: [1, 2], ring: [0.45, 0.95], height: [0.08, 0.14] },
            { family: "ash-grass", count: [0, 1], ring: [0.45, 0.9], height: [0.2, 0.3] },
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
  // Dark scorched patches under some clusters; fewer than half of those are
  // cracked, and their cracks glow deep red like cooling lava (redder than
  // the character's orange suit, 180° from the cyan collectible).
  ground: {
    contactColor: "#141216",
    contactOpacity: 0.4,
    contactScale: 0.9,
    patchColor: "#2e2826",
    cracks: 0.42,
    crackGlow: "#ff4a2a",
    patches: { tints: [{ color: "#5a504c", weight: 2 }, { color: "#3e3634", weight: 1 }] },
  },
  variation: { toneJitter: 0.04, hueJitterDeg: 3 },
  budgets: { triangles: { standard: 75_000, reduced: 32_000 }, membersPerCluster: { standard: 5, reduced: 3 } },
};
