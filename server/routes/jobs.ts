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
      res.status(400).json({ error: "Missing required Idempotency-Key header" });
      return;
    }

    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid job request", detail: parsed.error.flatten() });
      return;
    }

    // Reconcile first: a retried/duplicate POST with the same key must never
    // start a second generation.
    const existing = await jobManager.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      res.status(200).json(existing);
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
        res.status(400).json({ error: `Unknown photoId "${photo.photoId}"` });
        return;
      }
    }

    const validation = adapter.validateInput(capability, requestPhotos);
    if (!validation.valid) {
      res.status(400).json({ error: "Input validation failed", detail: validation.errors });
      return;
    }

    const job = await jobManager.create(
      { capability, photos: requestPhotos, ...(scenePrompt !== undefined ? { scenePrompt } : {}) },
      idempotencyKey,
    );
    res.status(job.state === "failed" ? 502 : 201).json(job);
  });

  router.get("/api/jobs/:id", async (req, res) => {
    const job = await jobManager.getPublic(req.params.id as string);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  router.post("/api/jobs/:id/retry", async (req, res) => {
    const job = await jobManager.retry(req.params.id as string);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  return router;
}
