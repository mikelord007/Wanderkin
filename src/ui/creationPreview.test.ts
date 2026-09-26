import { describe, expect, it } from "vitest";
import type { GeneratedImageReference, PhotoReference } from "@shared/index.js";
import {
  createCreationRecord,
  isUntouchedCreationRecord,
  visiblePreviewUrl,
  withCreationUpdate,
  withNewPhoto,
  withoutPhoto,
  withReadyPreview,
  type CreationRecord,
} from "./creationFlow.js";

/*
 * Step 3's preview slot must only ever show this creation's own preview of
 * this photo in this look. It used to show the previous creation's preview
 * when a fresh photo arrived: a new photo kept the old preview, and a preview
 * still being made borrowed the old picture (or the cut-out) as a stand-in.
 */

const image = (id: string): GeneratedImageReference => ({ id, url: `/generated/${id}.png` } as GeneratedImageReference);
const photo = (id: string): PhotoReference => ({ id, url: `/photos/${id}.jpg`, order: 1 });
const cartoon = { style: "cartoon" as const, mode: "collect" as const, atmosphere: "" };

/** A creation that got all the way to an approved preview of `photoId`. */
function previewed(id: string, photoId: string, previewId: string): CreationRecord {
  return withCreationUpdate(createCreationRecord(id, "2026-09-26T09:00:00.000Z"), {
    step: "preview",
    photo: photo(photoId),
    objectImage: image(`${photoId}-cutout`),
    reviewedImageAssetId: `${photoId}-cutout`,
    selection: cartoon,
    jobs: {
      object: { id: `${id}-object`, state: "ready", kind: "image-edit" },
      preview: { id: `${id}-preview-job`, state: "ready", kind: "image-edit" },
    },
    preview: { cacheKey: `${id}-key`, jobId: `${id}-preview-job`, asset: image(previewId), selection: cartoon, approvedAt: "2026-09-26T09:05:00.000Z" },
    selectedReference: { photoIds: [photoId], reviewedImageAssetId: `${photoId}-cutout`, approvedPreviewAssetId: previewId, ...cartoon },
  });
}

describe("step 3 preview slot", () => {
  it("never shows another creation's preview on a new creation with a different photo", () => {
    const earlier = previewed("world-a", "sofa", "sofa-cartoon");
    expect(visiblePreviewUrl(earlier)).toBe("/generated/sofa-cartoon.png");

    // A brand-new creation, even one reaching step 3 with a fresh photo.
    const fresh = withCreationUpdate(withNewPhoto(createCreationRecord("world-b"), photo("kettle")), { step: "preview", selection: cartoon });
    expect(visiblePreviewUrl(fresh)).toBeUndefined();

    // The same record reused with a different photo (Back to step 1, new photo).
    const reused = withCreationUpdate(withNewPhoto(earlier, photo("kettle")), { step: "preview" });
    expect(visiblePreviewUrl(reused)).toBeUndefined();
    expect(reused.preview).toBeUndefined();
    expect(reused.jobs.preview).toBeUndefined();
    expect(reused.objectImage).toBeUndefined();
    expect(reused.selectedReference).toBeUndefined();
  });

  it("keeps the same creation's own preview across a reload", () => {
    const record = previewed("world-a", "sofa", "sofa-cartoon");
    const reloaded = JSON.parse(JSON.stringify(record)) as CreationRecord;
    expect(visiblePreviewUrl(reloaded)).toBe("/generated/sofa-cartoon.png");
    // Choosing the same photo again keeps it too.
    expect(visiblePreviewUrl(withNewPhoto(reloaded, photo("sofa")))).toBe("/generated/sofa-cartoon.png");
  });

  it("clears everything derived from the photo when the photo is replaced", () => {
    const cleared = withoutPhoto(previewed("world-a", "sofa", "sofa-cartoon"));
    expect(cleared).toMatchObject({ step: "photo" });
    expect(cleared.photo).toBeUndefined();
    expect(visiblePreviewUrl(cleared)).toBeUndefined();
  });

  it("shows nothing while a first preview is being made, then the preview once it is ready", () => {
    const base = withCreationUpdate(withNewPhoto(createCreationRecord("world-b"), photo("kettle")), { step: "preview", selection: cartoon, objectImage: image("kettle-cutout") });
    const waiting = withCreationUpdate(base, { pendingPreview: { cacheKey: "k", jobId: "job-new", selection: cartoon } });
    expect(visiblePreviewUrl(waiting)).toBeUndefined();

    // A finished job that is not the one we are waiting for changes nothing.
    expect(withReadyPreview(waiting, waiting, "someone-elses-job", image("stray"))).toBe(waiting);

    const ready = withReadyPreview(waiting, waiting, "job-new", image("kettle-cartoon"));
    expect(ready.pendingPreview).toBeUndefined();
    expect(visiblePreviewUrl(ready)).toBe("/generated/kettle-cartoon.png");
  });

  it("never shows the cut-out or the photo as a stand-in preview from older saved records", () => {
    const legacy = withCreationUpdate(previewed("world-a", "sofa", "sofa-cartoon"), {});
    legacy.preview = { ...legacy.preview!, asset: image("sofa-cutout") };
    expect(visiblePreviewUrl(legacy)).toBeUndefined();
  });

  it("does not show a preview made for a different look", () => {
    const record = withCreationUpdate(previewed("world-a", "sofa", "sofa-cartoon"), { selection: { ...cartoon, style: "watercolor" } });
    expect(visiblePreviewUrl(record)).toBeUndefined();
  });

  it("counts a pending preview as real work, so the draft is never pruned", () => {
    const record = withCreationUpdate(createCreationRecord("world-c"), { pendingPreview: { cacheKey: "k", jobId: "j", selection: cartoon } });
    expect(isUntouchedCreationRecord(record)).toBe(false);
  });
});
