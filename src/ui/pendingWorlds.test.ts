import { describe, expect, it } from "vitest";
import { createCreationRecord, type CreationJobRef, type CreationRecord } from "./creationFlow.js";
import { extraRetryMode, extrasToSubmit, failedExtraStage, pendingWorldsFrom, startedHint, toPendingWorld, unfinishedBuildJobs, worldBuildStages } from "./pendingWorlds.js";
import {
  discardPendingWorld,
  findCreationByShapeJob,
  handOffBuild,
  loadBuildStarts,
  loadPendingWorldCards,
} from "./pendingWorldStore.js";
import { loadActiveCreation, loadCreationRecords, saveCreationRecord, setActiveCreationId } from "./creationStorage.js";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const ref = (id: string, state: CreationJobRef["state"], extra: Partial<CreationJobRef> = {}): CreationJobRef =>
  ({ id, state, kind: "image-to-3d", updatedAt: "2026-09-26T10:00:00.000Z", ...extra });

function building(id: string, shape: CreationJobRef, extra: Partial<CreationRecord> = {}): CreationRecord {
  return {
    ...createCreationRecord(id, "2026-09-26T09:00:00.000Z"),
    step: "building",
    photo: { id: `${id}-photo`, url: `/photos/${id}.jpg`, order: 1 },
    selection: { style: "watercolor", mode: "race", atmosphere: "" },
    jobs: { object: ref(`${id}-object`, "ready", { kind: "image-edit" }), shape },
    ...extra,
  };
}

describe("worldBuildStages", () => {
  it("uses the progress screen's four stage labels, in order", () => {
    expect(worldBuildStages(building("a", ref("s", "generating"))).map((stage) => stage.label)).toEqual([
      "Preparing your object",
      "Building its 3D shape",
      "Creating your course",
      "Adding its story and sound",
    ]);
  });

  it("never lets an optional story or music failure stop the world", () => {
    const record = building("a", ref("s", "ready"), {});
    record.jobs.music = ref("m", "failed", { kind: "music" });
    const stages = worldBuildStages(record);
    expect(stages[3]).toMatchObject({ status: "error", detail: "Your world stays playable. Sound can be added later." });
    expect(toPendingWorld(record)?.state).toBe("done");
  });
});

/** Recorded from storage/jobs.json: job_7c48d489 (the 60 s soundtrack asked
 * for before 9e87271) and job_02ca4c57 (a story the provider could not finish). */
const OLD_SOUNDTRACK_REFUSAL = "`create_media` was refused before it ran, so nothing was dispatched and nothing was charged. One argument is wrong:\n- `duration` must be at most 15.";
const STORY_PROVIDER_FAILURE = "The provider rejected the generation request. Check the selected model settings and try again.";

describe("story and sound stage honesty", () => {
  const key = (prefix: string) => `${prefix}-fresh`;

  it("is pending, with no alarm, while story and music were never asked for", () => {
    const record = building("a", ref("s", "ready"));
    expect(worldBuildStages(record)[3]).toEqual({ id: "story", label: "Adding its story and sound", status: "pending" });
    expect(failedExtraStage(record)).toBeUndefined();
  });

  it("is active, with no alarm, while story and music are still being made", () => {
    const record = building("a", ref("s", "ready"));
    record.jobs.story = ref("st", "generating", { kind: "text" });
    record.jobs.music = ref("m", "queued", { kind: "music" });
    expect(worldBuildStages(record)[3]).toMatchObject({ status: "active" });
    expect(worldBuildStages(record)[3]).not.toHaveProperty("detail");
    expect(failedExtraStage(record)).toBeUndefined();
  });

  it("asks again, quietly, for a soundtrack stored with the old 60 s refusal", () => {
    const record = building("a", ref("s", "ready"));
    record.jobs.story = ref("st", "ready", { kind: "text" });
    record.jobs.music = ref("job_7c48d489", "failed", { kind: "music", error: OLD_SOUNDTRACK_REFUSAL, retryable: false });
    expect(worldBuildStages(record)[3]).toEqual({ id: "story", label: "Adding its story and sound", status: "active" });
    expect(failedExtraStage(record)).toBeUndefined();
    const requests = extrasToSubmit(record, key);
    expect(requests.map(([stage]) => stage)).toEqual(["music"]);
    expect(requests[0]![1]).toMatchObject({ kind: "music", durationSeconds: 15, idempotencyKey: "music-fresh" });
  });

  it("raises the alarm only for a story or music job that really failed", () => {
    const record = building("a", ref("s", "ready"));
    record.jobs.story = ref("job_02ca4c57", "failed", { kind: "text", error: STORY_PROVIDER_FAILURE, retryable: false });
    record.jobs.music = ref("m", "ready", { kind: "music" });
    expect(failedExtraStage(record)).toBe("story");
    expect(worldBuildStages(record)[3]).toMatchObject({ status: "error", detail: "Your world stays playable. Sound can be added later." });
    // A real failure is never resubmitted behind the user's back.
    expect(extrasToSubmit(record, key)).toEqual([]);
  });

  it("retries a failure the server will not retry by asking for a fresh story", () => {
    const record = building("a", ref("s", "ready"));
    record.jobs.story = ref("job_02ca4c57", "failed", { kind: "text", error: STORY_PROVIDER_FAILURE, retryable: false });
    record.jobs.music = ref("m", "ready", { kind: "music" });
    expect(extraRetryMode(record.jobs.story)).toBe("resubmit");
    expect(extrasToSubmit(record, key, ["story"]).map(([stage, request]) => [stage, request.idempotencyKey])).toEqual([["story", "story-fresh"]]);
    expect(extraRetryMode(ref("m", "failed", { kind: "music", error: "Upstream timed out", retryable: true }))).toBe("retry-job");
  });
});

