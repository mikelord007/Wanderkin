/**
 * Autumn Forest art: a warm, golden, slightly misty miniature woodland.
 * Layered broadleaf crowns in amber, gold and brick rust (some still olive),
 * leafy shrubs with berries, golden bracken, toadstools and mushrooms, cool
 * grey mossy and lichen-crusted granite, fallen mossy logs, stumps and
 * broken snags, acorns and fallen leaves, with leaf litter on the ground
 * patches. Colour lives in the leaves; rock, bark and timber stay quiet.
 * Grouped into groves, thickets, fern glades, toadstool rings, mossy stones
 * and snags with clearings between.
 *
 * Builders live in `../autumn/`. Owned by the Autumn worker
 * (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2 addendum).
 */
import { signpost } from "../builders/dry.js";
import { tuft } from "../builders/foliage.js";
import { acorns, autumnShrub, bracken, leafScatter, mushrooms } from "../autumn/plants.js";
import { woodlandRocks } from "../autumn/rocks.js";
import { autumnTree } from "../autumn/trees.js";
import { AUTUMN_WALL } from "../autumn/wall.js";
import { mossyLog, stump } from "../autumn/wood.js";
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
  // Warm grey-brown bark: dark enough to anchor the crowns, never black.
  trunk: { dark: "#4a3527", base: "#6a4d38", light: "#93735a" },
  birch: { dark: "#8e897e", base: "#c4beb0", light: "#e4dfd2" },
  // Cool grey woodland granite: quiet under the warm canopy.
  rock: { dark: "#595c5a", base: "#7e817c", light: "#a8aaa2" },
  moss: { dark: "#45522a", base: "#62733a", light: "#8a9a55" },
  lichen: { dark: "#8c8a64", base: "#b2ae82", light: "#d0cca2" },
  // Deadwood: weathered grey-brown bark, pale heartwood on cut ends, ochre shelf fungi.
  deadwood: { dark: "#4f4238", base: "#75665a", light: "#a09282" },
  heartwood: { dark: "#8a6440", base: "#b88f62", light: "#d8b88c" },
  fungus: { dark: "#7a5230", base: "#a87844", light: "#d0a66e" },
  // Toadstools: brick-red fly agaric, brown penny bun, pale honey caps on cream stems.
  capRed: { dark: "#7a2a1e", base: "#a63c26", light: "#c8603e" },
  capBrown: { dark: "#5e3a22", base: "#8a5a34", light: "#b8844e" },
  capPale: { dark: "#a08458", base: "#c4a676", light: "#e0c898" },
  stem: { dark: "#b4a484", base: "#d4c8aa", light: "#ece4d0" },
  acorn: { dark: "#6a4a22", base: "#946a34", light: "#b8904e" },
  berry: { dark: "#6a1c2c", base: "#9a2c3e", light: "#c45a64" },
  soil: { dark: "#58402a", base: "#78583a", light: "#9e7c58" },
  // Dry golden grass and bracken tips.
  dry: { dark: "#76552e", base: "#9c7646", light: "#c29e70" },
  cactus: { dark: "#3f5530", base: "#5a7542", light: "#86a064" },
  accent: { dark: "#7e2440", base: "#a8385a", light: "#cf6a86" },
  stoneTop: { dark: "#5c6a3c", base: "#79894e", light: "#9dac6e" },
  stoneSide: { dark: "#68645b", base: "#888377", light: "#aba598" },
  stoneRecess: { dark: "#3c3934", base: "#48443e", light: "#56524b" },
} satisfies BiomeTones;

const rocks = woodlandRocks();

