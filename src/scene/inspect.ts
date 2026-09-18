import type { Quat, Vec3 } from "../../shared/geometry.js";
import { IDENTITY_QUAT } from "../../shared/geometry.js";
import {
  boundsExtents,
  computeBounds,
  quatFromAxisAngle,
  quatFromYaw,
  rotateVectorByQuat,
} from "./transform.js";
import type {
  Axis,
  GeometryInspection,
  NumericBuffer,
  TriangleSoup,
  UpAxisAssessment,
} from "./types.js";

/** Triangles whose normal lies within this many degrees of an axis count as
 * "flat against" that axis when voting for the up direction. */
const FLAT_NORMAL_TOLERANCE_DEGREES = 25;

/** Minimum (best / runner-up) area ratio before a non-Y up axis is trusted
 * enough to override glTF's specified Y-up convention. */
export const UP_AXIS_CONFIDENCE_THRESHOLD = 1.5;

const AXES: readonly Axis[] = ["x", "y", "z"];

/**
 * Rotation that carries `axis`'s + direction onto +Y. Identity for "y", so a
 * conventional Y-up asset is never touched.
 */
export function upCorrectionQuat(axis: Axis): Quat {
  switch (axis) {
    case "y":
      return IDENTITY_QUAT;
    case "x":
      return quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    case "z":
      return quatFromAxisAngle([1, 0, 0], -Math.PI / 2);
  }
}

interface TriangleStats {
  area: number;
  normal: Vec3;
  centroid: Vec3;
}

function triangleStats(
  p: NumericBuffer,
  offset: number,
): TriangleStats | null {
  const ax = p[offset]!;
  const ay = p[offset + 1]!;
  const az = p[offset + 2]!;
  const bx = p[offset + 3]!;
  const by = p[offset + 4]!;
  const bz = p[offset + 5]!;
  const cx = p[offset + 6]!;
  const cy = p[offset + 7]!;
  const cz = p[offset + 8]!;

  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;

  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const length = Math.hypot(nx, ny, nz);
  if (!(length > 1e-12)) return null; // degenerate: zero area or NaN

  return {
    area: length / 2,
    normal: [nx / length, ny / length, nz / length],
    centroid: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
  };
}

/** Per-triangle area/normal/centroid, skipping degenerate triangles. */
export function forEachTriangle(
  soup: TriangleSoup,
  visit: (stats: TriangleStats, index: number) => void,
): number {
  let degenerate = 0;
  const { positions } = soup;
  for (let t = 0; t < soup.triangleCount; t += 1) {
    const stats = triangleStats(positions, t * 9);
    if (stats === null) {
      degenerate += 1;
      continue;
    }
    visit(stats, t);
  }
  return degenerate;
}

/**
 * Measures which axis the asset uses as "up" from the surface-area
 * distribution of triangle normals: a room-corner scan is dominated by
 * upward-facing floor, seat, and tabletop area, so the axis holding the most
 * upward-facing area is the up axis.
 *
 * Reported with a confidence ratio because this is a heuristic on a generated
 * approximation, not metadata. Callers must treat a low ratio as "unknown".
 */
export function assessUpAxis(soup: TriangleSoup): UpAxisAssessment {
  const cosTolerance = Math.cos((FLAT_NORMAL_TOLERANCE_DEGREES * Math.PI) / 180);
  const positiveArea: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  let totalArea = 0;

  forEachTriangle(soup, ({ area, normal }) => {
    totalArea += area;
    if (normal[0]! >= cosTolerance) positiveArea.x += area;
    if (normal[1]! >= cosTolerance) positiveArea.y += area;
    if (normal[2]! >= cosTolerance) positiveArea.z += area;
  });

  const fraction: Record<Axis, number> = {
    x: totalArea > 0 ? positiveArea.x / totalArea : 0,
    y: totalArea > 0 ? positiveArea.y / totalArea : 0,
    z: totalArea > 0 ? positiveArea.z / totalArea : 0,
  };
  const ranked = [...AXES].sort((a, b) => fraction[b]! - fraction[a]!);
  const detected = ranked[0]!;
  const runnerUp = fraction[ranked[1]!];
  const confidenceRatio =
    runnerUp > 0
      ? fraction[detected]! / runnerUp
      : fraction[detected]! > 0
        ? Infinity
        : 1;
  const agreesWithGltfYUp =
    detected === "y" && confidenceRatio >= UP_AXIS_CONFIDENCE_THRESHOLD;

  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const notes = agreesWithGltfYUp
    ? `Upward-facing area is dominated by +${detected} (${percent(fraction[detected])} of total area, ${confidenceRatio.toFixed(2)}x the runner-up), matching glTF Y-up.`
    : confidenceRatio >= UP_AXIS_CONFIDENCE_THRESHOLD
      ? `Upward-facing area points along +${detected} (${percent(fraction[detected])}), not +y — the asset appears to be stored ${detected}-up.`
      : `No axis carries a clearly dominant flat-surface area (x ${percent(fraction.x)}, y ${percent(fraction.y)}, z ${percent(fraction.z)}); up axis is uncertain and glTF's Y-up convention is kept.`;

  return {
    detected,
    positiveAreaFraction: fraction,
    confidenceRatio,
    agreesWithGltfYUp,
    notes,
  };
}

