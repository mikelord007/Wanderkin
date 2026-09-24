import { describe, expect, it } from "vitest";
import { createCreationRecord } from "./creationFlow.js";
import {
  loadActiveCreation,
  loadCreationRecords,
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
});

