import { randomUUID } from "node:crypto";
import type { GenerationJob, JobError } from "../../shared/job.js";
import { isTerminalJobState } from "../../shared/job.js";
import { JOB_SCHEMA_VERSION } from "../../shared/schema-version.js";
import type { ProviderAdapter, ProviderInputPhoto } from "../../shared/provider.js";
import { McpToolError, McpTransportError } from "../livepeer/mcpClient.js";
import { AssetStore } from "../persistence/assetStore.js";
import { downloadBounded, UnsafeUrlError, DownloadTooLargeError } from "../persistence/fetchSafe.js";
import { MAX_GLB_BYTES } from "../persistence/validate.js";
import type { PhotoStore } from "../persistence/photoStore.js";
import { sanitizeMessage } from "../util/sanitize.js";
import {
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  JobStore,
  type JobInternal,
  type JobRecord,
  toPublicJob,
} from "./store.js";

export interface CreateJobRequest {
  capability: GenerationJob["capabilityRequested"];
  photos: readonly ProviderInputPhoto[];
  scenePrompt?: string;
}

export type SubmitOutcome =
  | { status: "created"; job: GenerationJob }
  | { status: "reconciled"; job: GenerationJob }
  /** Same idempotency key reused with a materially different request body —
   * refuses to guess which one the caller meant. */
  | { status: "conflict"; job: GenerationJob };

const MAX_RETRIES = 3;
const PROVIDER_ID = "livepeer-agent-mcp";
const TERMINAL_PROVIDER_STATUSES = new Set(["failed", "cancelled", "canceled"]);

/** Livepeer's documented `idempotency_key` cache retention is 24h — a
 * resubmit past that window can no longer rely on the provider deduping a
 * request that actually landed, so it risks starting a second real
 * generation. A margin is subtracted so a slow boot/restart sequence can't
 * straddle the exact boundary. Below this age, an ambiguous (no
 * `providerJobId`) job is safe to auto-resubmit; at or beyond it, automatic
 * resubmission is refused and the job is left for manual reconciliation. */
const CONFIRMED_IDEMPOTENCY_RETENTION_MS = 23 * 60 * 60 * 1000;

function isWithinConfirmedIdempotencyRetention(job: GenerationJob): boolean {
  return Date.now() - new Date(job.createdAt).getTime() < CONFIRMED_IDEMPOTENCY_RETENTION_MS;
}

function friendlyMessage(state: GenerationJob["state"]): string {
  switch (state) {
    case "queued":
      return "Waiting to start.";
    case "uploading":
      return "Uploading your photos.";
    case "generating":
      return "Generating the 3D scene — this usually takes 2-5 minutes.";
    case "downloading":
      return "Downloading the finished model.";
    case "preparing":
      return "Preparing the scene.";
    case "ready":
      // Server "ready" means the asset is durably stored — client-side
      // scene/physics preparation still has to happen before play.
      return "Model ready for preparation.";
    case "failed":
      return "Something went wrong.";
  }
}

