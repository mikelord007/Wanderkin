import type { Vec3 } from "../../shared/geometry.js";
import { computeBounds } from "./transform.js";
import type { Bounds, TriangleSoup } from "./types.js";

/**
 * Uniform XZ grid over a triangle soup.
 *
 * Surface sampling and clearance testing both need "which triangles are near
 * this column of space", tens of thousands of times per level. A flat grid is
 * enough: levels are one furniture corner, not a streaming world.
 */
export class TriangleGrid {
  readonly soup: TriangleSoup;
  readonly cellSize: number;
  readonly bounds: Bounds;
  private readonly cellsX: number;
  private readonly cellsZ: number;
  private readonly cells: Int32Array[];
  /** Per-triangle AABB, 6 floats each: minX, minY, minZ, maxX, maxY, maxZ. */
  private readonly aabbs: Float32Array;

  constructor(soup: TriangleSoup, cellSize: number) {
    this.soup = soup;
    this.cellSize = cellSize;
    this.bounds = computeBounds(soup);
    this.aabbs = new Float32Array(soup.triangleCount * 6);

    const width = this.bounds.max[0]! - this.bounds.min[0]!;
    const depth = this.bounds.max[2]! - this.bounds.min[2]!;
    this.cellsX = Math.max(1, Math.ceil(width / cellSize) + 1);
    this.cellsZ = Math.max(1, Math.ceil(depth / cellSize) + 1);

    const counts = new Int32Array(this.cellsX * this.cellsZ);
    const ranges = new Int32Array(soup.triangleCount * 4);

    const p = soup.positions;
    for (let t = 0; t < soup.triangleCount; t += 1) {
      const o = t * 9;
      let minX = p[o]!;
      let minY = p[o + 1]!;
      let minZ = p[o + 2]!;
      let maxX = minX;
      let maxY = minY;
      let maxZ = minZ;
      for (let v = 1; v < 3; v += 1) {
        const x = p[o + v * 3]!;
        const y = p[o + v * 3 + 1]!;
        const z = p[o + v * 3 + 2]!;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
      this.aabbs[t * 6] = minX;
      this.aabbs[t * 6 + 1] = minY;
      this.aabbs[t * 6 + 2] = minZ;
      this.aabbs[t * 6 + 3] = maxX;
      this.aabbs[t * 6 + 4] = maxY;
      this.aabbs[t * 6 + 5] = maxZ;

      const x0 = this.clampCellX(this.cellIndexX(minX));
      const x1 = this.clampCellX(this.cellIndexX(maxX));
      const z0 = this.clampCellZ(this.cellIndexZ(minZ));
      const z1 = this.clampCellZ(this.cellIndexZ(maxZ));
      ranges[t * 4] = x0;
      ranges[t * 4 + 1] = x1;
      ranges[t * 4 + 2] = z0;
      ranges[t * 4 + 3] = z1;
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let cx = x0; cx <= x1; cx += 1) {
          const cell = cz * this.cellsX + cx;
          counts[cell] = counts[cell]! + 1;
        }
      }
    }

    this.cells = new Array(this.cellsX * this.cellsZ);
    const cursors = new Int32Array(counts.length);
    for (let i = 0; i < counts.length; i += 1) {
      this.cells[i] = new Int32Array(counts[i]!);
    }
    for (let t = 0; t < soup.triangleCount; t += 1) {
      const x0 = ranges[t * 4]!;
      const x1 = ranges[t * 4 + 1]!;
      const z0 = ranges[t * 4 + 2]!;
      const z1 = ranges[t * 4 + 3]!;
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let cx = x0; cx <= x1; cx += 1) {
          const c = cz * this.cellsX + cx;
          const cursor = cursors[c]!;
          this.cells[c]![cursor] = t;
          cursors[c] = cursor + 1;
        }
      }
    }
  }

  private cellIndexX(x: number): number {
    return Math.floor((x - this.bounds.min[0]!) / this.cellSize);
  }

  private cellIndexZ(z: number): number {
    return Math.floor((z - this.bounds.min[2]!) / this.cellSize);
  }

  private clampCellX(value: number): number {
    return Math.min(this.cellsX - 1, Math.max(0, value));
  }

  private clampCellZ(value: number): number {
    return Math.min(this.cellsZ - 1, Math.max(0, value));
  }

  /** Visits each triangle index whose cell overlaps the XZ rectangle. A
   * triangle spanning several cells may be visited more than once. */
  forEachNear(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    visit: (triangleIndex: number) => void,
  ): void {
    const x0 = this.clampCellX(this.cellIndexX(minX));
    const x1 = this.clampCellX(this.cellIndexX(maxX));
    const z0 = this.clampCellZ(this.cellIndexZ(minZ));
    const z1 = this.clampCellZ(this.cellIndexZ(maxZ));
    for (let cz = z0; cz <= z1; cz += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = this.cells[cz * this.cellsX + cx]!;
        for (let i = 0; i < bucket.length; i += 1) visit(bucket[i]!);
      }
    }
  }

  triangleAabb(index: number): { min: Vec3; max: Vec3 } {
    const o = index * 6;
    return {
      min: [this.aabbs[o]!, this.aabbs[o + 1]!, this.aabbs[o + 2]!],
      max: [this.aabbs[o + 3]!, this.aabbs[o + 4]!, this.aabbs[o + 5]!],
    };
  }

  /**
   * True when any triangle actually overlaps the axis-aligned box.
   *
   * Used for clearance: the box is the character capsule's bounding box, which
   * is larger than the capsule itself, so a "clear" answer is conservative —
   * it can refuse a passage the real controller could squeeze through, but it
   * never approves one that is blocked.
   */
  intersectsBox(min: Vec3, max: Vec3): boolean {
    if (
      max[0]! < this.bounds.min[0]! ||
      min[0]! > this.bounds.max[0]! ||
      max[2]! < this.bounds.min[2]! ||
      min[2]! > this.bounds.max[2]! ||
      max[1]! < this.bounds.min[1]! ||
      min[1]! > this.bounds.max[1]!
    ) {
      return false;
    }
    const center: Vec3 = [
      (min[0]! + max[0]!) / 2,
      (min[1]! + max[1]!) / 2,
      (min[2]! + max[2]!) / 2,
    ];
    const half: Vec3 = [
      (max[0]! - min[0]!) / 2,
      (max[1]! - min[1]!) / 2,
      (max[2]! - min[2]!) / 2,
    ];

    let hit = false;
    this.forEachNear(min[0]!, min[2]!, max[0]!, max[2]!, (t) => {
      if (hit) return;
      const o = t * 6;
      if (
        this.aabbs[o]! > max[0]! ||
        this.aabbs[o + 3]! < min[0]! ||
        this.aabbs[o + 1]! > max[1]! ||
        this.aabbs[o + 4]! < min[1]! ||
        this.aabbs[o + 2]! > max[2]! ||
        this.aabbs[o + 5]! < min[2]!
      ) {
        return;
      }
      if (triangleIntersectsBox(this.soup.positions, t * 9, center, half)) {
        hit = true;
      }
    });
    return hit;
  }
}

