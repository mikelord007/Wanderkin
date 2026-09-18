import type { Vec3 } from "../../shared/geometry.js";
import type { MovementConfig } from "../../shared/movement.js";
import { TriangleGrid } from "./spatial.js";
import type { Bounds, TriangleSoup } from "./types.js";

/**
 * Generic, furniture-agnostic surface analysis.
 *
 * Nothing here knows what a desk or a sofa is. The level is a triangle soup;
 * the questions are only ever "is this patch flat enough, big enough, and
 * supported enough to stand on" and "does the character fit above it". That is
 * what lets the same code prepare a new generated mesh without new gameplay
 * code.
 *
 * Every judgement is deliberately conservative: it may refuse a surface the
 * live controller could actually use, but it must not approve one it cannot.
 */

export interface SurfaceOptions {
  /** XZ grid resolution. Roughly the character's diameter — finer resolution
   * finds narrow ledges but produces noisier patches on a generated mesh. */
  cellSize: number;
  /** Steepest surface still considered standable. */
  maxSlopeRadians: number;
  /** Height samples within a cell closer than this merge into one patch. */
  heightClusterTolerance: number;
  /** Minimum share of a cell's area that must be walkable surface. */
  minPatchAreaRatio: number;
  /** Of the 8 neighbouring cells, how many must have a patch at a compatible
   * height before the patch counts as a real standing area rather than a
   * spike of noise. */
  minSupportNeighbors: number;
  /** Height difference that still counts as "the same floor" for support and
   * for walking between patches. */
  stepTolerance: number;
  characterRadius: number;
  /** Total capsule height, 2 * (halfHeight + radius). */
  characterHeight: number;
  /** Geometry within this distance above a patch is treated as part of the
   * surface itself rather than as an obstacle. */
  surfaceSkin: number;
  /**
   * Optional predicate marking points buried inside solid geometry.
   *
   * A triangle soup cannot distinguish "standing on the floor" from "standing
   * on the floor underneath a solid block" — the floor's top face is present
   * in both. Callers that know their solids analytically (helper boxes and
   * ramps) supply this so buried patches are discarded.
   */
  insideSolid?: (point: Vec3) => boolean;
}

export function defaultSurfaceOptions(
  movement: MovementConfig,
): SurfaceOptions {
  const characterHeight =
    2 * (movement.characterHalfHeight + movement.characterRadius);
  return {
    cellSize: movement.characterRadius * 2,
    maxSlopeRadians: (32 * Math.PI) / 180,
    heightClusterTolerance: 0.08,
    minPatchAreaRatio: 0.45,
    minSupportNeighbors: 4,
    stepTolerance: 0.12,
    characterRadius: movement.characterRadius,
    characterHeight,
    surfaceSkin: 0.08,
  };
}

export type PatchRejection =
  | "too-small"
  | "unsupported"
  | "no-headroom"
  | "buried"
  | null;

export interface SurfacePatch {
  readonly id: string;
  readonly cellX: number;
  readonly cellZ: number;
  /** Standing point: cell centre in XZ, patch top in Y. */
  readonly point: Vec3;
  /** Walkable surface area accumulated into this patch, m². */
  readonly area: number;
  /** Mean upward tilt of the contributing triangles, radians. */
  readonly slopeRadians: number;
  readonly supportNeighbors: number;
  /** Measured free height above the patch, capped at `characterHeight`. */
  readonly clearanceHeight: number;
  readonly standable: boolean;
  readonly rejection: PatchRejection;
}

export interface SurfaceMap {
  readonly patches: readonly SurfacePatch[];
  readonly standable: readonly SurfacePatch[];
  readonly options: SurfaceOptions;
  readonly bounds: Bounds;
  readonly grid: TriangleGrid;
  /** Patches indexed by `cellKey(cellX, cellZ)`, ascending by height. */
  readonly byCell: ReadonlyMap<string, readonly SurfacePatch[]>;
  /** Walkable area that was discarded, and why — surfaced as honest
   * uncertainty rather than hidden. */
  readonly rejectedCounts: Readonly<Record<Exclude<PatchRejection, null>, number>>;
}

export function cellKey(cellX: number, cellZ: number): string {
  return `${cellX}:${cellZ}`;
}

interface CellAccumulator {
  ys: number[];
  weights: number[];
  slopes: number[];
}

/** Sub-samples per axis inside a cell when rasterizing a large triangle. 3×3
 * resolves partial coverage well enough to reject slivers without turning
 * surface sampling into a rasterizer benchmark. */
