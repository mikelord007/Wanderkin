import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Transform } from "../../shared/geometry.js";
import { extractGlbTriangles } from "./glb.js";
import { inspectGeometry } from "./inspect.js";
import type { GeometryInspection, TriangleSoup } from "./types.js";

/**
 * Stages the UI must keep distinct. Downloading bytes, decoding the glTF, and
 * analyzing geometry are genuinely different waits — collapsing them into one
 * bar would misreport progress.
 */
export type AssetLoadStage = "downloading" | "decoding" | "analyzing";

export interface AssetLoadProgress {
  stage: AssetLoadStage;
  /** Bytes received so far. Only meaningful during "downloading". */
  loadedBytes: number;
  /**
   * Total size, when the server sent a usable `Content-Length`. `null` means
   * the total is genuinely unknown and the UI must show an indeterminate
   * indicator rather than inventing a percentage.
   */
  totalBytes: number | null;
  /** 0..1, present only when `totalBytes` is known. */
  ratio: number | null;
}

export type AssetProgressListener = (progress: AssetLoadProgress) => void;

export interface LoadedAsset {
  readonly url: string;
  readonly sizeBytes: number;
  /** SHA-256 of the downloaded bytes, or `null` where WebCrypto is
   * unavailable (non-secure context). Feeds `AssetReference.sha256`. */
  readonly sha256: string | null;
  /**
   * The decoded glTF scene in **asset-local** space — no normalization baked
   * in. Apply the manifest entity `Transform` with
   * {@link applyTransformToObject3D} so the rendered mesh and the collider
   * come from the same numbers.
   */
  readonly scene: THREE.Group;
  /** Asset-local triangles, node transforms already baked. */
  readonly triangles: TriangleSoup;
  readonly inspection: GeometryInspection;
}

export class AssetLoadError extends Error {
  readonly url: string;
  readonly stage: AssetLoadStage;
  constructor(url: string, stage: AssetLoadStage, message: string) {
    super(message);
    this.name = "AssetLoadError";
    this.url = url;
    this.stage = stage;
  }
}

interface CacheEntry {
  promise: Promise<LoadedAsset>;
  listeners: Set<AssetProgressListener>;
  latest: AssetLoadProgress;
  settled: boolean;
  value: LoadedAsset | null;
}

const cache = new Map<string, CacheEntry>();

/** Already-loaded asset for `url`, or `null`. Lets the game runtime reuse the
 * geometry scene preparation already parsed instead of fetching again. */
export function getCachedAsset(url: string): LoadedAsset | null {
  return cache.get(url)?.value ?? null;
}

/** Drops cached assets. Pass a url to evict one; omit to clear everything. */
export function clearAssetCache(url?: string): void {
  if (url === undefined) {
    cache.clear();
    return;
  }
  cache.delete(url);
}

/**
 * Downloads, decodes, and inspects a GLB, caching by URL.
 *
 * Concurrent callers share one download; late subscribers immediately receive
 * the current stage so a second screen never shows a stalled progress bar. A
 * failed load is evicted from the cache so a retry actually retries.
 */
export function loadAsset(
  url: string,
  onProgress?: AssetProgressListener,
): Promise<LoadedAsset> {
  const existing = cache.get(url);
  if (existing) {
    if (onProgress) {
      onProgress(existing.latest);
      if (!existing.settled) {
        existing.listeners.add(onProgress);
      }
    }
    return existing.promise;
  }

  const entry: CacheEntry = {
    promise: null as unknown as Promise<LoadedAsset>,
    listeners: new Set(onProgress ? [onProgress] : []),
    latest: {
      stage: "downloading",
      loadedBytes: 0,
      totalBytes: null,
      ratio: null,
    },
    settled: false,
    value: null,
  };
  const report = (progress: AssetLoadProgress): void => {
    entry.latest = progress;
    for (const listener of entry.listeners) listener(progress);
  };

  entry.promise = performLoad(url, report)
    .then((asset) => {
      entry.settled = true;
      entry.value = asset;
      entry.listeners.clear();
      return asset;
    })
    .catch((error: unknown) => {
      cache.delete(url); // a retry must be able to start a fresh download
      entry.settled = true;
      entry.listeners.clear();
      throw error;
    });
  cache.set(url, entry);
  return entry.promise;
}

