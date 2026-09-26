import { describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "@shared/index.js";
import { createCreationRecord, type CreationJobRef, type CreationRecord } from "./creationFlow.js";
import { loadActiveCreation, loadCreationRecords, loadCreationWorldItems, resumeOrStartCreation, saveCreationRecord, setActiveCreationId } from "./creationStorage.js";
import { destinationForCreation, destinationForStartedBuild, loadPendingWorldCards } from "./pendingWorldStore.js";
import { creationWorldName, questTitle } from "./worldName.js";

/*
 * My worlds → a creation's tile → where it goes. Resume must reopen the same
 * creation (its step, photo, look and preview), and a creation whose build has
 * started must open its progress: Create would refuse it and start afresh.
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

const NOW = "2026-09-26T21:00:00.000Z";
const ref = (id: string, state: CreationJobRef["state"], kind: CreationJobRef["kind"]): CreationJobRef => ({ id, state, kind, updatedAt: NOW });

function draftAtPreview(id: string): CreationRecord {
  return {
    ...createCreationRecord(id, "2026-09-26T20:00:00.000Z"),
    updatedAt: "2026-09-26T20:10:00.000Z",
    step: "preview",
    photo: { id: `${id}-photo`, url: `/photos/${id}.jpg`, order: 1 },
    objectImage: { id: `${id}-cutout`, url: `/cutouts/${id}.png` } as CreationRecord["objectImage"] & object,
    selection: { style: "watercolor", mode: "race", atmosphere: "A lot of green clouds above." },
    preview: { cacheKey: "k", jobId: `${id}-preview`, asset: { id: `${id}-look`, url: `/looks/${id}.png` } as never, selection: { style: "watercolor", mode: "race", atmosphere: "A lot of green clouds above." } },
    jobs: { object: ref(`${id}-object`, "ready", "image-edit"), preview: ref(`${id}-preview`, "ready", "image-edit") },
  };
}

function built(id: string, shape: CreationJobRef["state"], step: CreationRecord["step"] = "building"): CreationRecord {
  const draft = draftAtPreview(id);
  return { ...draft, step, jobs: { ...draft.jobs, shape: ref(`${id}-shape`, shape, "image-to-3d"), story: ref(`${id}-story`, "generating", "text"), music: ref(`${id}-music`, "generating", "music") } };
}

function store(...records: CreationRecord[]): MemoryStorage {
  const storage = new MemoryStorage();
  for (const record of records) saveCreationRecord(record, storage);
  return storage;
}

describe("a creation's tile on My worlds", () => {
  it("never lists a creation that was opened but never given a photo", () => {
    const storage = store(createCreationRecord("empty", NOW), draftAtPreview("draft"));
    expect(loadCreationWorldItems(storage).map((item) => item.id)).toEqual(["draft"]);
  });

  it("Resume on a creation before its build reopens it at its saved step, with its photo, look and preview", () => {
    const storage = store(draftAtPreview("draft"));
    const [item] = loadCreationWorldItems(storage);
    expect(item).toMatchObject({ kind: "pending", id: "draft", actionLabel: "Resume" });

    expect(destinationForCreation(item!.job.id, storage)).toEqual({ name: "photos" });

    const opened = resumeOrStartCreation("fresh", storage);
    expect(opened.id).toBe("draft");
    expect(opened).toMatchObject({ step: "preview", photo: { id: "draft-photo" }, selection: { style: "watercolor", mode: "race" }, preview: { asset: { id: "draft-look" } } });
    expect(loadCreationRecords(storage).map((record) => record.id)).toEqual(["draft"]);
  });

  it("Retry on a creation whose style preview failed reopens that same creation", () => {
    const failed = { ...draftAtPreview("draft"), jobs: { object: ref("draft-object", "ready", "image-edit"), preview: { ...ref("draft-preview", "failed", "image-edit"), retryable: true } } };
    const storage = store(failed);
    expect(loadCreationWorldItems(storage)[0]).toMatchObject({ kind: "failed", actionLabel: "Retry" });
    expect(destinationForCreation("draft", storage)).toEqual({ name: "photos" });
    expect(resumeOrStartCreation("fresh", storage).id).toBe("draft");
  });

  it.each([
    ["building", "generating" as const, "building" as const],
    ["ready to play", "ready" as const, "building" as const],
    ["whose shape failed", "failed" as const, "building" as const],
    ["whose course is prepared", "ready" as const, "ready" as const],
  ])("a creation %s opens its progress, never Create", (_label, shape, step) => {
    const storage = store(built("world", shape, step));
    expect(destinationForCreation("world", storage)).toEqual({ name: "generation", jobId: "world-shape" });
    expect(loadCreationRecords(storage)).toHaveLength(1);
  });

  it("a building creation is shown as a build card, so its older tile is left out", () => {
    const storage = store(built("world", "generating"));
    expect(loadPendingWorldCards(storage).map((card) => card.id)).toEqual(["world"]);
    // The older list still describes it with View progress, never Resume.
    expect(loadCreationWorldItems(storage)[0]).toMatchObject({ actionLabel: "View progress" });
  });

  it("a creation this device no longer has goes nowhere", () => {
    expect(destinationForCreation("gone", store())).toBeNull();
  });
});

describe("a new creation", () => {
  it("after a build is handed over, starts empty: no jobs, default choices, nothing from the last one", () => {
    const storage = store(built("first", "generating"));
    setActiveCreationId("first", storage);
    expect(destinationForStartedBuild("first-shape", true, NOW, storage)).toMatchObject({ name: "worlds" });

    const next = resumeOrStartCreation("second", storage, NOW);

    expect(next).toEqual(createCreationRecord("second", NOW));
    expect(next.jobs).toEqual({});
    expect(next.selection.atmosphere).toBe("");
    expect(loadActiveCreation(storage)?.id).toBe("second");
    // The first creation keeps its own jobs, untouched.
    expect(loadCreationRecords(storage).find((record) => record.id === "first")?.jobs.shape?.id).toBe("first-shape");
  });

  it("even if the built creation is somehow still active, Create never reopens it", () => {
    const storage = store(built("first", "ready", "ready"));
    setActiveCreationId("first", storage);
    const next = resumeOrStartCreation("second", storage, NOW);
    expect(next.id).toBe("second");
    expect(next.jobs).toEqual({});
  });
});

describe("a prepared world's name", () => {
  const storyJob = (structured: unknown): GenerationJob => ({
    schemaVersion: 1, id: "world-story", idempotencyKey: "k", providerId: "p", providerJobId: null, capabilityRequested: "gemini-text",
    capabilityUsed: null, fallbackFired: null, state: "ready", photoOrder: [], createdAt: NOW, updatedAt: NOW, retryCount: 0, maxRetries: 1, kind: "text",
    result: { kind: "text", output: { text: "", structured } } as NonNullable<GenerationJob["result"]>,
  });
  const withStory = { ...built("world", "ready"), jobs: { ...built("world", "ready").jobs, story: ref("world-story", "ready", "text") } };

  it("is the quest title the story wrote", async () => {
    const fetchJob = vi.fn(async () => storyJob({ title: "  The Kettle Isles ", intro: "x" }));
    expect(await creationWorldName(withStory, fetchJob)).toBe("The Kettle Isles");
    expect(fetchJob).toHaveBeenCalledWith("world-story");
  });

  it("falls back to the creation's own title, but never to the scene default", async () => {
    const unreadable = vi.fn(async () => { throw new Error("offline"); });
    expect(await creationWorldName({ ...withStory, title: "Teapot Peak" }, unreadable)).toBe("Teapot Peak");
    expect(await creationWorldName({ ...withStory, title: "Imported level" }, unreadable)).toBeNull();
    expect(await creationWorldName(built("world", "ready"), unreadable)).toBeNull();
    expect(unreadable).toHaveBeenCalledTimes(2);
    expect(await creationWorldName(null, unreadable)).toBeNull();
  });

  it("reads only a real title", () => {
    expect(questTitle(storyJob({ title: "" }))).toBeNull();
    expect(questTitle(storyJob("not an object"))).toBeNull();
    expect(questTitle(null)).toBeNull();
  });
});
