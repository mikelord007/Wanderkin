import type { GenerationRequest } from "../../shared/generation.js";
import type { ProviderCapabilityId } from "../../shared/provider.js";

/** Provider-facing normalized status kept server-local. Public request,
 * result, job, and provenance types come exclusively from shared/*. */
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
    outputKind?: "image" | "3d" | "text" | "audio" | "video" | "json";
    contentType?: string;
  };
  error?: { message: string; retryable: boolean };
}

export type ProviderGenerationSubmitRequest = GenerationRequest & { maxCostUsd: number };

export interface ProviderGenerationSubmitResult {
  providerJobId: string | null;
  capabilityUsed: ProviderCapabilityId;
  fallbackFired: ProviderCapabilityId | null;
  servedModel?: string;
  reportedCostUsd?: number;
  inlineOutput?: ProviderGenerationStatus["output"];
}

export interface GenerationProviderAdapter {
  readonly providerId: string;
  validateGenerationInput(request: GenerationRequest): { valid: boolean; errors: string[] };
  submitGeneration(request: ProviderGenerationSubmitRequest): Promise<ProviderGenerationSubmitResult>;
  getGenerationStatus(providerJobId: string): Promise<ProviderGenerationStatus>;
}
