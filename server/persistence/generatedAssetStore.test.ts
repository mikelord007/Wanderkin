import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GenerationProvenance } from "../../shared/provenance.js";
import { GeneratedAssetStore } from "./generatedAssetStore.js";

const provenance: GenerationProvenance = {
  providerId: "fake", requestedCapability: "kontext-edit", servedCapability: "kontext-edit",
  servedModel: "fake/model", applicationJobId: "job-1", providerJobId: "provider-1",
  timings: { requestedAt: "2026-09-24T00:00:00.000Z" }, reportedCost: null,
};

describe("GeneratedAssetStore", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "objectquest-generated-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("stores a content-addressed PNG with provenance and dimensions", async () => {
    const png = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    const store = new GeneratedAssetStore(dir);
    const asset = await store.storeImage(png, "image/png", provenance);
    expect(asset).toMatchObject({ mimeType: "image/png", width: 640, height: 480, sizeBytes: 33, provenance });
    expect(asset.url).toMatch(/^\/api\/generated-assets\/files\/[a-f0-9]{64}\.png$/);
    expect((await store.get(asset.id))?.sha256).toBe(asset.sha256);
    expect((await store.getProviderImage(asset.id))?.id).toBe(asset.id);
    expect((await store.getImageBytes(asset.id)).buffer).toEqual(png);
  });

  it("rejects content that does not match the expected media type", async () => {
    await expect(new GeneratedAssetStore(dir).storeImage(Buffer.from("not an image"), "image/png", provenance))
      .rejects.toThrow(/do not match/);
  });

  it("stores independent audio and video assets with honest kinds", async () => {
    const store = new GeneratedAssetStore(dir);
    const wav = Buffer.alloc(16); wav.write("RIFF"); wav.write("WAVE", 8);
    const audio = await store.storeAudio(wav, { kind: "narration", durationSeconds: 4, loop: false, defaultGain: 1, transcript: "hello", provenance });
    const mp4 = Buffer.alloc(16); mp4.write("ftyp", 4);
    const video = await store.storeVideo(mp4, { durationSeconds: 5, provenance });
    expect(audio).toMatchObject({ mediaType: "audio", kind: "narration", transcript: "hello" });
    expect(video).toMatchObject({ mediaType: "video", kind: "animated-postcard", source: "generated-animation" });
    expect(await store.getProviderImage(audio.id)).toBeUndefined();
  });
});
