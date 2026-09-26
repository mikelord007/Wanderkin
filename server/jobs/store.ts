import { join } from "node:path";
import type { GenerationJob } from "../../shared/job.js";
import type { ProviderInputPhoto } from "../../shared/provider.js";
import type { UploadUrlCache } from "../livepeer/adapter.js";
import { JsonFileStore } from "../persistence/jsonStore.js";
import { sanitizeMessage } from "../util/sanitize.js";

/** Server-only bookkeeping kept out of the shared `GenerationJob` shape —
 * poll scheduling, raw provider diagnostics, and the original submit request
 * (needed to safely resubmit on retry) must never reach the client (see
 * shared/job.ts: "pair every job with a separate friendly uiMessage"). */
export interface JobInternal {
  nextPollAt: number;
  backoffMs: number;
  lastProviderStatusRaw?: unknown;
  originalRequest: {
    photos: readonly ProviderInputPhoto[];
    scenePrompt?: string;
  };
  /** Set once the first submit attempt's photos are re-hosted; reused by
   * `LivepeerAdapter.submit` on any later attempt for the same job so a
   * retry/resubmit sends the provider byte-identical `image_urls`. */
  resolvedImageUrls?: string[];
  /** Automatic re-runs already spent on this job (story and sound get one;
   * see JobManager.autoRetry). Manual retries are `job.retryCount`. */
  autoRetries?: number;
  /** The failure that triggered the latest automatic re-run, for operators. */
  lastAutoRetryError?: GenerationJob["lastError"];
}

export interface JobRecord {
  job: GenerationJob;
  internal: JobInternal;
}

export const INITIAL_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 60_000;

export class JobStore {
  private readonly file: JsonFileStore<Record<string, JobRecord>>;

  constructor(storageDir: string) {
    this.file = new JsonFileStore(join(storageDir, "jobs.json"), () => ({}));
  }

  async all(): Promise<JobRecord[]> {
    return Object.values(await this.file.read());
  }

  async get(id: string): Promise<JobRecord | undefined> {
    return (await this.file.read())[id];
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<JobRecord | undefined> {
    return Object.values(await this.file.read()).find((r) => r.job.idempotencyKey === idempotencyKey);
  }

  async put(record: JobRecord): Promise<void> {
    await this.file.update((current) => {
      current[record.job.id] = record;
    });
  }
}

/** Durable `UploadUrlCache` backed by the job record itself, keyed by
 * idempotency key — survives a process restart, which is exactly when a
 * resubmit (resumeOnBoot's ambiguous-recovery path) is most likely. */
export class JobStoreUploadUrlCache implements UploadUrlCache {
  constructor(private readonly store: JobStore) {}

  async get(idempotencyKey: string): Promise<string[] | undefined> {
    const record = await this.store.findByIdempotencyKey(idempotencyKey);
    return record?.internal.resolvedImageUrls;
  }

  async set(idempotencyKey: string, imageUrls: string[]): Promise<void> {
    const record = await this.store.findByIdempotencyKey(idempotencyKey);
    if (!record) return; // job record always exists by the time submit() runs (see JobManager)
    record.internal.resolvedImageUrls = imageUrls;
    await this.store.put(record);
  }
}

/** Strips server-only fields and sanitizes `lastError.message` (redacting
 * URLs, capping length) before a job crosses the API boundary — raw
 * provider error text/URLs must never reach client JSON. Applied here (the
 * single read-boundary function every public return goes through) as
 * defense in depth even though `toJobError`/callers should already sanitize
 * at write time. */
export function toPublicJob(record: JobRecord): GenerationJob {
  const { job } = record;
  if (!job.lastError) return job;
  return { ...job, lastError: { ...job.lastError, message: sanitizeMessage(job.lastError.message) } };
}
