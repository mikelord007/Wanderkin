/**
 * Ground height field for rain splashes (`BiomeLayout.ground`).
 *
 * One vertical ray per cell centre, cast once when the layout is prepared,
 * over the same collision grid (scan, floor and structures) that placement
 * and the route checks use. So a drop landing on the sofa seat, the desk top
 * or a generated step splashes on that surface, not on a guessed plane or
 * the scan's bounding box. The renderer only ever reads this grid: no ray
 * is cast per drop, and nothing here touches gameplay.
 */
import type { Vec3 } from "@shared/index.js";
import { raycastDown } from "./geometry.js";
import type { TriangleGrid } from "../scene/spatial.js";
import type { BiomeGroundHeights } from "./types.js";

/** Most cells per axis (a 4 m room at 128 cells is ~3 cm per cell). */
export const GROUND_MAX_CELLS = 128;

/**
 * Samples the highest collision surface under each cell of `bounds` (padded
 * by `pad` on every side). `unit` is the runtime character height: cells are
 * never finer than a tenth of it, and a height jump of more than a quarter
 * of it between neighbours marks both cells as ledge edges.
 */
export function sampleGroundHeights(
  grid: TriangleGrid,
  bounds: { min: Vec3; max: Vec3 },
  unit: number,
  pad = 0,
): BiomeGroundHeights | null {
  const minX = bounds.min[0] - pad;
  const minZ = bounds.min[2] - pad;
  const width = bounds.max[0] - bounds.min[0] + pad * 2;
  const depth = bounds.max[2] - bounds.min[2] + pad * 2;
  if (![minX, minZ, width, depth, unit].every(Number.isFinite) || !(width > 0) || !(depth > 0) || !(unit > 0)) return null;
  const cell = Math.max(unit * 0.1, Math.max(width, depth) / GROUND_MAX_CELLS);
  const cols = Math.max(1, Math.min(GROUND_MAX_CELLS, Math.ceil(width / cell)));
  const rows = Math.max(1, Math.min(GROUND_MAX_CELLS, Math.ceil(depth / cell)));
  const top = Math.max(bounds.max[1], grid.bounds.max[1]) + unit;
  const reach = top - Math.min(bounds.min[1], grid.bounds.min[1]) + unit;
  const heights = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const hit = raycastDown(grid, [minX + (col + 0.5) * cell, top, minZ + (row + 0.5) * cell], reach);
      heights[row * cols + col] = hit ? hit.point[1] : Number.NaN;
    }
  }
  const edge = new Uint8Array(cols * rows);
  const step = unit * 0.25;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const h = heights[row * cols + col]!;
      if (Number.isNaN(h)) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const n = heights[r * cols + c]!;
        if (Number.isNaN(n) || Math.abs(n - h) > step) {
          edge[row * cols + col] = 1;
          break;
        }
      }
    }
  }
  return { origin: [minX, minZ], cell, cols, rows, heights, edge, unit };
}

/** Result of {@link groundAt}: the surface height, and whether a splash there is safe. */
export interface GroundSample {
  height: number;
  /** False on open sky (NaN) or a ledge-edge cell. */
  splash: boolean;
}

/**
 * Height of the cell containing (x, z); NaN outside the grid or over open
 * sky. Nearest cell, not interpolated: interpolating across a table edge
 * would invent a slope in mid-air. Writes into `out` (no allocation).
 */
export function groundAt(field: BiomeGroundHeights, x: number, z: number, out: GroundSample): GroundSample {
  const col = Math.floor((x - field.origin[0]) / field.cell);
  const row = Math.floor((z - field.origin[1]) / field.cell);
  if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) {
    out.height = Number.NaN;
    out.splash = false;
    return out;
  }
  const i = row * field.cols + col;
  out.height = field.heights[i]!;
  out.splash = !Number.isNaN(out.height) && field.edge[i] === 0;
  return out;
}
