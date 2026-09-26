import { describe, expect, it } from "vitest";
import type { AudioAssetReference, GenerationJob, GenerationJobKind, GenerationRequest, SceneManifest } from "../../shared/index.js";
import { migrateSceneManifest } from "../../shared/index.js";
import lostColors from "../../shared/fixtures/lost-colors.json";
import { AudioOrchestrator, type AudioGateway } from "../../server/audio/orchestrator.js";
import type { SubmitOutcome } from "../../server/jobs/manager.js";

const GENERATION_JOB_KINDS = [
  "image-to-3d",
  "image-edit",
  "text",
  "music",
  "sfx",
  "tts",
  "video",
] as const satisfies readonly GenerationJobKind[];

describe("ObjectQuest v2 generation lifecycle integration contracts", () => {
  it.skip.each(GENERATION_JOB_KINDS)("deduplicates concurrent %s submissions without merging other kinds", (kind) => {
    // Given two concurrent requests with the same normalized payload,
    // purpose, world, job kind, and idempotency key,
    void kind;

    // when both cross the real gateway/job-store boundary before either
    // provider response completes,

    // then both callers receive one application job ID and exactly one
    // provider submission. The same key on another kind remains independent,
    // while a same-kind payload mismatch is rejected without a provider call.
    throw new Error("Contract stub: connect Worker 2's common multi-kind job gateway");
  });

  it.skip("polls queued/running jobs, classifies errors, and resumes the same job after refresh and restart", () => {
    // Given a durable job whose provider sequence is queued -> running -> ready,
    // observe bounded polling/backoff and persist every externally visible state.

    // Interrupt the client and API process independently, then resume through
    // Worker 4's stored pending-world path using the original application and
    // provider job IDs; neither recovery may call provider submission again.

    // Repeat with retryable and terminal provider failures. Retryable errors
    // preserve normalized input and completed assets; terminal errors stop
    // polling, expose stable safe copy, and never loop indefinitely.
    throw new Error("Contract stub: connect gateway, durable store, poller, and My worlds resume");
  });

  it("preserves the playable level and successful assets when one optional asset fails", async () => {
    // Given a ready mesh/course plus independent music, ambience, SFX, and
    // postcard jobs, make one optional job fail after another optional asset succeeds.

    // When the failure is persisted, the world remains playable, editable,
    // saveable, publishable, and replayable with an honest missing-media state.

    // Retrying only the failed kind reuses the world/mesh and successful asset
    // IDs, creates no image-to-3d submission, and cannot erase the publication.
    const gateway = new PartialFailureGateway();
    let stored = migrateSceneManifest(lostColors);
    const meshIds = stored.assets.map((asset) => asset.id);
    const levels = {
      async get() { return stored; },
      async save(_id: string, manifest: SceneManifest) { stored = manifest; return manifest; },
    };
    const orchestrator = new AudioOrchestrator(gateway, levels);
    const started = await orchestrator.start({
      worldId: stored.levelId,
      style: "cartoon",
      objectDescription: "a blue teacup",
    });
    expect(started.playable).toBe(true);
    expect(started.failedCues).toContain("ambience");
    expect(started.readyAssets.map((asset) => asset.id)).toContain("music-ready");
    await orchestrator.persist(stored.levelId, started);

    const ambienceJob = started.jobs.find((entry) => entry.cue === "ambience")!.job!;
    const retried = await orchestrator.retry("ambience", ambienceJob.id);
    await orchestrator.persist(stored.levelId, retried);
    expect(stored.assets.map((asset) => asset.id)).toEqual(meshIds);
    expect(stored.media?.audio.map((asset) => asset.id)).toEqual(expect.arrayContaining(["music-ready", "ambience-ready"]));
    expect(gateway.requests.some((request) => request.kind === "image-to-3d" || request.kind === "tts")).toBe(false);
    expect(gateway.retryIds).toEqual([ambienceJob.id]);
  });

  it.skip("rejects per-request and per-world budget excess before provider submission", () => {
    // Given current catalog pricing plus configured per-request and per-world
    // ceilings, test below-limit, exact-limit, above-limit, and unknown-cost inputs.

    // Above-limit requests fail before upload/provider submission and persist a
    // stable non-retry loop error. Unknown cost is represented as unknown, never zero.

    // Existing successful assets and spend ledger entries remain unchanged;
    // the fake provider call log is empty for every rejected request.
    throw new Error("Contract stub: connect Worker 2 budget policy, ledger, and gateway");
  });

  it.skip("submits the exact approved preview and settings, never an unapproved style selection", () => {
    // Given an uploaded source, style A preview, then style B preview, approve B
    // and persist its asset ID, digest, style definition version, atmosphere,
    // mode, source identity, and approval timestamp across a refresh.

    // Style selection and preview generation alone must make zero image-to-3d
    // calls. Explicit Build submits once using B's approved durable image—not
    // the upload, A, a stale blob URL, or the current unapproved controls.

    // Changing any bound input invalidates approval and requires a new explicit
    // approval before another build can pass the gateway.
    throw new Error("Contract stub: connect Worker 4 approval store and Worker 2 request capture");
  });
});

