import { randomUUID } from "node:crypto";
import type { GenerationJob, JobError } from "../../shared/job.js";
import type { GenerationRequest, GenerationResult } from "../../shared/generation.js";
import type { GenerationProvenance } from "../../shared/provenance.js";
import { isTerminalJobState } from "../../shared/job.js";
import { JOB_SCHEMA_VERSION } from "../../shared/schema-version.js";
import type { ProviderAdapter, ProviderInputPhoto } from "../../shared/provider.js";
import { McpToolError, McpTransportError } from "../livepeer/mcpClient.js";
import { AssetStore } from "../persistence/assetStore.js";
import type { StoredAssetRecord } from "../persistence/assetStore.js";
import { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import { downloadBounded, UnsafeUrlError, DownloadTooLargeError } from "../persistence/fetchSafe.js";
import { MAX_GLB_BYTES } from "../persistence/validate.js";
import type { PhotoStore } from "../persistence/photoStore.js";
import { sanitizeMessage } from "../util/sanitize.js";
import { estimateRequestCost } from "../livepeer/capabilities.js";
import type { GenerationProviderAdapter, ProviderGenerationStatus } from "./types.js";
import { BudgetExceededError, SpendLedger } from "./spendLedger.js";
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

export class ProviderConcurrencyExceededError extends Error {
  readonly code = "provider_concurrency_exceeded";
  readonly retryable = true;

  constructor(readonly retryAfterSeconds: number) {
    super("The generation service is at capacity. Please retry shortly.");
    this.name = "ProviderConcurrencyExceededError";
  }
}

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
  if (err instanceof BudgetExceededError) {
    return { message: err.message, code: err.code, retryable: false, occurredAt };
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

function requestMatchesGeneration(existing: GenerationRequest | undefined, incoming: GenerationRequest): boolean {
  return existing !== undefined && JSON.stringify(existing) === JSON.stringify(incoming);
}

function photosForGeneration(request: GenerationRequest): readonly ProviderInputPhoto[] {
  if (request.kind === "image-to-3d") {
    const photos = [...(request.photos ?? [])];
    const nextSourceIndex = photos.reduce((max, photo) => Math.max(max, photo.sourceIndex), 0) + 1;
    return [
      ...photos,
      ...(request.sourceImageAssetIds ?? []).map((photoId, index) => ({
        photoId,
        sourceIndex: nextSourceIndex + index,
      })),
    ];
  }
  return request.kind === "image-edit" || request.kind === "video"
      ? [{ photoId: request.sourceImageAssetId, sourceIndex: 1 }]
      : [];
}

function buildProvenance(job: GenerationJob): GenerationProvenance {
  const completedAt = job.completedAt;
  const requestedMs = new Date(job.createdAt).getTime();
  const startedMs = job.startedAt ? new Date(job.startedAt).getTime() : undefined;
  const completedMs = completedAt ? new Date(completedAt).getTime() : undefined;
  return {
    providerId: job.providerId,
    requestedCapability: job.capabilityRequested,
    servedCapability: job.capabilityUsed,
    servedModel: job.provenance?.servedModel ?? null,
    applicationJobId: job.id,
    providerJobId: job.providerJobId,
    timings: {
      requestedAt: job.createdAt,
      ...(job.startedAt ? { startedAt: job.startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(startedMs !== undefined ? { queueMilliseconds: Math.max(0, startedMs - requestedMs) } : {}),
      ...(startedMs !== undefined && completedMs !== undefined ? { executionMilliseconds: Math.max(0, completedMs - startedMs) } : {}),
      ...(completedMs !== undefined ? { totalMilliseconds: Math.max(0, completedMs - requestedMs) } : {}),
    },
    reportedCost: job.provenance?.reportedCost ?? null,
    ...(job.request?.kind === "image-to-3d" && job.request.sourceImageAssetIds?.length
      ? { sourceImageAssetIds: [...job.request.sourceImageAssetIds] }
      : {}),
    ...(job.request?.kind === "image-to-3d" && job.request.styleReferenceAssetId
      ? { styleReferenceAssetId: job.request.styleReferenceAssetId }
      : {}),
  };
}

function parseQuestJson(text: string, alreadyParsed: unknown): Record<string, unknown> {
  let value = alreadyParsed;
  if (value === undefined) {
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Quest generation did not return valid JSON");
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Quest generation must return a JSON object");
  }
  const record = value as Record<string, unknown>;
  for (const field of ["title", "intro", "objective", "narrationScript"]) {
    if (record[field] !== undefined && typeof record[field] !== "string") {
      throw new Error(`Quest field "${field}" must be text`);
    }
  }
  if (typeof record.title !== "string" || typeof record.objective !== "string") {
    throw new Error("Quest JSON must include text fields title and objective");
  }
  return record;
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
    private readonly adapter: ProviderAdapter & Partial<GenerationProviderAdapter>,
    private readonly assets: AssetStore,
    private readonly photos: PhotoStore,
    private readonly generation?: {
      generatedAssets: GeneratedAssetStore;
      spendLedger: SpendLedger;
      perRequestLimitUsd: number;
      perWorldLimitUsd: number;
      maxRetries?: number;
      maxInFlight?: number;
      concurrencyRetrySeconds?: number;
    },
  ) {}

  private async assertProviderCapacity(excludeJobId?: string): Promise<void> {
    const limit = this.generation?.maxInFlight ?? 4;
    const records = await this.store.all();
    const inFlight = records.filter(
      (record) => record.job.id !== excludeJobId && !isTerminalJobState(record.job.state),
    ).length;
    if (inFlight >= limit) {
      throw new ProviderConcurrencyExceededError(this.generation?.concurrencyRetrySeconds ?? 15);
    }
  }

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
          if (current.job.request) {
            await this.submitGenerationToProvider(
              current,
              current.job.request,
              this.generation?.perRequestLimitUsd ?? Number.MAX_SAFE_INTEGER,
            );
          } else {
            await this.submitToProvider(current, {
              capability: current.job.capabilityRequested,
              photos: current.internal.originalRequest.photos,
              ...(current.internal.originalRequest.scenePrompt !== undefined
                ? { scenePrompt: current.internal.originalRequest.scenePrompt }
                : {}),
            });
          }
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
      await this.runExclusive("provider-capacity", async () => {
        await this.assertProviderCapacity();
        await this.store.put(record);
      });
      const submitted = await this.submitToProvider(record, request);
      return { status: "created", job: toPublicJob(submitted) };
    });
  }

  /** Shared v2 entry point for every generation kind. Budget reservation,
   * durable job creation, and provider submission are serialized under the
   * request's idempotency key. */
  async submitGenerationOrReconcile(
    request: GenerationRequest,
    options: { requestLimitOverrideUsd?: number; worldId?: string } = {},
  ): Promise<SubmitOutcome> {
    if (!this.generation || !this.adapter.validateGenerationInput || !this.adapter.submitGeneration) {
      throw new Error("Multi-kind generation services are not configured");
    }
    return this.runExclusive(`idem:${request.idempotencyKey}`, async () => {
      const existing = await this.store.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        if (!requestMatchesGeneration(existing.job.request, request)) {
          return { status: "conflict", job: toPublicJob(existing) };
        }
        return { status: "reconciled", job: toPublicJob(existing) };
      }

      const validation = this.adapter.validateGenerationInput!(request);
      if (!validation.valid) {
        throw new McpToolError(`Input validation failed: ${validation.errors.join("; ")}`, "run_capability", false, validation);
      }
      const record = this.buildGenerationRecord(request);
      const estimateUsd = estimateRequestCost(request);
      const effectiveRequestLimit = Math.min(
        this.generation!.perRequestLimitUsd,
        options.requestLimitOverrideUsd ?? this.generation!.perRequestLimitUsd,
      );
      await this.runExclusive("provider-capacity", async () => {
        await this.assertProviderCapacity();
        await this.generation!.spendLedger.reserve({
          jobId: record.job.id,
          worldId: options.worldId ?? null,
          capability: request.capability,
          kind: request.kind,
          estimateUsd,
          perRequestLimitUsd: effectiveRequestLimit,
          perWorldLimitUsd: this.generation!.perWorldLimitUsd,
        });
        await this.store.put(record);
      });
      const submitted = await this.submitGenerationToProvider(record, request, effectiveRequestLimit);
      return { status: "created", job: toPublicJob(submitted) };
    });
  }

  private buildGenerationRecord(request: GenerationRequest): JobRecord {
    const now = new Date().toISOString();
    const photos = photosForGeneration(request);
    const job: GenerationJob = {
      schemaVersion: JOB_SCHEMA_VERSION,
      id: `job_${randomUUID()}`,
      idempotencyKey: request.idempotencyKey,
      providerId: PROVIDER_ID,
      providerJobId: null,
      capabilityRequested: request.capability,
      capabilityUsed: null,
      fallbackFired: null,
      state: "queued",
      photoOrder: photos.map((photo) => photo.sourceIndex),
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: this.generation?.maxRetries ?? MAX_RETRIES,
      uiMessage: friendlyMessage("queued"),
      kind: request.kind,
      request,
    };
    job.provenance = buildProvenance(job);
    return {
      job,
      internal: {
        nextPollAt: 0,
        backoffMs: INITIAL_BACKOFF_MS,
        originalRequest: {
          photos,
          ...(request.kind === "image-to-3d" && request.scenePrompt !== undefined ? { scenePrompt: request.scenePrompt } : {}),
        },
      },
    };
  }

  private async submitGenerationToProvider(
    record: JobRecord,
    request: GenerationRequest,
    requestLimitUsd: number,
  ): Promise<JobRecord> {
    if (!this.adapter.submitGeneration) throw new Error("Multi-kind adapter is not configured");
    record.job.state = photosForGeneration(request).length > 0 ? "uploading" : "generating";
    record.job.uiMessage = friendlyMessage(record.job.state);
    record.job.updatedAt = new Date().toISOString();
    await this.store.put(record);

    try {
      const result = await this.adapter.submitGeneration({ ...request, maxCostUsd: requestLimitUsd });
      record.job.providerJobId = result.providerJobId;
      record.job.capabilityUsed = result.capabilityUsed;
      record.job.fallbackFired = result.fallbackFired;
      record.job.startedAt = new Date().toISOString();
      record.job.updatedAt = record.job.startedAt;
      record.job.provenance = {
        ...buildProvenance(record.job),
        servedCapability: result.capabilityUsed,
        servedModel: result.servedModel ?? null,
        providerJobId: result.providerJobId,
        reportedCost: result.reportedCostUsd !== undefined
          ? { amount: result.reportedCostUsd, currency: "USD" }
          : null,
      };
      await this.generation?.spendLedger.reconcile(record.job.id, result.reportedCostUsd ?? null);

      if (result.inlineOutput) {
        await this.finalizeGenerationOutput(record, result.inlineOutput, result.servedModel);
      } else {
        record.job.state = "generating";
        record.job.uiMessage = friendlyMessage("generating");
        record.internal.nextPollAt = Date.now() + INITIAL_BACKOFF_MS;
        record.internal.backoffMs = INITIAL_BACKOFF_MS;
      }
    } catch (err) {
      record.job.state = "failed";
      record.job.uiMessage = friendlyMessage("failed");
      record.job.lastError = toJobError(err);
      record.job.updatedAt = new Date().toISOString();
    }
    await this.store.put(record);
    return record;
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
    if (record.job.request) return this.pollGenerationLocked(record);

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

  private async pollGenerationLocked(record: JobRecord): Promise<GenerationJob> {
    if (!record.job.providerJobId || !record.job.request || !this.adapter.getGenerationStatus) return toPublicJob(record);
    try {
      const status = await this.adapter.getGenerationStatus(record.job.providerJobId);
      record.internal.lastProviderStatusRaw = status;
      if (status.actualCapabilityUsed) record.job.capabilityUsed = status.actualCapabilityUsed;
      if (status.actualFallbackFired !== undefined) record.job.fallbackFired = status.actualFallbackFired;
      if (status.actualRegisteredModel || status.reportedCostUsd !== undefined) {
        record.job.provenance = {
          ...buildProvenance(record.job),
          servedCapability: status.actualCapabilityUsed ?? record.job.capabilityUsed,
          servedModel: status.actualRegisteredModel ?? record.job.provenance?.servedModel ?? null,
          reportedCost: status.reportedCostUsd !== undefined
            ? { amount: status.reportedCostUsd, currency: "USD" }
            : (record.job.provenance?.reportedCost ?? null),
        };
      }
      await this.generation?.spendLedger.reconcile(record.job.id, status.reportedCostUsd ?? null);

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
        record.job.provenance = buildProvenance(record.job);
      } else if (status.state === "ready" && status.output) {
        await this.finalizeGenerationOutput(record, status.output, status.actualRegisteredModel);
      } else {
        record.internal.backoffMs = Math.min(record.internal.backoffMs * 1.6, MAX_BACKOFF_MS);
        record.internal.nextPollAt = Date.now() + record.internal.backoffMs;
        record.job.updatedAt = new Date().toISOString();
      }
    } catch (err) {
      const terminalStatus = terminalProviderStatus(err);
      record.internal.lastProviderStatusRaw = err instanceof McpToolError ? err.raw : toJobError(err);
      if (terminalStatus) {
        record.job.state = "failed";
        record.job.uiMessage = friendlyMessage("failed");
        record.job.lastError = safeProviderFailure(terminalStatus);
        record.job.completedAt = new Date().toISOString();
        record.job.updatedAt = record.job.completedAt;
        record.job.provenance = buildProvenance(record.job);
      } else {
        record.internal.backoffMs = Math.min(record.internal.backoffMs * 1.6, MAX_BACKOFF_MS);
        record.internal.nextPollAt = Date.now() + record.internal.backoffMs;
      }
    }
    await this.store.put(record);
    return toPublicJob(record);
  }

  private async finalizeGenerationOutput(
    record: JobRecord,
    output: NonNullable<ProviderGenerationStatus["output"]>,
    servedModel?: string,
  ): Promise<void> {
    const request = record.job.request;
    if (!request || !this.generation) throw new Error("Generation output has no durable request context");
    record.job.state = output.url ? "downloading" : "generating";
    record.job.uiMessage = output.url ? friendlyMessage("downloading") : friendlyMessage("generating");
    record.job.completedAt = new Date().toISOString();
    record.job.updatedAt = record.job.completedAt;
    record.job.provenance = {
      ...buildProvenance(record.job),
      servedModel: servedModel ?? record.job.provenance?.servedModel ?? null,
    };
    await this.store.put(record);

    try {
      let result: GenerationResult;
      if (request.kind === "image-to-3d") {
        if (!output.url) throw new Error("3D provider output did not include a URL");
        await this.finalizeReady(record, output.url, servedModel);
        return;
      }
      if (request.kind === "text") {
        const text = output.text ?? (typeof output.json === "string" ? output.json : JSON.stringify(output.json));
        if (!text || text.length > request.maxCharacters) {
          throw new Error(`Generated text must contain at most ${request.maxCharacters} characters`);
        }
        const structured = request.output === "quest-json" ? parseQuestJson(text, output.json) : undefined;
        result = {
          kind: "text",
          output: { text, ...(structured !== undefined ? { structured } : {}) },
        };
      } else {
        if (!output.url) throw new Error(`${request.kind} provider output did not include a URL`);
        const maxBytes = request.kind === "image-edit" ? 25 * 1024 * 1024 : request.kind === "video" ? 200 * 1024 * 1024 : 75 * 1024 * 1024;
        const { buffer } = await downloadBounded(output.url, maxBytes);
        if (request.kind === "image-edit") {
          const asset = await this.generation.generatedAssets.storeImage(buffer, request.outputMimeType, record.job.provenance!);
          result = { kind: "image-edit", asset };
        } else if (request.kind === "video") {
          const asset = await this.generation.generatedAssets.storeVideo(buffer, {
            durationSeconds: request.durationSeconds,
            provenance: record.job.provenance!,
          });
          result = { kind: "video", asset: { ...asset, kind: "animated-postcard" } };
        } else {
          const kind = request.kind === "music"
            ? "music"
            : request.kind === "tts"
              ? "narration"
              : request.purpose.toLowerCase().includes("ambience") ? "ambience" : "sfx";
          const asset = await this.generation.generatedAssets.storeAudio(buffer, {
            kind,
            durationSeconds: request.kind === "tts" ? 0 : request.durationSeconds,
            loop: request.kind === "tts" ? false : request.loop,
            defaultGain: request.kind === "music" ? 0.7 : request.kind === "tts" ? 1 : 0.85,
            ...(request.kind === "tts" ? { transcript: request.text } : {}),
            provenance: record.job.provenance!,
          });
          result = request.kind === "music"
            ? { kind: "music", asset: { ...asset, kind: "music" } }
            : request.kind === "tts"
              ? { kind: "tts", asset: { ...asset, kind: "narration" } }
              : { kind: "sfx", asset: { ...asset, kind: asset.kind === "ambience" ? "ambience" : "sfx" } };
        }
      }
      record.job.result = result;
      if ("asset" in result) record.job.resultAssetId = result.asset.id;
      record.job.state = "ready";
      record.job.uiMessage = "Generated asset is ready.";
      record.job.updatedAt = record.job.completedAt!;
    } catch (err) {
      record.job.state = "failed";
      record.job.uiMessage = friendlyMessage("failed");
      record.job.lastError = toJobError(err);
      record.job.updatedAt = new Date().toISOString();
    }
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
      if (record.job.request?.kind === "image-to-3d") {
        record.job.result = { kind: "image-to-3d", asset };
        record.job.provenance = buildProvenance(record.job);
      }
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

  /** Repairs an already-ready asset whose original success poll lacked a
   * concrete model field. This only re-reads the existing provider job and
   * patches matching `unknown` provenance; it never submits or downloads. */
  async repairReadyAssetProvenance(jobId: string): Promise<StoredAssetRecord | undefined> {
    return this.runExclusive(`job:${jobId}`, async () => {
      const record = await this.store.get(jobId);
      if (
        !record ||
        record.job.state !== "ready" ||
        !record.job.providerJobId ||
        !record.job.resultAssetId
      ) {
        return undefined;
      }

      const asset = await this.assets.get(record.job.resultAssetId);
      if (!asset?.provenance) return undefined;
      if (asset.provenance.registeredModel !== "unknown") return asset;

      const status = await this.adapter.getStatus(record.job.providerJobId);
      record.internal.lastProviderStatusRaw = status;
      if (status.state !== "ready" || !status.actualRegisteredModel) {
        throw new Error("Provider did not return authoritative model provenance for the completed job");
      }

      const repaired = await this.assets.repairRegisteredModel(
        record.job.resultAssetId,
        record.job.providerJobId,
        status.actualRegisteredModel,
      );
      await this.store.put(record);
      return repaired;
    });
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

      await this.runExclusive("provider-capacity", async () => {
        await this.assertProviderCapacity(record.job.id);
        record.job.retryCount += 1;
        record.job.state = "queued";
        delete record.job.lastError;
        await this.store.put(record);
      });

      const updated = record.job.request
        ? await this.submitGenerationToProvider(
            record,
            record.job.request,
            this.generation?.perRequestLimitUsd ?? Number.MAX_SAFE_INTEGER,
          )
        : await this.submitToProvider(record, {
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
