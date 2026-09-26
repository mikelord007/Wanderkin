import { describe, expect, it } from "vitest";
import { createEmptyManifest, type SceneManifest } from "./manifest.js";
import type { GenerationJob } from "./job.js";
import type { AudioAssetReference } from "./media.js";
import type { WorldWorkflowJobV1 } from "./workflow.js";
import { attachWorldMusic, withWorldMusic, worldMusicJobId } from "./worldMusic.js";

function musicAsset(id: string): AudioAssetReference & { kind: "music" } {
  return {
    schemaVersion: 1,
    mediaType: "audio",
    kind: "music",
    id,
    url: `/api/generated-assets/files/${id}.mp3`,
    sha256: "a".repeat(64),
    sizeBytes: 1000,
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
  } as AudioAssetReference & { kind: "music" };
}

function job(id: string, state: GenerationJob["state"], asset?: AudioAssetReference & { kind: "music" }): GenerationJob {
  return {
    schemaVersion: 1,
    id,
    idempotencyKey: `key-${id}`,
    providerId: "livepeer",
    providerJobId: null,
    capabilityRequested: "music",
    capabilityUsed: "music",
    fallbackFired: null,
    state,
    photoOrder: [],
    createdAt: "2026-09-26T17:39:00.000Z",
    updatedAt: "2026-09-26T17:40:00.000Z",
    retryCount: 0,
    maxRetries: 1,
    kind: "music",
    ...(asset ? { result: { kind: "music", asset } } : {}),
  } as GenerationJob;
}

function entry(kind: WorldWorkflowJobV1["kind"], jobId: string, updatedAt: string, status: WorldWorkflowJobV1["status"] = "queued"): WorldWorkflowJobV1 {
  return { kind, jobId, status, updatedAt };
}

function manifestWith(jobs: WorldWorkflowJobV1[], media?: SceneManifest["media"]): SceneManifest {
  return {
    ...createEmptyManifest({ levelId: "level-1", name: "Toy plane", seed: "s", movementConfigId: "default-v1" }),
    workflow: {
      schemaVersion: 1,
      reviewedImageAssetId: "cutout",
      selectedReference: { photoIds: ["p"], reviewedImageAssetId: "cutout", approvedPreviewAssetId: "preview", style: "cartoon", mode: "collect", atmosphere: "" },
      jobs,
    },
    ...(media ? { media } : {}),
  };
}

describe("worldMusicJobId", () => {
  it("is null for a world with no workflow or no music job", () => {
    expect(worldMusicJobId(createEmptyManifest({ levelId: "l", name: "n", seed: "s", movementConfigId: "default-v1" }))).toBeNull();
    expect(worldMusicJobId(manifestWith([entry("image-to-3d", "shape", "2026-09-26T17:00:00.000Z")]))).toBeNull();
  });

  it("picks this world's own (newest) music job, not one carried over from an earlier creation", () => {
    const manifest = manifestWith([
      entry("music", "job-older-world", "2026-09-26T14:53:00.000Z", "ready"),
      entry("text", "job-story", "2026-09-26T17:39:00.000Z"),
      entry("music", "job-this-world", "2026-09-26T17:39:56.000Z"),
    ]);
    expect(worldMusicJobId(manifest)).toBe("job-this-world");
  });
});

describe("withWorldMusic", () => {
  it("makes the asset the world's music, keeps other media, and marks the workflow job consumed", () => {
    const sfx = { ...musicAsset("sfx-1"), kind: "sfx" as const, loop: false };
    const manifest = manifestWith([entry("music", "job-music", "2026-09-26T17:39:56.000Z")], { audio: [musicAsset("old-music"), sfx], video: [] });
    const next = withWorldMusic(manifest, "job-music", musicAsset("new-music"));
    expect(next.media?.audio.map((asset) => asset.id)).toEqual(["new-music", "sfx-1"]);
    expect(next.workflow?.jobs[0]).toMatchObject({ jobId: "job-music", status: "ready", consumedByAssetId: "new-music" });
  });

  it("returns the same manifest when that music is already attached", () => {
    const manifest = manifestWith([entry("music", "job-music", "2026-09-26T17:39:56.000Z", "ready")], { audio: [musicAsset("m")], video: [] });
    expect(withWorldMusic(manifest, "job-music", musicAsset("m"))).toBe(manifest);
  });
});

describe("attachWorldMusic", () => {
  it("attaches a ready world-soundtrack job to a world saved without media (the reported bug)", async () => {
    const manifest = manifestWith([entry("music", "job-music", "2026-09-26T17:39:56.000Z")]);
    const next = await attachWorldMusic(manifest, async (id) => (id === "job-music" ? job(id, "ready", musicAsset("plane-music")) : undefined));
    expect(next.media?.audio).toEqual([musicAsset("plane-music")]);
    expect(next.media?.video).toEqual([]);
  });

  it("leaves the world alone while its music is still generating, failed, or unknown", async () => {
    const manifest = manifestWith([entry("music", "job-music", "2026-09-26T17:39:56.000Z")]);
    expect(await attachWorldMusic(manifest, async () => job("job-music", "generating"))).toBe(manifest);
    expect(await attachWorldMusic(manifest, async () => job("job-music", "failed"))).toBe(manifest);
    expect(await attachWorldMusic(manifest, async () => undefined)).toBe(manifest);
    expect(await attachWorldMusic(manifest, async () => { throw new Error("offline"); })).toBe(manifest);
  });

  it("does not look anything up for a world without a music job", async () => {
    const manifest = manifestWith([]);
    let asked = false;
    expect(await attachWorldMusic(manifest, async () => { asked = true; return undefined; })).toBe(manifest);
    expect(asked).toBe(false);
  });
});