const now = "2026-09-24T00:00:00.000Z";
const provenance = { providerId: "fixture", requestedCapability: "music", servedCapability: "music", servedModel: "fixture", applicationJobId: "fixture", providerJobId: "provider", timings: { requestedAt: now }, reportedCost: null } as const;

function audioAsset(id: string, kind: "music" | "ambience"): AudioAssetReference {
  return { schemaVersion: 1, mediaType: "audio", kind, id, url: `/${id}.wav`, sha256: id === "music-ready" ? "1".repeat(64) : "2".repeat(64), sizeBytes: 100, mimeType: "audio/wav", durationSeconds: 2, provenance: { ...provenance, requestedCapability: kind === "music" ? "music" : "mirelo-sfx", servedCapability: kind === "music" ? "music" : "mirelo-sfx" }, loop: true, defaultGain: 1 };
}

function generationJob(request: GenerationRequest, state: GenerationJob["state"], asset?: AudioAssetReference): GenerationJob {
  const result = asset
    ? request.kind === "music" ? { kind: "music" as const, asset: { ...asset, kind: "music" as const } }
      : { kind: "sfx" as const, asset: { ...asset, kind: "ambience" as const } }
    : undefined;
  return { schemaVersion: 1, id: `job-${request.purpose}`, idempotencyKey: request.idempotencyKey, providerId: "fixture", providerJobId: `provider-${request.purpose}`, capabilityRequested: request.capability, capabilityUsed: request.capability, fallbackFired: null, state, photoOrder: [], createdAt: now, updatedAt: now, retryCount: 0, maxRetries: 1, kind: request.kind, request, ...(result ? { result } : {}), ...(state === "failed" ? { lastError: { message: "Optional ambience unavailable.", retryable: true, occurredAt: now } } : {}) };
}

class PartialFailureGateway implements AudioGateway {
  requests: GenerationRequest[] = [];
  retryIds: string[] = [];
  private ambienceRequest: GenerationRequest | undefined;
  async submitGenerationOrReconcile(request: GenerationRequest): Promise<SubmitOutcome> {
    this.requests.push(request);
    if (request.kind === "music") return { status: "created", job: generationJob(request, "ready", audioAsset("music-ready", "music")) };
    if (request.purpose === "audio:ambience") { this.ambienceRequest = request; return { status: "created", job: generationJob(request, "failed") }; }
    return { status: "created", job: generationJob(request, "generating") };
  }
  async getPublic(): Promise<GenerationJob | undefined> { return undefined; }
  async retry(jobId: string): Promise<GenerationJob | undefined> {
    this.retryIds.push(jobId);
    return this.ambienceRequest ? generationJob(this.ambienceRequest, "ready", audioAsset("ambience-ready", "ambience")) : undefined;
  }
}
