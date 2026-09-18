import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetProvenance, PhotoReference } from "../../shared/manifest.js";
import { AssetStore } from "./assetStore.js";

function minimalGlb(): Buffer {
  const buffer = Buffer.alloc(12);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(12, 8);
  return buffer;
}

const PROVENANCE: AssetProvenance = {
  providerId: "livepeer-agent-mcp",
  capabilityUsed: "rodin-i3d",
  fallbackFired: null,
  providerJobId: "mjob_generated",
  registeredModel: "fal-ai/hyper3d/rodin/v2.5",
  sourcePhotoOrder: [4, 1],
  generatedAt: "2026-09-18T09:35:50.313Z",
};

const PHOTOS: PhotoReference[] = [
  { id: "photo-4", url: "/api/photos/files/photo-4.jpg", order: 4 },
  { id: "photo-1", url: "/api/photos/files/photo-1.jpg", order: 1 },
];

describe("AssetStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("does not erase generated provenance or source photos when identical bytes are hand-imported", async () => {
    const dir = mkdtempSync(join(tmpdir(), "objectquest-assets-"));
    dirs.push(dir);
    const store = new AssetStore(dir);
    const bytes = minimalGlb();

    const generated = await store.store(bytes, PROVENANCE, PHOTOS);
    const imported = await store.store(bytes);

    expect(imported.id).toBe(generated.id);
    expect(imported.sha256).toBe(generated.sha256);
    expect(imported.provenance).toEqual(PROVENANCE);
    expect(imported.photos).toEqual(PHOTOS);
    expect(await store.get(generated.id)).toEqual(imported);
  });
});