describe("toPendingWorld", () => {
  it("is only for creations whose 3D build was submitted", () => {
    expect(toPendingWorld(createCreationRecord("draft"))).toBeNull();
    expect(toPendingWorld({ ...createCreationRecord("no-shape"), step: "building" })).toBeNull();
    // A prepared course ("ready") stays a card until its level is saved.
    expect(toPendingWorld({ ...building("ready", ref("s", "ready")), step: "ready" })).toMatchObject({ state: "done" });
  });

  it("describes a build in progress: the photo, the stage and a partial bar", () => {
    const world = toPendingWorld(building("a", ref("shape-1", "generating")), "2026-09-26T09:30:00.000Z")!;
    expect(world).toMatchObject({ state: "building", photoUrl: "/photos/a.jpg", shapeJobId: "shape-1", startedAt: "2026-09-26T09:30:00.000Z", style: "watercolor", mode: "race" });
    expect(world.currentStage.label).toBe("Building its 3D shape");
    expect(world.progress).toBeGreaterThan(0.3);
    expect(world.progress).toBeLessThan(1);
  });

  it("turns into a playable world when the shape is ready", () => {
    const world = toPendingWorld(building("a", ref("shape-1", "ready", { consumedByAssetId: "asset-9" }), {
      preview: { cacheKey: "k", jobId: "p", asset: { id: "prev", url: "/prev.png" } as never, selection: { style: "watercolor", mode: "race", atmosphere: "" } },
    }))!;
    expect(world).toMatchObject({ state: "done", resultAssetId: "asset-9", previewUrl: "/prev.png", progress: 1 });
  });

  it("reports a failed shape with its error, ready to retry", () => {
    const world = toPendingWorld(building("a", ref("shape-1", "failed", { error: "The 3D service timed out." })))!;
    expect(world).toMatchObject({ state: "failed", retryStage: "shape", error: "The 3D service timed out." });
    expect(world.currentStage).toMatchObject({ label: "Building its 3D shape", status: "error" });
  });
});

describe("pendingWorldsFrom and unfinishedBuildJobs", () => {
  it("lists concurrent builds newest first", () => {
    const worlds = pendingWorldsFrom(
      [building("old", ref("s1", "generating")), building("new", ref("s2", "queued")), createCreationRecord("draft")],
      { old: "2026-09-26T08:00:00.000Z", new: "2026-09-26T09:00:00.000Z" },
    );
    expect(worlds.map((world) => world.id)).toEqual(["new", "old"]);
  });

  it("watches every unfinished job of a build, and nothing that has finished", () => {
    const record = building("a", ref("shape", "generating"));
    record.jobs.story = ref("story", "queued", { kind: "text" });
    record.jobs.music = ref("music", "ready", { kind: "music" });
    expect(unfinishedBuildJobs(record)).toEqual([{ stage: "shape", jobId: "shape" }, { stage: "story", jobId: "story" }]);
    expect(unfinishedBuildJobs(createCreationRecord("draft"))).toEqual([]);
  });

  it("says how long ago a build started, to the minute", () => {
    const start = "2026-09-26T09:00:00.000Z";
    const at = (minutes: number) => new Date(start).getTime() + minutes * 60_000;
    expect(startedHint(start, at(0.5))).toBe("Started just now");
    expect(startedHint(start, at(4))).toBe("Started 4 min ago");
    expect(startedHint(start, at(130))).toBe("Started 2 h ago");
  });
});

describe("pending world store", () => {
  it("hands a started build to My worlds: Create forgets it, the record and start time stay", () => {
    const storage = new MemoryStorage();
    const record = building("a", ref("shape-1", "queued"));
    saveCreationRecord(record, storage);
    setActiveCreationId(record.id, storage);
    handOffBuild(record, "2026-09-26T09:30:00.000Z", storage);
    expect(loadActiveCreation(storage)).toBeNull();
    expect(loadCreationRecords(storage).map((r) => r.id)).toEqual(["a"]);
    expect(loadBuildStarts(storage)).toEqual({ a: "2026-09-26T09:30:00.000Z" });
    // Handing it off again never moves the start time.
    handOffBuild(record, "2026-09-26T11:00:00.000Z", storage);
    expect(loadBuildStarts(storage)).toEqual({ a: "2026-09-26T09:30:00.000Z" });
    expect(loadPendingWorldCards(storage).map((w) => [w.id, w.startedAt])).toEqual([["a", "2026-09-26T09:30:00.000Z"]]);
  });

  it("leaves a different active creation alone", () => {
    const storage = new MemoryStorage();
    const other = createCreationRecord("other");
    saveCreationRecord(other, storage);
    saveCreationRecord(building("a", ref("shape-1", "queued")), storage);
    setActiveCreationId("other", storage);
    handOffBuild(building("a", ref("shape-1", "queued")), undefined, storage);
    expect(loadActiveCreation(storage)?.id).toBe("other");
  });

  it("finds a build by its shape job and forgets it on discard", () => {
    const storage = new MemoryStorage();
    const record = building("a", ref("shape-1", "failed"));
    saveCreationRecord(record, storage);
    handOffBuild(record, "2026-09-26T09:30:00.000Z", storage);
    expect(findCreationByShapeJob("shape-1", storage)?.id).toBe("a");
    discardPendingWorld("a", storage);
    expect(findCreationByShapeJob("shape-1", storage)).toBeNull();
    expect(loadBuildStarts(storage)).toEqual({});
    expect(loadPendingWorldCards(storage)).toEqual([]);
  });
});
