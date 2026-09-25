import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Transform } from "../../shared/geometry.js";
import { applyTransformToObject3D, extractTrianglesFromObject3D } from "./loader.js";
import { clearSceneAssetCache, createHelperGeometry, loadSceneAsset } from "./runtime.js";
import { helperLocalTriangles } from "./helpers.js";
import { quatFromYaw, transformTriangleSoup } from "./transform.js";

// three's loaders probe `self` when deciding how to decode images; the game
// only ever runs in a browser, where it exists (see the identical shim in
// src/game/assets/sampleAsset.test.ts).
vi.hoisted(() => {
  const globals = globalThis as Record<string, unknown>;
  globals["self"] ??= globalThis;
});

const SAMPLES = path.resolve(__dirname, "../../public/samples");
const KNOWN_RODIN_SHA256 = "c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8";

function expectPositionsClose(actual: Float32Array, expected: Float32Array): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 5);
  }
}

describe("scene runtime geometry", () => {
  it("applies the identical entity transform to rendered and collision triangles", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(0.5, 0.25, -0.75);
    mesh.rotation.y = Math.PI / 6;
    mesh.scale.set(1.5, 0.75, 2);
    const assetScene = new THREE.Group();
    assetScene.add(mesh);

    const assetLocalCollision = extractTrianglesFromObject3D(assetScene);
    const entityTransform: Transform = {
      position: [3, 2, -4],
      rotation: quatFromYaw(Math.PI / 2),
      scale: [2, 2, 2],
    };
    const expectedCollision = transformTriangleSoup(
      assetLocalCollision,
      entityTransform,
    );

    applyTransformToObject3D(assetScene, entityTransform);
    const renderedWorldTriangles = extractTrianglesFromObject3D(assetScene);

    expectPositionsClose(
      renderedWorldTriangles.positions,
      expectedCollision.positions,
    );
  });

  it("builds ramp rendering from the exact wedge triangles used by collision", () => {
    const dimensions: [number, number, number] = [1.2, 0.5, 2.4];
    const geometry = createHelperGeometry("ramp", dimensions);
    const mesh = new THREE.Mesh(geometry);
    const rendered = extractTrianglesFromObject3D(mesh);
    const collision = helperLocalTriangles("ramp", dimensions);

    expect(rendered.triangleCount).toBe(8);
    expectPositionsClose(rendered.positions, collision.positions);
  });
});

describe("loadSceneAsset sha256 propagation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSceneAssetCache();
  });

  /** Serves a real bundled sample's bytes for a given fake URL, exactly like
   * the dev server would, so `loadAsset`'s own download+hash path runs for
   * real instead of being replaced by a shortcut. */
  function stubFetchServing(url: string, filePath: string): void {
    const bytes = readFileSync(filePath);
    vi.stubGlobal("fetch", async (requested: string) => {
      if (requested !== url) throw new Error(`Unexpected fetch of ${requested}`);
      return new Response(bytes, {
        status: 200,
        headers: { "content-length": String(bytes.byteLength) },
      });
    });
  }

  it(
    "returns loadAsset's own hash of the downloaded bytes, matching the known Rodin sample constant",
    async () => {
      const url = "/test-fixtures/rodin-sha-check.glb";
      stubFetchServing(url, path.join(SAMPLES, "rodin.glb"));

      const asset = await loadSceneAsset(url);

      // This is the exact value `materialRegions.ts` keys its Rodin region
      // profile on. Proving loadSceneAsset() reproduces it from the real
      // bytes — not from anything declared — is what closes the gap: a
      // manifest could declare this same value next to entirely different
      // bytes, and only a hash computed here, from what was actually
      // downloaded, can catch that.
      expect(asset.sha256).toBe(KNOWN_RODIN_SHA256);
    },
    20_000,
  );

  it(
    "hashes what was actually downloaded, not the URL or any declared identity",
    async () => {
      // Same manifest-style asset id/URL shape a level could use for either
      // sample; the fetched bytes are Tripo's despite the "rodin-like" URL,
      // standing in for a manifest that declares one hash next to different
      // real bytes. The regression this closes: material-region selection
      // must never trust a declared hash when the real bytes disagree.
      const url = "/test-fixtures/declared-rodin-actually-tripo.glb";
      stubFetchServing(url, path.join(SAMPLES, "tripo.glb"));

      const asset = await loadSceneAsset(url);

      expect(asset.sha256).not.toBe(KNOWN_RODIN_SHA256);
      expect(asset.sha256).not.toBeNull();
    },
    20_000,
  );
});
