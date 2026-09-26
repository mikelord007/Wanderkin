import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyManifest, type SceneManifest } from "../shared/manifest.js";
import type { GenerationJob } from "../shared/job.js";
import type { AudioAssetReference } from "../shared/media.js";
import { AssetStore } from "./persistence/assetStore.js";
import { PhotoStore } from "./persistence/photoStore.js";
import { LevelStore, createLevelsRouter } from "./levels.js";

const MUSIC: AudioAssetReference = {
  schemaVersion: 1,
  mediaType: "audio",
  kind: "music",
  id: "plane-music",
  url: "/api/generated-assets/files/plane-music.mp3",
  sha256: "b".repeat(64),
  sizeBytes: 2048,
  mimeType: "audio/mpeg",
  durationSeconds: 15,
  loop: true,
  defaultGain: 0.48,
  provenance: {
    providerId: "livepeer",
    requestedCapability: "music",
    servedCapability: "music",
    servedModel: "fal-ai/minimax-music/v2",
    applicationJobId: "job-music",
    providerJobId: "mjob-1",
    timings: { requestedAt: "2026-09-26T17:39:00.000Z", completedAt: "2026-09-26T17:40:00.000Z", totalMilliseconds: 60000 },
    reportedCost: null,
  },
};

function musicJob(state: GenerationJob["state"]): GenerationJob {
  return {
    schemaVersion: 1, id: "job-music", idempotencyKey: "music-1", providerId: "livepeer", providerJobId: null,
    capabilityRequested: "music", capabilityUsed: "music", fallbackFired: null, state, photoOrder: [],
    createdAt: "2026-09-26T17:39:00.000Z", updatedAt: "2026-09-26T17:40:00.000Z", retryCount: 0, maxRetries: 1,
    kind: "music",
    ...(state === "ready" ? { result: { kind: "music", asset: MUSIC } } : {}),
  } as GenerationJob;
}

/** A world prepared by the creation flow: no media, its music job still queued. */
function preparedWorld(levelId = ""): SceneManifest {
  return {
    ...createEmptyManifest({ levelId, name: "Toy plane", seed: "seed-1", movementConfigId: "default-v1" }),
    workflow: {
      schemaVersion: 1,
      reviewedImageAssetId: "cutout",
      selectedReference: { photoIds: ["photo"], reviewedImageAssetId: "cutout", approvedPreviewAssetId: "preview", style: "cartoon", mode: "collect", atmosphere: "" },
      jobs: [{ kind: "music", jobId: "job-music", status: "queued", updatedAt: "2026-09-26T17:39:56.000Z" }],
    },
  };
}

describe("levels router attaches a world's generated music", () => {
  let dir: string;
  let baseUrl: string;
  let close: () => Promise<void>;
  let state: GenerationJob["state"];

  beforeEach(async () => {
    state = "generating";
    dir = mkdtempSync(join(tmpdir(), "objectquest-world-music-"));
    const store = new LevelStore(dir, new AssetStore(dir), new PhotoStore(dir));
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(createLevelsRouter(store, undefined, undefined, {
      getJob: async (jobId) => (jobId === "job-music" ? musicJob(state) : undefined),
    }));
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve) => listener.close(() => resolve()));
  });

  afterEach(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (manifest: SceneManifest) => fetch(`${baseUrl}/api/levels`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(manifest),
  });

  it("saves a new world with its music when the music is already ready", async () => {
    state = "ready";
    const created = await (await post(preparedWorld())).json() as SceneManifest;
    expect(created.media?.audio).toEqual([MUSIC]);
    expect(created.workflow?.jobs[0]).toMatchObject({ status: "ready", consumedByAssetId: MUSIC.id });
  });

  it("attaches music that finished after the world was saved the next time the world is opened, and keeps it", async () => {
    const created = await (await post(preparedWorld())).json() as SceneManifest;
    expect(created.media).toBeUndefined();

    state = "ready";
    const opened = await (await fetch(`${baseUrl}/api/levels/${created.levelId}`)).json() as SceneManifest;
    expect(opened.media?.audio).toEqual([MUSIC]);

    state = "failed"; // Already stored: a later open no longer depends on the job.
    const reopened = await (await fetch(`${baseUrl}/api/levels/${created.levelId}`)).json() as SceneManifest;
    expect(reopened.media?.audio).toEqual([MUSIC]);
  });

  it("re-attaches the music when an editor save sends a manifest loaded before it was attached", async () => {
    state = "ready";
    const created = await (await post(preparedWorld())).json() as SceneManifest;
    const { media: _media, ...stale } = created;
    const saved = await (await fetch(`${baseUrl}/api/levels/${created.levelId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stale),
    })).json() as SceneManifest;
    expect(saved.media?.audio).toEqual([MUSIC]);
  });
});
