import type { Quat, Transform, Vec3 } from "../../shared/geometry.js";
import {
  UP_AXIS_CONFIDENCE_THRESHOLD,
  footprintPrincipalYaw,
  horizontalExtentsAfterYaw,
  snapYawToQuarterTurn,
  upCorrectionQuat,
} from "./inspect.js";
import {
  quatFromYaw,
  quatMultiply,
  rotateVectorByQuat,
} from "./transform.js";
import type {
  Axis,
  Bounds,
  GeometryInspection,
  NormalizationResult,
  NormalizeOptions,
  TriangleSoup,
} from "./types.js";

/**
 * Turns a raw generated asset into level geometry in the project's coordinate
 * convention (`shared/geometry.ts`: Y-up, right-handed, meters):
 *
 * 1. **Up axis** — rotate a measurably non-Y-up asset onto +Y. A low-confidence
 *    measurement keeps glTF's Y-up rather than guessing.
 * 2. **Yaw** — turn the footprint's dominant axis onto +X, snapped to a quarter
 *    turn so the mesh is never skewed. This is what brings the Tripo sample
 *    (long axis on Z) into the same orientation as the Rodin sample.
 * 3. **Scale** — uniform, so the longest horizontal extent becomes
 *    `targetExtentMeters`. Uniform only: non-uniform scale would break trimesh
 *    colliders and normals.
 * 4. **Floor alignment** — translate so the lowest vertex sits exactly on
 *    y = 0 and the footprint is centred on the origin, which is where the added
 *    game floor lives.
 *
 * The single `Transform` returned is applied identically by the renderer (to
 * the GLB scene graph) and by physics (via {@link transformTriangleSoup}).
 */
export function normalizeAsset(
  soup: TriangleSoup,
  inspection: GeometryInspection,
  options: NormalizeOptions,
): NormalizationResult {
  const notes: string[] = [];

  const upAxisUsed: Axis =
    options.upAxisOverride ??
    (inspection.upAxis.confidenceRatio >= UP_AXIS_CONFIDENCE_THRESHOLD
      ? inspection.upAxis.detected
      : "y");
  if (options.upAxisOverride) {
    notes.push(
      `Up axis set manually to +${upAxisUsed} (measurement suggested +${inspection.upAxis.detected}).`,
    );
  } else {
    notes.push(inspection.upAxis.notes);
  }
  const upCorrection = upCorrectionQuat(upAxisUsed);
  if (upAxisUsed !== "y") {
    notes.push(`Rotated +${upAxisUsed} onto +Y before any other alignment.`);
  }

  let yaw = 0;
  if (options.alignFootprintToX !== false) {
    const principal = footprintPrincipalYaw(soup, upCorrection);
    yaw = snapYawToQuarterTurn(principal);
    const firstPass = horizontalExtentsAfterYaw(soup, upCorrection, yaw);
    if (firstPass.extentZ > firstPass.extentX) {
      // The principal-axis fit is undirected; add a quarter turn so the long
      // side is definitely on X.
      yaw += Math.PI / 2;
    }
    notes.push(
      `Footprint principal axis measured at ${((principal * 180) / Math.PI).toFixed(1)}°; snapped to a ${((yaw * 180) / Math.PI).toFixed(0)}° yaw so the long side runs along +X. The fit is undirected, so a 180° flip is still a creator choice.`,
    );
  } else {
    notes.push("Footprint yaw alignment disabled; asset yaw left as authored.");
  }
  if (options.extraYawRadians) {
    yaw += options.extraYawRadians;
    notes.push(
      `Creator yaw adjustment of ${((options.extraYawRadians * 180) / Math.PI).toFixed(1)}° applied.`,
    );
  }

  const rotation: Quat = quatMultiply(quatFromYaw(yaw), upCorrection);

  const rotated = rotatedBounds(soup, rotation);
  const longestHorizontal = Math.max(
    rotated.max[0]! - rotated.min[0]!,
    rotated.max[2]! - rotated.min[2]!,
  );
  let uniformScale = 1;
  if (longestHorizontal > 1e-9) {
    uniformScale = options.targetExtentMeters / longestHorizontal;
    notes.push(
      `Scaled by ${uniformScale.toFixed(4)} so the ${longestHorizontal.toFixed(4)}-unit long side becomes ${options.targetExtentMeters} game meters. Generated meshes carry no measured scale; this is a documented game-scale choice.`,
    );
  } else {
    notes.push(
      "Asset has no measurable horizontal extent; scale left at 1 and the level should be treated as unusable.",
    );
  }

  const scaledMin: Vec3 = [
    rotated.min[0]! * uniformScale,
    rotated.min[1]! * uniformScale,
    rotated.min[2]! * uniformScale,
  ];
  const scaledMax: Vec3 = [
    rotated.max[0]! * uniformScale,
    rotated.max[1]! * uniformScale,
    rotated.max[2]! * uniformScale,
  ];
  const position: Vec3 = [
    -(scaledMin[0]! + scaledMax[0]!) / 2,
    -scaledMin[1]!,
    -(scaledMin[2]! + scaledMax[2]!) / 2,
  ];
  notes.push(
    "Floor-aligned: lowest vertex sits on y = 0 and the footprint is centred on the origin, where the added game floor is placed.",
  );

  const transform: Transform = {
    position,
    rotation,
    scale: [uniformScale, uniformScale, uniformScale],
  };
  const normalizedBounds: Bounds = {
    min: [
      scaledMin[0]! + position[0]!,
      scaledMin[1]! + position[1]!,
      scaledMin[2]! + position[2]!,
    ],
    max: [
      scaledMax[0]! + position[0]!,
      scaledMax[1]! + position[1]!,
      scaledMax[2]! + position[2]!,
    ],
  };

  return {
    transform,
    normalizedBounds,
    uniformScale,
    appliedYawRadians: yaw,
    upAxisUsed,
    notes,
  };
}

/** Bounds of every vertex after `rotation`, without allocating a second soup. */
function rotatedBounds(soup: TriangleSoup, rotation: Quat): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const { positions } = soup;
  for (let i = 0; i < soup.triangleCount * 9; i += 3) {
    const [x, y, z] = rotateVectorByQuat(
      [positions[i]!, positions[i + 1]!, positions[i + 2]!],
      rotation,
    );
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (soup.triangleCount === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
