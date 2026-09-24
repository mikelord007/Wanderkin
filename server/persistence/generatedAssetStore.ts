import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedImageReference } from "../../shared/generation.js";
import type { AudioAssetReference, VideoAssetReference } from "../../shared/media.js";
import type { GenerationProvenance } from "../../shared/provenance.js";
import { MEDIA_ASSET_SCHEMA_VERSION } from "../../shared/schema-version.js";
import { JsonFileStore } from "./jsonStore.js";
import { InvalidFileError } from "./validate.js";

export type GeneratedBinaryAsset = GeneratedImageReference | AudioAssetReference | VideoAssetReference;
type GeneratedBinaryAssetDraft =
  | Omit<GeneratedImageReference, "url" | "sha256" | "sizeBytes">
  | Omit<AudioAssetReference, "url" | "sha256" | "sizeBytes">
  | Omit<VideoAssetReference, "url" | "sha256" | "sizeBytes">;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 75 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export class GeneratedAssetStore {
  private readonly index: JsonFileStore<Record<string, GeneratedBinaryAsset>>;
  private readonly dir: string;

  constructor(storageDir: string) {
    this.dir = join(storageDir, "generated-assets");
    this.index = new JsonFileStore(join(storageDir, "generated-assets.json"), () => ({}));
  }

  async storeImage(
    buffer: Buffer,
    expectedMimeType: GeneratedImageReference["mimeType"],
    provenance: GenerationProvenance,
  ): Promise<GeneratedImageReference> {
    assertSize(buffer, MAX_IMAGE_BYTES, "image");
    const detected = detectImage(buffer);
    if (!detected || detected.mimeType !== expectedMimeType) {
      throw new InvalidFileError(`Generated image bytes do not match expected ${expectedMimeType}.`);
    }
    return this.store({
      id: randomUUID(),
      mimeType: detected.mimeType,
      width: detected.width,
      height: detected.height,
      provenance,
    }, buffer, detected.extension) as Promise<GeneratedImageReference>;
  }

  async storeAudio(
    buffer: Buffer,
    params: {
      kind: AudioAssetReference["kind"];
      durationSeconds: number;
      loop: boolean;
      defaultGain: number;
      transcript?: string;
      provenance: GenerationProvenance;
    },
  ): Promise<AudioAssetReference> {
    assertSize(buffer, MAX_AUDIO_BYTES, "audio");
    const detected = detectAudio(buffer);
    if (!detected) throw new InvalidFileError("Generated audio has an unsupported or invalid file signature.");
    return this.store({
      schemaVersion: MEDIA_ASSET_SCHEMA_VERSION,
      mediaType: "audio",
      id: randomUUID(),
      mimeType: detected.mimeType,
      durationSeconds: params.durationSeconds,
      kind: params.kind,
      loop: params.loop,
      defaultGain: params.defaultGain,
      ...(params.transcript !== undefined ? { transcript: params.transcript } : {}),
      provenance: params.provenance,
    }, buffer, detected.extension) as Promise<AudioAssetReference>;
  }

  async storeVideo(
    buffer: Buffer,
    params: { durationSeconds: number; width?: number; height?: number; provenance: GenerationProvenance },
  ): Promise<VideoAssetReference> {
    assertSize(buffer, MAX_VIDEO_BYTES, "video");
    const detected = detectVideo(buffer);
    if (!detected) throw new InvalidFileError("Generated video has an unsupported or invalid file signature.");
    return this.store({
      schemaVersion: MEDIA_ASSET_SCHEMA_VERSION,
      mediaType: "video",
      id: randomUUID(),
      mimeType: detected.mimeType,
      durationSeconds: params.durationSeconds,
      kind: "animated-postcard",
      width: params.width ?? 0,
      height: params.height ?? 0,
      source: "generated-animation",
      provenance: params.provenance,
    }, buffer, detected.extension) as Promise<VideoAssetReference>;
  }

  async get(id: string): Promise<GeneratedBinaryAsset | undefined> {
    return (await this.index.read())[id];
  }

  async getImageBytes(id: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const asset = await this.get(id);
    if (!asset || "mediaType" in asset) {
      throw new Error(`Unknown generated image asset id "${id}"`);
    }
    const filename = asset.url.split("/").pop();
    if (!filename) throw new Error(`Generated image "${id}" has an invalid stored URL`);
    return { buffer: await readFile(join(this.dir, filename)), mimeType: asset.mimeType, filename };
  }

  fileDir(): string {
    return this.dir;
  }

  private async store(
    partial: GeneratedBinaryAssetDraft,
    buffer: Buffer,
    extension: string,
  ): Promise<GeneratedBinaryAsset> {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const filename = `${sha256}.${extension}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), buffer);
    const existing = Object.values(await this.index.read()).find((asset) => asset.sha256 === sha256);
    const record = {
      ...partial,
      id: existing?.id ?? partial.id,
      url: `/api/generated-assets/files/${filename}`,
      sha256,
      sizeBytes: buffer.byteLength,
    } as GeneratedBinaryAsset;
    await this.index.update((current) => {
      current[record.id] = record;
    });
    return record;
  }
}

function assertSize(buffer: Buffer, max: number, kind: string): void {
  if (buffer.byteLength === 0 || buffer.byteLength > max) {
    throw new InvalidFileError(`Generated ${kind} must be between 1 byte and ${max} bytes.`);
  }
}

function detectImage(buffer: Buffer): { mimeType: GeneratedImageReference["mimeType"]; extension: string; width: number; height: number } | undefined {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: "image/png", extension: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    const dimensions = jpegDimensions(buffer);
    if (dimensions) return { mimeType: "image/jpeg", extension: "jpg", ...dimensions };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    if (buffer.toString("ascii", 12, 16) === "VP8X") {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { mimeType: "image/webp", extension: "webp", width, height };
    }
    return { mimeType: "image/webp", extension: "webp", width: 0, height: 0 };
  }
  return undefined;
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    offset += 2 + length;
  }
  return undefined;
}

function detectAudio(buffer: Buffer): { mimeType: string; extension: string } | undefined {
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return { mimeType: "audio/wav", extension: "wav" };
  if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") return { mimeType: "audio/mpeg", extension: "mp3" };
  if (buffer.length >= 2 && buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0) return { mimeType: "audio/mpeg", extension: "mp3" };
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") return { mimeType: "audio/ogg", extension: "ogg" };
  return undefined;
}

function detectVideo(buffer: Buffer): { mimeType: string; extension: string } | undefined {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") return { mimeType: "video/mp4", extension: "mp4" };
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { mimeType: "video/webm", extension: "webm" };
  return undefined;
}
