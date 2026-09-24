import type { AssetReference } from "./manifest.js";
import type { AudioAssetReference, VideoAssetReference } from "./media.js";
import type { GenerationProvenance } from "./provenance.js";
import type { ProviderCapabilityId, ProviderInputPhoto } from "./provider.js";
import { GENERATION_CONTRACT_SCHEMA_VERSION } from "./schema-version.js";

export type GenerationJobKind =
  | "image-to-3d"
  | "image-edit"
  | "text"
  | "music"
  | "sfx"
  | "tts"
  | "video";

interface GenerationRequestBase {
  schemaVersion: typeof GENERATION_CONTRACT_SCHEMA_VERSION;
  kind: GenerationJobKind;
  capability: ProviderCapabilityId;
  idempotencyKey: string;
  /** Which authored game asset will consume the result. */
  purpose: string;
}

export interface ImageTo3dGenerationRequest extends GenerationRequestBase {
  kind: "image-to-3d";
  photos: readonly ProviderInputPhoto[];
  scenePrompt?: string;
}

export interface ImageEditGenerationRequest extends GenerationRequestBase {
  kind: "image-edit";
  sourceImageAssetId: string;
  instruction: string;
  outputMimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface TextGenerationRequest extends GenerationRequestBase {
  kind: "text";
  prompt: string;
  output: "quest-json" | "plain-text";
  maxCharacters: number;
}

export interface MusicGenerationRequest extends GenerationRequestBase {
  kind: "music";
  prompt: string;
  durationSeconds: number;
  instrumental: true;
  loop: boolean;
}

export interface SfxGenerationRequest extends GenerationRequestBase {
  kind: "sfx";
  prompt: string;
  durationSeconds: number;
  loop: boolean;
}

export interface TtsGenerationRequest extends GenerationRequestBase {
  kind: "tts";
  text: string;
  voice?: string;
  language: string;
}

export interface VideoGenerationRequest extends GenerationRequestBase {
  kind: "video";
  sourceImageAssetId: string;
  prompt: string;
  durationSeconds: number;
  purpose: "animated-postcard";
}

export type GenerationRequest =
  | ImageTo3dGenerationRequest
  | ImageEditGenerationRequest
  | TextGenerationRequest
  | MusicGenerationRequest
  | SfxGenerationRequest
  | TtsGenerationRequest
  | VideoGenerationRequest;

export interface GeneratedImageReference {
  id: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  provenance: GenerationProvenance;
}

export interface GeneratedTextResult {
  text: string;
  /** Parsed JSON after server-side shape validation, when requested. */
  structured?: unknown;
}

export type GenerationResult =
  | { kind: "image-to-3d"; asset: AssetReference }
  | { kind: "image-edit"; asset: GeneratedImageReference }
  | { kind: "text"; output: GeneratedTextResult }
  | { kind: "music"; asset: AudioAssetReference & { kind: "music" } }
  | { kind: "sfx"; asset: AudioAssetReference & { kind: "sfx" | "ambience" } }
  | { kind: "tts"; asset: AudioAssetReference & { kind: "narration" } }
  | { kind: "video"; asset: VideoAssetReference & { kind: "animated-postcard" } };

export interface GenerationResponse {
  schemaVersion: typeof GENERATION_CONTRACT_SCHEMA_VERSION;
  kind: GenerationJobKind;
  applicationJobId: string;
  state: "queued" | "running" | "ready" | "failed";
  provenance: GenerationProvenance;
  result?: GenerationResult;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