/**
 * Yaw of the footprint's dominant horizontal axis, from an area-weighted
 * principal-component fit of triangle centroids in the XZ plane of the
 * up-corrected frame. Rotating the asset by this yaw places that axis on +X.
 *
 * Undirected: the fit cannot distinguish a long axis from the same axis turned
 * 180°, so a creator-facing yaw control remains necessary.
 */
export function footprintPrincipalYaw(
  soup: TriangleSoup,
  upCorrection: Quat,
): number {
  let weight = 0;
  let meanX = 0;
  let meanZ = 0;
  forEachTriangle(soup, ({ area, centroid }) => {
    const [x, , z] = rotateVectorByQuat(centroid, upCorrection);
    weight += area;
    meanX += area * x;
    meanZ += area * z;
  });
  if (weight <= 0) return 0;
  meanX /= weight;
  meanZ /= weight;

  let cxx = 0;
  let czz = 0;
  let cxz = 0;
  forEachTriangle(soup, ({ area, centroid }) => {
    const [x, , z] = rotateVectorByQuat(centroid, upCorrection);
    const dx = x - meanX;
    const dz = z - meanZ;
    cxx += area * dx * dx;
    czz += area * dz * dz;
    cxz += area * dx * dz;
  });

  if (Math.abs(cxz) < 1e-12 && Math.abs(cxx - czz) < 1e-12) return 0;
  return 0.5 * Math.atan2(2 * cxz, cxx - czz);
}

/**
 * Longest horizontal extent once `yaw` has been applied, measured by rotating
 * the actual bounds corners rather than assuming the axis-aligned box rotates
 * cleanly.
 */
export function horizontalExtentsAfterYaw(
  soup: TriangleSoup,
  upCorrection: Quat,
  yaw: number,
): { extentX: number; extentZ: number } {
  const rotation = quatFromYaw(yaw);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const { positions } = soup;
  for (let i = 0; i < soup.triangleCount * 9; i += 3) {
    const point: Vec3 = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
    const corrected = rotateVectorByQuat(point, upCorrection);
    const [x, , z] = rotateVectorByQuat(corrected, rotation);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (soup.triangleCount === 0) return { extentX: 0, extentZ: 0 };
  return { extentX: maxX - minX, extentZ: maxZ - minZ };
}

/** Snaps a yaw to the nearest quarter turn — an asset is only ever turned by a
 * multiple of 90°, never skewed by a noisy principal-axis fit. */
export function snapYawToQuarterTurn(yaw: number): number {
  const quarter = Math.PI / 2;
  return Math.round(yaw / quarter) * quarter;
}

/** Full geometry report for a loaded asset. Bounds and extents are in the
 * asset's own units so they can be compared against provider provenance. */
export function inspectGeometry(soup: TriangleSoup): GeometryInspection {
  const bounds = computeBounds(soup);
  let totalArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;
  const degenerateTriangleCount = forEachTriangle(
    soup,
    ({ area, centroid }) => {
      totalArea += area;
      centroidX += area * centroid[0]!;
      centroidY += area * centroid[1]!;
      centroidZ += area * centroid[2]!;
    },
  );
  const centroid: Vec3 =
    totalArea > 0
      ? [centroidX / totalArea, centroidY / totalArea, centroidZ / totalArea]
      : [0, 0, 0];

  const upAxis = assessUpAxis(soup);
  const upCorrection = upCorrectionQuat(
    upAxis.confidenceRatio >= UP_AXIS_CONFIDENCE_THRESHOLD
      ? upAxis.detected
      : "y",
  );
  const rawYaw = footprintPrincipalYaw(soup, upCorrection);
  const snapped = snapYawToQuarterTurn(rawYaw);
  const { extentX, extentZ } = horizontalExtentsAfterYaw(
    soup,
    upCorrection,
    snapped,
  );

  return {
    triangleCount: soup.triangleCount,
    degenerateTriangleCount,
    bounds,
    extents: boundsExtents(bounds),
    centroid,
    totalArea,
    upAxis,
    footprintPrincipalYawRadians: rawYaw,
    longestHorizontalExtent: Math.max(extentX, extentZ),
  };
}
