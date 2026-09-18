import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderAdapter, ProviderStatusResult, ProviderSubmitResult } from "../../shared/provider.js";
import { AssetStore } from "../persistence/assetStore.js";
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

describe("JobManager", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "objectquest-jobs-"));
    vi.mocked(downloadBounded).mockReset();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("submits once on create and the job is retrievable by idempotency key without a second submit", async () => {
    const adapter = fakeAdapter();
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));

    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-1",
    );
    expect(job.state).toBe("generating");
    expect(job.providerJobId).toBe("provider-job-1");
    expect(adapter.submit).toHaveBeenCalledTimes(1);

    const reconciled = await manager.findByIdempotencyKey("idem-key-1");
    expect(reconciled?.id).toBe(job.id);
    expect(adapter.submit).toHaveBeenCalledTimes(1); // still just once
  });

  it("marks the job failed (not stuck) when the provider submit throws, without a providerJobId", async () => {
    const adapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("upload failed"); }) });
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));

    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-2",
    );
    expect(job.state).toBe("failed");
    expect(job.providerJobId).toBeNull();
    expect(job.lastError?.message).toBe("upload failed");
  });

  it("pollAndAdvance downloads and finalizes a ready job into a durable AssetReference", async () => {
    vi.mocked(downloadBounded).mockResolvedValue({ buffer: minimalGlb(), contentType: "model/gltf-binary" });
    const adapter = fakeAdapter({
      getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({
        state: "ready",
        progress: { known: false },
        resultAssetUrl: "https://example.invalid/model.glb",
        actualRegisteredModel: "fal-ai/hyper3d/rodin/v2.5",
      })),
    });
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));

    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-3",
    );
    const updated = await manager.pollAndAdvance(job.id);

    expect(updated?.state).toBe("ready");
    expect(updated?.resultAssetId).toBeTruthy();
    const asset = await new AssetStore(dir).get(updated!.resultAssetId!);
    expect(asset?.sizeBytes).toBe(12);
    expect(asset?.provenance?.registeredModel).toBe("fal-ai/hyper3d/rodin/v2.5");
  });

  it("a poll failure backs off instead of marking the job failed on a transient blip", async () => {
    const adapter = fakeAdapter({ getStatus: vi.fn(async () => { throw new Error("network blip"); }) });
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));

    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-4",
    );
    const updated = await manager.pollAndAdvance(job.id);
    expect(updated?.state).toBe("generating");
  });

  it("resumeOnBoot schedules an immediate poll for a job restored from disk mid-flight", async () => {
    const adapter = fakeAdapter();
    const store = new JobStore(dir);
    const manager = new JobManager(store, adapter, new AssetStore(dir));
    await manager.create({ capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] }, "idem-key-5");

    // Simulate a restart: fresh store/manager instances over the same files.
    const restartedStore = new JobStore(dir);
    const restartedManager = new JobManager(restartedStore, adapter, new AssetStore(dir));
    await restartedManager.resumeOnBoot();
    restartedManager.stopScheduler();

    const record = await restartedStore.findByIdempotencyKey("idem-key-5");
    expect(record).toBeDefined();
  });

  it("retry reconciles an existing provider job instead of submitting a second generation", async () => {
    const adapter = fakeAdapter({
      getStatus: vi.fn(async (): Promise<ProviderStatusResult> => ({ state: "generating", progress: { known: false } })),
    });
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));
    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-6",
    );
    expect(adapter.submit).toHaveBeenCalledTimes(1);

    await manager.retry(job.id);
    expect(adapter.submit).toHaveBeenCalledTimes(1); // never a second generation
    expect(adapter.getStatus).toHaveBeenCalled();
  });

  it("retry resubmits with the same idempotency key when the job never reached the provider", async () => {
    let attempt = 0;
    const adapter = fakeAdapter({
      submit: vi.fn(async (request): Promise<ProviderSubmitResult> => {
        attempt += 1;
        expect(request.idempotencyKey).toBe("idem-key-7");
        if (attempt === 1) throw new Error("first attempt: transport blip");
        return { providerJobId: "provider-job-retry", capabilityUsed: "rodin-i3d", fallbackFired: null };
      }),
    });
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));
    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-7",
    );
    expect(job.state).toBe("failed");
    expect(job.providerJobId).toBeNull();

    const retried = await manager.retry(job.id);
    expect(retried?.state).toBe("generating");
    expect(retried?.providerJobId).toBe("provider-job-retry");
    expect(retried?.retryCount).toBe(1);
    expect(attempt).toBe(2);
  });

  it("retry refuses to resubmit past maxRetries", async () => {
    const adapter = fakeAdapter({ submit: vi.fn(async () => { throw new Error("always fails"); }) });
    const manager = new JobManager(new JobStore(dir), adapter, new AssetStore(dir));
    const job = await manager.create(
      { capability: "rodin-i3d", photos: [{ photoId: "p1", sourceIndex: 1 }] },
      "idem-key-8",
    );
    let current = job;
    for (let i = 0; i < job.maxRetries; i++) {
      current = (await manager.retry(current.id))!;
    }
    expect(current.retryCount).toBe(job.maxRetries);
    const submitCallsBefore = vi.mocked(adapter.submit).mock.calls.length;
    const afterMax = await manager.retry(current.id);
    expect(afterMax?.retryCount).toBe(job.maxRetries);
    expect(vi.mocked(adapter.submit).mock.calls.length).toBe(submitCallsBefore); // no further attempt
  });
});
