import { MEDIA_ASSET_SCHEMA_VERSION } from "./schema-version.js";
import type { GenerationProvenance } from "./provenance.js";

interface MediaAssetBase {
  schemaVersion: typeof MEDIA_ASSET_SCHEMA_VERSION;
  id: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds: number;
  provenance: GenerationProvenance;
}

export type AudioAssetKind = "music" | "ambience" | "sfx" | "narration";

export interface AudioAssetReference extends MediaAssetBase {
  mediaType: "audio";
  kind: AudioAssetKind;
  loop: boolean;
  defaultGain: number;
  transcript?: string;
}

export type VideoAssetKind = "animated-postcard" | "gameplay-highlight";

export interface VideoAssetReference extends MediaAssetBase {
  mediaType: "video";
  kind: VideoAssetKind;
  width: number;
  height: number;
  /** Generated postcards are never presented as captured gameplay. */
  source: "generated-animation" | "gameplay-capture";
  posterUrl?: string;
}

export type MediaAssetReference = AudioAssetReference | VideoAssetReference;

export interface LevelMedia {
  audio: AudioAssetReference[];
  video: VideoAssetReference[];
}
