import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { GenerationProvenance } from "../../shared/provenance.js";
import type { LevelStore } from "../levels.js";
import type { JobManager } from "../jobs/manager.js";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import {
  assertImageDimensions,
  DecodeBudgetExceededError,
  ImageDimensionError,
  type ImageDecodeBudget,
  type ImageDimensionLimits,
} from "../security/imageDimensions.js";
import type { OwnerSecurity } from "../security/owner.js";
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
  security?: OwnerSecurity,
  imagePolicy?: { limits: ImageDimensionLimits; budget: ImageDecodeBudget },
): Router {
  const router = Router();
  const service = new PostcardService(levels, assets, jobs, cache);

  router.post("/api/postcards/:levelId/screenshot", async (req, res) => {
    const levelId = req.params.levelId as string;
    const level = await levels.get(levelId);
    if (!level || (security && !(await security.canAccess("level", levelId, req)))) {
      res.status(404).json({ message: "World not found" });
      return;
    }
    const parsed = screenshotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A bounded PNG screenshot is required." });
      return;
    }
    const buffer = Buffer.from(parsed.data.imageBase64, "base64");
    let releaseBudget: (() => void) | undefined;
    try {
      if (imagePolicy) {
        const dimensions = assertImageDimensions(buffer, imagePolicy.limits);
        releaseBudget = imagePolicy.budget.acquire(dimensions.width * dimensions.height * 4);
      }
      const owner = security?.issue(req, res);
      const asset = await assets.storeImage(buffer, "image/png", localCaptureProvenance(buffer), true);
      if (owner) await security?.claim("generated-asset", asset.id, owner.ownerId);
      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof ImageDimensionError) {
        res.status(413).json({ message: error.message });
        return;
      }
      if (error instanceof DecodeBudgetExceededError) {
        res.setHeader("Retry-After", "1");
        res.status(429).json({ message: error.message });
        return;
      }
      res.status(400).json({ message: "The screenshot was not a valid bounded PNG image." });
    } finally {
      releaseBudget?.();
    }
  });

  router.get("/api/postcards/:levelId", async (req, res) => {
    const levelId = req.params.levelId as string;
    if (security && !(await security.canAccess("level", levelId, req))) {
      res.status(404).json({ message: "World not found" });
      return;
    }
    try {
      res.json(await service.status(levelId));
    } catch (error) {
      if (error instanceof Error && error.message === "WORLD_NOT_FOUND") {
        res.status(404).json({ message: "World not found" });
        return;
      }
      throw error;
    }
  });

  router.post("/api/postcards/:levelId", async (req, res) => {
    const levelId = req.params.levelId as string;
    if (security && !(await security.canAccess("level", levelId, req))) {
      res.status(404).json({ message: "World not found" });
      return;
    }
    const parsed = z.object({ screenshotAssetId: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A stored world screenshot is required." });
      return;
    }
    if (security && !(await security.canAccess("generated-asset", parsed.data.screenshotAssetId, req))) {
      res.status(400).json({ message: "The screenshot is not a valid local world capture." });
      return;
    }
    try {
      const owner = security?.issue(req, res);
      const status = await service.create(levelId, parsed.data.screenshotAssetId, owner?.ownerId);
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
    const levelId = req.params.levelId as string;
    if (security && !(await security.canAccess("level", levelId, req))) {
      res.status(404).json({ message: "World not found" });
      return;
    }
    try {
      res.json(await service.retry(levelId));
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
