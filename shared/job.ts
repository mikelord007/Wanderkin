import { JOB_SCHEMA_VERSION } from "./schema-version.js";
import type { ProviderCapabilityId } from "./provider.js";

/**
 * Durable job states. `queued` through `preparing` are all "in progress";
 * only `ready` and `failed` are terminal. A page refresh or repeated status
 * request must reconcile against the existing job id, never create a new one.
 */
export type JobState =
  | "queued"
  | "uploading"
  | "generating"
  | "downloading"
  | "preparing"
  | "ready"
  | "failed";

export const TERMINAL_JOB_STATES: readonly JobState[] = ["ready", "failed"];

/** Internal diagnostic detail. Never render `code`/`stack` directly to the
 * player — pair every job with a separate friendly `uiMessage`. */
export interface JobError {
  message: string;
  code?: string;
  retryable: boolean;
  occurredAt: string;
}

export interface GenerationJob {
  schemaVersion: typeof JOB_SCHEMA_VERSION;
  id: string;
  /** Supplied by the client; reused on retried submissions so a duplicate
   * request reconciles the existing job instead of starting another. */
  idempotencyKey: string;
  providerId: string;
  providerJobId: string | null;
  capabilityRequested: ProviderCapabilityId;
  capabilityUsed: ProviderCapabilityId | null;
  fallbackFired: ProviderCapabilityId | null;
  state: JobState;
  /** 1-based source photo numbers in the order submitted to the provider. */
  photoOrder: number[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
  lastError?: JobError;
  /** Friendly, user-facing status text — kept separate from `lastError`. */
  uiMessage?: string;
  /** Populated once `state === "ready"`; references shared/manifest.ts AssetReference.id. */
  resultAssetId?: string;
}

export function isTerminalJobState(state: JobState): boolean {
  return TERMINAL_JOB_STATES.includes(state);
}