/**
 * Akenine-Möller triangle/AABB overlap test (separating axis theorem over the
 * 3 box axes, the triangle normal, and the 9 edge cross-products).
 */
export function triangleIntersectsBox(
  positions: Float32Array,
  offset: number,
  boxCenter: Vec3,
  boxHalf: Vec3,
): boolean {
  const v0x = positions[offset]! - boxCenter[0]!;
  const v0y = positions[offset + 1]! - boxCenter[1]!;
  const v0z = positions[offset + 2]! - boxCenter[2]!;
  const v1x = positions[offset + 3]! - boxCenter[0]!;
  const v1y = positions[offset + 4]! - boxCenter[1]!;
  const v1z = positions[offset + 5]! - boxCenter[2]!;
  const v2x = positions[offset + 6]! - boxCenter[0]!;
  const v2y = positions[offset + 7]! - boxCenter[1]!;
  const v2z = positions[offset + 8]! - boxCenter[2]!;

  const e0x = v1x - v0x;
  const e0y = v1y - v0y;
  const e0z = v1z - v0z;
  const e1x = v2x - v1x;
  const e1y = v2y - v1y;
  const e1z = v2z - v1z;
  const e2x = v0x - v2x;
  const e2y = v0y - v2y;
  const e2z = v0z - v2z;

  const [hx, hy, hz] = boxHalf;

  // Nine axis tests: cross(box axis, triangle edge).
  const axisTest = (
    ax: number,
    ay: number,
    az: number,
    ex: number,
    ey: number,
    ez: number,
  ): boolean => {
    // axis = cross(a, e)
    const nx = ay * ez - az * ey;
    const ny = az * ex - ax * ez;
    const nz = ax * ey - ay * ex;
    const p0 = nx * v0x + ny * v0y + nz * v0z;
    const p1 = nx * v1x + ny * v1y + nz * v1z;
    const p2 = nx * v2x + ny * v2y + nz * v2z;
    const r = hx * Math.abs(nx) + hy * Math.abs(ny) + hz * Math.abs(nz);
    const min = Math.min(p0, p1, p2);
    const max = Math.max(p0, p1, p2);
    return min > r || max < -r; // true => separated
  };

  const edges: readonly [number, number, number][] = [
    [e0x, e0y, e0z],
    [e1x, e1y, e1z],
    [e2x, e2y, e2z],
  ];
  for (const [ex, ey, ez] of edges) {
    if (axisTest(1, 0, 0, ex, ey, ez)) return false;
    if (axisTest(0, 1, 0, ex, ey, ez)) return false;
    if (axisTest(0, 0, 1, ex, ey, ez)) return false;
  }

  // Box face axes.
  if (Math.min(v0x, v1x, v2x) > hx || Math.max(v0x, v1x, v2x) < -hx) return false;
  if (Math.min(v0y, v1y, v2y) > hy || Math.max(v0y, v1y, v2y) < -hy) return false;
  if (Math.min(v0z, v1z, v2z) > hz || Math.max(v0z, v1z, v2z) < -hz) return false;

  // Triangle plane vs box.
  const nx = e0y * e1z - e0z * e1y;
  const ny = e0z * e1x - e0x * e1z;
  const nz = e0x * e1y - e0y * e1x;
  const d = -(nx * v0x + ny * v0y + nz * v0z);
  const r = hx * Math.abs(nx) + hy * Math.abs(ny) + hz * Math.abs(nz);
  return Math.abs(d) <= r;
}
