import { Router } from "express";
import multer from "multer";
import type { PhotoStore } from "../persistence/photoStore.js";
import { assertValidPhoto, InvalidFileError, MAX_PHOTO_BYTES } from "../persistence/validate.js";
import { logServerError } from "../util/sanitize.js";
import type { OwnerSecurity } from "../security/owner.js";
import {
  assertImageDimensions,
  DecodeBudgetExceededError,
  ImageDimensionError,
  type ImageDecodeBudget,
  type ImageDimensionLimits,
} from "../security/imageDimensions.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 10 },
});

export function createUploadsRouter(
  photos: PhotoStore,
  security?: OwnerSecurity,
  imagePolicy?: { limits: ImageDimensionLimits; budget: ImageDecodeBudget },
): Router {
  const router = Router();

  router.post("/api/uploads", upload.array("photos", 10), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ message: 'No photos received (expected multipart field "photos")' });
      return;
    }
    let releaseBudget: (() => void) | undefined;
    try {
      if (imagePolicy) {
        const decodedBytes = files.reduce((sum, file) => {
          // Preserve the existing byte/magic validation precedence before
          // trusting format-specific dimension offsets.
          assertValidPhoto(file.buffer);
          const dimensions = assertImageDimensions(file.buffer, imagePolicy.limits);
          return sum + dimensions.width * dimensions.height * 4;
        }, 0);
        releaseBudget = imagePolicy.budget.acquire(decodedBytes);
      }
      const owner = security?.issue(req, res);
      const references = await Promise.all(
        files.map(async (file, index) => {
          const photo = await photos.store(file.buffer, index + 1, file.originalname);
          if (owner) await security?.claim("photo", photo.id, owner.ownerId);
          return photo;
        }),
      );
      res.status(201).json(references);
    } catch (err) {
      if (err instanceof InvalidFileError) {
        res.status(400).json({ message: err.message });
        return;
      }
      if (err instanceof ImageDimensionError) {
        res.status(413).json({ message: err.message });
        return;
      }
      if (err instanceof DecodeBudgetExceededError) {
        res.setHeader("Retry-After", "1");
        res.status(429).json({ message: err.message });
        return;
      }
      logServerError("POST /api/uploads", err);
      res.status(500).json({ message: "Failed to store the uploaded photos. Please try again." });
    } finally {
      releaseBudget?.();
    }
  });

  return router;
}
