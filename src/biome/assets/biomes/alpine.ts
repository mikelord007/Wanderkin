/**
 * Alpine art: crisp, cold, quiet. Layered snow-dusted conifers, low
 * juniper mounds, grey granite with snow on its upward faces, frozen water
 * and slow falling snow. Few, tall, dark trees against pale ground give the
 * silhouette; the snow caps tie every family together.
 *
 * Wave 2 baseline by the environment lead on the shared builders; owned by
 * the Alpine worker from hand-off (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2
 * addendum).
 */
import { post, signpost } from "../builders/dry.js";
import { bush, flowers, tuft } from "../builders/foliage.js";
import { lyingLog } from "../builders/trees.js";
import { alpineConiferVariants, youngConiferVariants } from "../alpine/conifer.js";
import { alpineRocks } from "../alpine/rocks.js";
import { ALPINE_WALL } from "../alpine/wall.js";
import { type SnowCapOptions, withSnowCap } from "../meshKit.js";
import type { BiomeArt, BiomeTones, VariantBuilder } from "../types.js";

const tones = {
  // Needles: deep blue-green, dark enough to hold a silhouette against snow.
  foliage: { dark: "#16372f", base: "#224c40", light: "#3a6e5b" },
  foliageAlt: { dark: "#1c3d36", base: "#2b574b", light: "#4b7d69" },
  trunk: { dark: "#4a3526", base: "#6b4d36", light: "#916f50" },
  // Granite: cool blue-grey, dark enough that snow caps pop.
  rock: { dark: "#4a515c", base: "#6d7581", light: "#98a0ab" },
  soil: { dark: "#8e979f", base: "#aeb7bf", light: "#cdd5dc" },
  dry: { dark: "#80734f", base: "#a39672", light: "#c6ba96" },
  cactus: { dark: "#2f5a45", base: "#437660", light: "#6c9a80" },
  accent: { dark: "#8a3668", base: "#b4568a", light: "#d98ab3" },
  stoneTop: { dark: "#a9b7c4", base: "#c4d0db", light: "#d6e0e9" },
  stoneSide: { dark: "#5b626c", base: "#7a818c", light: "#a0a7b1" },
  stoneRecess: { dark: "#3b4047", base: "#474c54", light: "#555b63" },
  // Snow pads on trees and rocks: shaded blue snow → lit snow.
  snow: { dark: "#a7bacb", base: "#c6d4e0", light: "#d5e1eb" },
  // Slate: darker, bluer bedding for layered rock.
  slate: { dark: "#343a45", base: "#4b5261", light: "#6c7483" },
  // Conifer bark: dark, warm red-brown.
  bark: { dark: "#3b2a22", base: "#5a4032", light: "#7d5c47" },
} satisfies BiomeTones;

/** Fresh snow on upward faces; heavier toward the top of each asset. */
const SNOW: SnowCapOptions = { color: "#eef4f8", threshold: 0.55, heightBias: 0.6 };
const LIGHT_SNOW: SnowCapOptions = { ...SNOW, threshold: 0.7, strength: 0.75 };

const rocks = alpineRocks();
const snowy = (list: readonly VariantBuilder[], options = SNOW) => list.map((builder) => withSnowCap(builder, options));

