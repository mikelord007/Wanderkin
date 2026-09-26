/**
 * Monsoon structure shells: rain-soaked timber stilt-house decking.
 * Generated steps, bridges and platforms read as stacked wet planks with
 * dark water-stained seams, like the walls of a stilt hut: courses
 * alternate between a soaked near-black board and a paler weathered one,
 * short staggered board ends, softened corners, and a walkable deck of
 * lighter boards with a pale wet rim on the collision edge.
 *
 * Darker and cooler than Tropical's bleached driftwood decks, so the two
 * timber looks stay distinct.
 */
import type { WallStyle } from "../types.js";

export const MONSOON_WALL: WallStyle = {
  strata: [4, 6],
  // Tall steps get proportionally more boards instead of a few huge ones.
  courseHeight: 0.12,
  stepping: 0.35,
  rounding: 0.35,
  notches: [0, 1],
  joints: [4, 7],
  seam: 0.85,
  top: { dark: "#6a5a47", base: "#86745d", light: "#a08c72" },
  side: { dark: "#3a3028", base: "#5d4d3d", light: "#8f7c64" },
  recess: "#211a15",
  rim: "#c9c2b0",
};
