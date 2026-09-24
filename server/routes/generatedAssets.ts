import { basename, extname, join } from "node:path";
import { Router } from "express";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import type { OwnerSecurity } from "../security/owner.js";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".mp4": "video/mp4", ".webm": "video/webm",
};

export function createGeneratedAssetsRouter(assets: GeneratedAssetStore, security?: OwnerSecurity): Router {
  const router = Router();
  router.get("/api/generated-assets/:id", async (req, res) => {
    const asset = await assets.get(req.params.id as string);
    if (!asset) { res.status(404).json({ message: "Generated asset not found" }); return; }
    if (security && !(await security.canAccess("generated-asset", asset.id, req))) {
      res.status(404).json({ message: "Generated asset not found" }); return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(asset);
  });
  router.get("/api/generated-assets/files/:name", async (req, res) => {
    const safeName = basename(req.params.name as string);
    const extension = extname(safeName).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[extension];
    if (!contentType || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(safeName)) { res.status(404).end(); return; }
    const asset = await assets.findByFilename(safeName);
    if (!asset || (security && !(await security.canAccess("generated-asset", asset.id, req)))) {
      res.status(404).end(); return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(join(assets.fileDir(), safeName), (err) => { if (err) res.status(404).end(); });
  });
  return router;
}
