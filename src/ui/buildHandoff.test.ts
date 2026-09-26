import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob, GenerationRequest, ImageTo3dGenerationRequest } from "@shared/index.js";
import { setCurrentOwnerId } from "../auth/credentials.js";
import { createCreationRecord, type CreationRecord } from "./creationFlow.js";
import { loadActiveCreation, loadCreationRecords, saveCreationRecord, setActiveCreationId, updateCreationJob } from "./creationStorage.js";
import { destinationForStartedBuild, loadPendingWorldCards, type StartedBuildDestination } from "./pendingWorldStore.js";
import { startWorldBuild } from "./worldBuild.js";

/*
 * Build world → My worlds, end to end below the React layer: the same deps
 * CreationJourneyScreen passes to startWorldBuild, and the same destination
 * App.handleJobStarted routes to. The story request never answers here, as
 * on the live server where the text is written before the request returns.
 */

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

// A Google account signed in through Supabase: a uuid owner, not the stub's.
const SUPABASE_USER = "5f0c2a8e-9d3b-4e71-a2c4-3b8f6d1e7a90";
const NOW = "2026-09-26T21:00:00.000Z";

const approved: CreationRecord = {
  ...createCreationRecord("world-1", "2026-09-26T20:40:00.000Z"),
  step: "preview",
  photo: { id: "photo-1", url: "/photos/1.jpg", order: 1 },
  selection: { style: "cartoon", mode: "race", atmosphere: "" },
};

const shapeRequest: ImageTo3dGenerationRequest = {
  schemaVersion: 1, kind: "image-to-3d", capability: "rodin-i3d", idempotencyKey: "shape-1", purpose: "world-mesh",
  photos: [{ photoId: "photo-1", sourceIndex: 1 }],
};

function job(id: string, kind: GenerationJob["kind"]): GenerationJob {
  return {
    schemaVersion: 1, id, idempotencyKey: id, providerId: "livepeer-agent-mcp", providerJobId: null,
    capabilityRequested: "x", capabilityUsed: null, fallbackFired: null, state: "queued", photoOrder: [],
    createdAt: NOW, updatedAt: NOW, retryCount: 0, maxRetries: 3, ...(kind ? { kind } : {}),
  };
}

/** Starts a build the way Create does, and returns where the app goes. */
async function buildWorld(storage: Storage, signedIn: boolean): Promise<StartedBuildDestination> {
  saveCreationRecord(approved, storage);
  setActiveCreationId(approved.id, storage);
  const submit = vi.fn((request: GenerationRequest) => request.kind === "text"
    ? new Promise<GenerationJob>(() => undefined)
    : Promise.resolve(job(request.kind === "image-to-3d" ? "shape-job" : `job-${request.kind}`, request.kind)));
  let destination: StartedBuildDestination | null = null;
  void startWorldBuild(approved, shapeRequest, {
    submit,
    save: (next) => { saveCreationRecord(next, storage); setActiveCreationId(next.id, storage); },
    record: (stage, accepted) => {
      const current = loadCreationRecords(storage).find((candidate) => candidate.id === approved.id);
      if (current) saveCreationRecord(updateCreationJob(current, stage, accepted), storage);
    },
    key: (prefix) => `${prefix}-1`,
    navigate: (next) => { destination = destinationForStartedBuild(next.jobs.shape!.id, signedIn, NOW, storage); },
  }, new Set());
  await vi.waitFor(() => expect(destination).not.toBeNull());
  return destination!;
}

afterEach(() => setCurrentOwnerId(null));

describe("Build world hands the build to My worlds", () => {
  it("signed in with Supabase: once the shape job exists the route is My worlds, with the note and a building card", async () => {
    setCurrentOwnerId(SUPABASE_USER);
    const storage = new MemoryStorage();

    const destination = await buildWorld(storage, true);

    expect(destination).toEqual({ name: "worlds", notice: "Building your world. Watch it here." });
    expect(loadActiveCreation(storage)).toBeNull();
    const cards = loadPendingWorldCards(storage);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "world-1", state: "building", shapeJobId: "shape-job", startedAt: NOW });
    expect(loadCreationRecords(storage)[0]?.ownerId).toBe(SUPABASE_USER);
  });

  it("signed out: the progress screen opens instead, and nothing is handed over", async () => {
    const storage = new MemoryStorage();

    const destination = await buildWorld(storage, false);

    expect(destination).toEqual({ name: "generation", jobId: "shape-job" });
    expect(loadActiveCreation(storage)?.id).toBe("world-1");
  });
});
