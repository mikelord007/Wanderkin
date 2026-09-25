/**
 * Game-facing exports for the shared scene asset loader.
 *
 * Production loads, cache state, progress, decoded render geometry and
 * collision all come directly from `src/scene`. The buffer-only parser below
 * remains solely for the bundled-GLB fixture tests, which intentionally avoid
 * network I/O.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  clearSceneAssetCache,
  extractGlbTriangles,
  isSceneAssetCached,
  loadSceneAsset,
  toIndexedMesh,
  type LoadedSceneAsset as SharedLoadedSceneAsset,
  type SceneAssetProgress,
} from "../../scene/index.js";

export {
  clearSceneAssetCache,
  isSceneAssetCached,
  loadSceneAsset,
};

export type AssetLoadStage = SceneAssetProgress["stage"];
export type AssetLoadProgress = SceneAssetProgress;
export type LoadedSceneAsset = SharedLoadedSceneAsset;

/** Richer result used only by the offline sample-asset tests. */
export interface ParsedSceneAsset extends SharedLoadedSceneAsset {
  url: string;
  byteLength: number;
  meshCount: number;
}

/**
 * Decodes already-fetched fixture bytes without entering the shared URL cache.
 * Collision uses the same GLB extraction and indexing path as production.
 */
export async function parseSceneAsset(
  buffer: ArrayBuffer,
  url: string,
): Promise<ParsedSceneAsset> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(buffer, baseDirectory(url)).catch((error: unknown) => {
    throw new Error(`Could not decode level asset: ${describe(error)}`);
  });

  let meshCount = 0;
  gltf.scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshCount += 1;
  });
  if (meshCount === 0) throw new Error("Level asset contains no meshes.");

  const collision = toIndexedMesh(extractGlbTriangles(buffer));
  if (collision.indices.length === 0) {
    throw new Error("Level asset contains no collision triangles.");
  }

  return {
    url,
    scene: gltf.scene,
    collision,
    // This fixture-only parser decodes an already-in-memory buffer and
    // never goes through the network loader's hashing step, so it has no
    // downloaded-bytes hash to report — never fabricate or approximate one.
    sha256: null,
    byteLength: buffer.byteLength,
    meshCount,
  };
}

function baseDirectory(url: string): string {
  const index = url.lastIndexOf("/");
  return index >= 0 ? url.slice(0, index + 1) : "";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
