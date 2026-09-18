/**
 * Offline geometry report for a bundled sample GLB.
 *
 * This is the tool the authored sample courses in `src/scene/samples.ts` were
 * written from: it prints the real normalized bounds, the standable surface
 * tiers, and the largest usable platform in each tier, so checkpoints are
 * placed on measured geometry instead of guessed coordinates.
 *
 *   npx tsx src/scene/tools/analyze-sample.ts public/samples/rodin.glb
 */
import { readFileSync } from "node:fs";
import { DEFAULT_ASSUMED_EXTENT_METERS } from "../../../shared/manifest.js";
import { DEFAULT_MOVEMENT_CONFIG } from "../../../shared/movement.js";
import { extractGlbTriangles } from "../glb.js";
import { inspectGeometry } from "../inspect.js";
import { normalizeAsset } from "../normalize.js";
import { createGameFloor, helperEntityTriangles } from "../helpers.js";
import { planCourse } from "../course.js";
import { mergeTriangleSoups, transformTriangleSoup } from "../transform.js";
import {
  defaultSurfaceOptions,
  sampleSurfaces,
  type SurfacePatch,
} from "../surfaces.js";

const path = process.argv[2]!;
if (!path) {
  console.error("usage: tsx src/scene/tools/analyze-sample.ts <file.glb>");
  process.exit(1);
}

const file = readFileSync(path);
const buffer = file.buffer.slice(
  file.byteOffset,
  file.byteOffset + file.byteLength,
) as ArrayBuffer;

const soup = extractGlbTriangles(buffer);
const inspection = inspectGeometry(soup);
console.log(`# ${path}`);
console.log(`bytes                ${file.byteLength}`);
console.log(`triangles            ${inspection.triangleCount} (${inspection.degenerateTriangleCount} degenerate)`);
console.log(`raw bounds min       ${fmt(inspection.bounds.min)}`);
console.log(`raw bounds max       ${fmt(inspection.bounds.max)}`);
console.log(`raw extents          ${fmt(inspection.extents)}`);
console.log(`area-weighted centre ${fmt(inspection.centroid)}`);
console.log(`total surface area   ${inspection.totalArea.toFixed(4)}`);
console.log(`up axis              ${inspection.upAxis.detected} (ratio ${inspection.upAxis.confidenceRatio.toFixed(2)})`);
console.log(`  fractions          x=${pct(inspection.upAxis.positiveAreaFraction.x)} y=${pct(inspection.upAxis.positiveAreaFraction.y)} z=${pct(inspection.upAxis.positiveAreaFraction.z)}`);
console.log(`  ${inspection.upAxis.notes}`);
console.log(`footprint yaw        ${deg(inspection.footprintPrincipalYawRadians)}`);
console.log(`longest horizontal   ${inspection.longestHorizontalExtent.toFixed(4)}`);

const normalization = normalizeAsset(soup, inspection, {
  targetExtentMeters: DEFAULT_ASSUMED_EXTENT_METERS,
});
console.log(`\n## normalization`);
console.log(`yaw applied          ${deg(normalization.appliedYawRadians)}`);
console.log(`uniform scale        ${normalization.uniformScale.toFixed(6)}`);
console.log(`transform.position   ${fmt(normalization.transform.position)}`);
console.log(`transform.rotation   ${fmt4(normalization.transform.rotation)}`);
console.log(`normalized min       ${fmt(normalization.normalizedBounds.min)}`);
console.log(`normalized max       ${fmt(normalization.normalizedBounds.max)}`);
for (const note of normalization.notes) console.log(`  - ${note}`);

const world = transformTriangleSoup(soup, normalization.transform);
const floor = createGameFloor({ bounds: normalization.normalizedBounds });
const collision = mergeTriangleSoups([world, helperEntityTriangles(floor)]);

const options = defaultSurfaceOptions(DEFAULT_MOVEMENT_CONFIG);
const started = Date.now();
const surfaces = sampleSurfaces(collision, options);
console.log(`\n## surfaces (cell ${options.cellSize} m, ${Date.now() - started} ms)`);
console.log(`patches              ${surfaces.patches.length}`);
console.log(`standable            ${surfaces.standable.length}`);
console.log(`rejected             too-small ${surfaces.rejectedCounts["too-small"]}, unsupported ${surfaces.rejectedCounts.unsupported}, no-headroom ${surfaces.rejectedCounts["no-headroom"]}`);

