import type { PhotoReference, ProviderCapabilityId, ProviderInputPhoto } from "@shared/index.js";

/**
 * Persists everything needed to survive a reload without ever launching a
 * duplicate generation job or losing source-photo/provenance metadata,
 * across two distinct phases:
 *
 * 1. `PendingSubmission` — saved BEFORE the POST /api/jobs call fires. If the
 *    response never arrives (timeout, tab closed, network drop), the server
 *    may or may not have actually started the job. On reload we must retry
 *    with the SAME idempotencyKey and the SAME already-uploaded photo refs
 *    (never re-upload — that would mint new photo ids under the same key
 *    and could desync from whatever the server already accepted).
 * 2. `ActiveSource` — saved once the POST response confirms a durable job
 *    id (kind "job"), or once a direct GLB import completes (kind
 *    "import"). The SAME record carries the flow all the way from
 *    generation through Preparation: `resultAssetId` starts unset, gets
 *    filled in once the job reaches `ready` (never cleared at that point —
 *    `AssetReference` has no photo refs of its own, so dropping this
 *    record on the ready→Preparation transition would silently lose which
 *    source photos the asset came from). It's only cleared once a level is
 *    actually saved (the photos are then durable inside the saved
 *    SceneManifest) or the user deliberately leaves an unsaved
 *    preparation.
 *
 * The two are mutually exclusive by construction; clearing one never
 * implicitly touches the other.
 */

const PENDING_SUBMISSION_KEY = "objectquest:pendingSubmission";
const ACTIVE_SOURCE_KEY = "objectquest:activeSource";

export interface PendingSubmission {
  idempotencyKey: string;
  capability: ProviderCapabilityId;
  inputPhotos: ProviderInputPhoto[];
  /** Every uploaded photo ref available at submit time (not just the ones
   * included in inputPhotos) so the Photos screen can restore its full
   * gallery without re-uploading anything. */
  photos: PhotoReference[];
}

export type ActiveSource =
  | {
      kind: "job";
      jobId: string;
      /** Carried forward so Preparation can attach real source-photo
       * references and provenance to the resulting manifest. */
      photos: PhotoReference[];
      /** Unset while still generating; set once the job reaches `ready`. */
      resultAssetId?: string;
    }
  | { kind: "import"; assetId: string };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private browsing, quota) — the current session
    // still works, it just won't survive a reload.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadPendingSubmission(): PendingSubmission | null {
  return readJson<PendingSubmission>(PENDING_SUBMISSION_KEY);
}

export function savePendingSubmission(submission: PendingSubmission): void {
  writeJson(PENDING_SUBMISSION_KEY, submission);
}

export function clearPendingSubmission(): void {
  remove(PENDING_SUBMISSION_KEY);
}

export function loadActiveSource(): ActiveSource | null {
  return readJson<ActiveSource>(ACTIVE_SOURCE_KEY);
}

export function saveActiveSource(source: ActiveSource): void {
  writeJson(ACTIVE_SOURCE_KEY, source);
}

export function clearActiveSource(): void {
  remove(ACTIVE_SOURCE_KEY);
}

export type ResumeState =
  | { screen: "preparation"; assetId: string; photos: PhotoReference[] }
  | { screen: "generation"; jobId: string }
  | { screen: "photos"; pending: PendingSubmission }
  | { screen: "start" };

/** Pure decision used on app boot. An ActiveSource always wins over a
 * PendingSubmission: a "job" with a resultAssetId, or an "import", both
 * mean the flow already reached Preparation and should resume there
 * directly rather than re-polling; a "job" without one is still
 * generating and resumes on the Generation screen. */
export function resolveResumeState(): ResumeState {
  const active = loadActiveSource();
  if (active) {
    if (active.kind === "import") {
      return { screen: "preparation", assetId: active.assetId, photos: [] };
    }
    if (active.resultAssetId) {
      return { screen: "preparation", assetId: active.resultAssetId, photos: active.photos };
    }
    return { screen: "generation", jobId: active.jobId };
  }
  const pending = loadPendingSubmission();
  if (pending) {
    return { screen: "photos", pending };
  }
  return { screen: "start" };
}
