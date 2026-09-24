import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderAdapter, ProviderStatusResult, ProviderSubmitResult } from "../../shared/provider.js";
import { McpToolError, McpTransportError } from "../livepeer/mcpClient.js";
import { AssetStore } from "../persistence/assetStore.js";
import { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import { PhotoStore } from "../persistence/photoStore.js";
import type { GenerationRequest } from "../../shared/generation.js";
import type { GenerationProviderAdapter, ProviderGenerationStatus } from "./types.js";
import { SpendLedger } from "./spendLedger.js";
import { JobStore } from "./store.js";
import { JobManager } from "./manager.js";

vi.mock("../persistence/fetchSafe.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../persistence/fetchSafe.js")>();
  return { ...actual, downloadBounded: vi.fn() };
});
import { downloadBounded } from "../persistence/fetchSafe.js";

/** Smallest possible valid binary glTF: a 12-byte header with no chunks,
 * satisfying assertValidGlb's magic/version/declared-length checks. */
function minimalGlb(): Buffer {
  const buffer = Buffer.alloc(12);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(12, 8);
  return buffer;
}

function minimalJpeg(size = 2000): Buffer {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

function fakeAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    providerId: "fake",
    discoverCapabilities: vi.fn(async () => []),
    validateInput: vi.fn(() => ({ valid: true, errors: [] })),
    submit: vi.fn(async (): Promise<ProviderSubmitResult> => ({
      providerJobId: "provider-job-1",
      capabilityUsed: "rodin-i3d",
      fallbackFired: null,
    })),
    getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({
      state: "generating",
      progress: { known: false },
    })),
    ...overrides,
  };
}

const REQUEST = { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] } as const;

/** Shape observed from the 2026-09-18 live smoke poll. The MCP
 * endpoint returned this as `result.isError`, so McpClient throws before the
 * adapter can return a normal `{ state: "failed" }` status object. */
const TERMINAL_STATUS_TEXT =
  "Media job mjob_68bae8dfd271: failed (19s)\n" +
  "Capability: rodin-i3d\n" +
  "Action: run_capability\n" +
  "Runner: host agent.livepeer.org · entered · http 200 · err detached_failed\n" +
  "Submitted via: run_capability\n" +
  "Error: {'error': 'pymthouse path is pinned to the live-runner provider node; LR dispatcher failed'}";

const TERMINAL_STATUS_ENVELOPE = {
  isError: true,
  content: [{ type: "text", text: TERMINAL_STATUS_TEXT }],
  structuredContent: {
    status: "failed",
    submitted_via: "run_capability",
    job_id: "mjob_68bae8dfd271",
    capability: "rodin-i3d",
    error_retryable: null,
    error_code: null,
    cost_disposition: "release_pending",
    error: {
      model_id: "fal-ai/hyper3d/rodin/v2.5",
      validation: [
        {
          type: "less_than_equal",
          loc: ["body", "seed"],
          msg: "Input should be less than or equal to 65535",
          input: 463_045_388,
          ctx: { le: 65_535 },
        },
      ],
    },
  },
};

