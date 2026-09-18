import type {
  AssetReference,
  GenerationJob,
  PhotoReference,
  ProviderCapabilityDescriptor,
  ProviderSubmitRequest,
  SceneManifest,
} from "@shared/index.js";

/**
 * Thin fetch wrapper around the server API documented in docs/CONTRACTS.md.
 * Every function here returns normalized shared/* types; nothing upstream of
 * this module should touch a raw provider or job response shape.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (cause) {
    throw new ApiError(
      "Could not reach the ObjectQuest server. Check your connection and try again.",
      0,
      cause,
    );
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const message =
      (body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : null) ?? `Request to ${path} failed (${res.status}).`;
    throw new ApiError(message, res.status, body);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function getCapabilities(): Promise<ProviderCapabilityDescriptor[]> {
  return request<ProviderCapabilityDescriptor[]>("/api/capabilities");
}

export async function uploadPhotos(files: File[]): Promise<PhotoReference[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("photos", file, file.name);
  }
  return request<PhotoReference[]>("/api/uploads", {
    method: "POST",
    body: form,
  });
}

export function submitJob(
  body: ProviderSubmitRequest,
  idempotencyKey: string,
): Promise<GenerationJob> {
  return request<GenerationJob>("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export function getJob(jobId: string): Promise<GenerationJob> {
  return request<GenerationJob>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function retryJob(jobId: string): Promise<GenerationJob> {
  return request<GenerationJob>(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
  });
}

/** For a generated asset, the server additionally returns the ordered
 * source photos it came from (absent for a hand-imported asset via
 * /api/assets/import, which has no provenance). Lets Preparation recover
 * the original photo set from the server alone, without relying on the
 * client's own localStorage record surviving the reload. */
export interface AssetWithSourcePhotos extends AssetReference {
  photos?: PhotoReference[];
}

export interface LevelBundle {
  bundleVersion: 1;
  manifest: SceneManifest;
  assets: { filename: string; base64: string }[];
  photos: { filename: string; base64: string }[];
}

export function getAsset(assetId: string): Promise<AssetWithSourcePhotos> {
  return request<AssetWithSourcePhotos>(`/api/assets/${encodeURIComponent(assetId)}`);
}

export async function importAsset(file: File): Promise<AssetReference> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request<AssetReference>("/api/assets/import", {
    method: "POST",
    body: form,
  });
}

export function listLevels(): Promise<SceneManifest[]> {
  return request<SceneManifest[]>("/api/levels");
}

export function createLevel(manifest: SceneManifest): Promise<SceneManifest> {
  return request<SceneManifest>("/api/levels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
}

export function getLevel(levelId: string): Promise<SceneManifest> {
  return request<SceneManifest>(`/api/levels/${encodeURIComponent(levelId)}`);
}

export function saveLevel(levelId: string, manifest: SceneManifest): Promise<SceneManifest> {
  return request<SceneManifest>(`/api/levels/${encodeURIComponent(levelId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
}

export function exportLevelBundle(levelId: string): Promise<LevelBundle> {
  return request<LevelBundle>(`/api/levels/${encodeURIComponent(levelId)}/export`);
}

export async function importLevelBundle(file: File): Promise<SceneManifest> {
  let body: string;
  try {
    body = await file.text();
  } catch (cause) {
    throw new ApiError("Could not read this level bundle. Choose the file again and retry.", 0, cause);
  }
  return request<SceneManifest>("/api/levels/import", {
    method: "POST",
    // The route intentionally bypasses the global 10 MB JSON parser so a
    // complete bundle can include its GLB and photos as base64.
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });
}

function safeBundleFilename(levelName: string): string {
  const stem = levelName
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${stem || "objectquest-level"}.objectquest.json`;
}

export async function downloadLevelBundle(levelId: string, levelName: string): Promise<void> {
  const bundle = await exportLevelBundle(levelId);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle)], { type: "application/json;charset=utf-8" }),
  );
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeBundleFilename(levelName);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Friendly text for a caught ApiError/Error, never internal stack/code. */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
