import { basename, join } from "node:path";
import { Router } from "express";
import multer from "multer";
import type { AssetStore } from "../persistence/assetStore.js";
import { InvalidFileError, MAX_GLB_BYTES } from "../persistence/validate.js";
import { logServerError } from "../util/sanitize.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_GLB_BYTES, files: 1 },
});

export function createAssetsRouter(assets: AssetStore): Router {
  const router = Router();

  router.get("/api/assets/:id", async (req, res) => {
    const asset = await assets.get(req.params.id as string);
    if (!asset) {
      res.status(404).json({ message: "Asset not found" });
      return;
    }
    res.json(asset);
  });

  router.post("/api/assets/import", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file received (expected multipart field "file")' });
      return;
    }
    try {
      // Hand-imported assets carry no provenance and no source photos —
      // they never went through generation.
      const asset = await assets.store(file.buffer);
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
  router.get("/api/assets/files/:name", (req, res) => {
    const safeName = basename(req.params.name as string);
    if (!/^[a-f0-9]{64}\.glb$/.test(safeName)) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(join(assets.fileDir(), safeName), (err) => {
      if (err) res.status(404).end();
    });
  });

  return router;
}
