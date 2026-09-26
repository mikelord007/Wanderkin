import { describe, expect, it } from "vitest";
import { createCreationRecord, isUntouchedCreationRecord } from "./creationFlow.js";
import {
  clearActiveCreationId,
  loadActiveCreation,
  loadCreationWorldItems,
  loadCreationRecords,
  removeCreationRecord,
  saveCreationRecord,
  setActiveCreationId,
  updateCreationJob,
} from "./creationStorage.js";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("creation storage", () => {
  it("keeps one durable active creation and updates a job without replacing other outputs", () => {
    const storage = new MemoryStorage();
    const initial = createCreationRecord("world-1", "2026-09-24T00:00:00.000Z");
    saveCreationRecord(initial, storage);
    setActiveCreationId(initial.id, storage);
    const next = updateCreationJob(initial, "music", {
      schemaVersion: 1,
      id: "music-job",
      idempotencyKey: "music-key",
      providerId: "fixture",
      providerJobId: null,
      capabilityRequested: "music",
      capabilityUsed: null,
      fallbackFired: null,
      state: "queued",
      photoOrder: [],
      createdAt: initial.createdAt,
      updatedAt: initial.updatedAt,
      retryCount: 0,
      maxRetries: 2,
      kind: "music",
    });
    saveCreationRecord(next, storage);

    expect(loadCreationRecords(storage)).toHaveLength(1);
    expect(loadActiveCreation(storage)?.jobs.music).toMatchObject({ id: "music-job", state: "queued" });
  });

  it("ignores corrupt persisted values", () => {
    const storage = new MemoryStorage();
    storage.setItem("objectquest:v2:creations", "not-json");
    expect(loadCreationRecords(storage)).toEqual([]);
  });

  it("adapts creation drafts, pending work, and failures to the shared My worlds union", () => {
    const storage = new MemoryStorage();
    const draft = {
      ...createCreationRecord("draft", "2026-09-24T00:00:00.000Z"),
      step: "review" as const,
      photo: { id: "draft-photo", url: "/photos/draft.jpg", order: 1 },
    };
    // Opened but never given a photo: not a world yet, so not listed.
    const untouched = createCreationRecord("untouched", "2026-09-24T00:03:00.000Z");
    const pending = {
      ...createCreationRecord("pending", "2026-09-24T00:01:00.000Z"),
      step: "building" as const,
    };
    const failed = {
      ...createCreationRecord("failed", "2026-09-24T00:02:00.000Z"),
      step: "preview" as const,
      jobs: {
        preview: {
          id: "preview-job",
          state: "failed" as const,
          kind: "image-edit" as const,
          error: "Preview needs another try.",
          retryable: true,
        },
      },
    };
    saveCreationRecord(draft, storage);
    saveCreationRecord(pending, storage);
    saveCreationRecord(failed, storage);
    saveCreationRecord(untouched, storage);

    expect(loadCreationWorldItems(storage).map(({ kind, id, actionLabel, job }) => ({
      kind,
      id,
      actionLabel,
      jobId: job.id,
    }))).toEqual([
      { kind: "failed", id: "failed", actionLabel: "Retry", jobId: "failed" },
      { kind: "pending", id: "pending", actionLabel: "View progress", jobId: "pending" },
      { kind: "pending", id: "draft", actionLabel: "Resume", jobId: "draft" },
    ]);
  });

  it("repeated open-then-back-out-before-a-photo cycles leave no stray drafts behind", () => {
    // Mirrors CreationJourneyScreen.initialRecord() (mint + persist + activate
    // when nothing is active) paired with App.tsx's handleCreationBack (prune
    // the active record if still untouched, then clear the pointer) — the
    // exact sequence that reproduced N drafts for N cycles before the fix.
    const storage = new MemoryStorage();
    function openCreateThenBackOut(id: string, now: string) {
      const restored = loadActiveCreation(storage);
      const record = restored ?? createCreationRecord(id, now);
      if (!restored) {
        saveCreationRecord(record, storage);
        setActiveCreationId(record.id, storage);
      }
      const active = loadActiveCreation(storage);
      if (active && isUntouchedCreationRecord(active)) removeCreationRecord(active.id, storage);
      clearActiveCreationId(storage);
    }

    openCreateThenBackOut("cycle-1", "2026-09-24T00:00:00.000Z");
    openCreateThenBackOut("cycle-2", "2026-09-24T00:01:00.000Z");
    openCreateThenBackOut("cycle-3", "2026-09-24T00:02:00.000Z");

    expect(loadCreationRecords(storage)).toEqual([]);
    expect(loadCreationWorldItems(storage)).toEqual([]);
  });

  it("still leaves an abandoned draft resumable once it carries real work", () => {
    const storage = new MemoryStorage();
    const withPhoto = {
      ...createCreationRecord("has-photo", "2026-09-24T00:00:00.000Z"),
      step: "review" as const,
      photo: { id: "photo-1", url: "/photo.jpg", order: 1 },
      jobs: { object: { id: "job-1", state: "ready" as const, kind: "image-edit" as const } },
    };
    saveCreationRecord(withPhoto, storage);
    setActiveCreationId(withPhoto.id, storage);

    const active = loadActiveCreation(storage);
    expect(active && isUntouchedCreationRecord(active)).toBe(false);
    if (active && isUntouchedCreationRecord(active)) removeCreationRecord(active.id, storage);
    clearActiveCreationId(storage);

    expect(loadCreationRecords(storage)).toHaveLength(1);
    expect(loadCreationWorldItems(storage)).toHaveLength(1);
  });
});
