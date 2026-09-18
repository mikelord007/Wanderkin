import { basename, extname, join } from "node:path";
import { Router } from "express";
import type { PhotoStore } from "../persistence/photoStore.js";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function createPhotosRouter(photos: PhotoStore): Router {
  const router = Router();

  router.get("/api/photos/files/:name", (req, res) => {
    const safeName = basename(req.params.name as string);
    const ext = extname(safeName).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext];
    if (!contentType || !/^[0-9a-f-]{36}\.[a-z]+$/.test(safeName)) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(join(photos.fileDir(), safeName), (err) => {
      if (err) res.status(404).end();
    });
  });

  return router;
}
