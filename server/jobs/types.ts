import type { GenerationJob } from "../../shared/job.js";
import type { ProviderCapabilityId, ProviderInputPhoto } from "../../shared/provider.js";

/** Interim server-local contract. Worker 1 owns shared/*; this additive shape
 * keeps the gateway usable until their versioned multi-kind job type lands. */
export const GENERATION_KINDS = [
  "image-edit",
  "background-removal",
  "image-to-3d",
  "text",
  "music",
  "sfx",
  "tts",
  "image-to-video",
] as const;

export type GenerationKind = (typeof GENERATION_KINDS)[number];

export interface AssetConsumer {
  worldId: string;
  /** Stable game-facing slot such as mesh, style-preview, quest, music, or narration. */
  assetKey: string;
}

export type GenerationInput =
  | { kind: "image-edit"; sourcePhotoId: string; prompt: string }
  | { kind: "background-removal"; sourcePhotoId: string }
  | {
      kind: "image-to-3d";
      photos: readonly ProviderInputPhoto[];
      scenePrompt?: string;
      meshy?: {
        enableRigging?: boolean;
        enableAnimation?: boolean;
        animationActionId?: number;
        ultraMode?: boolean;
        shouldTexture?: boolean;
        modelType?: "standard" | "lowpoly";
        topology?: "quad" | "triangle";
        targetPolycount?: number;
        poseMode?: "a-pose" | "t-pose" | "";
        symmetryMode?: "off" | "auto" | "on";
        enablePbr?: boolean;
      };
    }
  | { kind: "text"; prompt: string }
  | { kind: "music"; prompt: string; instrumental?: boolean }
  | { kind: "sfx"; prompt: string; durationSeconds: number }
  | { kind: "tts"; text: string; voice?: string }
  | { kind: "image-to-video"; sourcePhotoId: string; prompt: string; durationSeconds?: number };

export interface CreateGenerationRequest {
  kind: GenerationKind;
  capability: ProviderCapabilityId;
  input: GenerationInput;
  consumer?: AssetConsumer;
  /** Per-call override may only tighten the server-configured ceiling. */
  maxCostUsd?: number;
}

export interface CostRecord {
  currency: "USD";
  estimateUsd: number | null;
  reportedUsd: number | null;
  status: "estimated" | "reported" | "unknown";
}

export interface GenerationTimings {
  acceptedAt: string;
  submittedAt?: string;
  providerStartedAt?: string;
  completedAt?: string;
}

export interface GenerationProvenance {
  providerId: string;
  capabilityRequested: ProviderCapabilityId;
  capabilityServed: ProviderCapabilityId | null;
  servedModel: string | null;
  providerJobId: string | null;
  fallbackFired: ProviderCapabilityId | null;
  timings: GenerationTimings;
  cost: CostRecord;
  consumer: AssetConsumer | null;
}

export interface GeneratedOutputReference {
  kind: "image" | "3d" | "text" | "audio" | "video" | "json";
  assetId?: string;
  url?: string;
  text?: string;
  json?: unknown;
  contentType?: string;
}

export interface MultiKindGenerationJob extends GenerationJob {
  kind: GenerationKind;
  inputSummary: Record<string, unknown>;
  consumer: AssetConsumer | null;
  cost: CostRecord;
  provenance: GenerationProvenance;
  result?: GeneratedOutputReference;
}

export interface ProviderGenerationSubmitRequest extends CreateGenerationRequest {
  idempotencyKey: string;
  maxCostUsd: number;
}

export interface ProviderGenerationSubmitResult {
  providerJobId: string | null;
  capabilityUsed: ProviderCapabilityId;
  fallbackFired: ProviderCapabilityId | null;
  servedModel?: string;
  reportedCostUsd?: number;
  inlineOutput?: ProviderGenerationStatus["output"];
}

export interface ProviderGenerationStatus {
  state: "generating" | "ready" | "failed";
  actualCapabilityUsed?: ProviderCapabilityId;
  actualFallbackFired?: ProviderCapabilityId | null;
  actualRegisteredModel?: string;
  reportedCostUsd?: number;
  output?: {
    url?: string;
    text?: string;
    json?: unknown;
    outputKind?: GeneratedOutputReference["kind"];
    contentType?: string;
  };
  error?: { message: string; retryable: boolean };
}

export interface GenerationProviderAdapter {
  readonly providerId: string;
  validateGenerationInput(request: CreateGenerationRequest): { valid: boolean; errors: string[] };
  submitGeneration(request: ProviderGenerationSubmitRequest): Promise<ProviderGenerationSubmitResult>;
  getGenerationStatus(providerJobId: string): Promise<ProviderGenerationStatus>;
}

export const DEFAULT_CAPABILITY_BY_KIND: Readonly<Record<GenerationKind, ProviderCapabilityId>> = {
  "image-edit": "kontext-edit",
  "background-removal": "bg-remove",
  "image-to-3d": "rodin-i3d",
  text: "gemini-text",
  music: "music",
  sfx: "mirelo-sfx",
  tts: "chatterbox-tts",
  "image-to-video": "pixverse-i2v",
};