// Hero broadleaf trees (native units, ≈ 1 tall; crowns kept within the palm
// footprint class, radius ≤ 0.62 of the height).
const TREES = [
  // Round oak: stout trunk, broad amber dome, a gold crown on top.
  autumnTree({
    trunk: { height: 0.42, lean: 0.03, baseRadius: 0.07 },
    crown: {
      ramp: "foliage", leaves: 44,
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
      ramp: "foliageAlt", leaves: 42,
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
      ramp: "rust", leaves: 46, hang: 0.6,
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
      ramp: "foliageAlt", leaves: 38, leafSize: 0.65,
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
      ramp: "foliage", leaves: 44,
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
    crown: { ramp: "foliageAlt", leaves: 18, clumps: [{ c: [0, 0.72, 0], r: 0.15 }, { c: [0.07, 0.87, 0.02], r: 0.12, noLimb: true, bias: 0.1 }, { c: [-0.07, 0.67, 0.05], r: 0.11 }] },
    seed: 21,
  }),
  autumnTree({
    trunk: { height: 0.5, lean: 0.05, baseRadius: 0.036, roots: 3 },
    crown: { ramp: "rust", leaves: 18, clumps: [{ c: [0.04, 0.66, 0], r: 0.15 }, { c: [0.1, 0.8, -0.03], r: 0.12, noLimb: true }, { c: [-0.06, 0.62, -0.06], r: 0.1, ramp: "foliage" }] },
    seed: 22,
  }),
  autumnTree({
    trunk: { height: 0.52, lean: -0.03, baseRadius: 0.034, ramp: "birch", marks: true, roots: 3 },
    crown: { ramp: "olive", leaves: 16, clumps: [{ c: [0, 0.7, 0], r: 0.14, ramp: "foliageAlt" }, { c: [-0.05, 0.84, 0.02], r: 0.11, noLimb: true }, { c: [0.07, 0.64, -0.04], r: 0.1 }] },
    seed: 23,
  }),
];

// Leafy shrubs resting on the ground (native units; fit to height 1).
const SHRUBS = [
  // Amber mound with a gold top.
  autumnShrub({
    ramp: "foliage", leaves: 32, stems: 3, seed: 31,
    clumps: [{ c: [0, 0.22, 0], r: 0.26 }, { c: [0.2, 0.16, 0.08], r: 0.19 }, { c: [-0.18, 0.17, -0.06], r: 0.2, bias: -0.05 }, { c: [0.02, 0.42, -0.02], r: 0.18, ramp: "foliageAlt", bias: 0.1 }],
  }),
  // Burning-bush rust: lower and spreading.
  autumnShrub({
    ramp: "rust", leaves: 32, stems: 3, hang: 0.5, seed: 32,
    clumps: [{ c: [0, 0.2, 0], r: 0.24, squash: 0.7 }, { c: [0.22, 0.15, 0.06], r: 0.18, squash: 0.7 }, { c: [-0.2, 0.15, -0.08], r: 0.18, squash: 0.7 }, { c: [0.03, 0.34, 0.02], r: 0.16, bias: 0.1 }],
  }),
  // Upright gold shrub.
  autumnShrub({
    ramp: "foliageAlt", leaves: 28, stems: 2, seed: 33,
    clumps: [{ c: [0, 0.22, 0], r: 0.2 }, { c: [0.05, 0.42, 0.02], r: 0.17 }, { c: [-0.03, 0.6, -0.01], r: 0.13, bias: 0.12 }, { c: [0.14, 0.16, -0.06], r: 0.14, ramp: "olive" }],
  }),
  // Turning: olive body, rust and amber on the exposed top.
  autumnShrub({
    ramp: "olive", leaves: 32, stems: 3, seed: 34,
    clumps: [{ c: [0, 0.2, 0], r: 0.24 }, { c: [0.19, 0.16, 0.08], r: 0.18 }, { c: [-0.17, 0.18, -0.08], r: 0.18, ramp: "foliage" }, { c: [0.02, 0.4, 0], r: 0.17, ramp: "rust", bias: 0.1 }],
  }),
  // Berry shrub: dark olive and rust with red berries.
  autumnShrub({
    ramp: "olive", leaves: 26, stems: 3, berries: 6, seed: 35,
    clumps: [{ c: [0, 0.22, 0], r: 0.24, bias: -0.1 }, { c: [0.2, 0.18, -0.06], r: 0.18, ramp: "rust", bias: -0.05 }, { c: [-0.16, 0.2, 0.1], r: 0.18 }, { c: [0.03, 0.42, 0.02], r: 0.15, ramp: "rust" }],
  }),
];

const SMALL_SHRUBS = [
  autumnShrub({ ramp: "foliage", leaves: 16, seed: 41, clumps: [{ c: [0, 0.18, 0], r: 0.2 }, { c: [0.14, 0.13, 0.05], r: 0.14, ramp: "foliageAlt" }] }),
  autumnShrub({ ramp: "rust", leaves: 16, seed: 42, clumps: [{ c: [0, 0.17, 0], r: 0.19, squash: 0.72 }, { c: [-0.13, 0.12, 0.06], r: 0.14 }] }),
  autumnShrub({ ramp: "olive", leaves: 16, berries: 6, seed: 43, clumps: [{ c: [0, 0.18, 0], r: 0.19 }, { c: [0.12, 0.13, -0.07], r: 0.13, ramp: "rust" }] }),
];

// Toadstool clusters (fit to height) and small mushrooms.
const TOADSTOOLS = [
  mushrooms({ ramp: "capRed", spots: 3, seed: 51, caps: [{ at: [0, 0], h: 0.5, r: 0.2 }, { at: [0.2, 0.08], h: 0.32, r: 0.14 }, { at: [-0.12, 0.16], h: 0.22, r: 0.1, dome: 0.6 }] }),
  mushrooms({ ramp: "capBrown", seed: 52, caps: [{ at: [0, 0], h: 0.42, r: 0.22, dome: 0.5 }, { at: [0.2, -0.1], h: 0.28, r: 0.15 }, { at: [-0.16, -0.1], h: 0.2, r: 0.12 }, { at: [0.06, 0.2], h: 0.16, r: 0.09 }] }),
];
const MUSHROOMS = [
  mushrooms({ ramp: "capRed", spots: 2, seed: 61, caps: [{ at: [0, 0], h: 0.5, r: 0.24 }] }),
  mushrooms({ ramp: "capPale", seed: 62, caps: [{ at: [0, 0], h: 0.46, r: 0.2, dome: 0.4 }, { at: [0.22, 0.06], h: 0.3, r: 0.14, dome: 0.4 }] }),
  mushrooms({ ramp: "capBrown", seed: 63, caps: [{ at: [0, 0], h: 0.4, r: 0.24, dome: 0.5 }] }),
  mushrooms({ ramp: "capPale", seed: 64, caps: [{ at: [0, 0], h: 0.36, r: 0.14, dome: 0.3 }, { at: [0.14, 0.08], h: 0.26, r: 0.11, dome: 0.3 }, { at: [-0.08, 0.14], h: 0.2, r: 0.08, dome: 0.3 }] }),
];

export const AUTUMN_ART: BiomeArt = {
  id: "autumn",
  tones,
  // Golden-hour woodland: a low warm sun for long soft shadows, softer
  // shade (more fill), slightly closer haze so the layered crowns recede.
  lighting: { ambientKeep: 0.6, hemisphereShare: 0.5, sunElevation: [20, 40], fogScale: 0.94, contactStrength: 1.05 },
  families: {
    broadleaf: {
      category: "tree", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.6, triangleBudget: 1600,
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
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.84, triangleBudget: 900,
      mirror: true, embed: [0.01, 0.03],
      variants: SHRUBS,
      weights: [1, 1, 1, 1, 0.8],
    },
    "shrub-small": {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.92, triangleBudget: 500,
      mirror: true, embed: [0.01, 0.03],
      variants: SMALL_SHRUBS,
    },
    fern: {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.74, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: [
        bracken({ fronds: 7, length: 0.95, rise: 1.27, droop: 0.55, serrate: 0.55, ramp: "foliageAlt", altRamp: "olive", altEvery: 3, seed: 71 }),
        bracken({ fronds: 7, length: 0.95, rise: 1.2, droop: 0.6, serrate: 0.55, ramp: "rust", altRamp: "foliageAlt", altEvery: 2, seed: 72 }),
      ],
    },
    bracken: {
      category: "bush", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.5, triangleBudget: 500,
      mirror: true, embed: [0, 0.02],
      variants: [
        bracken({ fronds: 6, length: 0.9, rise: 0.8, droop: 0.9, ramp: "dry", altRamp: "foliage", altEvery: 3, seed: 81, fit: "size" }),
        bracken({ fronds: 5, length: 0.9, rise: 0.9, droop: 0.9, ramp: "olive", altRamp: "foliageAlt", altEvery: 2, seed: 82, fit: "size" }),
        bracken({ fronds: 6, length: 0.85, rise: 0.85, droop: 1.0, ramp: "rust", seed: 83, fit: "size" }),
      ],
    },
    toadstool: {
      category: "dressing", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.74, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: TOADSTOOLS,
    },
    "mushroom-cluster": {
      category: "dressing", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.74, triangleBudget: 700,
      mirror: true, embed: [0, 0.02],
      variants: [...TOADSTOOLS, MUSHROOMS[3]!],
    },
    mushroom: {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.74, triangleBudget: 380,
      mirror: true, embed: [0, 0.02],
      variants: MUSHROOMS,
    },
    acorns: {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 140,
      mirror: true, embed: [0.01, 0.03],
      variants: [acorns({ count: 3, seed: 1 }), acorns({ count: 2, seed: 2 })],
    },
    leaves: {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0, 0.005],
      variants: [
        leafScatter({ count: 6, seed: 1, ramps: ["foliage", "rust", "foliageAlt"] }),
        leafScatter({ count: 5, seed: 2, ramps: ["foliageAlt", "foliage"] }),
        leafScatter({ count: 7, seed: 3, ramps: ["rust", "foliage", "olive"] }),
      ],
    },
    grass: {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [
        tuft({ blades: 8, splay: 0.5, seed: 41, ramp: "dry" }),
        tuft({ blades: 7, splay: 0.7, seed: 42, ramp: "foliageAlt", width: 0.035 }),
        tuft({ blades: 6, splay: 0.4, seed: 43, ramp: "olive", width: 0.04 }),
      ],
    },
    "rock-mossy": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.03, 0.06], alignToNormal: 0.5,
      variants: rocks.mossy,
    },
    "rock-lichen": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.4,
      variants: rocks.lichen,
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.08], alignToNormal: 0.6,
      variants: rocks.medium,
    },
    pebble: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.pebbles,
    },
    log: {
      category: "dressing", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.5, triangleBudget: 360,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.8,
      variants: [
        mossyLog({ seed: 51, moss: 0.45, fungi: 2, stub: true }),
        mossyLog({ seed: 52, ramp: "deadwood", broken: true, moss: 0.55 }),
        mossyLog({ seed: 53, radius: 0.11, moss: 0.35, fungi: 1 }),
      ],
    },
    stump: {
      category: "dressing", role: "supporting", shading: "smooth", castShadow: true, unitRadius: 0.5, triangleBudget: 320,
      mirror: true, embed: [0.02, 0.04],
      variants: [
        stump({ seed: 61, height: 1.6, moss: 0.4, fungi: 1 }),
        stump({ seed: 62, height: 2.2, ramp: "deadwood", broken: true, moss: 0.5 }),
        stump({ seed: 63, height: 1.3, roots: 5 }),
      ],
    },
    snag: {
      category: "dressing", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.38, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.04], leanMax: 0.05,
      variants: [
        stump({ seed: 71, height: 5.5, ramp: "deadwood", broken: true, fungi: 3, moss: 0.3, rootReach: 1.8, fit: "height" }),
        stump({ seed: 72, height: 4.6, broken: true, fungi: 2, roots: 5, rootReach: 1.6, fit: "height" }),
      ],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: [signpost({ planks: 2, seed: 3 }), signpost({ planks: 1, seed: 4, lean: -0.05 })],
    },
  },
  compositions: {
    palm: [
      {
        weight: 3,
        preset: {
          // A tree with a sapling or small shrub, fallen leaves and a mushroom at its foot.
          id: "grove",
          primary: "broadleaf",
          primaryOffset: 0.15,
          members: [
            { family: "sapling", count: [0, 1], ring: [0.55, 0.95], height: [0.4, 0.6] },
            { family: "shrub-small", count: [0, 1], ring: [0.5, 0.95], height: [0.16, 0.24] },
            { family: "leaves", count: [1, 2], ring: [0.3, 0.9], height: [0.12, 0.18] },
            { family: "mushroom", count: [1, 1], ring: [0.3, 0.8], height: [0.05, 0.08], chance: 0.5 },
            { family: "pebble", count: [0, 1], ring: [0.45, 1], height: [0.03, 0.06] },
          ],
        },
      },
      {
        weight: 2,
        preset: {
          // A lone tree in a clearing: acorns, leaves, a bracken frond, grass.
          id: "lone-tree",
          primary: "broadleaf",
          primaryOffset: 0.1,
          members: [
            { family: "bracken", count: [0, 1], ring: [0.5, 0.9], height: [0.22, 0.3], chance: 0.6 },
            { family: "leaves", count: [1, 2], ring: [0.3, 0.9], height: [0.12, 0.18] },
            { family: "acorns", count: [1, 1], ring: [0.3, 0.8], height: [0.05, 0.08], chance: 0.6 },
            { family: "grass", count: [1, 2], ring: [0.4, 0.95], height: [0.05, 0.08] },
          ],
        },
      },
    ],
    shrub: [
      {
        weight: 3,
        preset: {
          id: "thicket",
          primary: "shrub",
          members: [
            { family: "shrub-small", count: [1, 1], ring: [0.5, 0.9], height: [0.45, 0.65] },
            { family: "bracken", count: [0, 1], ring: [0.5, 0.95], height: [0.5, 0.7] },
            { family: "leaves", count: [1, 2], ring: [0.35, 0.95], height: [0.3, 0.45] },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.08, 0.14] },
          ],
        },
      },
      {
        weight: 2,
        preset: {
          // A shrub with toadstools and grass at its edge.
          id: "berry-edge",
          primary: "shrub",
          primaryOffset: 0.15,
          members: [
            { family: "mushroom", count: [1, 2], ring: [0.45, 0.9], height: [0.12, 0.18] },
            { family: "leaves", count: [1, 1], ring: [0.35, 0.95], height: [0.3, 0.45] },
            { family: "grass", count: [1, 2], ring: [0.4, 0.95], height: [0.2, 0.3] },
          ],
        },
      },
    ],
    "dry-plant": [
      {
        weight: 3,
        preset: {
          // Golden bracken with smaller ferns, a mushroom and leaves.
          id: "fern-glade",
          primary: "fern",
          members: [
            { family: "bracken", count: [1, 2], ring: [0.5, 0.95], height: [0.5, 0.7] },
            { family: "mushroom", count: [0, 1], ring: [0.4, 0.9], height: [0.12, 0.18], chance: 0.6 },
            { family: "leaves", count: [1, 1], ring: [0.35, 0.95], height: [0.35, 0.5] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          // Toadstool ring: a big cluster, smaller clusters, fallen leaves.
          id: "toadstool-ring",
          primary: "toadstool",
          members: [
            { family: "mushroom-cluster", count: [1, 2], ring: [0.5, 0.95], height: [0.35, 0.55] },
            { family: "leaves", count: [1, 2], ring: [0.35, 0.95], height: [0.4, 0.6] },
            { family: "bracken", count: [0, 1], ring: [0.55, 0.95], height: [0.5, 0.7], chance: 0.4 },
          ],
        },
      },
    ],
    rock: [
      {
        weight: 3,
        preset: {
          // Mossy boulder with companion stones, a log, a fern, fallen leaves.
          id: "mossy-stones",
          primary: "rock-mossy",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.25, 0.42] },
            { family: "log", count: [1, 1], ring: [0.6, 0.95], height: [0.4, 0.55], chance: 0.35 },
            { family: "bracken", count: [0, 1], ring: [0.45, 0.9], height: [0.3, 0.42], chance: 0.5 },
            { family: "leaves", count: [1, 1], ring: [0.4, 0.95], height: [0.2, 0.3] },
            { family: "pebble", count: [1, 2], ring: [0.35, 1], height: [0.07, 0.13] },
          ],
        },
      },
      {
        weight: 2,
        preset: {
          // Lichen-crusted crags and slabs with a stump at their foot.
          id: "lichen-outcrop",
          primary: "rock-lichen",
          primaryOffset: 0.1,
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.22, 0.38] },
            { family: "stump", count: [1, 1], ring: [0.55, 0.9], height: [0.22, 0.32], chance: 0.35 },
            { family: "mushroom", count: [0, 1], ring: [0.45, 0.9], height: [0.1, 0.16], chance: 0.4 },
            { family: "pebble", count: [2, 3], ring: [0.4, 1], height: [0.06, 0.12] },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 2,
        preset: {
          // A broken snag with a fallen log, toadstools and stones at its foot.
          id: "snag",
          primary: "snag",
          members: [
            { family: "log", count: [1, 1], ring: [0.55, 0.95], height: [0.5, 0.7], chance: 0.6 },
            { family: "stump", count: [0, 1], ring: [0.5, 0.9], height: [0.2, 0.3] },
            { family: "mushroom", count: [1, 1], ring: [0.4, 0.9], height: [0.08, 0.14], chance: 0.6 },
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "trail-post",
          primary: "marker",
          members: [
            { family: "stump", count: [1, 1], ring: [0.5, 0.9], height: [0.2, 0.3], chance: 0.6 },
            { family: "leaves", count: [1, 1], ring: [0.35, 0.9], height: [0.2, 0.3] },
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
          ],
        },
      },
    ],
  },
  wall: AUTUMN_WALL,
  // Rich dark earth under clusters; ground patches strewn with fallen leaves.
  ground: {
    contactColor: "#3a2618",
    contactOpacity: 0.4,
    contactScale: 0.9,
    patchColor: "#6a4a2e",
    patches: {
      tints: [{ color: "#6e5440", weight: 2 }, { color: "#7a6444", weight: 1 }],
      litter: ["#c0702a", "#9a4a2c", "#bd942c"],
    },
  },
  variation: { toneJitter: 0.05, hueJitterDeg: 5 },
  budgets: { triangles: { standard: 90_000, reduced: 45_000 }, membersPerCluster: { standard: 6, reduced: 3 } },
};
