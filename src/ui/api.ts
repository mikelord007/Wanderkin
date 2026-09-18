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

export function getAsset(assetId: string): Promise<AssetReference> {
  return request<AssetReference>(`/api/assets/${encodeURIComponent(assetId)}`);
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
