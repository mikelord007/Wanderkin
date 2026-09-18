import { Router } from "express";
import multer from "multer";
import type { PhotoStore } from "../persistence/photoStore.js";
import { InvalidFileError, MAX_PHOTO_BYTES } from "../persistence/validate.js";
import { logServerError } from "../util/sanitize.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 10 },
});

export function createUploadsRouter(photos: PhotoStore): Router {
  const router = Router();

  router.post("/api/uploads", upload.array("photos", 10), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ message: 'No photos received (expected multipart field "photos")' });
      return;
    }
    try {
      const references = await Promise.all(
        files.map((file, index) => photos.store(file.buffer, index + 1, file.originalname)),
      );
      res.status(201).json(references);
    } catch (err) {
      if (err instanceof InvalidFileError) {
        res.status(400).json({ message: err.message });
        return;
      }
      logServerError("POST /api/uploads", err);
      res.status(500).json({ message: "Failed to store the uploaded photos. Please try again." });
    }
  });

  return router;
}
