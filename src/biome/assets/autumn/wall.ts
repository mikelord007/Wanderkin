/**
 * Autumn structure shells: woodland timber. Generated steps, bridges and
 * platforms read as a few thick, dark-oiled beams stacked like a log crib,
 * not as boxes: heavy strata with rounded (log-like) corners, staggered beam
 * ends, deep seams, a warm honey-plank walkable top and a pale amber rim on
 * the collision edge.
 *
 * Distinct from Tropical's thin sun-bleached planks (grey, many strata) and
 * the Desert's sandstone: fewer, heavier, richer-brown beams that sit with
 * the biome's bark and deadwood.
 */
import type { WallStyle } from "../types.js";

export const AUTUMN_WALL: WallStyle = {
  // Thick beams: few strata.
  strata: [3, 4],
  // Beams sit a little in and out of each other, within the shell tolerance.
  stepping: 0.6,
  // Rounded, log-like corners.
  rounding: 0.8,
  // A knot or split per beam at most.
  notches: [0, 1],
  // Beam ends: a few staggered joints per course; deep seams between beams.
  joints: [2, 3],
  seam: 0.85,
  // Honey-coloured boards on the walkable face.
  top: { dark: "#8a6844", base: "#a8845a", light: "#c4a174" },
  // Dark oiled beam against a warmer weathered one.
  side: { dark: "#3a2a1e", base: "#6b4f37", light: "#a88258" },
  recess: "#24180f",
  rim: "#dcbc86",
};
