import { Router } from "express";
import { z } from "zod";
import type { ProviderAdapter, ProviderInputPhoto } from "../../shared/provider.js";
import type { JobManager } from "../jobs/manager.js";
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

export function createJobsRouter(
  jobManager: JobManager,
  adapter: ProviderAdapter,
  photos: PhotoStore,
): Router {
  const router = Router();

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
    const outcome = await jobManager.submitOrReconcile(
      { capability, photos: requestPhotos, ...(scenePrompt !== undefined ? { scenePrompt } : {}) },
      idempotencyKey,
    );

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

  router.get("/api/jobs/:id", async (req, res) => {
    const job = await jobManager.getPublic(req.params.id as string);
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    res.json(job);
  });

  router.post("/api/jobs/:id/retry", async (req, res) => {
    const job = await jobManager.retry(req.params.id as string);
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    res.json(job);
  });

  return router;
}
