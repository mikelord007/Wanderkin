import type { ProviderCapabilityId } from "./provider.js";

export interface GenerationTimings {
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  queueMilliseconds?: number;
  executionMilliseconds?: number;
  totalMilliseconds?: number;
}

export interface ReportedGenerationCost {
  amount: number;
  currency: string;
  /** Human-readable provider unit, for example "image" or "generated-second". */
  unit?: string;
}

/** Provider-neutral evidence stored with every generated output. */
export interface GenerationProvenance {
  providerId: string;
  requestedCapability: ProviderCapabilityId;
  servedCapability: ProviderCapabilityId | null;
  servedModel: string | null;
  applicationJobId: string;
  providerJobId: string | null;
  timings: GenerationTimings;
  /** `null` means unknown/not reported; it must never be interpreted as zero. */
  reportedCost: ReportedGenerationCost | null;
  /** Generated image inputs used for a 3D request, in provider order. */
  sourceImageAssetIds?: readonly string[];
  /** Approved style direction associated with a 3D request. Provider-inert. */
  styleReferenceAssetId?: string;
}