describe("JobManager", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "objectquest-jobs-"));
    vi.mocked(downloadBounded).mockReset();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function build(adapter: ProviderAdapter) {
    return new JobManager(new JobStore(dir), adapter, new AssetStore(dir), new PhotoStore(dir));
  }

  function buildMulti(adapter: ProviderAdapter & GenerationProviderAdapter, storageDir = dir) {
    return new JobManager(
      new JobStore(storageDir),
      adapter,
      new AssetStore(storageDir),
      new PhotoStore(storageDir),
      {
        generatedAssets: new GeneratedAssetStore(storageDir),
        spendLedger: new SpendLedger(storageDir),
        perRequestLimitUsd: 2,
        perWorldLimitUsd: 8,
        maxRetries: 2,
      },
    );
  }

  function fakeMultiAdapter(overrides: Partial<GenerationProviderAdapter> = {}): ProviderAdapter & GenerationProviderAdapter {
    return {
      ...fakeAdapter(),
      validateGenerationInput: vi.fn(() => ({ valid: true, errors: [] })),
      submitGeneration: vi.fn(async (request) => ({
        providerJobId: `provider-${request.idempotencyKey}`,
        capabilityUsed: request.capability,
        fallbackFired: null,
      })),
      getGenerationStatus: vi.fn(async (): Promise<ProviderGenerationStatus> => ({ state: "generating" })),
      ...overrides,
    };
  }

  const v2Requests: GenerationRequest[] = [
    { schemaVersion: 1, kind: "image-edit", capability: "kontext-edit", idempotencyKey: "edit", purpose: "style-preview", sourceImageAssetId: "p", instruction: "cartoon", outputMimeType: "image/png" },
    { schemaVersion: 1, kind: "image-edit", capability: "bg-remove", idempotencyKey: "bg", purpose: "object-cutout", sourceImageAssetId: "p", instruction: "remove background", outputMimeType: "image/png" },
    { schemaVersion: 1, kind: "image-to-3d", capability: "rodin-i3d", idempotencyKey: "mesh", purpose: "world-mesh", photos: [{ photoId: "p", sourceIndex: 1 }] },
    { schemaVersion: 1, kind: "text", capability: "gemini-text", idempotencyKey: "text", purpose: "quest", prompt: "quest json", output: "quest-json", maxCharacters: 1200 },
    { schemaVersion: 1, kind: "music", capability: "music", idempotencyKey: "music", purpose: "soundtrack", prompt: "instrumental", durationSeconds: 60, instrumental: true, loop: true },
    { schemaVersion: 1, kind: "sfx", capability: "mirelo-sfx", idempotencyKey: "sfx", purpose: "pickup", prompt: "chime", durationSeconds: 2, loop: false },
    { schemaVersion: 1, kind: "tts", capability: "chatterbox-tts", idempotencyKey: "tts", purpose: "narration", text: "Welcome", language: "en" },
    { schemaVersion: 1, kind: "video", capability: "pixverse-i2v", idempotencyKey: "video", purpose: "animated-postcard", sourceImageAssetId: "p", prompt: "orbit", durationSeconds: 5 },
  ];

  it("deduplicates every v2 generation kind (including the background-removal image-edit profile)", async () => {
    const adapter = fakeMultiAdapter();
    const manager = buildMulti(adapter);
    for (const request of v2Requests) {
      const first = await manager.submitGenerationOrReconcile(request, { worldId: "world-1" });
      const second = await manager.submitGenerationOrReconcile(request, { worldId: "world-1" });
      expect(first.status, request.idempotencyKey).toBe("created");
      expect(second.status, request.idempotencyKey).toBe("reconciled");
      expect(second.job.id).toBe(first.job.id);
    }
    expect(adapter.submitGeneration).toHaveBeenCalledTimes(v2Requests.length);
  });

  it("hard-rejects a request that exceeds the configured budget before provider submission", async () => {
    const adapter = fakeMultiAdapter();
    const manager = buildMulti(adapter);
    const costly = v2Requests.find((request) => request.capability === "rodin-i3d")!;
    await expect(manager.submitGenerationOrReconcile(costly, { requestLimitOverrideUsd: 0.1, worldId: "world-budget" }))
      .rejects.toMatchObject({ code: "budget_exceeded", retryable: false });
    expect(adapter.submitGeneration).not.toHaveBeenCalled();
  });

  it("records shared provenance and preserves a ready mesh when an independent TTS job fails", async () => {
    vi.mocked(downloadBounded).mockResolvedValue({ buffer: minimalGlb(), contentType: "model/gltf-binary" });
    const adapter = fakeMultiAdapter({
      getGenerationStatus: vi.fn(async (providerJobId): Promise<ProviderGenerationStatus> => {
        if (providerJobId.includes("tts")) return { state: "failed", error: { message: "voice unavailable", retryable: true } };
        return {
          state: "ready",
          actualCapabilityUsed: "rodin-i3d",
          actualFallbackFired: null,
          actualRegisteredModel: "fal-ai/hyper3d/rodin/v2.5",
          reportedCostUsd: 0.42,
          output: { url: "https://provider.example/mesh.glb", outputKind: "3d" },
        };
      }),
    });
    const manager = buildMulti(adapter);
    const meshRequest = v2Requests.find((request) => request.kind === "image-to-3d")!;
    const ttsRequest = v2Requests.find((request) => request.kind === "tts")!;
    const mesh = await manager.submitGenerationOrReconcile(meshRequest, { worldId: "world-partial" });
    const tts = await manager.submitGenerationOrReconcile(ttsRequest, { worldId: "world-partial" });
    const readyMesh = await manager.pollAndAdvance(mesh.job.id, { force: true });
    const failedTts = await manager.pollAndAdvance(tts.job.id, { force: true });
    expect(readyMesh).toMatchObject({
      state: "ready",
      kind: "image-to-3d",
      provenance: {
        requestedCapability: "rodin-i3d",
        servedCapability: "rodin-i3d",
        servedModel: "fal-ai/hyper3d/rodin/v2.5",
        reportedCost: { amount: 0.42, currency: "USD" },
      },
      result: { kind: "image-to-3d", asset: { id: expect.any(String) } },
    });
    expect(failedTts?.state).toBe("failed");
    expect((await manager.getPublic(mesh.job.id))?.state).toBe("ready");
  });

  it("submits once on create and the job is retrievable by idempotency key without a second submit", async () => {
    const adapter = fakeAdapter();
    const manager = build(adapter);

    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-1");
    expect(outcome.status).toBe("created");
    expect(outcome.job.state).toBe("generating");
    expect(outcome.job.providerJobId).toBe("provider-job-1");
    expect(adapter.submit).toHaveBeenCalledTimes(1);

    const reconciled = await manager.findByIdempotencyKey("idem-key-1");
    expect(reconciled?.id).toBe(outcome.job.id);
    expect(adapter.submit).toHaveBeenCalledTimes(1); // still just once
  });

  it("submitOrReconcile with the same key returns 'reconciled', never a second submit", async () => {
    const adapter = fakeAdapter();
    const manager = build(adapter);

    const first = await manager.submitOrReconcile(REQUEST, "idem-key-1b");
    const second = await manager.submitOrReconcile(REQUEST, "idem-key-1b");
    expect(second).toEqual({ status: "reconciled", job: expect.objectContaining({ id: first.job.id }) });
    expect(adapter.submit).toHaveBeenCalledTimes(1);
  });

  it("two concurrent submitOrReconcile calls with the same key never double-submit", async () => {
    const adapter = fakeAdapter();
    const manager = build(adapter);

    const [a, b] = await Promise.all([
      manager.submitOrReconcile(REQUEST, "idem-key-concurrent"),
      manager.submitOrReconcile(REQUEST, "idem-key-concurrent"),
    ]);
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    expect(a.job.id).toBe(b.job.id);
    // exactly one of the two calls observed "created"; the other reconciled.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["created", "reconciled"]);
  });

  it("reusing a key with a materially different request returns 'conflict' without submitting again", async () => {
    const adapter = fakeAdapter();
    const manager = build(adapter);

    await manager.submitOrReconcile(REQUEST, "idem-key-2");
    const conflict = await manager.submitOrReconcile(
      { capability: "tripo-mv3d", photos: [{ photoId: "p2", sourceIndex: 1, viewSlot: "front" }] },
      "idem-key-2",
    );
    expect(conflict.status).toBe("conflict");
    expect(adapter.submit).toHaveBeenCalledTimes(1);
  });

  it("marks the job failed (not stuck) when the provider submit throws, without a providerJobId", async () => {
    const adapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("upload failed"); }) });
    const manager = build(adapter);

    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-3");
    expect(outcome.job.state).toBe("failed");
    expect(outcome.job.providerJobId).toBeNull();
    expect(outcome.job.lastError?.message).toBe("upload failed");
  });

  it("sanitizes a lastError message so no raw URL ever reaches the public job", async () => {
    const adapter = fakeAdapter({
      submit: vi.fn(async () => {
        throw new Error("upstream said: https://agent.livepeer.org/a/abc123?token=SECRET failed");
      }),
    });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-sanitize");
    expect(outcome.job.lastError?.message).not.toMatch(/https?:\/\//);
    expect(outcome.job.lastError?.message).toContain("[redacted-url]");
  });

  it("pollAndAdvance downloads and finalizes a ready job into a durable AssetReference with ordered photos", async () => {
    vi.mocked(downloadBounded).mockResolvedValue({ buffer: minimalGlb(), contentType: "model/gltf-binary" });
    const adapter = fakeAdapter({
      getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({
        state: "ready",
        progress: { known: false },
        resultAssetUrl: "https://example.invalid/model.glb",
        actualRegisteredModel: "fal-ai/hyper3d/rodin/v2.5",
      })),
    });
    const photoStore = new PhotoStore(dir);
    const jobStore = new JobStore(dir);
    const assetStore = new AssetStore(dir);
    const manager = new JobManager(jobStore, adapter, assetStore, photoStore);

    // PhotoStore.store mints its own id (randomUUID) — the job request must
    // reference the photoId it actually returned.
    const stored = await photoStore.store(minimalJpeg(), 1, "p1.jpg");
    const outcome = await manager.submitOrReconcile(
      { capability: "rodin-i3d", photos: [{ photoId: stored.id, sourceIndex: 1 }] },
      "idem-key-4",
    );
    const updated = await manager.pollAndAdvance(outcome.job.id);

    expect(updated?.state).toBe("ready");
    expect(updated?.uiMessage).toBe("Model ready for preparation.");
    expect(updated?.resultAssetId).toBeTruthy();
    const asset = await assetStore.get(updated!.resultAssetId!);
    expect(asset?.sizeBytes).toBe(12);
    expect(asset?.provenance?.registeredModel).toBe("fal-ai/hyper3d/rodin/v2.5");
    expect(asset?.photos?.[0]?.id).toBe(stored.id);
  });

  it("repairs unknown model provenance from the existing provider job without resubmitting or downloading", async () => {
    vi.mocked(downloadBounded).mockResolvedValue({ buffer: minimalGlb(), contentType: "model/gltf-binary" });
    const getStatus = vi
      .fn<ProviderAdapter["getStatus"]>()
      .mockResolvedValueOnce({
        state: "ready",
        progress: { known: false },
        resultAssetUrl: "https://example.invalid/model.glb",
      })
      .mockResolvedValueOnce({
        state: "ready",
        progress: { known: false },
        resultAssetUrl: "https://example.invalid/model.glb",
        actualRegisteredModel: "fal-ai/hyper3d/rodin/v2.5",
      });
    const adapter = fakeAdapter({ getStatus });
    const photoStore = new PhotoStore(dir);
    const jobStore = new JobStore(dir);
    const assetStore = new AssetStore(dir);
    const manager = new JobManager(jobStore, adapter, assetStore, photoStore);
    const storedPhoto = await photoStore.store(minimalJpeg(), 1, "p1.jpg");
    const outcome = await manager.submitOrReconcile(
      { capability: "rodin-i3d", photos: [{ photoId: storedPhoto.id, sourceIndex: 1 }] },
      "objectquest-success-provenance-repair",
    );
    const ready = await manager.pollAndAdvance(outcome.job.id);
    const assetId = ready?.resultAssetId;
    expect(assetId).toBeTruthy();
    expect((await assetStore.get(assetId!))?.provenance?.registeredModel).toBe("unknown");

    const repaired = await manager.repairReadyAssetProvenance(outcome.job.id);
    expect(repaired?.id).toBe(assetId);
    expect(repaired?.provenance?.registeredModel).toBe("fal-ai/hyper3d/rodin/v2.5");
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(downloadBounded).toHaveBeenCalledTimes(1);

    // Re-running recovery is a no-op and does not hit the provider again.
    await expect(manager.repairReadyAssetProvenance(outcome.job.id)).resolves.toMatchObject({ id: assetId });
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(downloadBounded).toHaveBeenCalledTimes(1);
  });

  it("a poll failure backs off instead of marking the job failed on a transient blip", async () => {
    const adapter = fakeAdapter({ getStatus: vi.fn(async () => { throw new McpTransportError("network blip"); }) });
    const manager = build(adapter);

    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-5");
    const updated = await manager.pollAndAdvance(outcome.job.id);
    expect(updated?.state).toBe("generating");
  });

  it("marks an explicit failed provider status terminal while keeping raw diagnostics server-only", async () => {
    const getStatus = vi.fn(async (): Promise<ProviderStatusResult> => {
      throw new McpToolError(
        TERMINAL_STATUS_TEXT,
        "get_create_media",
        false,
        TERMINAL_STATUS_ENVELOPE,
      );
    });
    const adapter = fakeAdapter({
      submit: vi.fn(async (): Promise<ProviderSubmitResult> => ({
        providerJobId: "mjob_68bae8dfd271",
        capabilityUsed: "rodin-i3d",
        fallbackFired: null,
      })),
      getStatus,
    });
    const jobStore = new JobStore(dir);
    const manager = new JobManager(jobStore, adapter, new AssetStore(dir), new PhotoStore(dir));

    const outcome = await manager.submitOrReconcile(REQUEST, "objectquest-smoke-terminal-fixture");
    const updated = await manager.pollAndAdvance(outcome.job.id);

    expect(updated?.state).toBe("failed");
    expect(updated?.providerJobId).toBe("mjob_68bae8dfd271");
    expect(updated?.lastError).toMatchObject({
      code: "provider_failed",
      retryable: false,
    });
    expect(updated?.lastError?.message).toBe(
      "The provider rejected the generation request. Check the selected model settings and try again.",
    );
    expect(updated?.lastError?.message).not.toContain("dispatcher");
    expect(updated?.lastError?.message).not.toContain("463045388");
    expect(updated?.completedAt).toBeTruthy();

    const stored = await jobStore.get(outcome.job.id);
    expect(stored?.internal.lastProviderStatusRaw).toMatchObject({
      isError: true,
      structuredContent: {
        status: "failed",
        job_id: "mjob_68bae8dfd271",
        cost_disposition: "release_pending",
        error: {
          model_id: "fal-ai/hyper3d/rodin/v2.5",
          validation: [{ input: 463_045_388, ctx: { le: 65_535 } }],
        },
      },
    });

    // Terminal means subsequent reads return the stored failure and do not
    // keep hammering get_create_media forever.
    await manager.getPublic(outcome.job.id);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps polling an isError envelope that has no explicit terminal provider status", async () => {
    const raw = {
      isError: true,
      content: [{ type: "text", text: "temporary wrapper error" }],
      structuredContent: { error_retryable: false },
    };
    const getStatus = vi.fn(async (): Promise<ProviderStatusResult> => {
      throw new McpToolError("temporary wrapper error", "get_create_media", false, raw);
    });
    const jobStore = new JobStore(dir);
    const manager = new JobManager(jobStore, fakeAdapter({ getStatus }), new AssetStore(dir), new PhotoStore(dir));

    const outcome = await manager.submitOrReconcile(REQUEST, "objectquest-smoke-ambiguous-error");
    const updated = await manager.pollAndAdvance(outcome.job.id);

    expect(updated?.state).toBe("generating");
    expect(updated?.completedAt).toBeUndefined();
    expect((await jobStore.get(outcome.job.id))?.internal.lastProviderStatusRaw).toEqual(raw);
  });

  it("resumeOnBoot schedules an immediate poll for a job restored from disk mid-flight (providerJobId already set)", async () => {
    const adapter = fakeAdapter();
    const store = new JobStore(dir);
    const photoStore = new PhotoStore(dir);
    const manager = new JobManager(store, adapter, new AssetStore(dir), photoStore);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-6");
    expect(outcome.job.providerJobId).toBeTruthy();

    const restartedStore = new JobStore(dir);
    const restartedManager = new JobManager(restartedStore, adapter, new AssetStore(dir), photoStore);
    await restartedManager.resumeOnBoot();
    restartedManager.stopScheduler();

    const record = await restartedStore.findByIdempotencyKey("idem-key-6");
    expect(record).toBeDefined();
    expect(adapter.submit).toHaveBeenCalledTimes(1); // resume never resubmits an already-submitted job
  });

  it("resumeOnBoot re-drives an ambiguous pre-submit job (no providerJobId) using the SAME idempotency key", async () => {
    // Simulate a crash mid-submit: a job record left in "uploading" with no
    // providerJobId, as if the process died between accepting the request
    // and hearing back from adapter.submit.
    const jobStore = new JobStore(dir);
    const photoStore = new PhotoStore(dir);
    const assetStore = new AssetStore(dir);
    const crashedAdapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("never got here before crash"); }) });
    const crashedManager = new JobManager(jobStore, crashedAdapter, assetStore, photoStore);
    const failedOutcome = await crashedManager.submitOrReconcile(REQUEST, "idem-key-7");
    expect(failedOutcome.job.providerJobId).toBeNull();
    // Force the record back to "uploading" with no providerJobId, as a
    // genuine crash (rather than an observed failure) would leave it.
    const record = await jobStore.get(failedOutcome.job.id);
    record!.job.state = "uploading";
    delete record!.job.lastError;
    await jobStore.put(record!);

    const recoveredAdapter = fakeAdapter();
    const recoveredManager = new JobManager(jobStore, recoveredAdapter, assetStore, photoStore);
    await recoveredManager.resumeOnBoot();
    recoveredManager.stopScheduler();

    expect(recoveredAdapter.submit).toHaveBeenCalledTimes(1);
    const submittedRequest = vi.mocked(recoveredAdapter.submit).mock.calls[0]?.[0];
    expect(submittedRequest?.idempotencyKey).toBe("idem-key-7"); // same key, not a fresh one
    const finalRecord = await jobStore.get(failedOutcome.job.id);
    expect(finalRecord?.job.state).toBe("generating");
    expect(finalRecord?.job.providerJobId).toBe("provider-job-1");
  });

  it("resumeOnBoot refuses to auto-resubmit an ambiguous job older than the provider's confirmed idempotency retention", async () => {
    const jobStore = new JobStore(dir);
    const photoStore = new PhotoStore(dir);
    const assetStore = new AssetStore(dir);
    const crashedAdapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("never got here before crash"); }) });
    const crashedManager = new JobManager(jobStore, crashedAdapter, assetStore, photoStore);
    const failedOutcome = await crashedManager.submitOrReconcile(REQUEST, "idem-key-stale");

    // Simulate a crash left this job ambiguous, and it's now well past
    // Livepeer's documented 24h idempotency_key cache retention.
    const record = await jobStore.get(failedOutcome.job.id);
    record!.job.state = "uploading";
    record!.job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    delete record!.job.lastError;
    await jobStore.put(record!);

    const recoveredAdapter = fakeAdapter();
    const recoveredManager = new JobManager(jobStore, recoveredAdapter, assetStore, photoStore);
    await recoveredManager.resumeOnBoot();
    recoveredManager.stopScheduler();

    expect(recoveredAdapter.submit).not.toHaveBeenCalled(); // never guesses by resubmitting past the safe window
    const finalRecord = await jobStore.get(failedOutcome.job.id);
    expect(finalRecord?.job.state).toBe("failed");
    expect(finalRecord?.job.lastError?.code).toBe("idempotency_retention_expired");
    expect(finalRecord?.job.lastError?.retryable).toBe(false);
  });

  it("retry refuses to resubmit an ambiguous job older than the provider's confirmed idempotency retention", async () => {
    // NOTE: JsonFileStore caches in-memory per instance, so the manager
    // must be built on the SAME JobStore instance the test mutates through
    // (matching the resumeOnBoot recovery tests above) — a second
    // `new JobStore(dir)` would write to disk but the manager's own cached
    // copy would never see it.
    const jobStore = new JobStore(dir);
    const adapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("never reached provider"); }) });
    const manager = new JobManager(jobStore, adapter, new AssetStore(dir), new PhotoStore(dir));
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-stale-retry");
    expect(outcome.job.providerJobId).toBeNull();

    const record = await jobStore.get(outcome.job.id);
    record!.job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    delete record!.job.lastError;
    await jobStore.put(record!);

    const submitCallsBefore = vi.mocked(adapter.submit).mock.calls.length;
    const retried = await manager.retry(outcome.job.id);
    expect(retried?.state).toBe("failed");
    expect(retried?.lastError?.code).toBe("idempotency_retention_expired");
    expect(vi.mocked(adapter.submit).mock.calls.length).toBe(submitCallsBefore); // no resubmit attempt
  });

  it("retry reconciles an existing provider job instead of submitting a second generation", async () => {
    const adapter = fakeAdapter({
      getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({ state: "generating", progress: { known: false } })),
    });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-8");
    expect(adapter.submit).toHaveBeenCalledTimes(1);

    await manager.retry(outcome.job.id);
    expect(adapter.submit).toHaveBeenCalledTimes(1); // never a second generation
    expect(adapter.getStatus).toHaveBeenCalled();
  });

  it("retry recovers a job stuck 'failed' with a providerJobId by reconciling with the provider again", async () => {
    // First poll observes a provider-side failure...
    let providerState: ProviderStatusResult = {
      state: "failed",
      progress: { known: false },
      error: { message: "transient upstream hiccup", retryable: true },
    };
    const adapter = fakeAdapter({ getStatus: vi.fn(async () => providerState) });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-9");
    const polled = await manager.pollAndAdvance(outcome.job.id);
    expect(polled?.state).toBe("failed");

    // ...but the provider actually recovers by the time we retry.
    providerState = { state: "generating", progress: { known: false } };
    const retried = await manager.retry(outcome.job.id);
    expect(retried?.state).toBe("generating");
    expect(adapter.submit).toHaveBeenCalledTimes(1); // still only the original submit
  });

  it("retry refuses to reconcile a job whose failure was marked non-retryable", async () => {
    const { UnsafeUrlError } = await import("../persistence/fetchSafe.js");
    vi.mocked(downloadBounded).mockRejectedValue(new UnsafeUrlError("refusing non-https URL"));
    const adapter = fakeAdapter({
      getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({
        state: "ready",
        progress: { known: false },
        resultAssetUrl: "https://example.invalid/model.glb",
      })),
    });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-10");
    const polled = await manager.pollAndAdvance(outcome.job.id);
    expect(polled?.state).toBe("failed");
    expect(polled?.lastError?.retryable).toBe(false);

    const retried = await manager.retry(outcome.job.id);
    expect(retried?.state).toBe("failed"); // unchanged — refused, not re-attempted
    expect(adapter.getStatus).toHaveBeenCalledTimes(1); // no extra poll from the refused retry
  });

  it("retry resubmits with the same idempotency key when the job never reached the provider", async () => {
    let attempt = 0;
    const adapter = fakeAdapter({
      submit: vi.fn(async (request): Promise<ProviderSubmitResult> => {
        attempt += 1;
        expect(request.idempotencyKey).toBe("idem-key-11");
        if (attempt === 1) throw new Error("first attempt: transport blip");
        return { providerJobId: "provider-job-retry", capabilityUsed: "rodin-i3d", fallbackFired: null };
      }),
    });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-11");
    expect(outcome.job.state).toBe("failed");
    expect(outcome.job.providerJobId).toBeNull();

    const retried = await manager.retry(outcome.job.id);
    expect(retried?.state).toBe("generating");
    expect(retried?.providerJobId).toBe("provider-job-retry");
    expect(retried?.retryCount).toBe(1);
    expect(attempt).toBe(2);
  });

  it("retry refuses to resubmit past maxRetries", async () => {
    const adapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("always fails"); }) });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-12");
    let current = outcome.job;
    for (let i = 0; i < current.maxRetries; i++) {
      current = (await manager.retry(current.id))!;
    }
    expect(current.retryCount).toBe(outcome.job.maxRetries);
    const submitCallsBefore = vi.mocked(adapter.submit).mock.calls.length;
    const afterMax = await manager.retry(current.id);
    expect(afterMax?.retryCount).toBe(outcome.job.maxRetries);
    expect(vi.mocked(adapter.submit).mock.calls.length).toBe(submitCallsBefore); // no further attempt
  });

  it("concurrent pollAndAdvance calls for the same job don't double-finalize or lose the winning write", async () => {
    vi.mocked(downloadBounded).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { buffer: minimalGlb(), contentType: "model/gltf-binary" };
    });
    const adapter = fakeAdapter({
      getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({
        state: "ready",
        progress: { known: false },
        resultAssetUrl: "https://example.invalid/model.glb",
      })),
    });
    const manager = build(adapter);
    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-13");

    const [a, b] = await Promise.all([
      manager.pollAndAdvance(outcome.job.id),
      manager.pollAndAdvance(outcome.job.id),
    ]);
    expect(a?.state).toBe("ready");
    expect(b?.state).toBe("ready");
    // The per-job lock fully serializes the two calls: whichever runs
    // second sees the record already terminal and short-circuits before
    // calling the provider again — so both getStatus and the download only
    // ever happen once, not twice.
    expect(vi.mocked(adapter.getStatus)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadBounded)).toHaveBeenCalledTimes(1);
  });
});
