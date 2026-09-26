import { describe, expect, it } from "vitest";
import type { GeneratedImageReference } from "@shared/index.js";
import {
  approvedPreviewMatchesSelection,
  buildWorldExtrasRequests,
  canBuildWorld,
  createCreationRecord,
  isUntouchedCreationRecord,
  toPendingWorldItem,
  withCreationUpdate,
  toWorldWorkflow,
} from "./creationFlow.js";

const image = {
  id: "preview-1",
  url: "/preview.png",
  sha256: "a".repeat(64),
  sizeBytes: 100,
  mimeType: "image/png",
  width: 512,
  height: 512,
  provenance: {
    providerId: "fixture",
    requestedCapability: "kontext-edit",
    servedCapability: "kontext-edit",
    servedModel: "fixture",
    applicationJobId: "job-1",
    providerJobId: "provider-1",
    timings: { requestedAt: "2026-09-24T00:00:00.000Z" },
    reportedCost: null,
  },
} satisfies GeneratedImageReference;

describe("creation flow", () => {
  it("builds world extras whose Livepeer create_media durations are integers from 3 through 15", () => {
    const requests = buildWorldExtrasRequests(createCreationRecord("world-1", "2026-09-24T00:00:00.000Z"), prefix => `${prefix}-key`);
    const music = requests.find(([stage]) => stage === "music")?.[1];
    expect(music).toMatchObject({ kind: "music", durationSeconds: 15, instrumental: true, loop: true });
    for (const [, request] of requests) {
      if (request.kind !== "music" && request.kind !== "sfx" && request.kind !== "video") continue;
      expect(Number.isInteger(request.durationSeconds)).toBe(true);
      expect(request.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(request.durationSeconds).toBeLessThanOrEqual(15);
    }
  });

  it("requests only the background music for world extras: no story, no narration voice", () => {
    const requests = buildWorldExtrasRequests(createCreationRecord("world-1", "2026-09-24T00:00:00.000Z"), prefix => `${prefix}-key`);
    expect(requests.map(([stage]) => stage)).toEqual(["music"]);
    expect(requests.some(([, request]) => request.kind === "text" || request.kind === "tts")).toBe(false);
  });

  it("never asks again for a story, even on an older creation whose story failed", () => {
    const record = { ...createCreationRecord("world-1", "2026-09-24T00:00:00.000Z"), jobs: { story: { id: "st", state: "failed" as const, kind: "text" as const } } };
    expect(buildWorldExtrasRequests(record, prefix => `${prefix}-key`).map(([stage]) => stage)).toEqual(["music"]);
  });

  it("allows building only from the approved preview matching the current selection", () => {
    const draft = createCreationRecord("world-1", "2026-09-24T00:00:00.000Z");
    const approved = withCreationUpdate(draft, {
      step: "preview",
      // The biome is locked in before the preview step (see biomeStep.test).
      selection: { ...draft.selection, biome: "desert" },
      preview: {
        cacheKey: "cache-1",
        jobId: "job-1",
        asset: image,
        selection: { ...draft.selection },
        approvedAt: "2026-09-24T00:01:00.000Z",
      },
    });
    expect(approvedPreviewMatchesSelection(approved)).toBe(true);
    expect(canBuildWorld(approved)).toBe(true);
    expect(canBuildWorld({ ...approved, selection: { ...approved.selection, style: "watercolor" } })).toBe(false);
  });

  it("maps drafts, active builds, and failures to state-specific My worlds actions", () => {
    const draft = createCreationRecord("draft");
    expect(toPendingWorldItem(draft)).toMatchObject({ status: "draft", primaryAction: "resume" });

    const pending = withCreationUpdate(draft, { id: "pending", step: "building" } as never);
    expect(toPendingWorldItem(pending)).toMatchObject({ status: "pending", primaryAction: "view-progress" });

    const failed = withCreationUpdate(draft, {
      jobs: { preview: { id: "job-preview", state: "failed", kind: "image-edit", retryable: true } },
    });
    expect(toPendingWorldItem(failed)).toMatchObject({
      status: "needs-attention",
      primaryAction: "retry",
      attentionStage: "preview",
    });
  });

  it("exports the exact reviewed and approved identities into the shared workflow block", () => {
    const record = withCreationUpdate(createCreationRecord("world-1"), {
      reviewedImageAssetId: "cutout-1",
      selectedReference: { photoIds: ["photo-1"], reviewedImageAssetId: "cutout-1", approvedPreviewAssetId: "preview-1", style: "cartoon", mode: "collect", atmosphere: "Cloud garden" },
      jobs: { shape: { id: "shape-1", state: "ready", kind: "image-to-3d", updatedAt: "2026-09-24T00:02:00.000Z", consumedByAssetId: "mesh-1" } },
    });
    expect(toWorldWorkflow(record)).toMatchObject({ reviewedImageAssetId: "cutout-1", selectedReference: { approvedPreviewAssetId: "preview-1" }, jobs: [{ jobId: "shape-1", consumedByAssetId: "mesh-1" }] });
  });

  it("flags a freshly minted record as untouched, and anything with real work as not", () => {
    const fresh = createCreationRecord("world-1", "2026-09-24T00:00:00.000Z");
    expect(isUntouchedCreationRecord(fresh)).toBe(true);

    expect(isUntouchedCreationRecord(withCreationUpdate(fresh, {
      photo: { id: "photo-1", url: "/photo.jpg", order: 1 },
    }))).toBe(false);
    expect(isUntouchedCreationRecord(withCreationUpdate(fresh, {
      jobs: { object: { id: "job-1", state: "queued", kind: "image-edit" } },
    }))).toBe(false);
    expect(isUntouchedCreationRecord(withCreationUpdate(fresh, {
      selection: { ...fresh.selection, atmosphere: "Cloud garden" },
    }))).toBe(false);
    expect(isUntouchedCreationRecord(withCreationUpdate(fresh, {
      crop: { scale: 1.5, x: 0, y: 0 },
    }))).toBe(false);
    expect(isUntouchedCreationRecord(withCreationUpdate(fresh, { step: "review" }))).toBe(false);
  });
});
