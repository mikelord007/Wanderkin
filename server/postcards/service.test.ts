import { describe, expect, it, vi } from "vitest";
import lostColorsFixture from "../../shared/fixtures/lost-colors.json";
import { migrateSceneManifest } from "../../shared/manifest-migration.js";
import type { GenerationJob } from "../../shared/job.js";
import type { GeneratedImageReference } from "../../shared/generation.js";
import type { SceneManifest } from "../../shared/manifest.js";
import type { PostcardCacheRecord } from "./store.js";
import { POSTCARD_MAX_COST_USD, PostcardService, fingerprintWorld, postcardPrompt } from "./service.js";

const manifest = migrateSceneManifest(lostColorsFixture);

const provenance = {
  providerId: "fixture-provider",
  requestedCapability: "pixverse-i2v",
  servedCapability: "pixverse-i2v",
  servedModel: "fixture/pixverse",
  applicationJobId: "job-postcard",
  providerJobId: "provider-postcard",
  timings: { requestedAt: "2026-09-24T10:00:00.000Z", completedAt: "2026-09-24T10:00:05.000Z" },
  reportedCost: { amount: POSTCARD_MAX_COST_USD, currency: "USD", unit: "generated-second" },
} as const;

function job(state: GenerationJob["state"]): GenerationJob {
  return {
    schemaVersion: 1,
    id: "job-postcard",
    idempotencyKey: `postcard_${fingerprintWorld(manifest)}`,
    providerId: "fixture-provider",
    providerJobId: "provider-postcard",
    capabilityRequested: "pixverse-i2v",
    capabilityUsed: "pixverse-i2v",
    fallbackFired: null,
    state,
    photoOrder: [1],
    createdAt: "2026-09-24T10:00:00.000Z",
    updatedAt: "2026-09-24T10:00:05.000Z",
    retryCount: 0,
    maxRetries: 3,
    kind: "video",
    provenance,
    ...(state === "failed"
      ? { lastError: { message: "fixture failure", retryable: true, occurredAt: "2026-09-24T10:00:05.000Z" } }
      : {}),
    ...(state === "ready"
      ? {
          completedAt: "2026-09-24T10:00:05.000Z",
          resultAssetId: "postcard-video",
          result: {
            kind: "video" as const,
            asset: {
              schemaVersion: 1 as const,
              mediaType: "video" as const,
              kind: "animated-postcard" as const,
              id: "postcard-video",
              url: "/api/generated-assets/files/postcard.mp4",
              sha256: "6".repeat(64),
              sizeBytes: 16_384,
              mimeType: "video/mp4",
              durationSeconds: 5,
              width: 1280,
              height: 720,
              source: "generated-animation" as const,
              provenance,
            },
          },
        }
      : {}),
  };
}

const screenshot = {
  id: "screenshot",
  url: "/api/generated-assets/files/screenshot.png",
  sha256: "a".repeat(64),
  sizeBytes: 1024,
  mimeType: "image/png",
  width: 1280,
  height: 720,
  provenance: { ...provenance, requestedCapability: "browser-world-capture", servedCapability: "browser-world-capture" },
} satisfies GeneratedImageReference;

function harness(firstJob: GenerationJob) {
  let savedManifest: SceneManifest = manifest;
  let cached: PostcardCacheRecord | undefined;
  const levels = {
    get: vi.fn(async () => savedManifest),
    save: vi.fn(async (_id: string, next: SceneManifest) => {
      savedManifest = next;
      return next;
    }),
  };
  const jobs = {
    getPublic: vi.fn(async () => firstJob),
    submitGenerationOrReconcile: vi.fn(async () => ({ status: "created" as const, job: firstJob })),
    retry: vi.fn(async () => firstJob),
  };
  const cache = {
    get: vi.fn(async () => cached),
    put: vi.fn(async (record: PostcardCacheRecord) => { cached = record; }),
  };
  const assets = { getProviderImage: vi.fn(async () => screenshot) };
  return { service: new PostcardService(levels, assets, jobs, cache), levels, jobs, cache, current: () => savedManifest };
}

describe("PostcardService", () => {
  it("deduplicates an unchanged world and reuses its existing job", async () => {
    const subject = harness(job("generating"));
    const first = await subject.service.create(manifest.levelId, screenshot.id);
    const second = await subject.service.create(manifest.levelId, screenshot.id);

    expect(first).toMatchObject({ state: "job", cacheHit: false });
    expect(second).toMatchObject({ state: "job", cacheHit: true });
    expect(subject.jobs.submitGenerationOrReconcile).toHaveBeenCalledTimes(1);
    expect(subject.jobs.submitGenerationOrReconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        capability: "pixverse-i2v",
        durationSeconds: 5,
        sourceImageAssetId: screenshot.id,
      }),
      { worldId: manifest.levelId, requestLimitOverrideUsd: POSTCARD_MAX_COST_USD },
    );
  });

  it("isolates a failed optional video from the playable level", async () => {
    const subject = harness(job("failed"));
    await subject.service.create(manifest.levelId, screenshot.id);

    expect(subject.levels.save).not.toHaveBeenCalled();
    expect(subject.current().media?.video ?? []).toHaveLength(0);
    expect(subject.current().assets).toEqual(manifest.assets);
  });

  it("records a ready animated postcard with provider provenance and cost", async () => {
    const subject = harness(job("ready"));
    await subject.service.create(manifest.levelId, screenshot.id);

    const [video] = subject.current().media?.video ?? [];
    expect(video).toMatchObject({
      kind: "animated-postcard",
      source: "generated-animation",
      provenance: {
        requestedCapability: "pixverse-i2v",
        servedCapability: "pixverse-i2v",
        servedModel: "fixture/pixverse",
        reportedCost: { amount: POSTCARD_MAX_COST_USD, currency: "USD" },
      },
    });
  });

  it("derives the animation prompt from the saved style and atmosphere", () => {
    expect(postcardPrompt(manifest)).toContain("cartoon art direction");
    expect(postcardPrompt(manifest)).toContain("cheerful floating island");
    expect(postcardPrompt(manifest)).toContain("Do not add captions");
  });
});
