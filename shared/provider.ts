/**
 * Provider boundary contracts. The game/server never depends on a raw
 * Livepeer/fal/Tripo response shape past the adapter that implements
 * `ProviderAdapter` — everything downstream consumes these normalized
 * types instead.
 */

/**
 * Known capability ids observed against the Livepeer MCP endpoint, kept
 * open (`string & {}`) so a newly discovered or provider-added capability
 * (e.g. a future WorldGen entry) can flow through without a type change.
 */
export type ProviderCapabilityId = "rodin-i3d" | "tripo-mv3d" | (string & {});

export type PhotoViewSlot = "front" | "left" | "back" | "right";

/** Result of asking a provider what it currently supports. Never assume a
 * capability exists, or that a field like cancellation/progress is present,
 * without checking this descriptor first. */
export interface ProviderCapabilityDescriptor {
  id: ProviderCapabilityId;
  displayName: string;
  /** The concrete model registered behind this capability, e.g. "fal-ai/hyper3d/rodin/v2.5". */
  registeredModel: string;
  minPhotos: number;
  maxPhotos: number;
  /** Present only for multiview-style capabilities that require specific view slots (e.g. Tripo). */
  requiredViewOrder?: readonly PhotoViewSlot[];
  supportsScenePrompt: boolean;
  supportsCancellation: boolean;
  /** Whether the provider reports a numeric progress percentage at all. */
  supportsProgressPercent: boolean;
  notes?: string;
}

export interface ProviderInputPhoto {
  photoId: string;
  /** 1-based position the user assigned this photo in their original numbering. */
  sourceIndex: number;
  viewSlot?: PhotoViewSlot;
}

export interface ProviderValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ProviderSubmitRequest {
  capability: ProviderCapabilityId;
  photos: readonly ProviderInputPhoto[];
  scenePrompt?: string;
  /** Caller-generated idempotency key; the adapter/server must ensure a retry
   * with the same key never starts a second generation job. */
  idempotencyKey: string;
}

export interface ProviderSubmitResult {
  providerJobId: string;
  /** The capability actually used to service the request, which may differ
   * from the one requested if the provider fell back. */
  capabilityUsed: ProviderCapabilityId;
  fallbackFired: ProviderCapabilityId | null;
}

export type ProviderJobState = "generating" | "ready" | "failed";

export interface ProviderProgress {
  known: boolean;
  percent?: number;
}

export interface ProviderStatusResult {
  state: ProviderJobState;
  progress: ProviderProgress;
  resultAssetUrl?: string;
  resultSizeBytes?: number;
  /** The capability/model actually used and any fallback that fired. Some
   * providers only reveal this once the job completes, so it may be absent
   * on in-progress polls even though it was present in ProviderSubmitResult. */
  actualCapabilityUsed?: ProviderCapabilityId;
  actualFallbackFired?: ProviderCapabilityId | null;
  actualRegisteredModel?: string;
  error?: {
    message: string;
    retryable: boolean;
  };
}

/**
 * Server-side adapter interface. An adapter must not claim a capability
 * (cancellation, percentage progress, a specific response field) without
 * having verified it against the current provider schema.
 */
export interface ProviderAdapter {
  readonly providerId: string;
  discoverCapabilities(): Promise<ProviderCapabilityDescriptor[]>;
  validateInput(
    capability: ProviderCapabilityId,
    photos: readonly ProviderInputPhoto[],
  ): ProviderValidationResult;
  submit(request: ProviderSubmitRequest): Promise<ProviderSubmitResult>;
  getStatus(providerJobId: string): Promise<ProviderStatusResult>;
}