function toJobError(err: unknown): JobError {
  const occurredAt = new Date().toISOString();
  if (err instanceof McpToolError) {
    return { message: sanitizeMessage(err.message), code: err.toolName, retryable: err.retryable, occurredAt };
  }
  if (err instanceof McpTransportError) {
    return { message: sanitizeMessage(err.message), code: "mcp_transport", retryable: true, occurredAt };
  }
  if (err instanceof UnsafeUrlError) {
    return { message: sanitizeMessage(err.message), code: "unsafe_url", retryable: false, occurredAt };
  }
  if (err instanceof DownloadTooLargeError) {
    return { message: sanitizeMessage(err.message), code: "download_too_large", retryable: false, occurredAt };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { message: sanitizeMessage(message), code: "unknown", retryable: true, occurredAt };
}

function terminalProviderStatus(err: unknown): string | undefined {
  if (!(err instanceof McpToolError) || typeof err.raw !== "object" || err.raw === null) return undefined;
  const structuredContent = (err.raw as { structuredContent?: unknown }).structuredContent;
  if (typeof structuredContent !== "object" || structuredContent === null) return undefined;
  const status = (structuredContent as { status?: unknown }).status;
  if (typeof status !== "string") return undefined;
  const normalized = status.toLowerCase();
  return TERMINAL_PROVIDER_STATUSES.has(normalized) ? normalized : undefined;
}

function safeProviderFailure(status: string): JobError {
  return {
    message:
      status === "cancelled" || status === "canceled"
        ? "The provider cancelled the generation request."
        : "The provider rejected the generation request. Check the selected model settings and try again.",
    code: "provider_failed",
    retryable: false,
    occurredAt: new Date().toISOString(),
  };
}

function canonicalPhotos(photos: readonly ProviderInputPhoto[]): string {
  return JSON.stringify(photos.map((p) => ({ photoId: p.photoId, sourceIndex: p.sourceIndex, viewSlot: p.viewSlot ?? null })));
}

/** Whether a repeated POST with the same Idempotency-Key describes the same
 * logical request as the job already on file for that key. A mismatch means
 * the key was reused for a materially different submission — safer to
 * refuse than to silently either double-submit or return the wrong job. */
function requestMatchesExisting(
  existing: { capability: GenerationJob["capabilityRequested"]; original: JobInternal["originalRequest"] },
  incoming: CreateJobRequest,
): boolean {
  if (existing.capability !== incoming.capability) return false;
  if (canonicalPhotos(existing.original.photos) !== canonicalPhotos(incoming.photos)) return false;
  if ((existing.original.scenePrompt ?? null) !== (incoming.scenePrompt ?? null)) return false;
  return true;
}

export class JobManager {
  private timer: NodeJS.Timeout | null = null;
  /** Per-key async mutex (promise chain, same pattern as JsonFileStore) —
   * `idem:<idempotencyKey>` serializes create-vs-reconcile so two concurrent
   * POSTs with the same key can't both pass a "not found yet" check and
   * double-submit; `job:<jobId>` serializes every state transition for one
   * job so a GET-triggered poll and the background ticker (or two GETs)
   * can't race and finalize/write over each other. */
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: JobStore,
    private readonly adapter: ProviderAdapter,
    private readonly assets: AssetStore,
    private readonly photos: PhotoStore,
  ) {}

  /** Marks a job whose submit outcome is permanently ambiguous (no
   * `providerJobId`, and past the provider's confirmed idempotency
   * retention) as failed-and-non-retryable with an explicit diagnostic,
   * instead of silently guessing by resubmitting. */
  private async markIdempotencyRetentionExpired(record: JobRecord): Promise<GenerationJob> {
    record.job.state = "failed";
    record.job.uiMessage = friendlyMessage("failed");
    record.job.lastError = {
      message:
        "Provider outcome unknown; cannot safely resubmit after the provider's idempotency retention window. Manual reconciliation required.",
      code: "idempotency_retention_expired",
      retryable: false,
      occurredAt: new Date().toISOString(),
    };
    record.job.updatedAt = new Date().toISOString();
    await this.store.put(record);
    return toPublicJob(record);
  }

  private runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    this.locks.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  /** Loads persisted jobs and resumes polling anything still in flight — a
   * process restart must reconcile, never resubmit. Two cases:
   *  - `providerJobId` is set: schedule an immediate poll (existing job).
   *  - no `providerJobId` (crashed between accepting the request and
   *    hearing back from `submit`, i.e. still `queued`/`uploading`): the
   *    submit outcome is ambiguous — it may or may not have reached the
   *    provider — so re-drive it through `submitToProvider` reusing the
   *    SAME persisted idempotency key. If it did reach the provider,
   *    Livepeer's own 24h idempotency cache on that key returns the
   *    original job instead of billing/running a second one. */
  async resumeOnBoot(): Promise<void> {
    const records = await this.store.all();
    for (const record of records) {
      if (isTerminalJobState(record.job.state)) continue;
      if (record.job.providerJobId) {
        record.internal.nextPollAt = Date.now();
        await this.store.put(record);
      } else {
        const jobId = record.job.id;
        await this.runExclusive(`job:${jobId}`, async () => {
          const current = await this.store.get(jobId);
          if (!current || current.job.providerJobId || isTerminalJobState(current.job.state)) return;
          if (!isWithinConfirmedIdempotencyRetention(current.job)) {
            await this.markIdempotencyRetentionExpired(current);
            return;
          }
          await this.submitToProvider(current, {
            capability: current.job.capabilityRequested,
            photos: current.internal.originalRequest.photos,
            ...(current.internal.originalRequest.scenePrompt !== undefined
              ? { scenePrompt: current.internal.originalRequest.scenePrompt }
              : {}),
          });
        });
      }
    }
    this.startScheduler();
  }

  startScheduler(intervalMs = 4_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const records = await this.store.all();
    for (const record of records) {
      if (isTerminalJobState(record.job.state)) continue;
      if (!record.job.providerJobId) continue; // still being submitted inline by the request handler
      if (record.internal.nextPollAt > now) continue;
      await this.pollAndAdvance(record.job.id);
    }
  }

  async getPublic(id: string): Promise<GenerationJob | undefined> {
    const record = await this.store.get(id);
    if (!record) return undefined;
    if (!isTerminalJobState(record.job.state) && record.job.providerJobId && record.internal.nextPollAt <= Date.now()) {
      const updated = await this.pollAndAdvance(id);
      if (updated) return updated;
    }
    return toPublicJob(record);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<GenerationJob | undefined> {
    const record = await this.store.findByIdempotencyKey(idempotencyKey);
    return record && toPublicJob(record);
  }

  /** Atomic create-or-reconcile: the ONLY way a new job should be created.
   * Holds a per-idempotency-key lock across the "does a job for this key
   * already exist" check and the create, so two concurrent POSTs with the
   * same key can never both create a job. */
  async submitOrReconcile(request: CreateJobRequest, idempotencyKey: string): Promise<SubmitOutcome> {
    return this.runExclusive(`idem:${idempotencyKey}`, async () => {
      const existing = await this.store.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (!requestMatchesExisting({ capability: existing.job.capabilityRequested, original: existing.internal.originalRequest }, request)) {
          return { status: "conflict", job: toPublicJob(existing) };
        }
        return { status: "reconciled", job: toPublicJob(existing) };
      }

      const record = this.buildRecord(request, idempotencyKey);
      await this.store.put(record);
      const submitted = await this.submitToProvider(record, request);
      return { status: "created", job: toPublicJob(submitted) };
    });
  }

  private buildRecord(request: CreateJobRequest, idempotencyKey: string): JobRecord {
    const now = new Date().toISOString();
    const job: GenerationJob = {
      schemaVersion: JOB_SCHEMA_VERSION,
      id: `job_${randomUUID()}`,
      idempotencyKey,
      providerId: PROVIDER_ID,
      providerJobId: null,
      capabilityRequested: request.capability,
      capabilityUsed: null,
      fallbackFired: null,
      state: "queued",
      photoOrder: request.photos.map((p) => p.sourceIndex),
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      uiMessage: friendlyMessage("queued"),
    };
    return {
      job,
      internal: {
        nextPollAt: 0,
        backoffMs: INITIAL_BACKOFF_MS,
        originalRequest: {
          photos: request.photos,
          ...(request.scenePrompt !== undefined ? { scenePrompt: request.scenePrompt } : {}),
        },
      },
    };
  }

  /** Uploads + submits to the provider and persists the result. Callers are
   * responsible for holding the appropriate lock (a brand-new record from
   * `submitOrReconcile` is safe unlocked — nothing else can know its id yet;
   * `retry`/`resumeOnBoot` explicitly hold `job:<id>`). */
  private async submitToProvider(record: JobRecord, request: CreateJobRequest): Promise<JobRecord> {
    record.job.state = "uploading";
    record.job.uiMessage = friendlyMessage("uploading");
    record.job.updatedAt = new Date().toISOString();
    await this.store.put(record);

    try {
      const result = await this.adapter.submit({
        capability: request.capability,
        photos: request.photos,
        idempotencyKey: record.job.idempotencyKey,
        ...(request.scenePrompt !== undefined ? { scenePrompt: request.scenePrompt } : {}),
      });
      record.job.providerJobId = result.providerJobId;
      record.job.capabilityUsed = result.capabilityUsed;
      record.job.fallbackFired = result.fallbackFired;
      record.job.state = "generating";
      record.job.uiMessage = friendlyMessage("generating");
      record.job.startedAt = new Date().toISOString();
      record.job.updatedAt = record.job.startedAt;
      record.internal.nextPollAt = Date.now() + INITIAL_BACKOFF_MS;
      record.internal.backoffMs = INITIAL_BACKOFF_MS;
    } catch (err) {
      record.job.state = "failed";
      record.job.uiMessage = friendlyMessage("failed");
      record.job.lastError = toJobError(err);
      record.job.updatedAt = new Date().toISOString();
    }
    await this.store.put(record);
    return record;
  }

  /** Polls the provider once and advances job state accordingly. Never
   * submits a new provider job — only ever reconciles the existing one.
   * Serialized per job id so a GET-triggered poll and the background ticker
   * (or two concurrent GETs) can't interleave and finalize/write over each
   * other. */
  async pollAndAdvance(jobId: string, opts: { force?: boolean } = {}): Promise<GenerationJob | undefined> {
    return this.runExclusive(`job:${jobId}`, async () => {
      const record = await this.store.get(jobId);
      if (!record) return undefined;
      return this.pollAndAdvanceLocked(record, opts);
    });
  }

  /** Core poll/advance logic. Must only be called while already holding
   * `job:<record.job.id>` (either via `pollAndAdvance` or from within
   * `retry`, which holds the same lock for its own duration). */
  private async pollAndAdvanceLocked(record: JobRecord, opts: { force?: boolean } = {}): Promise<GenerationJob> {
    if (!record.job.providerJobId) return toPublicJob(record);
    if (isTerminalJobState(record.job.state) && !opts.force) return toPublicJob(record);

    try {
      const status = await this.adapter.getStatus(record.job.providerJobId);
      record.internal.lastProviderStatusRaw = status;

      if (status.actualCapabilityUsed) record.job.capabilityUsed = status.actualCapabilityUsed;
      if (status.actualFallbackFired !== undefined) record.job.fallbackFired = status.actualFallbackFired;

      if (status.state === "failed") {
        record.job.state = "failed";
        record.job.uiMessage = friendlyMessage("failed");
        record.job.lastError = {
          message: sanitizeMessage(status.error?.message ?? "Generation failed."),
          retryable: status.error?.retryable ?? true,
          occurredAt: new Date().toISOString(),
        };
        record.job.completedAt = new Date().toISOString();
        record.job.updatedAt = record.job.completedAt;
      } else if (status.state === "ready" && status.resultAssetUrl) {
        record.job.state = "downloading";
        record.job.uiMessage = friendlyMessage("downloading");
        record.job.updatedAt = new Date().toISOString();
        await this.store.put(record);
        await this.finalizeReady(record, status.resultAssetUrl, status.actualRegisteredModel);
      } else {
        record.internal.backoffMs = Math.min(record.internal.backoffMs * 1.6, MAX_BACKOFF_MS);
        record.internal.nextPollAt = Date.now() + record.internal.backoffMs;
        record.job.updatedAt = new Date().toISOString();
      }
    } catch (err) {
      const jobError = toJobError(err);
      const terminalStatus = terminalProviderStatus(err);
      // McpClient retains the complete tool result on McpToolError.raw.
      // Store it only in server-side bookkeeping so operators can diagnose
      // typed validation failures without exposing runner internals to UI.
      record.internal.lastProviderStatusRaw = err instanceof McpToolError ? err.raw : jobError;

      if (terminalStatus) {
        // `isError` alone is not enough to prove the provider job is dead:
        // only the explicit typed provider status makes this terminal.
        record.job.state = "failed";
        record.job.uiMessage = friendlyMessage("failed");
        record.job.lastError = safeProviderFailure(terminalStatus);
        record.job.completedAt = new Date().toISOString();
        record.job.updatedAt = record.job.completedAt;
      } else {
        // A transport/unknown poll failure does not prove the provider job
        // died. Preserve the existing provider id and reconcile again after
        // bounded backoff rather than starting another generation.
        record.internal.backoffMs = Math.min(record.internal.backoffMs * 1.6, MAX_BACKOFF_MS);
        record.internal.nextPollAt = Date.now() + record.internal.backoffMs;
      }
    }

    await this.store.put(record);
    return toPublicJob(record);
  }

  private async finalizeReady(
    record: JobRecord,
    resultAssetUrl: string,
    actualRegisteredModel?: string,
  ): Promise<void> {
    try {
      const { buffer } = await downloadBounded(resultAssetUrl, MAX_GLB_BYTES);
      const orderedPhotos = (
        await Promise.all(record.internal.originalRequest.photos.map((p) => this.photos.get(p.photoId)))
      ).filter((p): p is NonNullable<typeof p> => p !== undefined);
      const asset = await this.assets.store(
        buffer,
        {
          providerId: record.job.providerId,
          capabilityUsed: record.job.capabilityUsed ?? record.job.capabilityRequested,
          fallbackFired: record.job.fallbackFired,
          providerJobId: record.job.providerJobId ?? "",
          registeredModel: actualRegisteredModel ?? "unknown",
          sourcePhotoOrder: record.job.photoOrder,
          generatedAt: new Date().toISOString(),
        },
        orderedPhotos,
      );
      record.job.resultAssetId = asset.id;
      record.job.state = "ready";
      record.job.uiMessage = friendlyMessage("ready");
      record.job.completedAt = new Date().toISOString();
      record.job.updatedAt = record.job.completedAt;
    } catch (err) {
      record.job.state = "failed";
      record.job.uiMessage = friendlyMessage("failed");
      record.job.lastError = toJobError(err);
      record.job.updatedAt = new Date().toISOString();
    }
  }

  /** Reconciles/recovers a job, serialized per job id:
   *  - has a `providerJobId`: re-checks with the provider even if our
   *    record says `failed` (a local failure — e.g. a download error, or a
   *    stale terminal write — does not mean the provider's job is dead).
   *    Never submits a second generation.
   *  - no `providerJobId` yet (never reached the provider): resubmits,
   *    reusing the same idempotency key, up to `maxRetries`. */
  async retry(jobId: string): Promise<GenerationJob | undefined> {
    return this.runExclusive(`job:${jobId}`, async () => {
      const record = await this.store.get(jobId);
      if (!record) return undefined;

      if (record.job.lastError?.retryable === false) {
        return toPublicJob(record);
      }

      if (record.job.providerJobId) {
        if (record.job.state === "failed") {
          record.job.state = "generating";
          delete record.job.lastError;
          await this.store.put(record);
        }
        return this.pollAndAdvanceLocked(record, { force: true });
      }

      if (record.job.retryCount >= record.job.maxRetries) {
        return toPublicJob(record);
      }

      if (!isWithinConfirmedIdempotencyRetention(record.job)) {
        return this.markIdempotencyRetentionExpired(record);
      }

      record.job.retryCount += 1;
      record.job.state = "queued";
      delete record.job.lastError;
      await this.store.put(record);

      const updated = await this.submitToProvider(record, {
        capability: record.job.capabilityRequested,
        photos: record.internal.originalRequest.photos,
        ...(record.internal.originalRequest.scenePrompt !== undefined
          ? { scenePrompt: record.internal.originalRequest.scenePrompt }
          : {}),
      });
      return toPublicJob(updated);
    });
  }
}
