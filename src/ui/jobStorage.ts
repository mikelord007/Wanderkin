/**
 * Persists the active generation job id across reloads so a refresh resumes
 * polling the existing job instead of losing track of it. Never stores a
 * second job id for a new submission until the previous one reaches a
 * terminal state (see shared/job.ts isTerminalJobState).
 */

const ACTIVE_JOB_KEY = "objectquest:activeJobId";

export function loadActiveJobId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

export function saveActiveJobId(jobId: string): void {
  try {
    localStorage.setItem(ACTIVE_JOB_KEY, jobId);
  } catch {
    // Storage unavailable (private browsing, quota) — job still works for
    // this session, it just won't survive a reload.
  }
}

export function clearActiveJobId(): void {
  try {
    localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    // ignore
  }
}
