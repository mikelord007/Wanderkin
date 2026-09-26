import { describe, expect, it, vi } from "vitest";
import type { GenerationJob, GenerationRequest, ImageTo3dGenerationRequest } from "@shared/index.js";
import { createCreationRecord, type CreationRecord } from "./creationFlow.js";
import { updateCreationJob } from "./creationStorage.js";
import { extrasToSubmit } from "./pendingWorlds.js";
import { EXTRAS_MAX_ASKS, EXTRAS_REASK_MS, reaskMissingExtras, startWorldBuild } from "./worldBuild.js";

const approved: CreationRecord = {
  ...createCreationRecord("world-1", "2026-09-26T09:00:00.000Z"),
  step: "preview",
  photo: { id: "photo-1", url: "/photos/1.jpg", order: 1 },
  selection: { style: "cartoon", mode: "race", atmosphere: "Forest region" },
};

const shapeRequest: ImageTo3dGenerationRequest = {
  schemaVersion: 1, kind: "image-to-3d", capability: "rodin-i3d", idempotencyKey: "shape-1", purpose: "world-mesh",
  photos: [{ photoId: "photo-1", sourceIndex: 1 }],
};

function job(id: string, kind: GenerationJob["kind"]): GenerationJob {
  return {
    schemaVersion: 1, id, idempotencyKey: id, providerId: "livepeer-agent-mcp", providerJobId: null,
    capabilityRequested: "x", capabilityUsed: null, fallbackFired: null, state: "queued", photoOrder: [],
    createdAt: "2026-09-26T09:00:00.000Z", updatedAt: "2026-09-26T09:00:00.000Z", retryCount: 0, maxRetries: 3,
    ...(kind ? { kind } : {}),
  };
}

describe("reaskMissingExtras", () => {
  const building: CreationRecord = {
    ...approved,
    step: "building",
    jobs: { shape: { id: "shape-1", state: "generating", kind: "image-to-3d" } },
  };

  it("asks again for story and music the server turned away, throttled, until both are recorded", async () => {
    let record = building;
    const state = new Map<string, { at: number; count: number }>();
    let busy = true;
    const submit = vi.fn(async (request: GenerationRequest) => {
      if (busy && request.kind === "music") throw Object.assign(new Error("The generation service is at capacity."), { status: 429 });
      return job(`job-${request.kind}`, request.kind);
    });
    const deps = (now: number) => ({ submit, key: (prefix: string) => `${prefix}-${now}`, now, record: (stage: "story" | "music", accepted: GenerationJob) => { record = updateCreationJob(record, stage, accepted); } });

    // Like creations B and C on the live server: the service was busy.
    await reaskMissingExtras(record, deps(0), state);
    expect(record.jobs.story?.id).toBe("job-text");
    expect(record.jobs.music).toBeUndefined();

    await reaskMissingExtras(record, deps(EXTRAS_REASK_MS - 1), state);
    expect(submit).toHaveBeenCalledTimes(2);

    busy = false;
    await reaskMissingExtras(record, deps(EXTRAS_REASK_MS), state);
    expect(record.jobs.music?.id).toBe("job-music");
    expect(submit.mock.calls.map(([request]) => request.kind)).toEqual(["text", "music", "music"]);

    await reaskMissingExtras(record, deps(10 * EXTRAS_REASK_MS), state);
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it("stops repeating a request the server keeps refusing", async () => {
    const state = new Map<string, { at: number; count: number }>();
    const submit = vi.fn(async () => { throw new Error("Invalid generation request"); });
    for (let ask = 0; ask < EXTRAS_MAX_ASKS + 3; ask += 1) {
      await reaskMissingExtras(building, { submit, record: vi.fn(), key: (prefix) => prefix, now: ask * EXTRAS_REASK_MS }, state);
    }
    expect(submit).toHaveBeenCalledTimes(EXTRAS_MAX_ASKS * 2);
  });

  it("leaves worlds that are not building, or have everything, alone", async () => {
    const submit = vi.fn();
    await reaskMissingExtras(approved, { submit, record: vi.fn(), key: (prefix) => prefix, now: 0 }, new Map());
    await reaskMissingExtras({ ...building, jobs: { ...building.jobs, story: { id: "s", state: "ready", kind: "text" }, music: { id: "m", state: "generating", kind: "music" } } }, { submit, record: vi.fn(), key: (prefix) => prefix, now: 0 }, new Map());
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("startWorldBuild", () => {
  it("hands the build on only once story and music are recorded, so they are never asked for twice", async () => {
    const saved: CreationRecord[] = [];
    const submit = vi.fn(async (request: GenerationRequest) => job(`job-${request.kind}`, request.kind));
    const navigate = vi.fn((record: CreationRecord) => {
      // Whoever opens next (the progress screen, a My worlds card) sees every
      // job this build started, so it has nothing left to submit.
      expect(saved.at(-1)).toBe(record);
      expect(extrasToSubmit(record, (prefix) => `${prefix}-again`)).toEqual([]);
    });

    await startWorldBuild(approved, shapeRequest, { submit, save: (record) => saved.push(record), key: (prefix) => `${prefix}-1`, navigate });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls.map(([request]) => request.kind)).toEqual(["image-to-3d", "text", "music"]);
    // The shape is recorded before anything else is asked for, so it is never lost.
    expect(saved[0]).toMatchObject({ step: "building", jobs: { shape: { id: "job-image-to-3d" } } });
    expect(saved.at(-1)?.jobs).toMatchObject({ shape: { id: "job-image-to-3d" }, story: { id: "job-text" }, music: { id: "job-music" } });
  });

  it("leaves a turned-away extra unrecorded, never failed, so it is simply asked for again later", async () => {
    const saved: CreationRecord[] = [];
    const submit = vi.fn(async (request: GenerationRequest) => {
      if (request.kind === "music") throw Object.assign(new Error("The generation service is at capacity. Please retry shortly."), { status: 429 });
      return job(`job-${request.kind}`, request.kind);
    });
    const navigate = vi.fn();

    await startWorldBuild(approved, shapeRequest, { submit, save: (record) => saved.push(record), key: (prefix) => `${prefix}-1`, navigate });

    const final = saved.at(-1)!;
    expect(navigate).toHaveBeenCalledWith(final);
    expect(final.jobs.music).toBeUndefined();
    expect(extrasToSubmit(final, (prefix) => `${prefix}-2`).map(([stage]) => stage)).toEqual(["music"]);
  });

  it("does not start story or music when the shape itself is refused", async () => {
    const submit = vi.fn(async () => { throw new Error("Invalid generation request"); });
    const save = vi.fn();
    const navigate = vi.fn();
    await expect(startWorldBuild(approved, shapeRequest, { submit, save, key: (prefix) => prefix, navigate })).rejects.toThrow("Invalid generation request");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
