/**
 * Tropical structure shells: weathered driftwood-timber decks. Generated
 * steps, bridges and platforms read as stacked, sun-bleached planks rather
 * than boxes: many thin horizontal strata alternating between a dark,
 * damp plank and a pale bleached one (wide enough contrast to beat facet
 * shading at distance), slightly misaligned plank edges, worn corners, dark
 * gaps, and a light boarded top with a pale rim on the collision edge.
 *
 * Timber rather than stone keeps Tropical distinct from the Desert's
 * sandstone strata while using the same shell framework, and ties the decks
 * to the biome's driftwood, trunk and bamboo tones.
 */
import type { WallStyle } from "../types.js";

export const TROPICAL_WALL: WallStyle = {
  // Planks: many thin strata.
  strata: [5, 7],
  // Plank edges sit slightly in and out, within the shell tolerance.
  stepping: 0.45,
  // Worn, rounded corners.
  rounding: 0.55,
  // Dark gaps / knots, each confined to one plank.
  notches: [1, 2],
  // Plank ends: many short, staggered joints; strong seams between planks.
  joints: [6, 9],
  seam: 0.8,
  // Sun-bleached boards on the walkable face.
  top: { dark: "#a8997c", base: "#c7b99c", light: "#ddd2b8" },
  // Wide dark → light span: damp plank vs bleached plank.
  side: { dark: "#4f3d2e", base: "#86725a", light: "#cdbfa4" },
  recess: "#382a1f",
  rim: "#efe6d2",
};
