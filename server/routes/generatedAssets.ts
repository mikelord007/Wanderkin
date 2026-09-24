import { basename, extname, join } from "node:path";
import { Router } from "express";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".mp4": "video/mp4", ".webm": "video/webm",
};

export function createGeneratedAssetsRouter(assets: GeneratedAssetStore): Router {
  const router = Router();
  router.get("/api/generated-assets/:id", async (req, res) => {
    const asset = await assets.get(req.params.id as string);
    if (!asset) { res.status(404).json({ message: "Generated asset not found" }); return; }
    res.json(asset);
  });
  router.get("/api/generated-assets/files/:name", (req, res) => {
    const safeName = basename(req.params.name as string);
    const extension = extname(safeName).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[extension];
    if (!contentType || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(safeName)) { res.status(404).end(); return; }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(join(assets.fileDir(), safeName), (err) => { if (err) res.status(404).end(); });
  });
  return router;
}
