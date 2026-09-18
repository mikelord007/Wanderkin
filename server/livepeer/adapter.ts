import type {
  ProviderAdapter,
  ProviderCapabilityDescriptor,
  ProviderCapabilityId,
  ProviderInputPhoto,
  ProviderStatusResult,
  ProviderSubmitRequest,
  ProviderSubmitResult,
  ProviderValidationResult,
} from "../../shared/provider.js";
import { McpToolError, McpTransportError, type McpToolCaller } from "./mcpClient.js";
import { STATIC_CAPABILITY_DESCRIPTORS, findStaticDescriptor } from "./capabilities.js";

/** Adapter-side hook for turning a stored photo into re-hostable bytes.
 * Kept separate from disk/storage concerns so the adapter stays testable
 * with fixtures instead of real files. */
export interface PhotoBytesProvider {
  getPhotoBytes(
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }>;
}

/** Durable cache for the image URLs a photo set was re-hosted to, keyed by
 * idempotency key. `upload` mints a fresh timestamped URL on every call —
 * without this, a retry/resubmit that reuses the same `idempotency_key`
 * would still send DIFFERENT `image_urls` to `run_capability`. If the
 * provider's own idempotency matching fingerprints the request body (not
 * just the key), that mismatch could defeat it and start a second real
 * generation. Backed by the durable job record (not just in-memory) so it
 * survives a process restart, which is exactly when a resubmit is most
 * likely to happen (see JobManager.resumeOnBoot). */
export interface UploadUrlCache {
  get(idempotencyKey: string): Promise<string[] | undefined>;
  set(idempotencyKey: string, imageUrls: string[]): Promise<void>;
}

interface RunCapabilitySubmitResponse {
  job_id?: string;
  status?: string;
  capability?: string | null;
  capability_used?: string | null;
  fallback_fired?: string | null;
  error?: string | null;
  error_code?: string | null;
  error_retryable?: boolean | null;
  served_model_id?: string;
  url?: string | null;
}

interface GetCreateMediaResponse {
  job_id?: string;
  status?: string; // "queued" | "running" | "submitted" | "done" | "failed" | "cancelled" | ...
  capability?: string | null;
  capability_used?: string | null;
  fallback_fired?: string | null;
  served_model_id?: string;
  url?: string | null;
  error?: string | null;
  error_code?: string | null;
  error_retryable?: boolean | null;
  eta_seconds?: number | null;
}

interface DescribeCapabilityResponse {
  found?: boolean;
  availability?: string;
  status?: string;
  model_id?: string;
  fallback_chain?: string[] | null;
}

