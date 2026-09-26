import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG } from "@shared/index.js";
import { capsuleHeight, toMiniatureScale } from "../game/core/characterScale.js";
import { analyzeManifest, assetGeometryFromLoaded, raycastDown } from "./geometry.js";
import { sampleScanFixture } from "./geometryFixtures.js";
import { GROUND_MAX_CELLS, groundAt } from "./groundHeights.js";
import { prepareBiomeLayout } from "./placement.js";
import { getBiomeDefinition } from "./presets.js";

const RUNTIME = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);
const BODY = capsuleHeight(RUNTIME);

describe("rain ground heights on the real scans", () => {
  for (const id of ["sample-rodin-room-corner", "sample-tripo-room-corner"]) {
    it(`${id}: baked for Monsoon only, bounded, and matching the collision surface`, () => {
      const fixture = sampleScanFixture(id, true);
      const input = { manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, seed: "rain", quality: "standard" as const };
      const started = performance.now();
      const layout = prepareBiomeLayout({ ...input, definition: getBiomeDefinition("monsoon") });
      const elapsed = performance.now() - started;
      const ground = layout.ground!;
      expect(ground).toBeTruthy();
      expect(ground.cols).toBeLessThanOrEqual(GROUND_MAX_CELLS);
      expect(ground.rows).toBeLessThanOrEqual(GROUND_MAX_CELLS);
      expect(ground.unit).toBeCloseTo(BODY, 9);
      // The whole layout (props, patches, water and heights) stays interactive.
      expect(elapsed).toBeLessThan(1500);
      // Spot-check cells against a fresh ray down the same collision.
      const analysis = analyzeManifest(fixture.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
      const out = { height: 0, splash: false };
      let covered = 0;
      for (let row = 3; row < ground.rows; row += 17) {
        for (let col = 5; col < ground.cols; col += 13) {
          const x = ground.origin[0] + (col + 0.5) * ground.cell;
          const z = ground.origin[1] + (row + 0.5) * ground.cell;
          const hit = raycastDown(analysis.grid, [x, analysis.grid.bounds.max[1] + 1, z], 100);
          groundAt(ground, x, z, out);
          if (!hit) {
            expect(Number.isNaN(out.height)).toBe(true);
            continue;
          }
          expect(out.height).toBeCloseTo(hit.point[1], 4);
          covered += 1;
        }
      }
      expect(covered).toBeGreaterThan(10);
      // Other looks never pay for it.
      for (const other of ["tropical", "alpine", "original"] as const) {
        expect(prepareBiomeLayout({ ...input, definition: getBiomeDefinition(other) }).ground ?? null).toBeNull();
      }
    });
  }
});
