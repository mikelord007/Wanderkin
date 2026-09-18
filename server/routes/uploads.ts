import { Router } from "express";
import multer from "multer";
import type { PhotoStore } from "../persistence/photoStore.js";
import { InvalidFileError, MAX_PHOTO_BYTES } from "../persistence/validate.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 10 },
});

export function createUploadsRouter(photos: PhotoStore): Router {
  const router = Router();

  router.post("/api/uploads", upload.array("photos", 10), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: 'No photos received (expected multipart field "photos")' });
      return;
    }
    try {
      const references = await Promise.all(
        files.map((file, index) => photos.store(file.buffer, index + 1, file.originalname)),
      );
      res.status(201).json(references);
    } catch (err) {
      if (err instanceof InvalidFileError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Failed to store uploaded photos", detail: (err as Error).message });
    }
  });

  return router;
}
