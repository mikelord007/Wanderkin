/**
 * GLB loading for the game runtime.
 *
 * TEMPORARY OWNERSHIP NOTE: the shared asset cache/loader belongs to the
 * scene-preparation worker (`src/scene`). This module is a self-contained
 * stand-in so the game runtime is not blocked on it, and is written to the
 * handover shape proposed to the lead — `loadSceneAsset(url, onProgress)`
 * returning a decoded scene plus merged asset-local collision triangles.
 * Swapping to `src/scene`'s implementation should be an import change.
 *
 * Two things matter here beyond "load a file":
 *
 *  - Download and decode are reported as distinct stages with real byte
 *    counts, and `total` is null when the server gives no content length,
 *    so the UI can show an honest indeterminate indicator instead of a
 *    fabricated percentage.
 *  - Collision triangles are extracted from the very meshes that will be
 *    rendered, in asset-local space, so the collider cannot describe
 *    different geometry from the visible furniture.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TriangleSoup } from "../core/soup.js";

export type AssetLoadStage = "downloading" | "decoding";

export interface AssetLoadProgress {
  stage: AssetLoadStage;
  loadedBytes: number;
  /** Null when the server reported no content length. */
  totalBytes: number | null;
}

export interface LoadedSceneAsset {
  url: string;
  /** Decoded asset-local scene. Clone before adding it to a scene graph. */
  scene: THREE.Group;
  /** Merged triangles from every mesh above, in asset-local space. */
  collision: TriangleSoup;
  byteLength: number;
  meshCount: number;
}

const cache = new Map<string, Promise<LoadedSceneAsset>>();
const loader = new GLTFLoader();

/** Drops cached assets. Intended for tests and dev-time reloads. */
export function clearSceneAssetCache(): void {
  cache.clear();
}

export function isSceneAssetCached(url: string): boolean {
  return cache.has(url);
}

/**
 * Loads and decodes a GLB, memoised per URL. Concurrent callers and later
 * remounts (replaying a level) share one in-flight promise rather than
 * downloading the asset again.
 *
 * `onProgress` is only driven by the first caller to request a given URL;
 * a cached hit resolves immediately with no progress events, which is the
 * truthful report — nothing is being downloaded.
 */
export function loadSceneAsset(
  url: string,
  onProgress?: (progress: AssetLoadProgress) => void,
): Promise<LoadedSceneAsset> {
  const cached = cache.get(url);
  if (cached) return cached;

  const pending = loadUncached(url, onProgress).catch((error: unknown) => {
    // A failed load must not poison the cache: the UI offers a retry.
    cache.delete(url);
    throw error;
  });

  cache.set(url, pending);
  return pending;
}

/**
 * Decodes an already-fetched GLB. Exposed separately from `loadSceneAsset`
 * so the scene-preparation worker and the test suite can decode a buffer
 * read from disk without going through `fetch`.
 */
export async function parseSceneAsset(buffer: ArrayBuffer, url: string): Promise<LoadedSceneAsset> {
  const gltf = await loader.parseAsync(buffer, baseDirectory(url)).catch((error: unknown) => {
    throw new Error(`Could not decode level asset: ${describe(error)}`);
  });

  const scene = gltf.scene;
  prepareForRendering(scene);
  const { collision, meshCount } = extractCollision(scene);

  if (meshCount === 0) {
    throw new Error("Level asset contains no meshes.");
  }

  return { url, scene, collision, byteLength: buffer.byteLength, meshCount };
}

async function loadUncached(
  url: string,
  onProgress?: (progress: AssetLoadProgress) => void,
): Promise<LoadedSceneAsset> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download level asset (${response.status} ${response.statusText}).`);
  }

  const header = response.headers.get("content-length");
  const parsedTotal = header === null ? Number.NaN : Number(header);
  const totalBytes = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;

  const buffer = await readBody(response, totalBytes, onProgress);

  onProgress?.({ stage: "decoding", loadedBytes: buffer.byteLength, totalBytes: buffer.byteLength });

  return parseSceneAsset(buffer, url);
}

async function readBody(
  response: Response,
  totalBytes: number | null,
  onProgress?: (progress: AssetLoadProgress) => void,
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();

  if (!reader) {
    // No streaming support: report a single completed download rather than
    // inventing intermediate progress.
    const buffer = await response.arrayBuffer();
    onProgress?.({ stage: "downloading", loadedBytes: buffer.byteLength, totalBytes });
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  onProgress?.({ stage: "downloading", loadedBytes: 0, totalBytes });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.({ stage: "downloading", loadedBytes, totalBytes });
  }

  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function baseDirectory(url: string): string {
  const index = url.lastIndexOf("/");
  return index >= 0 ? url.slice(0, index + 1) : "";
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Generated assets sometimes carry their own cameras and lights; the game
 * provides its own, so they are removed rather than fighting the scene's
 * lighting.
 */
function prepareForRendering(scene: THREE.Group): void {
  const strip: THREE.Object3D[] = [];

  scene.traverse((object) => {
    if ((object as THREE.Light).isLight || (object as THREE.Camera).isCamera) {
      strip.push(object);
      return;
    }
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
    }
  });

  for (const object of strip) object.removeFromParent();
}

function extractCollision(scene: THREE.Group): { collision: TriangleSoup; meshCount: number } {
  scene.updateMatrixWorld(true);

  const positionChunks: Float32Array[] = [];
  const indexChunks: Uint32Array[] = [];
  let vertexTotal = 0;
  let indexTotal = 0;
  let meshCount = 0;

  const vertex = new THREE.Vector3();

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;

    meshCount += 1;

    const count = position.count;
    const vertices = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      vertex.fromBufferAttribute(position as THREE.BufferAttribute, i);
      // Relative to the asset root, not the world: the entity transform is
      // applied later by the collision builder, from manifest data.
      vertex.applyMatrix4(mesh.matrixWorld);
      vertices[i * 3] = vertex.x;
      vertices[i * 3 + 1] = vertex.y;
      vertices[i * 3 + 2] = vertex.z;
    }

    const base = vertexTotal / 3;
    const sourceIndex = geometry.getIndex();
    let indices: Uint32Array;

    if (sourceIndex) {
      indices = new Uint32Array(sourceIndex.count);
      for (let i = 0; i < sourceIndex.count; i += 1) {
        indices[i] = sourceIndex.getX(i) + base;
      }
    } else {
      // Non-indexed geometry is already triangle soup.
      indices = new Uint32Array(count);
      for (let i = 0; i < count; i += 1) indices[i] = i + base;
    }

    positionChunks.push(vertices);
    indexChunks.push(indices);
    vertexTotal += vertices.length;
    indexTotal += indices.length;
  });

  const mergedVertices = new Float32Array(vertexTotal);
  const mergedIndices = new Uint32Array(indexTotal);
  let vOffset = 0;
  let iOffset = 0;

  for (let i = 0; i < positionChunks.length; i += 1) {
    mergedVertices.set(positionChunks[i]!, vOffset);
    mergedIndices.set(indexChunks[i]!, iOffset);
    vOffset += positionChunks[i]!.length;
    iOffset += indexChunks[i]!.length;
  }

  return { collision: { vertices: mergedVertices, indices: mergedIndices }, meshCount };
}
