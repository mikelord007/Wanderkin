import { join } from "node:path";
import type { GenerationJob } from "../../shared/job.js";
import type { ProviderInputPhoto } from "../../shared/provider.js";
import { JsonFileStore } from "../persistence/jsonStore.js";

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

/** Strips server-only fields before a job crosses the API boundary. */
export function toPublicJob(record: JobRecord): GenerationJob {
  return record.job;
}
