import * as THREE from "three";
import type { SceneManifest } from "../../shared/manifest.js";
import { buildCollisionSet, type EntityCollision } from "./collision.js";
import { helperLocalTriangles } from "./helpers.js";
import {
  applyTransformToObject3D,
  clearAssetCache,
  getCachedAsset,
  loadAsset,
  type AssetLoadProgress,
  type LoadedAsset,
} from "./loader.js";
import { toIndexedMesh } from "./transform.js";
import type { TriangleSoup } from "./types.js";

/**
 * Integration surface for the game runtime and the level editor.
 *
 * The rule the whole pipeline is built around: the renderer and the collider
 * consume the *same* geometry with the *same* transform applied. Nothing here
 * re-parses a GLB or keeps a second copy of a transform.
 */

/** Progress shape the game runtime's loading screen consumes. `total` is null
 * when the server sent no usable `Content-Length` — show an indeterminate
 * indicator then, never a made-up percentage. */
export interface SceneAssetProgress {
  stage: "downloading" | "decoding";
  loadedBytes: number;
  totalBytes: number | null;
}

export interface LoadedSceneAsset {
  /** Decoded glTF scene in asset-local space, node transforms already baked.
   * Apply the manifest entity transform with {@link applyTransformToObject3D}. */
  scene: THREE.Group;
  /** Asset-local collision geometry in Rapier trimesh form. Apply the same
   * entity transform the scene gets. */
  collision: { vertices: Float32Array; indices: Uint32Array };
  /**
   * SHA-256 of the bytes actually downloaded and decoded for this asset —
   * {@link LoadedAsset.sha256}, passed through unchanged. `null` where
   * WebCrypto is unavailable (non-secure context).
   *
   * This is the only hash a consumer should ever use to recognise an exact
   * known asset (e.g. selecting a material region profile): it reflects what
   * was actually fetched, not what a manifest's `AssetReference.sha256`
   * merely declares. A manifest can declare any value; only this field is
   * computed from the real bytes.
   */
  sha256: string | null;
}

/**
 * Cached loader for the game runtime.
 *
 * Thin adapter over {@link loadAsset}: same cache, same single download, but
 * shaped to the `{ scene, collision, sha256 }` triple the runtime asked for.
 * `sha256` is {@link loadAsset}'s own hash of the downloaded bytes, passed
 * through unchanged — never recomputed here, and never substituted with a
 * manifest's declared value. The "analyzing" stage is reported as "decoding"
 * because it is part of the same post-download wait from a player's point of
 * view.
 */
export async function loadSceneAsset(
  url: string,
  onProgress?: (progress: SceneAssetProgress) => void,
): Promise<LoadedSceneAsset> {
  const loaded = await loadAsset(
    url,
    onProgress
      ? (progress: AssetLoadProgress) =>
          onProgress({
            stage: progress.stage === "downloading" ? "downloading" : "decoding",
            loadedBytes: progress.loadedBytes,
            totalBytes: progress.totalBytes,
          })
      : undefined,
  );
  return {
    scene: loaded.scene,
    collision: toIndexedMesh(loaded.triangles),
    sha256: loaded.sha256,
  };
}

/** Backward-compatible name for consumers that adopted the earlier draft. */
export type SceneAsset = LoadedSceneAsset;

/** Runtime-facing cache controls mirror the temporary game loader API. */
export function clearSceneAssetCache(url?: string): void {
  clearAssetCache(url);
}

export function isSceneAssetCached(url: string): boolean {
  return getCachedAsset(url) !== null;
}

/** Loads every asset a manifest references, in parallel, sharing the cache
 * with anything already loaded. */
export async function loadManifestAssets(
  manifest: SceneManifest,
  onProgress?: (assetId: string, progress: AssetLoadProgress) => void,
): Promise<Map<string, LoadedAsset>> {
  const entries = await Promise.all(
    manifest.assets.map(async (asset) => {
      const loaded = await loadAsset(asset.url, (progress) =>
        onProgress?.(asset.id, progress),
      );
      return [asset.id, loaded] as const;
    }),
  );
  return new Map(entries);
}

/**
 * World-space collision for every entity in a level, ready for Rapier
 * trimesh/cuboid colliders.
 *
 * Generated meshes come from the loaded GLB with the entity transform baked
 * in; helper floors, boxes, and ramps come from the same eight/twelve
 * triangles the helper renderer draws.
 */
export function buildManifestCollision(
  manifest: SceneManifest,
  assets: ReadonlyMap<string, LoadedAsset>,
): EntityCollision[] {
  const geometry = new Map<string, TriangleSoup>();
  for (const [assetId, loaded] of assets) {
    geometry.set(assetId, loaded.triangles);
  }
  return buildCollisionSet(manifest, geometry);
}

/**
 * Renderable geometry for a helper entity, built from the *same* triangles as
 * its collider. A separate visual mesh could disagree with the collider; this
 * cannot.
 */
export function createHelperGeometry(
  kind: "floor" | "box" | "ramp",
  dimensions: readonly [number, number, number],
): THREE.BufferGeometry {
  const soup = helperLocalTriangles(kind, [
    dimensions[0],
    dimensions[1],
    dimensions[2],
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      soup.positions.slice(0, soup.triangleCount * 9),
      3,
    ),
  );
  // Flat shading: the triangles are independent, so per-face normals are the
  // honest answer and make a ramp's slope read clearly.
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds the renderable scene graph for a whole level: the generated mesh
 * under its manifest transform, plus a mesh per helper entity. Materials are
 * left to the caller so the game and the editor can style them differently.
 */
export function buildManifestScene(
  manifest: SceneManifest,
  assets: ReadonlyMap<string, LoadedAsset>,
  options: {
    helperMaterial?: THREE.Material;
    cloneAssetScene?: boolean;
  } = {},
): THREE.Group {
  const root = new THREE.Group();
  root.name = `level:${manifest.levelId}`;

  for (const entity of manifest.entities) {
    const container = new THREE.Group();
    container.name = entity.id;
    if (entity.kind === "generated-mesh") {
      const loaded = assets.get(entity.assetId);
      if (!loaded) continue;
      container.add(
        options.cloneAssetScene === false
          ? loaded.scene
          : loaded.scene.clone(true),
      );
    } else {
      const geometry = createHelperGeometry(entity.kind, entity.dimensions);
      const material =
        options.helperMaterial ??
        new THREE.MeshStandardMaterial({ color: 0x9aa7bd, roughness: 0.85 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${entity.id}:mesh`;
      container.add(mesh);
    }
    applyTransformToObject3D(container, entity.transform);
    root.add(container);
  }
  return root;
}