const tiers = clusterByHeight(surfaces.standable, 0.15);
console.log(`\n## standable height tiers`);
for (const tier of tiers) {
  const cluster = largestCluster(tier.patches, options.cellSize);
  const ys = cluster.patches.map((patch) => patch.point[1]!);
  console.log(
    `y ≈ ${tier.height.toFixed(3)}  patches ${String(tier.patches.length).padStart(4)}  area ${tier.area.toFixed(2)} m²  ` +
      `largest contiguous ${String(cluster.patches.length).padStart(3)} cells centred ${fmt(cluster.center)} ` +
      `(x ${cluster.minX.toFixed(2)}..${cluster.maxX.toFixed(2)}, z ${cluster.minZ.toFixed(2)}..${cluster.maxZ.toFixed(2)}, ` +
      `y ${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)})`,
  );
  // The most interior cells of the cluster make the safest checkpoint anchors:
  // they have full neighbour support and the most headroom.
  const anchors = [...cluster.patches]
    .sort(
      (a, b) =>
        b.supportNeighbors - a.supportNeighbors ||
        b.clearanceHeight - a.clearanceHeight ||
        b.area - a.area,
    )
    .slice(0, 6);
  for (const anchor of anchors) {
    console.log(
      `      anchor ${fmt(anchor.point)} support ${anchor.supportNeighbors}/8 clearance ${anchor.clearanceHeight.toFixed(2)} area ${anchor.area.toFixed(3)}`,
    );
  }
}

const planStarted = Date.now();
const plan = planCourse(collision, {
  movement: DEFAULT_MOVEMENT_CONFIG,
  seed: `analyze:${path}`,
  checkpointCount: 5,
});
console.log(`\n## generic course plan (${Date.now() - planStarted} ms)`);
console.log(`spawn                ${fmt(plan.spawn.position)} heading ${deg(plan.spawn.headingRadians)}`);
console.log(`reachable patches    ${plan.diagnostics.reachablePatches} of ${plan.diagnostics.standablePatches}`);
console.log(`helpers added        ${plan.diagnostics.helpersAdded.join(", ") || "(none)"}`);
for (const helper of plan.helpers) {
  console.log(`  ${helper.id} ${helper.kind} dims ${fmt(helper.dimensions)} at ${fmt(helper.transform.position)} rot ${fmt4(helper.transform.rotation)}`);
}
for (const checkpoint of plan.checkpoints) {
  console.log(`  ${checkpoint.id} ${fmt(checkpoint.position)} r=${checkpoint.triggerRadius.toFixed(2)}`);
}
console.log(`validation           ${plan.validation.status}`);
console.log(`  method             ${plan.validation.method}`);
console.log(`  evidence           ${plan.validation.evidence}`);
for (const note of plan.diagnostics.notes) console.log(`  note: ${note}`);
console.log(`  tiers reachable    ${plan.diagnostics.tiers.map((tier) => `${tier.height}:${tier.reachable}/${tier.patches}`).join("  ")}`);

function clusterByHeight(
  patches: readonly SurfacePatch[],
  tolerance: number,
): { height: number; patches: SurfacePatch[]; area: number }[] {
  const sorted = [...patches].sort((a, b) => a.point[1]! - b.point[1]!);
  const tiers: { height: number; patches: SurfacePatch[]; area: number }[] = [];
  for (const patch of sorted) {
    const last = tiers[tiers.length - 1]!;
    if (last && patch.point[1]! - last.patches[last.patches.length - 1]!.point[1]! <= tolerance) {
      last.patches.push(patch);
      last.area += patch.area;
      last.height = (last.height + patch.point[1]!) / 2;
    } else {
      tiers.push({ height: patch.point[1]!, patches: [patch], area: patch.area });
    }
  }
  return tiers.filter((tier) => tier.patches.length >= 3).reverse();
}

function largestCluster(patches: SurfacePatch[], cellSize: number) {
  const key = (patch: SurfacePatch) => `${patch.cellX}:${patch.cellZ}`;
  const remaining = new Map(patches.map((patch) => [key(patch), patch]));
  let best: SurfacePatch[] = [];
  while (remaining.size > 0) {
    const [firstKey] = remaining.keys();
    const seed = remaining.get(firstKey) as SurfacePatch;
    remaining.delete(firstKey);
    const group = [seed];
    const queue = [seed];
    while (queue.length > 0) {
      const current = queue.pop() as SurfacePatch;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const neighborKey = `${current.cellX + dx}:${current.cellZ + dz}`;
          const neighbor = remaining.get(neighborKey);
          if (!neighbor) continue;
          if (Math.abs(neighbor.point[1]! - current.point[1]!) > cellSize) continue;
          remaining.delete(neighborKey);
          group.push(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  const xs = best.map((patch) => patch.point[0]!);
  const zs = best.map((patch) => patch.point[2]!);
  const ys = best.map((patch) => patch.point[1]!);
  return {
    patches: best,
    center: [avg(xs), avg(ys), avg(zs)] as const,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function fmt(v: readonly number[]): string {
  return `[${v.map((n) => n.toFixed(4)).join(", ")}]`;
}
function fmt4(v: readonly number[]): string {
  return `[${v.map((n) => n.toFixed(6)).join(", ")}]`;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function deg(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(2)}°`;
}
