/**
 * Checks every bundled sample course against its real geometry.
 *
 *   npx tsx src/scene/tools/verify-samples.ts
 *
 * Loads each manifest's GLB from `public/`, builds the same world-space
 * collision the game runtime will build, and runs the conservative
 * walk/jump/mantle validator over spawn → checkpoint 1 → … → checkpoint N.
 * Exits non-zero if any leg has no route, so an authored course cannot
 * silently rot when the movement config or the mesh changes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_MOVEMENT_CONFIG } from "../../../shared/movement.js";
import { validateManifestCourse } from "../course.js";
import { extractGlbTriangles } from "../glb.js";
import { SAMPLE_LEVELS } from "../samples.js";
import { surfaceFromCenter } from "../surfaces.js";
import type { TriangleSoup } from "../types.js";

let failures = 0;

for (const manifest of SAMPLE_LEVELS) {
  console.log(`\n=== ${manifest.levelId} (${manifest.name})`);
  const assetGeometry = new Map<string, TriangleSoup>();
  for (const asset of manifest.assets) {
    const file = readFileSync(path.join("public", asset.url.replace(/^\//, "")));
    if (file.byteLength !== asset.sizeBytes) {
      console.log(
        `  ! ${asset.url} is ${file.byteLength} bytes, manifest says ${asset.sizeBytes}`,
      );
      failures += 1;
    }
    const buffer = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
    assetGeometry.set(asset.id, extractGlbTriangles(buffer));
  }

  const started = Date.now();
  const { validation, report, surfaces } = validateManifestCourse(
    manifest,
    assetGeometry,
    DEFAULT_MOVEMENT_CONFIG,
  );
  console.log(
    `  surfaces: ${surfaces.standable.length} standable of ${surfaces.patches.length} (${Date.now() - started} ms)`,
  );

  const waypoints = [
    surfaceFromCenter(manifest.spawn.position, DEFAULT_MOVEMENT_CONFIG),
    ...[...manifest.checkpoints]
      .sort((a, b) => a.order - b.order)
      .map((checkpoint) =>
        surfaceFromCenter(checkpoint.position, DEFAULT_MOVEMENT_CONFIG),
      ),
  ];
  report.segments.forEach((segment, index) => {
    const from = waypoints[index]!;
    const to = waypoints[index + 1]!;
    const kinds = segment.transitions.map((transition) => transition.kind);
    const summary = segment.reachable
      ? `${segment.transitions.length} transitions (${kinds.filter((k) => k === "walk").length}w ${kinds.filter((k) => k === "jump").length}j ${kinds.filter((k) => k === "mantle").length}m)`
      : `UNREACHABLE — ${segment.failureReason}`;
    console.log(
      `  leg ${index}: ${fmt(from)} → ${fmt(to)}  ${segment.reachable ? "ok" : "FAIL"}  ${summary}`,
    );
    if (!segment.reachable) failures += 1;
  });

  const elevated = manifest.checkpoints.filter(
    (checkpoint) =>
      surfaceFromCenter(checkpoint.position, DEFAULT_MOVEMENT_CONFIG)[1] > 0.5,
  );
  console.log(`  checkpoints: ${manifest.checkpoints.length}, elevated: ${elevated.length}`);
  if (elevated.length === 0) {
    console.log("  ! no checkpoint on an elevated furniture surface");
    failures += 1;
  }
  console.log(`  validation: ${validation.status}`);
  console.log(`  evidence:   ${validation.evidence}`);
}

function fmt(v: readonly number[]): string {
  return `(${v.map((n) => n.toFixed(2)).join(", ")})`;
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log("\nAll sample courses reachable under the conservative validator.");
