import { randomUUID } from "node:crypto";
import type { GenerationJob, JobError } from "../../shared/job.js";
import { isTerminalJobState } from "../../shared/job.js";
import { JOB_SCHEMA_VERSION } from "../../shared/schema-version.js";
import type { ProviderAdapter, ProviderInputPhoto } from "../../shared/provider.js";
import { McpToolError, McpTransportError } from "../livepeer/mcpClient.js";
import { AssetStore } from "../persistence/assetStore.js";
import { downloadBounded, UnsafeUrlError, DownloadTooLargeError } from "../persistence/fetchSafe.js";
import { MAX_GLB_BYTES } from "../persistence/validate.js";
import { INITIAL_BACKOFF_MS, MAX_BACKOFF_MS, JobStore, type JobRecord, toPublicJob } from "./store.js";

export interface CreateJobRequest {
  capability: GenerationJob["capabilityRequested"];
  photos: readonly ProviderInputPhoto[];
  scenePrompt?: string;
}

const MAX_RETRIES = 3;
const PROVIDER_ID = "livepeer-agent-mcp";

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
      return "Ready to play.";
    case "failed":
      return "Something went wrong.";
  }
}

function toJobError(err: unknown): JobError {
  const occurredAt = new Date().toISOString();
  if (err instanceof McpToolError) {
    return { message: err.message, code: err.toolName, retryable: err.retryable, occurredAt };
  }
  if (err instanceof McpTransportError) {
    return { message: err.message, code: "mcp_transport", retryable: true, occurredAt };
  }
  if (err instanceof UnsafeUrlError) {
    return { message: err.message, code: "unsafe_url", retryable: false, occurredAt };
  }
  if (err instanceof DownloadTooLargeError) {
    return { message: err.message, code: "download_too_large", retryable: false, occurredAt };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { message, code: "unknown", retryable: true, occurredAt };
}

export class JobManager {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: JobStore,
    private readonly adapter: ProviderAdapter,
    private readonly assets: AssetStore,
  ) {}

  /** Loads persisted jobs and resumes polling anything still in flight —
   * a process restart must reconcile existing provider jobs, never resubmit. */
  async resumeOnBoot(): Promise<void> {
    const records = await this.store.all();
    for (const record of records) {
      if (!isTerminalJobState(record.job.state) && record.job.providerJobId) {
        record.internal.nextPollAt = Date.now();
        await this.store.put(record);
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
    return record.job;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<GenerationJob | undefined> {
    const record = await this.store.findByIdempotencyKey(idempotencyKey);
    return record && toPublicJob(record);
  }

  /** Creates a job for a new idempotency key and drives it through
   * upload+submit inline (bounded by the MCP client's own timeouts). Callers
   * must check `findByIdempotencyKey` first — this never checks itself, so
   * it never accidentally reconciles instead of creating. */
  async create(request: CreateJobRequest, idempotencyKey: string): Promise<GenerationJob> {
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
    let record: JobRecord = {
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
    await this.store.put(record);

    record = await this.submitToProvider(record, request);
    return record.job;
  }

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
      const jobError = toJobError(err);
      record.job.state = "failed";
      record.job.uiMessage = friendlyMessage("failed");
      record.job.lastError = jobError;
      record.job.updatedAt = new Date().toISOString();
    }
    await this.store.put(record);
    return record;
  }

  /** Polls the provider once and advances job state accordingly. Never
   * submits a new provider job — only ever reconciles the existing one. */
  async pollAndAdvance(jobId: string): Promise<GenerationJob | undefined> {
    const record = await this.store.get(jobId);
    if (!record || !record.job.providerJobId || isTerminalJobState(record.job.state)) {
      return record?.job;
    }

    try {
      const status = await this.adapter.getStatus(record.job.providerJobId);
      record.internal.lastProviderStatusRaw = status;

      if (status.actualCapabilityUsed) record.job.capabilityUsed = status.actualCapabilityUsed;
      if (status.actualFallbackFired !== undefined) record.job.fallbackFired = status.actualFallbackFired;

      if (status.state === "failed") {
        record.job.state = "failed";
        record.job.uiMessage = friendlyMessage("failed");
        record.job.lastError = {
          message: status.error?.message ?? "Generation failed.",
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
      // A poll failure does not mean the provider job died — back off and
      // try again rather than marking the job failed on a transient blip.
      record.internal.backoffMs = Math.min(record.internal.backoffMs * 1.6, MAX_BACKOFF_MS);
      record.internal.nextPollAt = Date.now() + record.internal.backoffMs;
      record.internal.lastProviderStatusRaw = toJobError(err);
    }

    await this.store.put(record);
    return record.job;
  }

  private async finalizeReady(
    record: JobRecord,
    resultAssetUrl: string,
    actualRegisteredModel?: string,
  ): Promise<void> {
    try {
      const { buffer } = await downloadBounded(resultAssetUrl, MAX_GLB_BYTES);
      const asset = await this.assets.store(buffer, {
        providerId: record.job.providerId,
        capabilityUsed: record.job.capabilityUsed ?? record.job.capabilityRequested,
        fallbackFired: record.job.fallbackFired,
        providerJobId: record.job.providerJobId ?? "",
        registeredModel: actualRegisteredModel ?? "unknown",
        sourcePhotoOrder: record.job.photoOrder,
        generatedAt: new Date().toISOString(),
      });
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

  /** Reconciles the existing provider job if one exists; only submits a
   * (new, but same-idempotency-key) generation if the job never reached the
   * provider in the first place. */
  async retry(jobId: string): Promise<GenerationJob | undefined> {
    const record = await this.store.get(jobId);
    if (!record) return undefined;

    if (record.job.providerJobId) {
      return this.pollAndAdvance(jobId);
    }

    if (record.job.retryCount >= record.job.maxRetries) {
      return record.job;
    }
    if (record.job.lastError && record.job.lastError.retryable === false) {
      return record.job;
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
    return updated.job;
  }
}
