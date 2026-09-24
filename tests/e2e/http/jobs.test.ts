import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GenerationJob } from "../../../shared/job.js";
import type { GenerationProvenance } from "../../../shared/provenance.js";
import { PreviewCacheStore } from "../../../server/jobs/previewCache.js";
import { GeneratedAssetStore } from "../../../server/persistence/generatedAssetStore.js";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { readSamplePhoto, uniqueIdempotencyKey } from "./helpers/fixtures.js";
import { defaultMcpHandlers, runCapabilitySucceeds } from "./helpers/mcpHandlers.js";

interface UploadedPhoto {
  id: string;
  order: number;
}

interface JobRequest {
  capability: "rodin-i3d";
  photos: Array<{ photoId: string; sourceIndex: number }>;
  scenePrompt?: string;
}

/**
 * These are HTTP integration tests: every request crosses a real
 * server/index.ts process and durable JSON/file stores. The provider is a
 * local fake MCP endpoint, so this suite can never spend allowance or start
 * real Livepeer generation.
 */
describe("POST /api/jobs, status, retry, and restart reconciliation", () => {
  let api: ApiServerHandle | undefined;
  let mcp: FakeMcpServer | undefined;
  let retainedStorageDir: string | undefined;

  beforeEach(() => {
    api = undefined;
    mcp = undefined;
    retainedStorageDir = undefined;
  });

  afterEach(async () => {
    await api?.stop();
    await mcp?.close();
    if (retainedStorageDir) {
      rmSync(retainedStorageDir, { recursive: true, force: true });
    }
  });

  async function boot(): Promise<void> {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url });
  }

  async function uploadPhoto(sample: 1 | 2 | 3 | 4 | 5 = 1): Promise<UploadedPhoto> {
    const form = new FormData();
    form.append(
      "photos",
      new Blob([new Uint8Array(readSamplePhoto(sample))], { type: "image/jpeg" }),
      `photo-${sample}.jpg`,
    );
    const response = await fetch(`${api!.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    const [photo] = (await response.json()) as UploadedPhoto[];
    return photo!;
  }

  function requestFor(photo: UploadedPhoto, scenePrompt = "A tiny furniture course"): JobRequest {
    return {
      capability: "rodin-i3d",
      photos: [{ photoId: photo.id, sourceIndex: 4 }],
      scenePrompt,
    };
  }

  async function submit(key: string, body: JobRequest): Promise<Response> {
    return fetch(`${api!.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  }

  it("allows only one provider submission when identical same-key requests race", async () => {
    await boot();
    const photo = await uploadPhoto(4);
    const key = uniqueIdempotencyKey("concurrent");
    const request = requestFor(photo);

    mcp!.setHandler("run_capability", async (args) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        job_id: `fake-job-${args.idempotency_key}`,
        status: "submitted",
        capability_used: args.capability,
        fallback_fired: null,
      };
    });

    const [first, second] = await Promise.all([submit(key, request), submit(key, request)]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    const [firstJob, secondJob] = (await Promise.all([first.json(), second.json()])) as GenerationJob[];
    expect(secondJob.id).toBe(firstJob.id);
    expect(firstJob.idempotencyKey).toBe(key);
    expect(firstJob.photoOrder).toEqual([4]);
    expect(mcp!.callsFor("run_capability")).toHaveLength(1);
    expect(mcp!.callsFor("upload")).toHaveLength(1);
  });

  it("returns 409 when the same idempotency key is reused for a different payload", async () => {
    await boot();
    const photo = await uploadPhoto(2);
    const key = uniqueIdempotencyKey("conflict");

    const created = await submit(key, requestFor(photo, "first prompt"));
    expect(created.status).toBe(201);
    const conflict = await submit(key, requestFor(photo, "different prompt"));
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as { message: string };
    expect(Object.keys(body)).toEqual(["message"]);
    expect(body.message).toMatch(/already used for a different request/i);
    expect(mcp!.callsFor("run_capability")).toHaveLength(1);
  });

  it("reconciles the same durable job after an API process restart without resubmitting", async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url, removeStorageOnStop: false });
    retainedStorageDir = api.storageDir;
    const photo = await uploadPhoto(3);
    const key = uniqueIdempotencyKey("restart");
    const request = requestFor(photo);

    const createdResponse = await submit(key, request);
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as GenerationJob;
    expect(mcp!.callsFor("run_capability")).toHaveLength(1);

    await api!.stop();
    api = undefined;
    api = await startApiServer({
      mcpEndpoint: mcp!.url,
      storageDir: retainedStorageDir,
      removeStorageOnStop: false,
    });

    const reconciledResponse = await submit(key, request);
    expect(reconciledResponse.status).toBe(200);
    const reconciled = (await reconciledResponse.json()) as GenerationJob;
    expect(reconciled.id).toBe(created.id);
    expect(reconciled.providerJobId).toBe(created.providerJobId);
    expect(mcp!.callsFor("run_capability")).toHaveLength(1);
  });

  it("retry with a provider job id polls the existing job and never submits again", async () => {
    await boot();
    const photo = await uploadPhoto(1);
    const key = uniqueIdempotencyKey("poll-retry");
    const createdResponse = await submit(key, requestFor(photo));
    const created = (await createdResponse.json()) as GenerationJob;

    mcp!.setHandler("get_create_media", () => ({ status: "running" }));
    const retryResponse = await fetch(`${api!.baseUrl}/api/jobs/${created.id}/retry`, { method: "POST" });
    expect(retryResponse.status).toBe(200);
    const retried = (await retryResponse.json()) as GenerationJob;
    expect(retried.id).toBe(created.id);
    expect(retried.state).toBe("generating");
    expect(mcp!.callsFor("run_capability")).toHaveLength(1);
    expect(mcp!.callsFor("get_create_media")).toHaveLength(1);
  });

  it("sanitizes a failed submit, then retries with the same provider request and cached upload URL", async () => {
    await boot();
    const photo = await uploadPhoto(5);
    const key = uniqueIdempotencyKey("failed-submit-retry");
    mcp!.setHandler("run_capability", () => ({
      error: "provider rejected https://signed.example/private.glb?token=TOP_SECRET",
      error_retryable: true,
    }));

    const failedResponse = await submit(key, requestFor(photo));
    expect(failedResponse.status).toBe(502);
    const failed = (await failedResponse.json()) as GenerationJob;
    expect(failed.state).toBe("failed");
    expect(failed.providerJobId).toBeNull();
    expect(failed.lastError?.retryable).toBe(true);
    expect(failed.lastError?.message).toContain("[redacted-url]");
    expect(failed.lastError?.message).not.toMatch(/TOP_SECRET|signed\.example|https?:\/\//i);
    expect(JSON.stringify(failed)).not.toMatch(/stack|private\.glb/i);

    mcp!.setHandler("run_capability", runCapabilitySucceeds());
    const retryResponse = await fetch(`${api!.baseUrl}/api/jobs/${failed.id}/retry`, { method: "POST" });
    expect(retryResponse.status).toBe(200);
    const retried = (await retryResponse.json()) as GenerationJob;
    expect(retried.providerJobId).toContain(key);
    expect(retried.retryCount).toBe(1);

    const runCalls = mcp!.callsFor("run_capability");
    expect(runCalls).toHaveLength(2);
    expect(runCalls[1]!.args.idempotency_key).toBe(key);
    expect(runCalls[1]!.args.inputs).toEqual(runCalls[0]!.args.inputs);
    expect(runCalls[1]!.args.source_url).toBe(runCalls[0]!.args.source_url);
    expect(mcp!.callsFor("upload")).toHaveLength(1);
  });

  it("uses a stable plain error response for malformed and unknown requests", async () => {
    await boot();
    const missingKey = await fetch(`${api!.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: "rodin-i3d", photos: [] }),
    });
    expect(missingKey.status).toBe(400);
    expect(Object.keys((await missingKey.json()) as object)).toEqual(["message"]);

    const unknown = await fetch(`${api!.baseUrl}/api/jobs/not-a-real-job/retry`, { method: "POST" });
    expect(unknown.status).toBe(404);
    const unknownBody = (await unknown.json()) as { message: string };
    expect(unknownBody).toEqual({ message: "Job not found" });
  });

  it("submits and deduplicates a shared v2 text job and records world spend", async () => {
    await boot();
    const key = uniqueIdempotencyKey("v2-text");
    const request = {
      schemaVersion: 1,
      kind: "text",
      capability: "gemini-text",
      idempotencyKey: key,
      purpose: "quest-text",
      prompt: "Return a constrained Lost Colors quest JSON object.",
      output: "quest-json",
      maxCharacters: 1200,
    } as const;
    const send = () => fetch(`${api!.baseUrl}/api/jobs/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ request, worldId: "world-v2-text", maxCostUsd: 0.01 }),
    });
    const first = await send();
    const firstJob = await first.json() as GenerationJob;
    const second = await send();
    const secondJob = await second.json() as GenerationJob;
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondJob.id).toBe(firstJob.id);
    expect(firstJob).toMatchObject({ kind: "text", state: "generating", request: { purpose: "quest-text" } });
    expect(mcp!.callsFor("run_capability")).toHaveLength(1);
    const spend = await fetch(`${api!.baseUrl}/api/jobs/spend/world-v2-text`);
    expect(await spend.json()).toMatchObject({ worldId: "world-v2-text", entries: 1, unknownEntries: 0 });
  });

  it("hard-rejects an over-budget v2 mesh before upload or provider submission", async () => {
    await boot();
    const photo = await uploadPhoto(1);
    const key = uniqueIdempotencyKey("v2-budget");
    const response = await fetch(`${api!.baseUrl}/api/jobs/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        request: {
          schemaVersion: 1, kind: "image-to-3d", capability: "rodin-i3d", idempotencyKey: key,
          purpose: "world-mesh", photos: [{ photoId: photo.id, sourceIndex: 1 }],
        },
        worldId: "world-over-budget",
        maxCostUsd: 0.1,
      }),
    });
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "budget_exceeded", message: expect.stringMatching(/per-request limit/) });
    expect(mcp!.callsFor("upload")).toHaveLength(0);
    expect(mcp!.callsFor("run_capability")).toHaveLength(0);
  });

  it("uses a generated cutout for 3D, keeps style provenance provider-inert, and reuses its hosted URL on retry", async () => {
    await boot();
    const generatedAssets = new GeneratedAssetStore(api!.storageDir);
    const provenance = (requestedCapability: string, applicationJobId: string): GenerationProvenance => ({
      providerId: "fake-provider",
      requestedCapability,
      servedCapability: requestedCapability,
      servedModel: "fake/model",
      applicationJobId,
      providerJobId: `provider-${applicationJobId}`,
      timings: { requestedAt: "2026-09-24T00:00:00.000Z" },
      reportedCost: null,
    });
    const cutout = await generatedAssets.storeImage(
      readSamplePhoto(1),
      "image/jpeg",
      provenance("bg-remove", "job-cutout"),
    );
    const styleReference = await generatedAssets.storeImage(
      readSamplePhoto(2),
      "image/jpeg",
      provenance("kontext-edit", "job-style-preview"),
    );
    const previewCache = new PreviewCacheStore(api!.storageDir);
    const previewKey = "a".repeat(64);
    await previewCache.put(previewKey, "job-style-preview");
    // Exercise backward compatibility with approvals written before cache
    // records carried a direct generated-asset id.
    await previewCache.approve(previewKey, "job-style-preview");
    const key = uniqueIdempotencyKey("v2-generated-cutout");
    const request = {
      schemaVersion: 1,
      kind: "image-to-3d",
      capability: "rodin-i3d",
      idempotencyKey: key,
      purpose: "world-mesh",
      sourceImageAssetIds: [cutout.id],
      styleReferenceAssetId: styleReference.id,
      scenePrompt: "Preserve the reviewed object silhouette.",
    } as const;
    const post = (body: unknown) => fetch(`${api!.baseUrl}/api/jobs/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ request: body, worldId: "world-generated-cutout" }),
    });

    mcp!.setHandler("run_capability", () => ({
      error: "temporary provider failure",
      error_retryable: true,
    }));
    const failedResponse = await post(request);
    expect(failedResponse.status).toBe(502);
    const failed = await failedResponse.json() as GenerationJob;
    expect(failed).toMatchObject({
      request: {
        sourceImageAssetIds: [cutout.id],
        styleReferenceAssetId: styleReference.id,
      },
      provenance: {
        sourceImageAssetIds: [cutout.id],
        styleReferenceAssetId: styleReference.id,
      },
    });

    mcp!.setHandler("run_capability", runCapabilitySucceeds());
    const retryResponse = await fetch(`${api!.baseUrl}/api/jobs/${failed.id}/retry`, { method: "POST" });
    expect(retryResponse.status).toBe(200);
    const retried = await retryResponse.json() as GenerationJob;
    expect(retried.provenance).toMatchObject({
      sourceImageAssetIds: [cutout.id],
      styleReferenceAssetId: styleReference.id,
    });
    expect(mcp!.callsFor("upload")).toHaveLength(1);
    const runCalls = mcp!.callsFor("run_capability");
    expect(runCalls).toHaveLength(2);
    expect(runCalls[1]!.args.inputs).toEqual(runCalls[0]!.args.inputs);
    expect(runCalls[1]!.args.source_url).toBe(runCalls[0]!.args.source_url);
    expect(JSON.stringify(runCalls[0]!.args)).not.toContain(styleReference.id);

    const conflict = await post({ ...request, styleReferenceAssetId: undefined });
    expect(conflict.status).toBe(409);
    expect(mcp!.callsFor("run_capability")).toHaveLength(2);
  });
});
