import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderAdapter, ProviderStatusResult, ProviderSubmitResult } from "../../shared/provider.js";
import { AssetStore } from "../persistence/assetStore.js";
import { PhotoStore } from "../persistence/photoStore.js";
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

  it("a poll failure backs off instead of marking the job failed on a transient blip", async () => {
    const adapter = fakeAdapter({ getStatus: vi.fn(async () => { throw new Error("network blip"); }) });
    const manager = build(adapter);

    const outcome = await manager.submitOrReconcile(REQUEST, "idem-key-5");
    const updated = await manager.pollAndAdvance(outcome.job.id);
    expect(updated?.state).toBe("generating");
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
