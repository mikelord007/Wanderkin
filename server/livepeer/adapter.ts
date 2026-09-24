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
import type {
  GenerationProviderAdapter,
  ProviderGenerationStatus,
  ProviderGenerationSubmitRequest,
  ProviderGenerationSubmitResult,
} from "../jobs/types.js";
import type { GenerationRequest, ImageTo3dGenerationRequest } from "../../shared/generation.js";
import { McpToolError, McpTransportError, type McpToolCaller } from "./mcpClient.js";
import { capabilityContract, STATIC_CAPABILITY_DESCRIPTORS, findStaticDescriptor } from "./capabilities.js";

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
  output_kind?: string;
  output?: unknown;
  payload?: unknown;
  text?: string;
  cost_usd?: number | null;
  reported_cost_usd?: number | null;
  actual_cost_usd?: number | null;
}

interface RunCapabilityTextResult {
  text?: unknown;
  model_id?: unknown;
}

interface RunCapabilityOutput {
  ok?: boolean | null;
  output_kind?: string | null;
  result?: RunCapabilityTextResult | null;
  error?: unknown;
  cost_usd_estimated?: number | null;
  cost_paid_usd?: number | null;
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
  output_kind?: string;
  output?: unknown;
  payload?: unknown;
  text?: string;
  content_type?: string;
  run_output?: RunCapabilityOutput | null;
  cost_usd?: number | null;
  reported_cost_usd?: number | null;
  actual_cost_usd?: number | null;
  cost_usd_estimated?: number | null;
  cost_paid_usd?: number | null;
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

const CREATE_MEDIA_DURATION_MIN_SECONDS = 3;
const CREATE_MEDIA_DURATION_MAX_SECONDS = 15;

const TRIPO_SEED_MODULUS = 2_147_483_647;
const RODIN_SEED_MODULUS = 65_536;

function deterministicSeed(key: string, modulus = TRIPO_SEED_MODULUS): number {
  // FNV-1a, folded into the provider-specific non-negative seed range.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % modulus;
}

function validateText(errors: string[], field: string, value: string, min: number, max: number): void {
  const length = value.trim().length;
  if (length < min || length > max) errors.push(`${field} must contain between ${min} and ${max} characters.`);
}

function validateId(errors: string[], field: string, value: string): void {
  if (!value.trim()) errors.push(`${field} is required.`);
}

function validateCreateMediaDuration(errors: string[], durationSeconds: number): void {
  if (
    !Number.isInteger(durationSeconds)
    || durationSeconds < CREATE_MEDIA_DURATION_MIN_SECONDS
    || durationSeconds > CREATE_MEDIA_DURATION_MAX_SECONDS
  ) {
    errors.push(
      `durationSeconds must be an integer from ${CREATE_MEDIA_DURATION_MIN_SECONDS} through ${CREATE_MEDIA_DURATION_MAX_SECONDS} for Livepeer create_media.`,
    );
  }
}

function reportedCost(value: {
  cost_usd?: number | null;
  reported_cost_usd?: number | null;
  actual_cost_usd?: number | null;
}): number | undefined {
  const cost = value.reported_cost_usd ?? value.actual_cost_usd ?? value.cost_usd;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}

function normalizeOutputKind(value: string | null | undefined): NonNullable<ProviderGenerationStatus["output"]>["outputKind"] | undefined {
  const kind = value?.toLowerCase();
  return kind === "3d" || kind === "image" || kind === "audio" || kind === "video" || kind === "text" || kind === "json"
    ? kind
    : undefined;
}

function successfulNestedText(value: { run_output?: RunCapabilityOutput | null }): { text: string; modelId?: string } | undefined {
  const runOutput = value.run_output;
  if (runOutput?.ok !== true || normalizeOutputKind(runOutput.output_kind) !== "text") return undefined;
  if (!runOutput.result || typeof runOutput.result.text !== "string") return undefined;
  const modelId = typeof runOutput.result.model_id === "string" && runOutput.result.model_id.trim()
    ? runOutput.result.model_id
    : undefined;
  return { text: runOutput.result.text, ...(modelId ? { modelId } : {}) };
}

function normalizeOutput(value: {
  url?: string | null;
  text?: string;
  output?: unknown;
  payload?: unknown;
  output_kind?: string;
  content_type?: string;
  run_output?: RunCapabilityOutput | null;
}): ProviderGenerationStatus["output"] | undefined {
  const outputKind = normalizeOutputKind(value.output_kind);
  if (value.url) {
    return {
      url: value.url,
      ...(outputKind ? { outputKind } : {}),
      ...(value.content_type ? { contentType: value.content_type } : {}),
    };
  }
  if (value.text !== undefined) return { text: value.text, outputKind: outputKind ?? "text" };
  const payload = value.payload ?? value.output;
  if (payload !== undefined) {
    if (typeof payload === "string") return { text: payload, outputKind: outputKind ?? "text" };
    return { json: payload, outputKind: outputKind ?? "json" };
  }
  const nestedText = successfulNestedText(value);
  return nestedText ? { text: nestedText.text, outputKind: "text" } : undefined;
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

/** Normalizes original uploads and reviewed generated images into the one
 * ordered image-input shape understood by the existing provider adapter.
 * The style reference is intentionally absent: it is provenance only. */
function imageTo3dProviderInputs(request: ImageTo3dGenerationRequest): ProviderInputPhoto[] {
  const photos = [...(request.photos ?? [])];
  const nextSourceIndex = photos.reduce((max, photo) => Math.max(max, photo.sourceIndex), 0) + 1;
  return [
    ...photos,
    ...(request.sourceImageAssetIds ?? []).map((photoId, index) => ({
      photoId,
      sourceIndex: nextSourceIndex + index,
    })),
  ];
}

export class LivepeerAdapter implements ProviderAdapter, GenerationProviderAdapter {
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

  validateGenerationInput(request: GenerationRequest): ProviderValidationResult {
    const errors: string[] = [];
    const contract = capabilityContract(request.capability);
    if (!contract) {
      return { valid: false, errors: [`Unknown or unpriced capability "${request.capability}".`] };
    }
    if (contract.kind !== request.kind) {
      errors.push(`Capability "${request.capability}" is registered for ${contract.kind}, not ${request.kind}.`);
    }

    switch (request.kind) {
      case "image-edit":
        validateText(errors, "instruction", request.instruction, 1, 4_000);
        validateId(errors, "sourceImageAssetId", request.sourceImageAssetId);
        break;
      case "image-to-3d": {
        const inputs = imageTo3dProviderInputs(request);
        if (request.styleReferenceAssetId !== undefined) {
          validateId(errors, "styleReferenceAssetId", request.styleReferenceAssetId);
        }
        for (const [index, id] of (request.sourceImageAssetIds ?? []).entries()) {
          validateId(errors, `sourceImageAssetIds[${index}]`, id);
        }
        const ids = inputs.map((input) => input.photoId);
        if (new Set(ids).size !== ids.length) errors.push("Each 3D source image must be selected only once.");
        if (request.capability === "meshy-v7-i3d") {
          if (inputs.length !== 1) errors.push("meshy-v7-i3d requires exactly one source image.");
        } else {
          errors.push(...this.validateInput(request.capability, inputs).errors);
        }
        break;
      }
      case "text":
        validateText(errors, "prompt", request.prompt, 1, 8_000);
        if (!Number.isInteger(request.maxCharacters) || request.maxCharacters < 1 || request.maxCharacters > 8_000) {
          errors.push("maxCharacters must be an integer from 1 through 8000.");
        }
        break;
      case "music":
        validateText(errors, "prompt", request.prompt, 1, 4_000);
        validateCreateMediaDuration(errors, request.durationSeconds);
        break;
      case "sfx":
        validateText(errors, "prompt", request.prompt, 1, 2_000);
        validateCreateMediaDuration(errors, request.durationSeconds);
        break;
      case "tts":
        validateText(errors, "text", request.text, 1, 2_000);
        validateText(errors, "language", request.language, 1, 32);
        if (request.voice !== undefined) validateText(errors, "voice", request.voice, 1, 200);
        break;
      case "video":
        validateText(errors, "prompt", request.prompt, 1, 4_000);
        validateId(errors, "sourceImageAssetId", request.sourceImageAssetId);
        validateCreateMediaDuration(errors, request.durationSeconds);
        break;
    }
    return { valid: errors.length === 0, errors };
  }

  async submitGeneration(request: ProviderGenerationSubmitRequest): Promise<ProviderGenerationSubmitResult> {
    const validation = this.validateGenerationInput(request);
    if (!validation.valid) {
      const validationTool = request.kind === "image-to-3d" || request.kind === "text"
        ? "run_capability"
        : "create_media";
      throw new McpToolError(
        `Input validation failed: ${validation.errors.join("; ")}`,
        validationTool,
        false,
        validation,
      );
    }

    if (request.kind === "image-to-3d" && request.capability !== "meshy-v7-i3d") {
      const legacy = await this.submit({
        capability: request.capability,
        photos: imageTo3dProviderInputs(request),
        idempotencyKey: request.idempotencyKey,
        ...(request.scenePrompt !== undefined ? { scenePrompt: request.scenePrompt } : {}),
      });
      return legacy;
    }

    const imageUrls = await this.resolveGenerationImageUrls(request);
    const common = {
      async: true,
      idempotency_key: request.idempotencyKey,
      session_id: request.idempotencyKey,
      max_cost_usd: request.maxCostUsd,
    };
    let toolName: "create_media" | "run_capability";
    let args: Record<string, unknown>;

    switch (request.kind) {
      case "image-edit":
        toolName = "create_media";
        args = { action: "generate", model_override: request.capability, source_url: imageUrls[0], prompt: request.instruction, quality_gate: false, ...common };
        break;
      case "image-to-3d": {
        toolName = "run_capability";
        args = {
          capability: request.capability,
          source_url: imageUrls[0],
          inputs: {
            image_url: imageUrls[0],
          },
          timeout: CAPABILITY_TIMEOUT_SECONDS,
          ...common,
        };
        break;
      }
      case "text":
        toolName = "run_capability";
        args = { capability: request.capability, prompt: request.prompt, inputs: { max_characters: request.maxCharacters, output: request.output }, timeout: CAPABILITY_TIMEOUT_SECONDS, ...common };
        break;
      case "music":
        toolName = "create_media";
        args = { action: "music", model_override: request.capability, prompt: request.prompt, duration: request.durationSeconds, instrumental: true, ...common };
        break;
      case "sfx":
        toolName = "create_media";
        args = { action: "music", model_override: request.capability, prompt: request.prompt, duration: request.durationSeconds, ...common };
        break;
      case "tts":
        toolName = "create_media";
        args = { action: "tts", model_override: request.capability, prompt: request.text, text: request.text, ...(request.voice ? { voice: request.voice } : {}), ...common };
        break;
      case "video":
        toolName = "create_media";
        args = { action: "animate", model_override: request.capability, source_url: imageUrls[0], prompt: request.prompt, duration: request.durationSeconds, on_i2v_timeout: "wait", quality_gate: false, ...common };
        break;
    }

    const response = await this.mcp.callTool<RunCapabilitySubmitResponse>(
      toolName,
      args,
      { timeoutMs: SUBMIT_HTTP_TIMEOUT_MS },
    );
    if (response.error) {
      throw new McpToolError(response.error, toolName, Boolean(response.error_retryable), response);
    }
    const inlineOutput = response.url || response.text || response.output !== undefined || response.payload !== undefined
      ? normalizeOutput(response)
      : undefined;
    if (!response.job_id && !inlineOutput) {
      throw new McpTransportError(`${toolName} returned neither a job_id nor an inline output for "${request.capability}"`);
    }
    const submitCost = reportedCost(response);
    return {
      providerJobId: response.job_id ?? null,
      capabilityUsed: (response.capability_used ?? response.capability ?? request.capability) as ProviderCapabilityId,
      fallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
      ...(response.served_model_id ? { servedModel: response.served_model_id } : {}),
      ...(submitCost !== undefined ? { reportedCostUsd: submitCost } : {}),
      ...(inlineOutput ? { inlineOutput } : {}),
    };
  }

  async getGenerationStatus(providerJobId: string): Promise<ProviderGenerationStatus> {
    const response = await this.mcp.callTool<GetCreateMediaResponse>(
      "get_create_media",
      { job_id: providerJobId },
      { timeoutMs: STATUS_HTTP_TIMEOUT_MS },
    );
    const status = (response.status ?? "").toLowerCase();
    const cost = reportedCost(response);
    if (FAILED_STATUSES.has(status)) {
      return {
        state: "failed",
        ...(response.capability_used ? { actualCapabilityUsed: response.capability_used as ProviderCapabilityId } : {}),
        actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
        ...(cost !== undefined ? { reportedCostUsd: cost } : {}),
        error: {
          message: response.error ?? `Generation ${status === "cancelled" ? "was cancelled" : "failed"}`,
          retryable: status === "cancelled" ? false : (response.error_retryable ?? true),
        },
      };
    }
    if (READY_STATUSES.has(status)) {
      const actualCapability = this.resolveActualCapability(response);
      const registeredModel = await this.resolveRegisteredModel(response, actualCapability);
      const output = normalizeOutput(response);
      if (!output) {
        return { state: "failed", error: { message: `Provider reported "${status}" but returned no output`, retryable: true } };
      }
      return {
        state: "ready",
        output,
        ...(actualCapability ? { actualCapabilityUsed: actualCapability } : {}),
        actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
        ...(registeredModel ? { actualRegisteredModel: registeredModel } : {}),
        ...(cost !== undefined ? { reportedCostUsd: cost } : {}),
      };
    }
    return {
      state: "generating",
      ...(response.capability_used ? { actualCapabilityUsed: response.capability_used as ProviderCapabilityId } : {}),
      actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
      ...(cost !== undefined ? { reportedCostUsd: cost } : {}),
    };
  }

  private async resolveGenerationImageUrls(request: ProviderGenerationSubmitRequest): Promise<string[]> {
    let photoIds: string[] = [];
    switch (request.kind) {
      case "image-edit":
      case "video":
        photoIds = [request.sourceImageAssetId];
        break;
      case "image-to-3d":
        photoIds = orderPhotosForCapability(request.capability, imageTo3dProviderInputs(request)).map((photo) => photo.photoId);
        break;
      default:
        return [];
    }

    const cached = await this.uploadCache?.get(request.idempotencyKey);
    if (cached) return cached;
    const urls: string[] = [];
    for (const photoId of photoIds) {
      const bytes = await this.photos.getPhotoBytes(photoId);
      const uploaded = await this.mcp.callTool<{ url?: string }>(
        "upload",
        { data: bytes.buffer.toString("base64"), mime_type: bytes.mimeType, kind: "image", filename: bytes.filename },
        { timeoutMs: STATUS_HTTP_TIMEOUT_MS },
      );
      if (!uploaded.url) throw new McpTransportError(`Livepeer "upload" did not return a URL for photo ${photoId}`);
      urls.push(uploaded.url);
    }
    await this.uploadCache?.set(request.idempotencyKey, urls);
    return urls;
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
            // fal's Rodin v2.5 schema accepts seed values from 0 through
            // 65,535. Keep Tripo on its existing int32 sequence above.
            seed: deterministicSeed(request.idempotencyKey, RODIN_SEED_MODULUS),
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
      const actualCapability = this.resolveActualCapability(response);
      const registeredModel = await this.resolveRegisteredModel(response, actualCapability);
      return {
        state: "ready",
        progress: { known: false },
        resultAssetUrl: response.url,
        ...(actualCapability ? { actualCapabilityUsed: actualCapability } : {}),
        actualFallbackFired: (response.fallback_fired ?? null) as ProviderCapabilityId | null,
        ...(registeredModel ? { actualRegisteredModel: registeredModel } : {}),
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

  /** A completed job may report the concrete model directly. The observed
   * 2026-09-18 success envelope did not, but it did name the capability
   * that ran, so ask the provider for that capability's registered model.
   * Never fall back to our static catalog: missing live evidence stays
   * missing rather than becoming fabricated provenance. */
  private async resolveRegisteredModel(
    response: GetCreateMediaResponse,
    actualCapability: ProviderCapabilityId | undefined,
  ): Promise<string | undefined> {
    if (response.served_model_id) return response.served_model_id;
    const nestedText = successfulNestedText(response);
    if (nestedText?.modelId) return nestedText.modelId;
    if (!actualCapability) return undefined;

    try {
      const descriptor = await this.mcp.callTool<DescribeCapabilityResponse>(
        "describe_capability",
        { name: actualCapability },
        { timeoutMs: DESCRIBE_HTTP_TIMEOUT_MS },
      );
      return descriptor.found && descriptor.model_id ? descriptor.model_id : undefined;
    } catch {
      // Provenance enrichment must not turn a successfully completed asset
      // into a failed job when the descriptor endpoint is temporarily down.
      return undefined;
    }
  }

  private resolveActualCapability(response: GetCreateMediaResponse): ProviderCapabilityId | undefined {
    const capability = response.capability_used ?? response.fallback_fired ?? response.capability;
    return capability ? (capability as ProviderCapabilityId) : undefined;
  }
}
