import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreviewCacheStore } from "./previewCache.js";

describe("PreviewCacheStore", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "objectquest-preview-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("uses the visual inputs, not the idempotency key, as the stable cache identity", async () => {
    const store = new PreviewCacheStore(dir);
    const base = { schemaVersion: 1, kind: "image-edit", capability: "kontext-edit", purpose: "style-preview", sourceImageAssetId: "photo-1", instruction: "watercolor", outputMimeType: "image/png" } as const;
    expect(store.keyFor({ ...base, idempotencyKey: "first" })).toBe(store.keyFor({ ...base, idempotencyKey: "second" }));
    expect(store.keyFor({ ...base, idempotencyKey: "third", instruction: "cartoon" })).not.toBe(store.keyFor({ ...base, idempotencyKey: "first" }));
  });

  it("persists approval only for the matching cached job", async () => {
    const store = new PreviewCacheStore(dir);
    const request = { schemaVersion: 1, kind: "image-edit", capability: "kontext-edit", idempotencyKey: "first", purpose: "style-preview", sourceImageAssetId: "photo-1", instruction: "watercolor", outputMimeType: "image/png" } as const;
    const key = store.keyFor(request);
    await store.put(key, "job-1");
    expect(await store.approve(key, "wrong")).toBeUndefined();
    expect(await store.approve(key, "job-1")).toMatchObject({ approved: true, jobId: "job-1" });
  });
});
