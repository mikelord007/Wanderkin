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

  it("asks again for music the server turned away, throttled, until it is recorded", async () => {
    let record = building;
    const state = new Map<string, { at: number; count: number }>();
    let busy = true;
    const submit = vi.fn(async (request: GenerationRequest) => {
      if (busy) throw Object.assign(new Error("The generation service is at capacity."), { status: 429 });
      return job(`job-${request.kind}`, request.kind);
    });
    const deps = (now: number) => ({ submit, key: (prefix: string) => `${prefix}-${now}`, now, record: (stage: "music", accepted: GenerationJob) => { record = updateCreationJob(record, stage, accepted); } });

    // Like creations B and C on the live server: the service was busy.
    await reaskMissingExtras(record, deps(0), state);
    expect(record.jobs.music).toBeUndefined();

    await reaskMissingExtras(record, deps(EXTRAS_REASK_MS - 1), state);
    expect(submit).toHaveBeenCalledTimes(1);

    busy = false;
    await reaskMissingExtras(record, deps(EXTRAS_REASK_MS), state);
    expect(record.jobs.music?.id).toBe("job-music");
    expect(submit.mock.calls.map(([request]) => request.kind)).toEqual(["music", "music"]);

    await reaskMissingExtras(record, deps(10 * EXTRAS_REASK_MS), state);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("stops repeating a request the server keeps refusing", async () => {
    const state = new Map<string, { at: number; count: number }>();
    const submit = vi.fn(async () => { throw new Error("Invalid generation request"); });
    for (let ask = 0; ask < EXTRAS_MAX_ASKS + 3; ask += 1) {
      await reaskMissingExtras(building, { submit, record: vi.fn(), key: (prefix) => prefix, now: ask * EXTRAS_REASK_MS }, state);
    }
    expect(submit).toHaveBeenCalledTimes(EXTRAS_MAX_ASKS);
  });

  it("leaves worlds that are not building, or have their music, alone, and never asks for a story", async () => {
    const submit = vi.fn();
    await reaskMissingExtras(approved, { submit, record: vi.fn(), key: (prefix) => prefix, now: 0 }, new Map());
    await reaskMissingExtras({ ...building, jobs: { ...building.jobs, music: { id: "m", state: "generating", kind: "music" } } }, { submit, record: vi.fn(), key: (prefix) => prefix, now: 0 }, new Map());
    // An older creation whose story failed or was never made.
    await reaskMissingExtras({ ...building, jobs: { ...building.jobs, story: { id: "s", state: "failed", kind: "text" }, music: { id: "m", state: "ready", kind: "music" } } }, { submit, record: vi.fn(), key: (prefix) => prefix, now: 0 }, new Map());
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("startWorldBuild", () => {
  /** Keeps the stored record the way the screen's deps do. */
  function recorder() {
    let stored: CreationRecord | null = null;
    return {
      get stored() { return stored; },
      save: (record: CreationRecord) => { stored = record; },
      record: (stage: "music", accepted: GenerationJob) => { if (stored) stored = updateCreationJob(stored, stage, accepted); },
    };
  }

  it("moves on as soon as the shape exists, then records the music, and asks for no story", async () => {
    const store = recorder();
    const submit = vi.fn(async (request: GenerationRequest) => job(`job-${request.kind}`, request.kind));
    const navigate = vi.fn((record: CreationRecord) => {
      // The shape is recorded before the build moves on, so it is never lost.
      expect(store.stored).toBe(record);
      expect(record).toMatchObject({ step: "building", jobs: { shape: { id: "job-image-to-3d" } } });
    });

    await startWorldBuild(approved, shapeRequest, { submit, ...store, key: (prefix) => `${prefix}-1`, navigate });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls.map(([request]) => request.kind)).toEqual(["image-to-3d", "music"]);
    expect(store.stored?.jobs).toMatchObject({ shape: { id: "job-image-to-3d" }, music: { id: "job-music" } });
    expect(store.stored?.jobs.story).toBeUndefined();
    expect(extrasToSubmit(store.stored!, (prefix) => `${prefix}-again`)).toEqual([]);
  });

  it("never waits for the music in Create", async () => {
    const store = recorder();
    const submit = vi.fn((request: GenerationRequest) => request.kind === "music" ? new Promise<GenerationJob>(() => undefined) : Promise.resolve(job(`job-${request.kind}`, request.kind)));
    const navigate = vi.fn();

    void startWorldBuild(approved, shapeRequest, { submit, ...store, key: (prefix) => `${prefix}-1`, navigate }, new Set());
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));

    expect(submit.mock.calls.map(([request]) => request.kind)).toEqual(["image-to-3d", "music"]);
  });

  it("while its first music request is out, nothing else asks for it again", async () => {
    const starting = new Set<string>();
    let answerMusic: (accepted: GenerationJob) => void = () => undefined;
    const submit = vi.fn((request: GenerationRequest) => request.kind === "music"
      ? new Promise<GenerationJob>((resolve) => { answerMusic = resolve; })
      : Promise.resolve(job(`job-${request.kind}`, request.kind)));
    const store = recorder();
    const built = startWorldBuild(approved, shapeRequest, { submit, ...store, key: (prefix) => `${prefix}-1`, navigate: vi.fn() }, starting);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(2));

    // My worlds or the progress screen opening meanwhile.
    const reask = vi.fn(async () => job("again", "music"));
    await reaskMissingExtras(store.stored!, { submit: reask, record: vi.fn(), key: (prefix) => prefix, now: 0 }, new Map(), starting);
    expect(reask).not.toHaveBeenCalled();

    answerMusic(job("job-music", "music"));
    await built;
    expect(starting.size).toBe(0);
    expect(store.stored?.jobs.music?.id).toBe("job-music");
  });

  it("leaves a turned-away extra unrecorded, never failed, so it is simply asked for again later", async () => {
    const store = recorder();
    const submit = vi.fn(async (request: GenerationRequest) => {
      if (request.kind === "music") throw Object.assign(new Error("The generation service is at capacity. Please retry shortly."), { status: 429 });
      return job(`job-${request.kind}`, request.kind);
    });

    await startWorldBuild(approved, shapeRequest, { submit, ...store, key: (prefix) => `${prefix}-1`, navigate: vi.fn() });

    expect(store.stored?.jobs.music).toBeUndefined();
    expect(extrasToSubmit(store.stored!, (prefix) => `${prefix}-2`).map(([stage]) => stage)).toEqual(["music"]);
  });

  it("does not start the music when the shape itself is refused", async () => {
    const submit = vi.fn(async () => { throw new Error("Invalid generation request"); });
    const save = vi.fn();
    const navigate = vi.fn();
    await expect(startWorldBuild(approved, shapeRequest, { submit, save, record: vi.fn(), key: (prefix) => prefix, navigate })).rejects.toThrow("Invalid generation request");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
