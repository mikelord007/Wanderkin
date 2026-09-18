import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "../../shared/movement.js";
import { buildCollisionSet } from "./collision.js";
import { validateManifestCourse } from "./course.js";
import { extractGlbTriangles } from "./glb.js";
import { SAMPLE_LEVELS } from "./samples.js";
import { TriangleGrid } from "./spatial.js";
import { surfaceFromCenter } from "./surfaces.js";
import type { TriangleSoup } from "./types.js";

function readAsset(url: string): { bytes: Buffer; triangles: TriangleSoup } {
  const bytes = readFileSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return { bytes, triangles: extractGlbTriangles(buffer) };
}

describe("bundled sample manifests", () => {
  it.each(SAMPLE_LEVELS)("$levelId has an intact, conservative five-checkpoint course", (manifest) => {
    const assetGeometry = new Map<string, TriangleSoup>();
    for (const asset of manifest.assets) {
      const loaded = readAsset(asset.url);
      expect(loaded.bytes.byteLength).toBe(asset.sizeBytes);
      expect(createHash("sha256").update(loaded.bytes).digest("hex")).toBe(asset.sha256);
      assetGeometry.set(asset.id, loaded.triangles);
    }

    expect(manifest.checkpoints).toHaveLength(5);
    expect(manifest.entities.some((entity) => entity.kind === "generated-mesh")).toBe(true);
    expect(manifest.entities.some((entity) => entity.kind === "floor" && entity.addedBy === "game")).toBe(true);

    const { validation, report } = validateManifestCourse(
      manifest,
      assetGeometry,
      DEFAULT_MOVEMENT_CONFIG,
    );
    expect(validation.status).toBe("validated");
    expect(report.segments).toHaveLength(manifest.checkpoints.length);
    expect(report.segments.every((segment) => segment.reachable)).toBe(true);
    expect(
      report.segments.some((segment) =>
        segment.transitions.some((transition) => transition.kind === "mantle"),
      ),
    ).toBe(true);

    const generatedOnly = buildCollisionSet(
      {
        ...manifest,
        entities: manifest.entities.filter((entity) => entity.kind === "generated-mesh"),
      },
      assetGeometry,
    );
    expect(generatedOnly).toHaveLength(1);
    const grid = new TriangleGrid(generatedOnly[0]!.triangles, 0.36);
    const elevated = manifest.checkpoints.filter(
      (checkpoint) =>
        surfaceFromCenter(checkpoint.position, DEFAULT_MOVEMENT_CONFIG)[1] > 0.5,
    );
    expect(elevated.length).toBeGreaterThan(0);
    expect(
      elevated.some((checkpoint) => {
        const surface = surfaceFromCenter(
          checkpoint.position,
          DEFAULT_MOVEMENT_CONFIG,
        );
        return grid.intersectsBox(
          [surface[0] - 0.18, surface[1] - 0.03, surface[2] - 0.18],
          [surface[0] + 0.18, surface[1] + 0.03, surface[2] + 0.18],
        );
      }),
    ).toBe(true);
  });
});
