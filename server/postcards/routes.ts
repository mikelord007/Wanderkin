import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { GenerationProvenance } from "../../shared/provenance.js";
import type { LevelStore } from "../levels.js";
import type { JobManager } from "../jobs/manager.js";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import { PostcardService } from "./service.js";
import type { PostcardCacheStore } from "./store.js";

const screenshotSchema = z.object({
  imageBase64: z.string().min(1).max(8_000_000),
});

function localCaptureProvenance(buffer: Buffer): GenerationProvenance {
  const digest = createHash("sha256").update(buffer).digest("hex");
  const capturedAt = new Date().toISOString();
  return {
    providerId: "browser-local",
    requestedCapability: "browser-world-capture",
    servedCapability: "browser-world-capture",
    servedModel: "canvas-readback-v1",
    applicationJobId: `capture_${digest}`,
    providerJobId: null,
    timings: { requestedAt: capturedAt, completedAt: capturedAt, totalMilliseconds: 0 },
    reportedCost: { amount: 0, currency: "USD", unit: "local-capture" },
  };
}

export function createPostcardsRouter(
  levels: LevelStore,
  assets: GeneratedAssetStore,
  jobs: JobManager,
  cache: PostcardCacheStore,
): Router {
  const router = Router();
  const service = new PostcardService(levels, assets, jobs, cache);

  router.post("/api/postcards/:levelId/screenshot", async (req, res) => {
    const level = await levels.get(req.params.levelId as string);
    if (!level) {
      res.status(404).json({ message: "World not found" });
      return;
    }
    const parsed = screenshotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A bounded PNG screenshot is required." });
      return;
    }
    const buffer = Buffer.from(parsed.data.imageBase64, "base64");
    try {
      const asset = await assets.storeImage(buffer, "image/png", localCaptureProvenance(buffer));
      res.status(201).json(asset);
    } catch {
      res.status(400).json({ message: "The screenshot was not a valid bounded PNG image." });
    }
  });

  router.get("/api/postcards/:levelId", async (req, res) => {
    try {
      res.json(await service.status(req.params.levelId as string));
    } catch (error) {
      if (error instanceof Error && error.message === "WORLD_NOT_FOUND") {
        res.status(404).json({ message: "World not found" });
        return;
      }
      throw error;
    }
  });

  router.post("/api/postcards/:levelId", async (req, res) => {
    const parsed = z.object({ screenshotAssetId: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A stored world screenshot is required." });
      return;
    }
    try {
      const status = await service.create(req.params.levelId as string, parsed.data.screenshotAssetId);
      res.status(status.cacheHit ? 200 : 201).json(status);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "WORLD_NOT_FOUND") res.status(404).json({ message: "World not found" });
      else if (code === "INVALID_SCREENSHOT") res.status(400).json({ message: "The screenshot is not a valid local world capture." });
      else if (code === "POSTCARD_CONFLICT") res.status(409).json({ message: "The cached postcard request conflicts with this world." });
      else throw error;
    }
  });

  router.post("/api/postcards/:levelId/retry", async (req, res) => {
    try {
      res.json(await service.retry(req.params.levelId as string));
    } catch (error) {
      if (error instanceof Error && error.message === "WORLD_NOT_FOUND") {
        res.status(404).json({ message: "World not found" });
        return;
      }
      throw error;
    }
  });

  return router;
}
