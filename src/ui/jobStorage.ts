import type { PhotoReference, ProviderCapabilityId, ProviderInputPhoto } from "@shared/index.js";

/**
 * Persists everything needed to survive a reload without ever launching a
 * duplicate generation job, across two distinct phases:
 *
 * 1. `PendingSubmission` — saved BEFORE the POST /api/jobs call fires. If the
 *    response never arrives (timeout, tab closed, network drop), the server
 *    may or may not have actually started the job. On reload we must retry
 *    with the SAME idempotencyKey and the SAME already-uploaded photo refs
 *    (never re-upload — that would mint new photo ids under the same key
 *    and could desync from whatever the server already accepted).
 * 2. `ActiveJob` — saved once the POST response confirms a durable job id.
 *    From here a reload just resumes polling GET /api/jobs/:id.
 *
 * Exactly one of the two (or neither) should be present at a time; clearing
 * one never implicitly touches the other.
 */

const PENDING_SUBMISSION_KEY = "objectquest:pendingSubmission";
const ACTIVE_JOB_KEY = "objectquest:activeJob";

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

export type ResumeState =
  | { screen: "generation"; jobId: string }
  | { screen: "photos"; pending: PendingSubmission }
  | { screen: "start" };

/** Pure decision used on app boot: an ActiveJob always wins (the server
 * already confirmed a job id, so just resume polling it); otherwise an
 * unresolved PendingSubmission sends the user back to Photos so the
 * submission can be retried under the same idempotency key. */
export function resolveResumeState(): ResumeState {
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
