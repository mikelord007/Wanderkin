import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ProviderAdapter, ProviderInputPhoto } from "../../shared/provider.js";
import type { GenerationRequest, ImageEditGenerationRequest } from "../../shared/generation.js";
import { ProviderConcurrencyExceededError, type JobManager } from "../jobs/manager.js";
import { BudgetExceededError, type SpendLedger } from "../jobs/spendLedger.js";
import type { PreviewCacheStore } from "../jobs/previewCache.js";
import { McpToolError } from "../livepeer/mcpClient.js";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import type { PhotoStore } from "../persistence/photoStore.js";

const photoSchema = z.object({
  photoId: z.string().min(1),
  sourceIndex: z.number().int().positive(),
  viewSlot: z.enum(["front", "left", "back", "right"]).optional(),
});

const createJobSchema = z.object({
  capability: z.string().min(1),
  photos: z.array(photoSchema).min(1),
  scenePrompt: z.string().max(4000).optional(),
});

const generationBase = {
  schemaVersion: z.literal(1),
  capability: z.string().min(1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  purpose: z.string().min(1).max(200),
};

const generationRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    ...generationBase,
    kind: z.literal("image-to-3d"),
    photos: z.array(photoSchema).max(5).optional(),
    sourceImageAssetIds: z.array(z.string().min(1)).min(1).max(5).optional(),
    styleReferenceAssetId: z.string().min(1).optional(),
    scenePrompt: z.string().max(4000).optional(),
  }),
  z.object({ ...generationBase, kind: z.literal("image-edit"), sourceImageAssetId: z.string().min(1), instruction: z.string().min(1).max(4000), outputMimeType: z.enum(["image/png", "image/jpeg", "image/webp"]) }),
  z.object({ ...generationBase, kind: z.literal("text"), prompt: z.string().min(1).max(8000), output: z.enum(["quest-json", "plain-text"]), maxCharacters: z.number().int().min(1).max(8000) }),
  z.object({ ...generationBase, kind: z.literal("music"), prompt: z.string().min(1).max(4000), durationSeconds: z.number().int().min(1).max(600), instrumental: z.literal(true), loop: z.boolean() }),
  z.object({ ...generationBase, kind: z.literal("sfx"), prompt: z.string().min(1).max(2000), durationSeconds: z.number().int().min(1).max(60), loop: z.boolean() }),
  z.object({ ...generationBase, kind: z.literal("tts"), text: z.string().min(1).max(2000), voice: z.string().min(1).max(200).optional(), language: z.string().min(1).max(32) }),
  z.object({ ...generationBase, kind: z.literal("video"), sourceImageAssetId: z.string().min(1), prompt: z.string().min(1).max(4000), durationSeconds: z.number().int().min(3).max(15), purpose: z.literal("animated-postcard") }),
]).superRefine((request, context) => {
  if (request.kind !== "image-to-3d") return;
  const inputCount = (request.photos?.length ?? 0) + (request.sourceImageAssetIds?.length ?? 0);
  if (inputCount < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "At least one photo or sourceImageAssetId is required." });
  } else if (inputCount > 5) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "At most five combined 3D source images are allowed." });
  }
  if (request.styleReferenceAssetId && request.sourceImageAssetIds?.includes(request.styleReferenceAssetId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The style reference cannot also be a 3D provider input." });
  }
});

const generationEnvelopeSchema = z.object({
  request: generationRequestSchema,
  worldId: z.string().min(1).max(200).optional(),
  maxCostUsd: z.number().positive().optional(),
});

