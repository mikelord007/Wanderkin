/**
 * Alpine art: a cold, quiet, miniature winter mountain on the furniture.
 * Layered snow-laden conifers and dwarf pines, dark granite and slate under
 * thick snow pillows, cairns and trail poles, sparse straw grass poking
 * through, frozen water and slow falling snow. Few dark shapes on wide
 * snowfields give the silhouette; snow ties every family together.
 *
 * Wave 2 baseline by the environment lead; owned by the Alpine worker
 * (ENVIRONMENT_ARCHITECTURE.md §10 + Wave 2 addendum). Builders live in
 * `../alpine/`.
 */
import { tuft } from "../builders/foliage.js";
import { lyingLog } from "../builders/trees.js";
import { alpineConiferVariants, youngConiferVariants } from "../alpine/conifer.js";
import { alpineMarkerVariants } from "../alpine/markers.js";
import { alpineRocks } from "../alpine/rocks.js";
import { alpineShrubVariants, snowDrift } from "../alpine/shrubs.js";
import { ALPINE_WALL } from "../alpine/wall.js";
import type { BiomeArt, BiomeTones } from "../types.js";

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
  // Painted trail-marker bands: a cold red, far from the collectible's amber.
  paint: { dark: "#7a2a31", base: "#a3333d", light: "#c8555e" },
  // Conifer bark: dark, warm red-brown.
  bark: { dark: "#3b2a22", base: "#5a4032", light: "#7d5c47" },
} satisfies BiomeTones;

const rocks = alpineRocks();

export const ALPINE_ART: BiomeArt = {
  id: "alpine",
  tones,
  // Low, warm winter sun over bright snow (22–40°, long shadows): less flat
  // ambient, more blue sky fill in the shade, slightly longer fog for crisp
  // distance.
  lighting: { ambientKeep: 0.56, hemisphereShare: 0.55, sunElevation: [22, 40], fogScale: 1.08, contactStrength: 0.95 },
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
    "dwarf-pine": {
      category: "bush", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.8, triangleBudget: 900,
      mirror: true, embed: [0.02, 0.05],
      variants: alpineShrubVariants(),
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
    // Wind-shaped snow at the foot of trees, rocks and markers.
    drift: {
      category: "dressing", role: "micro", shading: "smooth", castShadow: false, unitRadius: 0.5, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.04], alignToNormal: 1,
      variants: [snowDrift(601), snowDrift(603), snowDrift(605)],
    },
    // Sparse straw grass poking through the snow.
    "winter-grass": {
      category: "grass", role: "micro", shading: "smooth", castShadow: false, unitRadius: 1.1, triangleBudget: 220,
      mirror: true, embed: [0.02, 0.05],
      variants: [
        tuft({ blades: 6, splay: 0.45, seed: 21, ramp: "dry" }),
        tuft({ blades: 5, splay: 0.7, seed: 22, ramp: "dry", width: 0.035 }),
        tuft({ blades: 8, splay: 0.3, seed: 23, ramp: "dry", width: 0.03 }),
      ],
    },
    "fallen-branch": {
      category: "dressing", role: "micro", shading: "faceted", castShadow: false, unitRadius: 0.5, triangleBudget: 120,
      mirror: true, embed: [0.03, 0.06],
      variants: [lyingLog({ seed: 41, ramp: "bark", fork: true }), lyingLog({ seed: 42, ramp: "bark" })],
    },
    marker: {
      category: "marker", role: "hero", shading: "faceted", castShadow: true, unitRadius: 0.39, triangleBudget: 400,
      mirror: true, embed: [0.02, 0.04],
      variants: alpineMarkerVariants(),
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
            { family: "young-conifer", count: [1, 1], ring: [0.55, 0.95], height: [0.32, 0.55], chance: 0.7 },
            { family: "drift", count: [1, 1], ring: [0.3, 0.6], height: [0.28, 0.4] },
            { family: "winter-grass", count: [0, 2], ring: [0.45, 0.95], height: [0.06, 0.1] },
            { family: "fallen-branch", count: [1, 1], ring: [0.5, 0.9], height: [0.14, 0.2], chance: 0.3 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-pine",
          primary: "conifer",
          members: [
            { family: "drift", count: [1, 1], ring: [0.3, 0.55], height: [0.3, 0.42] },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.03, 0.05] },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "treeline-copse",
          primary: "conifer",
          primaryOffset: 0.2,
          members: [
            { family: "young-conifer", count: [1, 2], ring: [0.5, 0.95], height: [0.4, 0.62] },
            { family: "dwarf-pine", count: [0, 1], ring: [0.55, 0.95], height: [0.14, 0.2] },
          ],
        },
      },
    ],
    shrub: [
      {
        weight: 3,
        preset: {
          id: "krummholz",
          primary: "dwarf-pine",
          members: [
            { family: "winter-grass", count: [1, 2], ring: [0.5, 0.95], height: [0.3, 0.45] },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.1, 0.16] },
            { family: "drift", count: [0, 1], ring: [0.55, 0.9], height: [0.6, 0.8], chance: 0.5 },
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
            { family: "pebble", count: [1, 2], ring: [0.35, 1], height: [0.08, 0.15] },
            { family: "winter-grass", count: [0, 1], ring: [0.45, 0.9], height: [0.14, 0.22], chance: 0.5 },
          ],
        },
      },
      {
        weight: 1,
        preset: {
          id: "lone-boulder",
          primary: "rock-large",
          members: [
            { family: "drift", count: [1, 1], ring: [0.45, 0.75], height: [0.4, 0.55] },
            { family: "pebble", count: [0, 1], ring: [0.5, 1], height: [0.08, 0.14] },
          ],
        },
      },
    ],
    wood: [
      {
        weight: 1,
        preset: {
          id: "trail-marker",
          primary: "marker",
          members: [
            { family: "pebble", count: [1, 2], ring: [0.4, 0.9], height: [0.05, 0.08] },
            { family: "drift", count: [0, 1], ring: [0.45, 0.8], height: [0.3, 0.45], chance: 0.6 },
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
    patchColor: "#e9f0f6",
    // Wind-packed snow: bright and cool, so under a warm sun it never reads
    // as a grey smudge on the white snowfield; a faint blue crust now and then.
    patches: { tints: [{ color: "#f8fbfe", weight: 3 }, { color: "#e3edf7", weight: 1 }] },
  },
  variation: { toneJitter: 0.04, hueJitterDeg: 3 },
  budgets: { triangles: { standard: 80_000, reduced: 35_000 }, membersPerCluster: { standard: 5, reduced: 3 } },
};
