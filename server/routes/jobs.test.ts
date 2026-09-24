import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "../../shared/job.js";
import type { ProviderAdapter } from "../../shared/provider.js";
import type { JobManager } from "../jobs/manager.js";
import { PreviewCacheStore } from "../jobs/previewCache.js";
import { SpendLedger } from "../jobs/spendLedger.js";
import { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import { PhotoStore } from "../persistence/photoStore.js";
import { createJobsRouter } from "./jobs.js";

function jpeg(): Buffer {
  const value = Buffer.alloc(512); value[0] = 0xff; value[1] = 0xd8; value[2] = 0xff; return value;
}

describe("multi-kind job routes", () => {
  let dir: string;
  let close: (() => Promise<void>) | undefined;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "objectquest-routes-")); });
  afterEach(async () => { await close?.(); rmSync(dir, { recursive: true, force: true }); });

  async function start(manager: JobManager, photos: PhotoStore, previews: PreviewCacheStore): Promise<string> {
    const app = express(); app.use(express.json());
    const adapter = { validateInput: () => ({ valid: true, errors: [] }) } as unknown as ProviderAdapter;
    app.use(createJobsRouter(manager, adapter, photos, new GeneratedAssetStore(dir), previews, new SpendLedger(dir)));
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    close = () => new Promise<void>((resolve) => listener.close(() => resolve()));
    return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  }

  it("returns an approved unchanged style preview from cache without resubmitting", async () => {
    const photos = new PhotoStore(dir);
    const photo = await photos.store(jpeg(), 1, "object.jpg");
    const previews = new PreviewCacheStore(dir);
    const jobs = new Map<string, GenerationJob>();
    const submitGenerationOrReconcile = vi.fn(async (request) => {
      const job = {
        schemaVersion: 1, id: "job-preview", idempotencyKey: request.idempotencyKey,
        providerId: "fake", providerJobId: "mjob_preview", capabilityRequested: request.capability,
        capabilityUsed: request.capability, fallbackFired: null, state: "ready", photoOrder: [1],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), retryCount: 0, maxRetries: 2,
        kind: "image-edit", request,
      } satisfies GenerationJob;
      jobs.set(job.id, job);
      return { status: "created" as const, job };
    });
    const manager = {
      submitGenerationOrReconcile,
      getPublic: vi.fn(async (id: string) => jobs.get(id)),
    } as unknown as JobManager;
    const baseUrl = await start(manager, photos, previews);
    const request = {
      schemaVersion: 1, kind: "image-edit", capability: "kontext-edit", idempotencyKey: "preview-one",
      purpose: "style-preview", sourceImageAssetId: photo.id, instruction: "watercolor", outputMimeType: "image/png",
    } as const;
    const first = await fetch(`${baseUrl}/api/jobs/previews`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.idempotencyKey },
      body: JSON.stringify({ request, worldId: "world-1" }),
    });
    const created = await first.json() as { cacheKey: string; job: GenerationJob };
    expect(first.status).toBe(201);
    const approved = await fetch(`${baseUrl}/api/jobs/preview-cache/${created.cacheKey}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: created.job.id }),
    });
    expect(approved.status).toBe(200);

    const secondRequest = { ...request, idempotencyKey: "preview-two" };
    const second = await fetch(`${baseUrl}/api/jobs/previews`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": secondRequest.idempotencyKey },
      body: JSON.stringify({ request: secondRequest, worldId: "world-1" }),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ cacheHit: true, approved: true, job: { id: "job-preview" } });
    expect(submitGenerationOrReconcile).toHaveBeenCalledTimes(1);
  });
});
