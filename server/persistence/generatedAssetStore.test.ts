import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function pcmWav(durationSeconds: number, sampleRate = 24_000): Buffer {
  const dataBytes = Math.round(durationSeconds * sampleRate) * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

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
    const asset = await store.storeImage(png, provenance);
    expect(asset).toMatchObject({ mimeType: "image/png", width: 640, height: 480, sizeBytes: 33, provenance });
    expect(asset.url).toMatch(/^\/api\/generated-assets\/files\/[a-f0-9]{64}\.png$/);
    expect((await store.get(asset.id))?.sha256).toBe(asset.sha256);
    expect((await store.getProviderImage(asset.id))?.id).toBe(asset.id);
    expect((await store.getImageBytes(asset.id)).buffer).toEqual(png);
  });

  it("rejects content that is not a supported image", async () => {
    await expect(new GeneratedAssetStore(dir).storeImage(Buffer.from("not an image"), provenance))
      .rejects.toThrow(/not a recognized JPEG, PNG, or WebP/);
  });

  it("stores independent audio and video assets with honest kinds", async () => {
    const store = new GeneratedAssetStore(dir);
    const wav = pcmWav(0.25);
    const audio = await store.storeAudio(wav, { kind: "narration", durationSeconds: 4, loop: false, defaultGain: 1, transcript: "hello", provenance });
    const mp4 = Buffer.alloc(16); mp4.write("ftyp", 4);
    const video = await store.storeVideo(mp4, { durationSeconds: 5, provenance });
    expect(audio).toMatchObject({ mediaType: "audio", kind: "narration", transcript: "hello", durationSeconds: 0.25 });
    expect(video).toMatchObject({ mediaType: "video", kind: "animated-postcard", source: "generated-animation" });
    expect(await store.getProviderImage(audio.id)).toBeUndefined();
  });

  it("rejects malformed WAV bytes and audio without a supported signature", async () => {
    const malformed = Buffer.alloc(20);
    malformed.write("RIFF", 0, "ascii");
    malformed.writeUInt32LE(12, 4);
    malformed.write("WAVE", 8, "ascii");
    malformed.write("fmt ", 12, "ascii");
    malformed.writeUInt32LE(16, 16);
    const store = new GeneratedAssetStore(dir);
    await expect(store.storeAudio(malformed, { kind: "narration", loop: false, defaultGain: 1, provenance }))
      .rejects.toThrow(/truncated chunk/);
    const unsupportedEncoding = pcmWav(0.25);
    unsupportedEncoding.writeUInt16LE(6, 20);
    await expect(store.storeAudio(unsupportedEncoding, { kind: "narration", loop: false, defaultGain: 1, provenance }))
      .rejects.toThrow(/unsupported audio encoding/);
    await expect(store.storeAudio(Buffer.from("not audio"), { kind: "narration", loop: false, defaultGain: 1, provenance }))
      .rejects.toThrow(/unsupported or invalid file signature/);
  });

  it("idempotently reconciles a legacy zero duration from unchanged WAV bytes", async () => {
    const wav = pcmWav(0.375);
    const initial = await new GeneratedAssetStore(dir).storeAudio(wav, {
      kind: "narration", loop: false, defaultGain: 1, transcript: "hello", provenance,
    });
    const indexPath = join(dir, "generated-assets.json");
    const records = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, typeof initial>;
    records[initial.id] = { ...records[initial.id]!, durationSeconds: 0 };
    writeFileSync(indexPath, JSON.stringify(records, null, 2));
    const legacy = records[initial.id]!;
    const store = new GeneratedAssetStore(dir);

    const repaired = await store.reconcileAudioDuration(legacy);
    expect(repaired).toEqual({ ...legacy, durationSeconds: 0.375 });
    const afterFirst = readFileSync(indexPath, "utf8");
    expect(await store.reconcileAudioDuration(legacy)).toEqual(repaired);
    expect(readFileSync(indexPath, "utf8")).toBe(afterFirst);
    expect(readFileSync(join(dir, "generated-assets", initial.url.split("/").pop()!))).toEqual(wav);
  });
});