export function createJobsRouter(
  jobManager: JobManager,
  adapter: ProviderAdapter,
  photos: PhotoStore,
  generatedAssets?: GeneratedAssetStore,
  previewCache?: PreviewCacheStore,
  spendLedger?: SpendLedger,
): Router {
  const router = Router();

  function sendConcurrencyError(err: unknown, res: Response): boolean {
    if (!(err instanceof ProviderConcurrencyExceededError)) return false;
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(429).json({ message: err.message });
    return true;
  }

  async function sourceImageExists(id: string): Promise<boolean> {
    if (await photos.get(id)) return true;
    return Boolean(await generatedAssets?.getProviderImage(id));
  }

  async function isApprovedPreviewAsset(id: string): Promise<boolean> {
    const asset = await generatedAssets?.getProviderImage(id);
    if (!asset || !previewCache) return false;
    return Boolean(
      (await previewCache.findApprovedByAssetId(id))
      ?? (await previewCache.findApprovedByJobId(asset.provenance.applicationJobId)),
    );
  }

  async function validateGenerationSources(request: GenerationRequest): Promise<string | undefined> {
    if (request.kind === "image-to-3d") {
      for (const photo of request.photos ?? []) if (!(await photos.get(photo.photoId))) return `Unknown photoId "${photo.photoId}"`;
      for (const id of request.sourceImageAssetIds ?? []) {
        if (!(await generatedAssets?.getProviderImage(id))) {
          return `Unknown or ineligible generated sourceImageAssetId "${id}"`;
        }
        if (await isApprovedPreviewAsset(id)) {
          return `Approved style preview "${id}" cannot be used as a 3D provider input`;
        }
      }
      if (request.styleReferenceAssetId) {
        if (!(await generatedAssets?.getProviderImage(request.styleReferenceAssetId))) {
          return `Unknown or ineligible styleReferenceAssetId "${request.styleReferenceAssetId}"`;
        }
        if (!(await isApprovedPreviewAsset(request.styleReferenceAssetId))) {
          return `styleReferenceAssetId "${request.styleReferenceAssetId}" is not an approved preview`;
        }
      }
    } else if ((request.kind === "image-edit" || request.kind === "video") && !(await sourceImageExists(request.sourceImageAssetId))) {
      return `Unknown sourceImageAssetId "${request.sourceImageAssetId}"`;
    }
    return undefined;
  }

  async function submitGeneration(req: Request, res: Response): Promise<void> {
    const parsed = generationEnvelopeSchema.safeParse(req.body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
      res.status(400).json({ message: `Invalid generation request: ${detail}` });
      return;
    }
    const headerKey = req.get("Idempotency-Key");
    if (!headerKey || headerKey !== parsed.data.request.idempotencyKey) {
      res.status(400).json({ message: "Idempotency-Key header must match request.idempotencyKey" });
      return;
    }
    const request = parsed.data.request as GenerationRequest;
    const sourceError = await validateGenerationSources(request);
    if (sourceError) { res.status(400).json({ message: sourceError }); return; }
    try {
      const outcome = await jobManager.submitGenerationOrReconcile(request, {
        ...(parsed.data.worldId !== undefined ? { worldId: parsed.data.worldId } : {}),
        ...(parsed.data.maxCostUsd !== undefined ? { requestLimitOverrideUsd: parsed.data.maxCostUsd } : {}),
      });
      if (outcome.status === "conflict") {
        res.status(409).json({ message: "This Idempotency-Key was already used for a different generation request." });
        return;
      }
      res.status(outcome.status === "reconciled" ? 200 : outcome.job.state === "failed" ? 502 : 201).json(outcome.job);
    } catch (err) {
      if (sendConcurrencyError(err, res)) return;
      if (err instanceof BudgetExceededError) { res.status(402).json({ message: err.message, code: err.code }); return; }
      if (err instanceof McpToolError) { res.status(400).json({ message: err.message }); return; }
      throw err;
    }
  }

  router.post("/api/jobs/generate", submitGeneration);

  router.post("/api/jobs", async (req, res) => {
    const idempotencyKey = req.get("Idempotency-Key");
    if (!idempotencyKey) {
      res.status(400).json({ message: "Missing required Idempotency-Key header" });
      return;
    }

    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
      res.status(400).json({ message: `Invalid job request: ${detail}` });
      return;
    }

    const { capability, scenePrompt } = parsed.data;
    // exactOptionalPropertyTypes: zod's `.optional()` yields `viewSlot?: T |
    // undefined`, which ProviderInputPhoto's `viewSlot?: PhotoViewSlot`
    // rejects — rebuild each photo so an absent slot is an omitted key, not
    // an explicit `undefined` value.
    const requestPhotos: ProviderInputPhoto[] = parsed.data.photos.map((p) => ({
      photoId: p.photoId,
      sourceIndex: p.sourceIndex,
      ...(p.viewSlot !== undefined ? { viewSlot: p.viewSlot } : {}),
    }));

    for (const photo of requestPhotos) {
      const stored = await photos.get(photo.photoId);
      if (!stored) {
        res.status(400).json({ message: `Unknown photoId "${photo.photoId}"` });
        return;
      }
    }

    const validation = adapter.validateInput(capability, requestPhotos);
    if (!validation.valid) {
      res.status(400).json({ message: `Input validation failed: ${validation.errors.join("; ")}` });
      return;
    }

    // submitOrReconcile is the sole atomic entry point — it holds a
    // per-idempotency-key lock across the exists-check and the create, so
    // two concurrent POSTs with the same key can never both submit.
    let outcome;
    try {
      outcome = await jobManager.submitOrReconcile(
        { capability, photos: requestPhotos, ...(scenePrompt !== undefined ? { scenePrompt } : {}) },
        idempotencyKey,
      );
    } catch (err) {
      if (sendConcurrencyError(err, res)) return;
      throw err;
    }

    if (outcome.status === "conflict") {
      res.status(409).json({
        message:
          "This Idempotency-Key was already used for a different request (capability/photos/prompt don't match). Use a new key for a new submission.",
      });
      return;
    }
    if (outcome.status === "reconciled") {
      res.status(200).json(outcome.job);
      return;
    }
    res.status(outcome.job.state === "failed" ? 502 : 201).json(outcome.job);
  });

  router.post("/api/jobs/previews", async (req, res) => {
    if (!previewCache) { res.status(503).json({ message: "Preview cache is not configured" }); return; }
    const parsed = generationEnvelopeSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.request.kind !== "image-edit" || parsed.data.request.purpose !== "style-preview") {
      res.status(400).json({ message: "Preview requests must be a valid image-edit generation with purpose style-preview" });
      return;
    }
    const request = parsed.data.request as ImageEditGenerationRequest;
    const headerKey = req.get("Idempotency-Key");
    if (!headerKey || headerKey !== request.idempotencyKey) {
      res.status(400).json({ message: "Idempotency-Key header must match request.idempotencyKey" });
      return;
    }
    if (!(await sourceImageExists(request.sourceImageAssetId))) {
      res.status(400).json({ message: `Unknown sourceImageAssetId "${request.sourceImageAssetId}"` });
      return;
    }
    const cacheKey = previewCache.keyFor(request);
    const cached = await previewCache.get(cacheKey);
    if (cached) {
      const job = await jobManager.getPublic(cached.jobId);
      if (job && job.state !== "failed") {
        res.status(200).json({ cacheHit: true, approved: cached.approved, cacheKey, job });
        return;
      }
    }
    try {
      const outcome = await jobManager.submitGenerationOrReconcile(request, {
        ...(parsed.data.worldId !== undefined ? { worldId: parsed.data.worldId } : {}),
        ...(parsed.data.maxCostUsd !== undefined ? { requestLimitOverrideUsd: parsed.data.maxCostUsd } : {}),
      });
      if (outcome.status === "conflict") {
        res.status(409).json({ message: "This Idempotency-Key was already used for a different generation request." });
        return;
      }
      const record = await previewCache.put(cacheKey, outcome.job.id);
      res.status(outcome.status === "reconciled" ? 200 : 201).json({ cacheHit: false, approved: record.approved, cacheKey, job: outcome.job });
    } catch (err) {
      if (sendConcurrencyError(err, res)) return;
      if (err instanceof BudgetExceededError) { res.status(402).json({ message: err.message, code: err.code }); return; }
      if (err instanceof McpToolError) { res.status(400).json({ message: err.message }); return; }
      throw err;
    }
  });

  router.get("/api/jobs/preview-cache/:key", async (req, res) => {
    if (!previewCache || !/^[a-f0-9]{64}$/.test(req.params.key as string)) { res.status(404).json({ message: "Preview not found" }); return; }
    const record = await previewCache.get(req.params.key as string);
    if (!record) { res.status(404).json({ message: "Preview not found" }); return; }
    const job = await jobManager.getPublic(record.jobId);
    res.json({ ...record, job: job ?? null });
  });

  router.post("/api/jobs/preview-cache/:key/approve", async (req, res) => {
    if (!previewCache || !/^[a-f0-9]{64}$/.test(req.params.key as string)) { res.status(404).json({ message: "Preview not found" }); return; }
    const parsed = z.object({ jobId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "A matching jobId is required" }); return; }
    const job = await jobManager.getPublic(parsed.data.jobId);
    if (!job || job.state !== "ready" || job.kind !== "image-edit" || job.request?.purpose !== "style-preview") {
      res.status(409).json({ message: "Only a ready style preview can be approved" });
      return;
    }
    const assetId = job.result?.kind === "image-edit" ? job.result.asset.id : undefined;
    const record = await previewCache.approve(req.params.key as string, job.id, assetId);
    if (!record) { res.status(404).json({ message: "Preview not found for this job" }); return; }
    res.json({ ...record, job });
  });

  router.get("/api/jobs/spend/:worldId", async (req, res) => {
    if (!spendLedger) { res.status(503).json({ message: "Spend ledger is not configured" }); return; }
    res.json(await spendLedger.summaryForWorld(req.params.worldId as string));
  });

  router.get("/api/jobs/:id", async (req, res) => {
    const job = await jobManager.getPublic(req.params.id as string);
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    res.json(job);
  });

  router.post("/api/jobs/:id/retry", async (req, res) => {
    let job;
    try {
      job = await jobManager.retry(req.params.id as string);
    } catch (err) {
      if (sendConcurrencyError(err, res)) return;
      throw err;
    }
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    res.json(job);
  });

  return router;
}
