/**
 * Autumn structure shells: woodland timber. Generated steps, bridges and
 * platforms read as stacked, dark-oiled beams, not boxes: several courses
 * with rounded (log-like) corners, staggered beam ends on every face, deep
 * seams, a warm honey-plank walkable top and a pale amber rim on the
 * collision edge.
 *
 * Enough courses and joints that even a tall step in furniture shade shows
 * seams and beam ends on every face (review of 2d25cb4: 3–4 courses left
 * ~0.7-unit flat beam faces). Distinct from Tropical's sun-bleached grey
 * planks and the Desert's sandstone through a darker, richer, redder wood.
 */
import type { WallStyle } from "../types.js";

export const AUTUMN_WALL: WallStyle = {
  // Beams: a course every ~0.3–0.4 units on a tall step.
  strata: [5, 7],
  // Beams sit a little in and out of each other, within the shell tolerance.
  stepping: 0.6,
  // Rounded, log-like corners.
  rounding: 0.8,
  // A knot or split per beam at most.
  notches: [0, 1],
  // Beam ends: staggered joints on every face; deep seams between beams.
  joints: [5, 8],
  seam: 0.85,
  // Honey-coloured boards on the walkable face.
  top: { dark: "#8a6844", base: "#a8845a", light: "#c4a174" },
  // Dark oiled beam against a warmer weathered one.
  side: { dark: "#3a2a1e", base: "#6b4f37", light: "#a88258" },
  recess: "#24180f",
  rim: "#dcbc86",
};
