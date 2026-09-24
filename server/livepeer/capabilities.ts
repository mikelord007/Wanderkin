import type { ProviderCapabilityDescriptor } from "../../shared/provider.js";
import type { GenerationJobKind, GenerationRequest } from "../../shared/generation.js";

export interface CapabilityContract {
  kind: GenerationJobKind;
  outputKind: "image" | "3d" | "text" | "audio" | "video";
  invokeVia: "create_media" | "run_capability";
  priceUsd: number;
  priceUnit: "image" | "call" | "track" | "second" | "1000_characters" | "1000_tokens" | "mesh";
  fallbackChain: readonly string[];
}

export const COST_NOT_BOUNDED_CODE = "cost_not_bounded";
export const POSTCARD_UNAVAILABLE_MESSAGE = "Animated postcards are temporarily unavailable.";

/** Raised when the provider contract exposes only a lower-bound price, so
 * ObjectQuest cannot enforce its promised maximum before paid execution. */
export class RequestCostNotBoundedError extends Error {
  readonly code = COST_NOT_BOUNDED_CODE;
  readonly retryable = false;

  constructor() {
    super(POSTCARD_UNAVAILABLE_MESSAGE);
    this.name = "RequestCostNotBoundedError";
  }
}

/** Live-discovered on 2026-09-24; see docs/LIVEPEER_CAPABILITIES.md. Price
 * estimators intentionally round up later, never down. */
export const CAPABILITY_CONTRACTS: Readonly<Record<string, CapabilityContract>> = {
  "bg-remove": { kind: "image-edit", outputKind: "image", invokeVia: "create_media", priceUsd: 0.00105, priceUnit: "image", fallbackChain: ["ideogram-bg-remove"] },
  "kontext-edit": { kind: "image-edit", outputKind: "image", invokeVia: "create_media", priceUsd: 0.042, priceUnit: "image", fallbackChain: [] },
  "gpt-image-edit": { kind: "image-edit", outputKind: "image", invokeVia: "create_media", priceUsd: 0.22995, priceUnit: "image", fallbackChain: [] },
  "rodin-i3d": { kind: "image-to-3d", outputKind: "3d", invokeVia: "run_capability", priceUsd: 0.42, priceUnit: "call", fallbackChain: ["tripo-i3d", "triposplat"] },
  "tripo-mv3d": { kind: "image-to-3d", outputKind: "3d", invokeVia: "run_capability", priceUsd: 0.315, priceUnit: "call", fallbackChain: [] },
  "meshy-v7-i3d": { kind: "image-to-3d", outputKind: "3d", invokeVia: "run_capability", priceUsd: 1.26, priceUnit: "mesh", fallbackChain: [] },
  "gemini-text": { kind: "text", outputKind: "text", invokeVia: "run_capability", priceUsd: 0.0000788, priceUnit: "1000_tokens", fallbackChain: [] },
  music: { kind: "music", outputKind: "audio", invokeVia: "create_media", priceUsd: 0.0315, priceUnit: "track", fallbackChain: [] },
  "mirelo-sfx": { kind: "sfx", outputKind: "audio", invokeVia: "create_media", priceUsd: 0.0105, priceUnit: "second", fallbackChain: [] },
  "chatterbox-tts": { kind: "tts", outputKind: "audio", invokeVia: "create_media", priceUsd: 0.02625, priceUnit: "1000_characters", fallbackChain: ["gemini-tts", "inworld-tts", "grok-tts"] },
  "pixverse-i2v": { kind: "video", outputKind: "video", invokeVia: "create_media", priceUsd: 0.06825, priceUnit: "second", fallbackChain: ["ltx-i2v", "seedance-mini-i2v"] },
};

export function capabilityContract(capability: string): CapabilityContract | undefined {
  return CAPABILITY_CONTRACTS[capability];
}

/** The current pixverse-i2v wrapper accepts a cap_price but documents its
 * rate as a lower bound and does not expose the output controls needed to
 * derive an enforceable maximum. Fail closed until that contract changes. */
export function isRequestCostBounded(request: GenerationRequest): boolean {
  return !(request.kind === "video" && request.capability === "pixverse-i2v");
}

export function assertRequestCostBounded(request: GenerationRequest): void {
  if (!isRequestCostBounded(request)) throw new RequestCostNotBoundedError();
}

export function estimateRequestCost(request: GenerationRequest): number | null {
  const contract = capabilityContract(request.capability);
  if (!contract) return null;
  switch (contract.priceUnit) {
    case "second": {
      const seconds = request.kind === "sfx"
        ? request.durationSeconds
        : request.kind === "video"
          ? request.durationSeconds
          : null;
      return seconds === null ? null : roundUsd(contract.priceUsd * seconds);
    }
    case "1000_characters":
      return request.kind === "tts" ? roundUsd(contract.priceUsd * request.text.length / 1000) : null;
    case "1000_tokens":
      // The provider bills tokens. Four characters/token is a conservative
      // planning estimate; reconciliation replaces this when actual cost is returned.
      return request.kind === "text"
        ? roundUsd(contract.priceUsd * Math.max(1, Math.ceil(request.prompt.length / 4)) / 1000)
        : null;
    case "mesh": {
      return request.kind === "image-to-3d" ? roundUsd(contract.priceUsd) : null;
    }
    default:
      return roundUsd(contract.priceUsd);
  }
}

function roundUsd(value: number): number {
  return Math.ceil(value * 10_000) / 10_000;
}

/**
 * Static fallback/base descriptors. Values not discoverable from
 * `describe_capability` (min/max photos, required view order, scene-prompt
 * support) are sourced from docs/CONTRACTS.md and the reference workspace's
 * successful 2026-09-17 requests (`outputs/room-corner-comparison/
 * rodin-request.json`, `tripo-request.json`) — re-verify against
 * https://fal.ai/models/.../api if the provider schema changes.
 */
export const STATIC_CAPABILITY_DESCRIPTORS: readonly ProviderCapabilityDescriptor[] = [
  {
    id: "rodin-i3d",
    displayName: "Rodin (Hyper3D v2.5)",
    registeredModel: "fal-ai/hyper3d/rodin/v2.5",
    minPhotos: 1,
    maxPhotos: 5,
    supportsScenePrompt: true,
    supportsCancellation: false,
    supportsProgressPercent: false,
    notes:
      "Static fallback descriptor (live discovery unavailable). Accepts 1-5 photos in caller-chosen order; " +
      "fallback_chain observed live: tripo-i3d, triposplat.",
  },
  {
    id: "tripo-mv3d",
    displayName: "Tripo Multiview (h3.1)",
    registeredModel: "tripo3d/h3.1/multiview-to-3d",
    minPhotos: 2,
    maxPhotos: 4,
    requiredViewOrder: ["front", "left", "back", "right"],
    supportsScenePrompt: false,
    supportsCancellation: false,
    supportsProgressPercent: false,
    notes:
      "Static fallback descriptor (live discovery unavailable). Requires 2-4 photos each assigned a distinct " +
      "front/left/back/right view slot; no scene-guidance prompt input.",
  },
];

export function findStaticDescriptor(id: string): ProviderCapabilityDescriptor | undefined {
  return STATIC_CAPABILITY_DESCRIPTORS.find((d) => d.id === id);
}