const CELL_SUBSAMPLES = 3;

/** Lattice density for triangles smaller than a cell, where rasterizing by
 * cell centre would miss them entirely. */
const SMALL_TRIANGLE_LATTICE = 2;

export function sampleSurfaces(
  triangles: TriangleSoup,
  options: SurfaceOptions,
): SurfaceMap {
  const grid = new TriangleGrid(triangles, options.cellSize);
  const bounds = grid.bounds;
  const cosMaxSlope = Math.cos(options.maxSlopeRadians);
  const cellArea = options.cellSize * options.cellSize;
  const cells = new Map<string, CellAccumulator>();

  const p = triangles.positions;
  for (let t = 0; t < triangles.triangleCount; t += 1) {
    const o = t * 9;
    const ax = p[o]!;
    const ay = p[o + 1]!;
    const az = p[o + 2]!;
    const e1x = p[o + 3]! - ax;
    const e1y = p[o + 4]! - ay;
    const e1z = p[o + 5]! - az;
    const e2x = p[o + 6]! - ax;
    const e2y = p[o + 7]! - ay;
    const e2z = p[o + 8]! - az;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const length = Math.hypot(nx, ny, nz);
    if (!(length > 1e-12)) continue;
    const upness = ny / length;
    // Only upward-facing faces are standable. A downward-facing face at the
    // same height is a ceiling, and treating it as floor is how a player ends
    // up standing inside the sofa.
    if (upness < cosMaxSlope) continue;

    const slope = Math.acos(Math.min(1, upness));
    // Areas are horizontal projections throughout: standing room is a
    // footprint question, so a steep patch contributes less than a flat one of
    // the same surface area.
    const projectedArea = (length / 2) * upness;

    if (projectedArea <= cellArea * 0.5) {
      // Smaller than half a cell: rasterizing by cell centre could miss it, so
      // drop a small barycentric lattice instead.
      const n = SMALL_TRIANGLE_LATTICE;
      const weight = projectedArea / (n * n);
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n - i; j += 1) {
          addLatticeSample(cells, ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z, (i + 1 / 3) / n, (j + 1 / 3) / n, weight, slope, bounds, options.cellSize);
          if (i + j < n - 1) {
            addLatticeSample(cells, ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z, (i + 2 / 3) / n, (j + 2 / 3) / n, weight, slope, bounds, options.cellSize);
          }
        }
      }
      continue;
    }

    // Large triangle: rasterize over the XZ grid so coverage is proportional
    // to actual footprint, whatever the triangle's size. A helper floor is a
    // pair of huge triangles and must still fill every cell it spans.
    rasterizeTriangle(
      cells,
      { ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z, nx, ny, nz },
      slope,
      bounds,
      options.cellSize,
      cellArea,
    );
  }

  // Cluster each cell's height samples into patches.
  interface RawPatch {
    cellX: number;
    cellZ: number;
    top: number;
    area: number;
    slope: number;
  }
  const raw: RawPatch[] = [];
  for (const [key, accumulator] of cells) {
    const [cellXText, cellZText] = key.split(":") as [string, string];
    const cellX = Number(cellXText);
    const cellZ = Number(cellZText);
    const order = accumulator.ys
      .map((_, index) => index)
      .sort((a, b) => accumulator.ys[a]! - accumulator.ys[b]!);

    let groupTop = Number.NaN;
    let groupArea = 0;
    let groupSlopeWeighted = 0;
    let previous = Number.NaN;
    const flush = () => {
      if (groupArea > 0) {
        raw.push({
          cellX,
          cellZ,
          top: groupTop,
          area: groupArea,
          slope: groupSlopeWeighted / groupArea,
        });
      }
      groupArea = 0;
      groupSlopeWeighted = 0;
    };
    for (const index of order) {
      const y = accumulator.ys[index]!;
      if (!Number.isNaN(previous) && y - previous > options.heightClusterTolerance) {
        flush();
      }
      // The patch top is the highest sample in the cluster: standing lower
      // would put the capsule inside the surface.
      groupTop = y;
      groupArea += accumulator.weights[index]!;
      groupSlopeWeighted += accumulator.slopes[index]! * accumulator.weights[index]!;
      previous = y;
    }
    flush();
  }

  // Index by cell so support and clearance can be evaluated.
  const byCellRaw = new Map<string, RawPatch[]>();
  for (const patch of raw) {
    const key = cellKey(patch.cellX, patch.cellZ);
    const list = byCellRaw.get(key);
    if (list) list.push(patch);
    else byCellRaw.set(key, [patch]);
  }

  const minArea = options.minPatchAreaRatio * options.cellSize * options.cellSize;
  const patches: SurfacePatch[] = [];
  const rejectedCounts = {
    "too-small": 0,
    unsupported: 0,
    "no-headroom": 0,
    buried: 0,
  };

  for (const patch of raw) {
    const x = bounds.min[0]! + (patch.cellX + 0.5) * options.cellSize;
    const z = bounds.min[2]! + (patch.cellZ + 0.5) * options.cellSize;
    const point: Vec3 = [x, patch.top, z];

    let supportNeighbors = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const neighbors = byCellRaw.get(
          cellKey(patch.cellX + dx, patch.cellZ + dz),
        );
        if (!neighbors) continue;
        if (
          neighbors.some(
            (other) => Math.abs(other.top - patch.top) <= options.stepTolerance,
          )
        ) {
          supportNeighbors += 1;
        }
      }
    }

    const clearanceHeight = measureClearance(grid, point, options);

    let rejection: PatchRejection = null;
    if (options.insideSolid?.([x, patch.top + options.surfaceSkin, z])) {
      rejection = "buried";
    } else if (patch.area < minArea) rejection = "too-small";
    else if (supportNeighbors < options.minSupportNeighbors) rejection = "unsupported";
    else if (clearanceHeight < options.characterHeight) rejection = "no-headroom";
    if (rejection) rejectedCounts[rejection] += 1;

    patches.push({
      id: `p${patch.cellX}_${patch.cellZ}_${patch.top.toFixed(3)}`,
      cellX: patch.cellX,
      cellZ: patch.cellZ,
      point,
      area: patch.area,
      slopeRadians: patch.slope,
      supportNeighbors,
      clearanceHeight,
      standable: rejection === null,
      rejection,
    });
  }

  const byCell = new Map<string, SurfacePatch[]>();
  for (const patch of patches) {
    const key = cellKey(patch.cellX, patch.cellZ);
    const list = byCell.get(key);
    if (list) list.push(patch);
    else byCell.set(key, [patch]);
  }
  for (const list of byCell.values()) list.sort((a, b) => a.point[1]! - b.point[1]!);

  return {
    patches,
    standable: patches.filter((patch) => patch.standable),
    options,
    bounds,
    grid,
    byCell,
    rejectedCounts,
  };
}

