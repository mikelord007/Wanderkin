/**
 * Alpine structure shells: snow-topped dry-stone granite. Generated steps,
 * bridges and platforms read as courses of dark fitted blocks under a snow
 * cap: a few heavy strata with staggered block joints and deep dark seams,
 * alternating between a frost-lit and a dark stone course (a wide enough
 * swing to beat facet shading in furniture shade), angular corners, snow
 * collecting on every stepped ledge, a snow-covered walkable top and a
 * bright packed-snow rim on the collision edge.
 *
 * Cold stone with snow keeps Alpine distinct from Desert's warm sandstone
 * strata and Tropical's timber decks, and ties the structures to the
 * biome's snow-capped granite boulders.
 */
import type { WallStyle } from "../types.js";

export const ALPINE_WALL: WallStyle = {
  // Heavy courses: few, thick strata.
  strata: [3, 5],
  // Courses sit slightly in and out, so ledges catch snow (within ±τ).
  stepping: 0.6,
  // Hard, frost-split corners.
  rounding: 0.3,
  // A frost crack or two, each confined to one course.
  notches: [1, 2],
  // Fitted blocks: staggered joints per course, dark deep seams.
  joints: [3, 5],
  seam: 0.78,
  // Snow on the walkable face (and on the ledges between courses).
  top: { dark: "#a9bccd", base: "#c4d2df", light: "#d9e3ec" },
  // Dark granite course → frost-lit course.
  side: { dark: "#353b45", base: "#5d6571", light: "#9aa3af" },
  recess: "#23272e",
  // Packed snow on the collision edge, brighter than the top.
  rim: "#eaf0f5",
};
