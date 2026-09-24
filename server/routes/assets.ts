import { basename, join } from "node:path";
import { Router } from "express";
import multer from "multer";
import type { AssetStore } from "../persistence/assetStore.js";
import { InvalidFileError, MAX_GLB_BYTES } from "../persistence/validate.js";
import { logServerError } from "../util/sanitize.js";
import type { OwnerSecurity } from "../security/owner.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_GLB_BYTES, files: 1 },
});

export function createAssetsRouter(assets: AssetStore, security?: OwnerSecurity): Router {
  const router = Router();

  router.get("/api/assets/:id", async (req, res) => {
    const asset = await assets.get(req.params.id as string);
    if (!asset) {
      res.status(404).json({ message: "Asset not found" });
      return;
    }
    if (security && !(await security.canAccess("asset", asset.id, req))) {
      res.status(404).json({ message: "Asset not found" });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(asset);
  });

  router.post("/api/assets/import", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file received (expected multipart field "file")' });
      return;
    }
    try {
      const owner = security?.issue(req, res);
      // Hand-imported assets carry no provenance and no source photos —
      // they never went through generation.
      const asset = await assets.store(file.buffer);
      if (owner) await security?.claim("asset", asset.id, owner.ownerId);
      res.status(201).json(asset);
    } catch (err) {
      if (err instanceof InvalidFileError) {
        res.status(400).json({ message: err.message });
        return;
      }
      logServerError("POST /api/assets/import", err);
      res.status(500).json({ message: "Failed to import the asset. Please try again." });
    }
  });

  // Content-addressed (sha256-named) files stored by AssetStore; safe to
  // cache forever. `basename` strips any path segments before joining, so a
  // request can never escape the asset directory.
  router.get("/api/assets/files/:name", async (req, res) => {
    const safeName = basename(req.params.name as string);
    if (!/^[a-f0-9]{64}\.glb$/.test(safeName)) {
      res.status(404).end();
      return;
    }
    const asset = await assets.findByFilename(safeName);
    if (!asset || (security && !(await security.canAccess("asset", asset.id, req)))) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(join(assets.fileDir(), safeName), (err) => {
      if (err) res.status(404).end();
    });
  });

  return router;
}
