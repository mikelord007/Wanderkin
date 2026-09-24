import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { GenerationProvenance } from "../../shared/provenance.js";
import type { LevelStore } from "../levels.js";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";

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

export function createPostcardsRouter(levels: LevelStore, assets: GeneratedAssetStore): Router {
  const router = Router();

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

  return router;
}