async function performLoad(
  url: string,
  report: (progress: AssetLoadProgress) => void,
): Promise<LoadedAsset> {
  const bytes = await downloadBytes(url, report);

  report({
    stage: "decoding",
    loadedBytes: bytes.byteLength,
    totalBytes: bytes.byteLength,
    ratio: null,
  });
  const scene = await decodeGlb(url, bytes);

  report({
    stage: "analyzing",
    loadedBytes: bytes.byteLength,
    totalBytes: bytes.byteLength,
    ratio: null,
  });
  let triangles: TriangleSoup;
  try {
    triangles = extractGlbTriangles(bytes);
  } catch (error) {
    throw new AssetLoadError(
      url,
      "analyzing",
      `Could not read collision geometry: ${(error as Error).message}`,
    );
  }
  if (triangles.triangleCount === 0) {
    throw new AssetLoadError(
      url,
      "analyzing",
      "Asset contains no triangles, so it has no surfaces to stand on.",
    );
  }
  const inspection = inspectGeometry(triangles);
  const sha256 = await hashBytes(bytes);

  return {
    url,
    sizeBytes: bytes.byteLength,
    sha256,
    scene,
    triangles,
    inspection,
  };
}

async function downloadBytes(
  url: string,
  report: (progress: AssetLoadProgress) => void,
): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new AssetLoadError(
      url,
      "downloading",
      `Network request failed: ${(error as Error).message}`,
    );
  }
  if (!response.ok) {
    throw new AssetLoadError(
      url,
      "downloading",
      `Server responded ${response.status} ${response.statusText}.`,
    );
  }

  const header = response.headers.get("content-length");
  const parsedTotal = header === null ? Number.NaN : Number.parseInt(header, 10);
  // A known total is the only case where a percentage is honest. Chunked or
  // compressed transfers report no usable length, and we must not fake one.
  const totalBytes =
    Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;

  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    report({ stage: "downloading", loadedBytes: 0, totalBytes, ratio: null });
    const buffer = await response.arrayBuffer();
    report({
      stage: "downloading",
      loadedBytes: buffer.byteLength,
      totalBytes: totalBytes ?? buffer.byteLength,
      ratio: 1,
    });
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  report({ stage: "downloading", loadedBytes: 0, totalBytes, ratio: totalBytes ? 0 : null });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loadedBytes += value.byteLength;
    report({
      stage: "downloading",
      loadedBytes,
      totalBytes,
      ratio: totalBytes ? Math.min(1, loadedBytes / totalBytes) : null,
    });
  }

  const merged = new Uint8Array(loadedBytes);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return merged.buffer;
}

async function decodeGlb(
  url: string,
  bytes: ArrayBuffer,
): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const resourcePath = url.slice(0, url.lastIndexOf("/") + 1);
  try {
    const gltf = await loader.parseAsync(bytes, resourcePath);
    return gltf.scene;
  } catch (error) {
    throw new AssetLoadError(
      url,
      "decoding",
      `glTF decode failed: ${(error as Error).message}`,
    );
  }
}

async function hashBytes(bytes: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/** Applies a manifest `Transform` to a three.js object. The renderer must use
 * this rather than setting position/rotation/scale ad hoc, so the visible mesh
 * matches {@link transformTriangleSoup}'s collider exactly. */
export function applyTransformToObject3D(
  object: THREE.Object3D,
  transform: Transform,
): void {
  object.position.set(
    transform.position[0],
    transform.position[1],
    transform.position[2],
  );
  object.quaternion.set(
    transform.rotation[0],
    transform.rotation[1],
    transform.rotation[2],
    transform.rotation[3],
  );
  object.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
  object.updateMatrixWorld(true);
}

/**
 * Pulls world-space triangles out of an arbitrary three.js object graph.
 *
 * `loadAsset` already returns triangles for GLB assets; this is the escape
 * hatch for geometry that only exists as three.js objects (procedural helper
 * meshes, editor previews) and needs a matching collider.
 */
export function extractTrianglesFromObject3D(
  root: THREE.Object3D,
): TriangleSoup {
  root.updateMatrixWorld(true);
  const chunks: Float32Array[] = [];
  let triangleCount = 0;
  const vertex = new THREE.Vector3();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const usable = Math.floor(count / 3) * 3;
    const out = new Float32Array(usable * 3);
    for (let i = 0; i < usable; i += 1) {
      const vi = index ? index.getX(i) : i;
      vertex
        .fromBufferAttribute(position as THREE.BufferAttribute, vi)
        .applyMatrix4(mesh.matrixWorld);
      out[i * 3] = vertex.x;
      out[i * 3 + 1] = vertex.y;
      out[i * 3 + 2] = vertex.z;
    }
    chunks.push(out);
    triangleCount += usable / 3;
  });

  const positions = new Float32Array(triangleCount * 9);
  let cursor = 0;
  for (const chunk of chunks) {
    positions.set(chunk, cursor);
    cursor += chunk.length;
  }
  return { positions, triangleCount };
}
