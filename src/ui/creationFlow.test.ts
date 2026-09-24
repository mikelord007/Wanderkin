import { describe, expect, it } from "vitest";
import type { GeneratedImageReference } from "@shared/index.js";
import {
  approvedPreviewMatchesSelection,
  canBuildWorld,
  createCreationRecord,
  toPendingWorldItem,
  withCreationUpdate,
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
  it("allows building only from the approved preview matching the current selection", () => {
    const draft = createCreationRecord("world-1", "2026-09-24T00:00:00.000Z");
    const approved = withCreationUpdate(draft, {
      step: "preview",
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
});

