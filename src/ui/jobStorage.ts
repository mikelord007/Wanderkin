import type { PhotoReference, ProviderCapabilityId, ProviderInputPhoto } from "@shared/index.js";

/**
 * Persists everything needed to survive a reload without ever launching a
 * duplicate generation job or losing source-photo/provenance metadata,
 * across three distinct phases:
 *
 * 1. `PendingSubmission` — saved BEFORE the POST /api/jobs call fires. If the
 *    response never arrives (timeout, tab closed, network drop), the server
 *    may or may not have actually started the job. On reload we must retry
 *    with the SAME idempotencyKey and the SAME already-uploaded photo refs
 *    (never re-upload — that would mint new photo ids under the same key
 *    and could desync from whatever the server already accepted).
 * 2. `ActiveJob` — saved once the POST response confirms a durable job id.
 *    From here a reload just resumes polling GET /api/jobs/:id.
 * 3. `ActivePreparation` — saved once a job reaches `ready` (or a GLB import
 *    completes) and the flow moves into Preparation, before the user has
 *    saved a level. `AssetReference` (shared/manifest.ts) has no photo
 *    refs of its own, so without this record a reload between "asset
 *    ready" and "level saved" would silently drop which source photos the
 *    asset came from. Cleared once a level is actually saved (the photos
 *    are then durable inside the saved SceneManifest) or the user
 *    deliberately abandons this preparation.
 *
 * Exactly one of the three (or none) should be present at a time; clearing
 * one never implicitly touches the others.
 */

const PENDING_SUBMISSION_KEY = "objectquest:pendingSubmission";
const ACTIVE_JOB_KEY = "objectquest:activeJob";
const ACTIVE_PREPARATION_KEY = "objectquest:activePreparation";

export interface PendingSubmission {
  idempotencyKey: string;
  capability: ProviderCapabilityId;
  inputPhotos: ProviderInputPhoto[];
  /** Every uploaded photo ref available at submit time (not just the ones
   * included in inputPhotos) so the Photos screen can restore its full
   * gallery without re-uploading anything. */
  photos: PhotoReference[];
}

export interface ActiveJob {
  jobId: string;
  /** Carried forward so Preparation can attach real source-photo references
   * and provenance to the resulting manifest once the job is ready. */
  photos: PhotoReference[];
}

export interface ActivePreparation {
  assetId: string;
  /** Same source-photo refs carried over from ActiveJob (empty for a
   * direct GLB import, which has none). */
  photos: PhotoReference[];
}

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

export function loadActiveJob(): ActiveJob | null {
  return readJson<ActiveJob>(ACTIVE_JOB_KEY);
}

export function saveActiveJob(job: ActiveJob): void {
  writeJson(ACTIVE_JOB_KEY, job);
}

export function clearActiveJob(): void {
  remove(ACTIVE_JOB_KEY);
}

export function loadActivePreparation(): ActivePreparation | null {
  return readJson<ActivePreparation>(ACTIVE_PREPARATION_KEY);
}

export function saveActivePreparation(preparation: ActivePreparation): void {
  writeJson(ACTIVE_PREPARATION_KEY, preparation);
}

export function clearActivePreparation(): void {
  remove(ACTIVE_PREPARATION_KEY);
}

export type ResumeState =
  | { screen: "generation"; jobId: string }
  | { screen: "preparation"; preparation: ActivePreparation }
  | { screen: "photos"; pending: PendingSubmission }
  | { screen: "start" };

/** Pure decision used on app boot, most-advanced-phase-first (these are
 * expected to be mutually exclusive by construction — each phase clears
 * the previous one's record on transition — so the ordering below is only
 * a defensive tie-break, not load-bearing in the normal flow):
 * ActivePreparation (closest to a save) beats ActiveJob (still generating)
 * beats an unresolved PendingSubmission (the submission itself is still in
 * doubt). */
export function resolveResumeState(): ResumeState {
  const preparation = loadActivePreparation();
  if (preparation) {
    return { screen: "preparation", preparation };
  }
  const activeJob = loadActiveJob();
  if (activeJob) {
    return { screen: "generation", jobId: activeJob.jobId };
  }
  const pending = loadPendingSubmission();
  if (pending) {
    return { screen: "photos", pending };
  }
  return { screen: "start" };
}
