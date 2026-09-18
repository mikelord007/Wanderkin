import { describe, expect, it } from "vitest";
import type { PhotoReference, ProviderCapabilityDescriptor } from "@shared/index.js";
import { buildProviderInputPhotos, deriveSelectionFromInputPhotos } from "./photoSelection.js";

const photos: PhotoReference[] = [
  { id: "p1", url: "/u/1.jpg", order: 1 },
  { id: "p2", url: "/u/2.jpg", order: 2 },
  { id: "p3", url: "/u/3.jpg", order: 3 },
  { id: "p4", url: "/u/4.jpg", order: 4 },
];

const rodin: ProviderCapabilityDescriptor = {
  id: "rodin-i3d",
  displayName: "Rodin",
  registeredModel: "fal-ai/hyper3d/rodin/v2.5",
  minPhotos: 1,
  maxPhotos: 5,
  supportsScenePrompt: false,
  supportsCancellation: false,
  supportsProgressPercent: false,
};

const tripo: ProviderCapabilityDescriptor = {
  id: "tripo-mv3d",
  displayName: "Tripo",
  registeredModel: "tripo3d/h3.1/multiview-to-3d",
  minPhotos: 2,
  maxPhotos: 4,
  requiredViewOrder: ["front", "left", "back", "right"],
  supportsScenePrompt: false,
  supportsCancellation: false,
  supportsProgressPercent: false,
};

describe("buildProviderInputPhotos", () => {
  it("requires a capability to be selected", () => {
    const result = buildProviderInputPhotos(null, photos, new Set(), {});
    expect(result.inputPhotos).toEqual([]);
    expect(result.validationError).toMatch(/select a generation model/i);
  });

  it("builds free-order inputs for a non-slotted capability, sorted by upload order", () => {
    const included = new Set(["p3", "p1"]);
    const result = buildProviderInputPhotos(rodin, photos, included, {});
    expect(result.validationError).toBeNull();
    expect(result.inputPhotos).toEqual([
      { photoId: "p1", sourceIndex: 1 },
      { photoId: "p3", sourceIndex: 3 },
    ]);
  });

  it("rejects too few or too many photos for the selected capability", () => {
    const tooMany = new Set(photos.map((p) => p.id));
    const single: ProviderCapabilityDescriptor = { ...rodin, minPhotos: 1, maxPhotos: 3 };
    expect(buildProviderInputPhotos(single, photos, tooMany, {}).validationError).toMatch(/at most 3/);
    expect(buildProviderInputPhotos(rodin, photos, new Set(), {}).validationError).toMatch(/at least 1/);
  });

  it("builds ordered view-slot inputs for a slotted capability", () => {
    const result = buildProviderInputPhotos(tripo, photos, new Set(), {
      front: "p4",
      left: "p2",
    });
    expect(result.validationError).toBeNull();
    expect(result.inputPhotos).toEqual([
      { photoId: "p4", sourceIndex: 4, viewSlot: "front" },
      { photoId: "p2", sourceIndex: 2, viewSlot: "left" },
    ]);
  });

  it("rejects a gap in the required view order", () => {
    const result = buildProviderInputPhotos(tripo, photos, new Set(), {
      front: "p4",
      back: "p1",
    });
    expect(result.inputPhotos).toEqual([]);
    expect(result.validationError).toMatch(/no gaps/i);
  });

  it("rejects fewer view slots than the capability's minimum", () => {
    const result = buildProviderInputPhotos(tripo, photos, new Set(), { front: "p4" });
    expect(result.validationError).toMatch(/at least 2/);
  });
});

describe("deriveSelectionFromInputPhotos", () => {
  it("reconstructs free-order inclusion", () => {
    const restored = deriveSelectionFromInputPhotos([
      { photoId: "p1", sourceIndex: 1 },
      { photoId: "p3", sourceIndex: 3 },
    ]);
    expect(restored.includedPhotoIds).toEqual(new Set(["p1", "p3"]));
    expect(restored.slotAssignments).toEqual({});
  });

  it("reconstructs view-slot assignments", () => {
    const restored = deriveSelectionFromInputPhotos([
      { photoId: "p4", sourceIndex: 4, viewSlot: "front" },
      { photoId: "p2", sourceIndex: 2, viewSlot: "left" },
    ]);
    expect(restored.slotAssignments).toEqual({ front: "p4", left: "p2" });
    expect(restored.includedPhotoIds).toEqual(new Set(["p4", "p2"]));
  });

  it("round-trips through buildProviderInputPhotos for a slotted capability", () => {
    const original = buildProviderInputPhotos(tripo, photos, new Set(), { front: "p4", left: "p2" });
    const restored = deriveSelectionFromInputPhotos(original.inputPhotos);
    const rebuilt = buildProviderInputPhotos(tripo, photos, restored.includedPhotoIds, restored.slotAssignments);
    expect(rebuilt.inputPhotos).toEqual(original.inputPhotos);
  });
});
