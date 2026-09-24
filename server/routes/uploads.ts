import { Router, type Request, type Response } from "express";
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

  const handleUpload = async (req: Request, res: Response): Promise<void> => {
    const files = (req.files as Express.Multer.File[] | undefined)
      ?? (req.file ? [req.file as Express.Multer.File] : []);
    if (files.length === 0) {
      res.status(400).json({
        message: req.path === "/api/screenshots"
          ? 'No screenshot received (expected multipart field "screenshot")'
          : 'No photos received (expected multipart field "photos")',
      });
      return;
    }
    let releaseBudget: (() => void) | undefined;
    try {
      let decodedBytes = 0;
      for (const file of files) {
        // Validate the entire batch before any content-hash lookup or write.
        assertValidPhoto(file.buffer);
        if (imagePolicy) {
          const dimensions = assertImageDimensions(file.buffer, imagePolicy.limits);
          decodedBytes += dimensions.width * dimensions.height * 4;
        }
      }
      if (imagePolicy) {
        releaseBudget = imagePolicy.budget.acquire(decodedBytes);
      }
      const owner = security?.issue(req, res);
      const results = await Promise.all(
        files.map(async (file, index) => {
          const result = await photos.storeOrReuse(
            file.buffer,
            index + 1,
            file.originalname,
            security?.legacyOpen === false ? owner!.ownerId : null,
            (photoId) => security ? security.canReuse("photo", photoId, owner?.ownerId) : Promise.resolve(true),
          );
          if (owner && result.created) await security?.claim("photo", result.photo.id, owner.ownerId);
          return result;
        }),
      );
      res.status(results.every((result) => !result.created) ? 200 : 201)
        .json(results.map((result) => result.photo));
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
  };

  router.post("/api/uploads", upload.array("photos", 10), handleUpload);
  router.post("/api/screenshots", upload.single("screenshot"), handleUpload);

  return router;
}