interface RasterTriangle {
  ax: number;
  ay: number;
  az: number;
  e1x: number;
  e1y: number;
  e1z: number;
  e2x: number;
  e2y: number;
  e2z: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Deposits area into every grid cell the triangle's XZ footprint covers,
 * measuring partial coverage with a 3×3 sub-sample per cell and reading the
 * exact surface height from the triangle's plane.
 */
function rasterizeTriangle(
  cells: Map<string, CellAccumulator>,
  tri: RasterTriangle,
  slope: number,
  bounds: Bounds,
  cellSize: number,
  cellArea: number,
): void {
  const bx = tri.ax + tri.e1x;
  const bz = tri.az + tri.e1z;
  const cx = tri.ax + tri.e2x;
  const cz = tri.az + tri.e2z;
  const minX = Math.min(tri.ax, bx, cx);
  const maxX = Math.max(tri.ax, bx, cx);
  const minZ = Math.min(tri.az, bz, cz);
  const maxZ = Math.max(tri.az, bz, cz);

  const cell0X = Math.floor((minX - bounds.min[0]!) / cellSize);
  const cell1X = Math.floor((maxX - bounds.min[0]!) / cellSize);
  const cell0Z = Math.floor((minZ - bounds.min[2]!) / cellSize);
  const cell1Z = Math.floor((maxZ - bounds.min[2]!) / cellSize);

  // 2D barycentric denominator in the XZ plane.
  const denominator = tri.e1x * tri.e2z - tri.e2x * tri.e1z;
  if (Math.abs(denominator) < 1e-12) return; // edge-on, no footprint
  const subWeight = cellArea / (CELL_SUBSAMPLES * CELL_SUBSAMPLES);
  const step = cellSize / CELL_SUBSAMPLES;

  for (let cz = cell0Z; cz <= cell1Z; cz += 1) {
    for (let cxi = cell0X; cxi <= cell1X; cxi += 1) {
      const cellOriginX = bounds.min[0]! + cxi * cellSize;
      const cellOriginZ = bounds.min[2]! + cz * cellSize;
      for (let sz = 0; sz < CELL_SUBSAMPLES; sz += 1) {
        for (let sx = 0; sx < CELL_SUBSAMPLES; sx += 1) {
          const px = cellOriginX + (sx + 0.5) * step;
          const pz = cellOriginZ + (sz + 0.5) * step;
          const dx = px - tri.ax;
          const dz = pz - tri.az;
          const u = (dx * tri.e2z - tri.e2x * dz) / denominator;
          const v = (tri.e1x * dz - dx * tri.e1z) / denominator;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const y = tri.ay + tri.e1y * u + tri.e2y * v;
          pushSample(cells, cxi, cz, y, subWeight, slope);
        }
      }
    }
  }
}

function pushSample(
  cells: Map<string, CellAccumulator>,
  cellX: number,
  cellZ: number,
  y: number,
  weight: number,
  slope: number,
): void {
  const key = cellKey(cellX, cellZ);
  let accumulator = cells.get(key);
  if (!accumulator) {
    accumulator = { ys: [], weights: [], slopes: [] };
    cells.set(key, accumulator);
  }
  accumulator.ys.push(y);
  accumulator.weights.push(weight);
  accumulator.slopes.push(slope);
}

function addLatticeSample(
  cells: Map<string, CellAccumulator>,
  ax: number,
  ay: number,
  az: number,
  e1x: number,
  e1y: number,
  e1z: number,
  e2x: number,
  e2y: number,
  e2z: number,
  u: number,
  v: number,
  weight: number,
  slope: number,
  bounds: Bounds,
  cellSize: number,
): void {
  const x = ax + e1x * u + e2x * v;
  const y = ay + e1y * u + e2y * v;
  const z = az + e1z * u + e2z * v;
  const cellX = Math.floor((x - bounds.min[0]!) / cellSize);
  const cellZ = Math.floor((z - bounds.min[2]!) / cellSize);
  pushSample(cells, cellX, cellZ, y, weight, slope);
}

/**
 * Free height above `point`, capped at the character's height.
 *
 * Tests the capsule's bounding box rather than the capsule, so the answer is a
 * lower bound on the true clearance. Binary search reports how much room there
 * actually is instead of a bare pass/fail, which is what makes "this ledge is
 * 0.4 m short" a usable message for the editor.
 */
export function measureClearance(
  grid: TriangleGrid,
  point: Vec3,
  options: SurfaceOptions,
): number {
  const base = point[1]! + options.surfaceSkin;
  const required = options.characterHeight;
  const radius = options.characterRadius;
  const blocked = (height: number): boolean =>
    grid.intersectsBox(
      [point[0]! - radius, base, point[2]! - radius],
      [point[0]! + radius, point[1]! + height, point[2]! + radius],
    );

  if (!blocked(required)) return required;

  let low = 0;
  let high = required;
  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2;
    if (mid <= options.surfaceSkin) {
      low = mid;
      continue;
    }
    if (blocked(mid)) high = mid;
    else low = mid;
  }
  return low;
}