const READY_STATUSES = new Set(["done", "completed", "succeeded", "ok"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled"]);

const CAPABILITY_TIMEOUT_SECONDS = 700;
/** MCP aborts internally at ~700s and still bills; hold the HTTP call open a
 * little longer than that so we observe the real outcome instead of racing it. */
const SUBMIT_HTTP_TIMEOUT_MS = 720_000;
const STATUS_HTTP_TIMEOUT_MS = 20_000;
const DESCRIBE_HTTP_TIMEOUT_MS = 8_000;

const DISCOVERY_CACHE_TTL_MS = 5 * 60_000;

function deterministicSeed(key: string): number {
  // FNV-1a, folded into fal/Tripo's accepted int32 seed range.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 2_147_483_647;
}

function orderPhotosForCapability(
  capability: ProviderCapabilityId,
  photos: readonly ProviderInputPhoto[],
): ProviderInputPhoto[] {
  if (capability === "tripo-mv3d") {
    const order: readonly string[] = ["front", "left", "back", "right"];
    return [...photos].sort((a, b) => {
      const ai = a.viewSlot ? order.indexOf(a.viewSlot) : 99;
      const bi = b.viewSlot ? order.indexOf(b.viewSlot) : 99;
      return ai - bi;
    });
  }
  // rodin-i3d and anything else: preserve caller-supplied order verbatim.
  return [...photos];
}

export class LivepeerAdapter implements ProviderAdapter {
  readonly providerId = "livepeer-agent-mcp";

  private discoveryCache: { at: number; value: ProviderCapabilityDescriptor[] } | null = null;

  constructor(
    private readonly mcp: McpToolCaller,
    private readonly photos: PhotoBytesProvider,
    private readonly uploadCache?: UploadUrlCache,
  ) {}

  /** Live-confirms each known capability via `describe_capability`. A
   * capability that can't be confirmed available right now (network
   * failure, not found, or the provider itself reports it degraded) is
   * DROPPED from the result rather than returned as if it were usable —
   * the static descriptor list is only ever the input template for what to
   * check, never a fallback value served in place of a real check. If
   * nothing can be confirmed, throws so the caller (the /api/capabilities
   * route) can surface a clear "unavailable" response instead of silently
   * presenting stale/assumed data as current. */
  async discoverCapabilities(): Promise<ProviderCapabilityDescriptor[]> {
    if (this.discoveryCache && Date.now() - this.discoveryCache.at < DISCOVERY_CACHE_TTL_MS) {
      return this.discoveryCache.value;
    }

    const settled = await Promise.allSettled(
      STATIC_CAPABILITY_DESCRIPTORS.map(async (base): Promise<ProviderCapabilityDescriptor> => {
        const info = await this.mcp.callTool<DescribeCapabilityResponse>(
          "describe_capability",
          { name: base.id },
          { timeoutMs: DESCRIBE_HTTP_TIMEOUT_MS },
        );
        if (!info.found) {
          throw new Error(`"${base.id}" not found by describe_capability`);
        }
        const isAvailable = info.availability === "available" && info.status === "active";
        if (!isAvailable) {
          throw new Error(`"${base.id}" reports availability="${info.availability}", status="${info.status}"`);
        }
        const fallbackNote = info.fallback_chain?.length
          ? ` fallback_chain: ${info.fallback_chain.join(", ")}.`
          : "";
        return {
          ...base,
          registeredModel: info.model_id ?? base.registeredModel,
          notes: `Confirmed available via live describe_capability.${fallbackNote}`,
        };
      }),
    );

    const available = settled
      .filter((r): r is PromiseFulfilledResult<ProviderCapabilityDescriptor> => r.status === "fulfilled")
      .map((r) => r.value);

    if (available.length === 0) {
      const reasons = settled
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason as Error).message)
        .join("; ");
      throw new McpTransportError(`No capabilities could be confirmed available right now (${reasons})`);
    }

    this.discoveryCache = { at: Date.now(), value: available };
    return available;
  }

  validateInput(
    capability: ProviderCapabilityId,
    photos: readonly ProviderInputPhoto[],
  ): ProviderValidationResult {
    const descriptor = findStaticDescriptor(capability);
    const errors: string[] = [];
    if (!descriptor) {
      return { valid: false, errors: [`Unknown capability "${capability}".`] };
    }
    if (photos.length < descriptor.minPhotos || photos.length > descriptor.maxPhotos) {
      errors.push(
        `${descriptor.displayName} requires between ${descriptor.minPhotos} and ${descriptor.maxPhotos} photos; received ${photos.length}.`,
      );
    }
    if (descriptor.requiredViewOrder) {
      const seenSlots = new Set<string>();
      for (const photo of photos) {
        if (!photo.viewSlot) {
          errors.push(`Photo (source #${photo.sourceIndex}) is missing a required view slot.`);
          continue;
        }
        if (!descriptor.requiredViewOrder.includes(photo.viewSlot)) {
          errors.push(`Photo (source #${photo.sourceIndex}) has unsupported view slot "${photo.viewSlot}".`);
          continue;
        }
        if (seenSlots.has(photo.viewSlot)) {
          errors.push(`View slot "${photo.viewSlot}" was assigned to more than one photo.`);
        }
        seenSlots.add(photo.viewSlot);
      }
    }
    const seenSourceIndices = new Set<number>();
    for (const photo of photos) {
      if (seenSourceIndices.has(photo.sourceIndex)) {
        errors.push(`Source photo #${photo.sourceIndex} was submitted more than once.`);
      }
      seenSourceIndices.add(photo.sourceIndex);
    }
    return { valid: errors.length === 0, errors };
  }

  async submit(request: ProviderSubmitRequest): Promise<ProviderSubmitResult> {
    const validation = this.validateInput(request.capability, request.photos);
    if (!validation.valid) {
      throw new McpToolError(
        `Input validation failed: ${validation.errors.join("; ")}`,
        "run_capability",
        false,
        validation,
      );
    }

    const orderedPhotos = orderPhotosForCapability(request.capability, request.photos);

    // Reuse a prior submit attempt's re-hosted URLs on retry/resubmit for
    // the same idempotency key, rather than re-uploading (which mints a
    // fresh timestamped URL every call) — see UploadUrlCache above.
    let imageUrls = await this.uploadCache?.get(request.idempotencyKey);
    if (!imageUrls) {
      imageUrls = [];
      for (const photo of orderedPhotos) {
        const bytes = await this.photos.getPhotoBytes(photo.photoId);
        const uploaded = await this.mcp.callTool<{ url?: string }>(
          "upload",
          {
            data: bytes.buffer.toString("base64"),
            mime_type: bytes.mimeType,
            kind: "image",
            filename: bytes.filename,
          },
          { timeoutMs: STATUS_HTTP_TIMEOUT_MS },
        );
        if (!uploaded.url) {
          throw new McpTransportError(`Livepeer "upload" did not return a URL for photo ${photo.photoId}`);
        }
        imageUrls.push(uploaded.url);
      }
      await this.uploadCache?.set(request.idempotencyKey, imageUrls);
    }

    const inputs: Record<string, unknown> =
      request.capability === "tripo-mv3d"
        ? {
            image_urls: imageUrls,
            texture: true,
            pbr: true,
            face_limit: 50_000,
            model_seed: deterministicSeed(request.idempotencyKey),
            texture_seed: deterministicSeed(`${request.idempotencyKey}:texture`),
            orientation: "align_image",
            quad: false,
          }
        : {
            image_urls: imageUrls,
            prompt: request.scenePrompt,
            geometry_file_format: "glb",
            material: "Shaded",
            quality_mesh_option: "50K Triangle",
            preview_render: true,
            seed: deterministicSeed(request.idempotencyKey),
          };

    const response = await this.mcp.callTool<RunCapabilitySubmitResponse>(
      "run_capability",
      {
        capability: request.capability,
        ...(request.scenePrompt ? { prompt: request.scenePrompt } : {}),
        source_url: imageUrls[0],
        inputs,
        async: true,
        timeout: CAPABILITY_TIMEOUT_SECONDS,
        idempotency_key: request.idempotencyKey,
        session_id: request.idempotencyKey,
      },
      { timeoutMs: SUBMIT_HTTP_TIMEOUT_MS },
    );

    if (response.error) {
      throw new McpToolError(response.error, "run_capability", Boolean(response.error_retryable), response);
    }
    if (!response.job_id) {
      throw new McpTransportError(
        `run_capability did not return a job_id for capability "${request.capability}" (status: ${response.status ?? "unknown"})`,
      );
    }

    return {
      providerJobId: response.job_id,
      capabilityUsed: (response.capability_used ?? response.capability ?? request.capability) as ProviderCapabilityId,
      fallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
    };
  }

  async getStatus(providerJobId: string): Promise<ProviderStatusResult> {
    const response = await this.mcp.callTool<GetCreateMediaResponse>(
      "get_create_media",
      { job_id: providerJobId },
      { timeoutMs: STATUS_HTTP_TIMEOUT_MS },
    );

    const status = (response.status ?? "").toLowerCase();

    if (FAILED_STATUSES.has(status)) {
      return {
        state: "failed",
        progress: { known: false },
        ...(response.capability_used ? { actualCapabilityUsed: response.capability_used as ProviderCapabilityId } : {}),
        actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
        error: {
          message: response.error ?? `Generation ${status === "cancelled" ? "was cancelled" : "failed"}`,
          retryable: status === "cancelled" ? false : (response.error_retryable ?? true),
        },
      };
    }

    if (READY_STATUSES.has(status)) {
      if (!response.url) {
        return {
          state: "failed",
          progress: { known: false },
          error: { message: `Provider reported "${status}" but returned no result URL`, retryable: true },
        };
      }
      return {
        state: "ready",
        progress: { known: false },
        resultAssetUrl: response.url,
        ...(response.capability_used ? { actualCapabilityUsed: response.capability_used as ProviderCapabilityId } : {}),
        actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
        ...(response.served_model_id ? { actualRegisteredModel: response.served_model_id } : {}),
      };
    }

    // queued / submitted / running / processing / anything else in-flight.
    return {
      state: "generating",
      progress: { known: false },
      ...(response.capability_used ? { actualCapabilityUsed: response.capability_used as ProviderCapabilityId } : {}),
      actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
    };
  }
}