export const ALPINE_ART: BiomeArt = {
  id: "alpine",
  tones,
  // Low, warm winter sun over bright snow: less flat ambient, more sky fill,
  // slightly longer fog for crisp distance.
  lighting: { ambientKeep: 0.56, hemisphereShare: 0.55, sunElevation: [20, 44], fogScale: 1.08, contactStrength: 0.95 },
  atmosphere: { water: "frozen", particles: "snow" },
  families: {
    conifer: {
      category: "tree", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.62, triangleBudget: 900,
      leanMax: 0.03, mirror: true, embed: [0.01, 0.03],
      variants: alpineConiferVariants(),
    },
    "young-conifer": {
      category: "tree", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.62, triangleBudget: 500,
      mirror: true, embed: [0.01, 0.03],
      variants: youngConiferVariants(),
    },
    juniper: {
      category: "bush", role: "hero", shading: "smooth", castShadow: true, unitRadius: 0.8, triangleBudget: 900,
      mirror: true, embed: [0, 0.03],
      variants: snowy([
        bush({ lobes: 6, spread: 0.52, height: 1.25, seed: 1 }),
        bush({ lobes: 5, spread: 0.48, height: 1.2, seed: 2, altRamp: "foliage" }),
        bush({ lobes: 7, spread: 0.5, height: 1.35, seed: 3 }),
        bush({ lobes: 4, spread: 0.44, height: 1.2, seed: 4, ramp: "foliageAlt" }),
        bush({ lobes: 6, spread: 0.5, height: 1.3, seed: 5, blossoms: 3 }),
      ], LIGHT_SNOW),
    },
    "rock-large": {
      category: "rock", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.9, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.05], alignToNormal: 0.4,
      variants: rocks.hero,
    },
    "rock-medium": {
      category: "rock", role: "supporting", shading: "faceted", castShadow: true, unitRadius: 0.5, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.08], alignToNormal: 0.6,
      variants: rocks.supporting,
    },
    pebble: {
      category: "rock", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 60,
      mirror: true, embed: [0.05, 0.15], alignToNormal: 1,
      variants: rocks.dressing,
    },
    "alpine-grass": {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0, 0.02],
      variants: [
        tuft({ blades: 7, splay: 0.5, seed: 21, ramp: "dry" }),
        tuft({ blades: 6, splay: 0.7, seed: 22, ramp: "dry", width: 0.035 }),
      ],
    },
    "alpine-flowers": {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 400,
      mirror: true, embed: [0, 0.02],
      variants: [flowers({ stems: 5, seed: 31, ramp: "accent" }), flowers({ stems: 4, seed: 32, ramp: "accent" })],
    },
    "fallen-branch": {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.02, 0.05],
      variants: [lyingLog({ seed: 41, fork: true }), lyingLog({ seed: 42, ramp: "trunk" })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.36, triangleBudget: 300,
      mirror: true, embed: [0.03, 0.05],
      variants: snowy([post({ seed: 1 }), post({ seed: 2, lean: 0.05 }), signpost({ planks: 2, seed: 3 })], LIGHT_SNOW),
    },
  },
  compositions: {
    palm: [
      {
        weight: 3,
        preset: {
          id: "conifer-stand",
          primary: "conifer",
          primaryOffset: 0.15,
          members: [
            { family: "young-conifer", count: [0, 1], ring: [0.55, 0.95], height: [0.4, 0.62] },
            { family: "pebble", count: [1, 2], ring: [0.45, 1], height: [0.03, 0.06] },
            { family: "alpine-grass", count: [0, 2], ring: [0.4, 0.9], height: [0.06, 0.1] },
            { family: "fallen-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.14, 0.2], chance: 0.35 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-pine",
          primary: "conifer",
          members: [{ family: "pebble", count: [1, 2], ring: [0.5, 1], height: [0.03, 0.05] }],
        },
      },
    ],
    shrub: [
      {
        weight: 2,
        preset: {
          id: "juniper-mound",
          primary: "juniper",
          members: [
            { family: "pebble", count: [1, 2], ring: [0.5, 1], height: [0.1, 0.16] },
            { family: "alpine-flowers", count: [0, 1], ring: [0.5, 0.9], height: [0.25, 0.35] },
            { family: "alpine-grass", count: [1, 2], ring: [0.45, 0.95], height: [0.25, 0.35] },
          ],
        },
      },
    ],
    rock: [
      {
        weight: 2,
        preset: {
          id: "granite-outcrop",
          primary: "rock-large",
          members: [
            { family: "rock-medium", count: [1, 2], ring: [0.55, 0.9], height: [0.28, 0.45] },
            { family: "pebble", count: [2, 3], ring: [0.35, 1], height: [0.08, 0.15] },
            { family: "alpine-flowers", count: [0, 1], ring: [0.45, 0.9], height: [0.12, 0.18], chance: 0.4 },
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
    wood: [
      {
        weight: 1,
        preset: {
          id: "trail-post",
          primary: "marker",
          members: [
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
            { family: "fallen-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.3, 0.42], chance: 0.5 },
          ],
        },
      },
    ],
  },
  wall: ALPINE_WALL,
  // Cool blue-grey contact; fresh and wind-packed snow drifts.
  ground: {
    contactColor: "#3c4a5a",
    contactOpacity: 0.34,
    contactScale: 0.9,
    patchColor: "#dfe7ee",
    patches: { tints: [{ color: "#eef3f7", weight: 3 }, { color: "#cfd9e1", weight: 1 }] },
  },
  variation: { toneJitter: 0.04, hueJitterDeg: 3 },
  budgets: { triangles: { standard: 80_000, reduced: 35_000 }, membersPerCluster: { standard: 5, reduced: 3 } },
};