/** Capsule CENTRE for standing on `patch`, matching the manifest's
 * centre-position convention for spawn points and checkpoints. */
export function standingCenter(
  patch: SurfacePatch,
  movement: MovementConfig,
  skin = 0.02,
): Vec3 {
  return [
    patch.point[0]!,
    patch.point[1]! +
      movement.characterHalfHeight +
      movement.characterRadius +
      skin,
    patch.point[2]!,
  ];
}

/** Inverse of {@link standingCenter}: the standing surface under a capsule
 * centre. Used to check manifest spawn/checkpoint positions against the
 * measured surface map. */
export function surfaceFromCenter(
  center: Vec3,
  movement: MovementConfig,
  skin = 0.02,
): Vec3 {
  return [
    center[0]!,
    center[1]! - movement.characterHalfHeight - movement.characterRadius - skin,
    center[2]!,
  ];
}

/** Nearest standable patch to an XZ position, optionally near a target height. */
export function nearestStandablePatch(
  map: SurfaceMap,
  position: Vec3,
  maxHeightDelta = Infinity,
): SurfacePatch | null {
  let best: SurfacePatch | null = null;
  let bestDistance = Infinity;
  for (const patch of map.standable) {
    const dy = Math.abs(patch.point[1]! - position[1]!);
    if (dy > maxHeightDelta) continue;
    const distance =
      (patch.point[0]! - position[0]!) ** 2 + (patch.point[2]! - position[2]!) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = patch;
    }
  }
  return best;
}
