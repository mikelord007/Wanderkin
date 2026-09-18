import { Router } from "express";
import type { ProviderAdapter } from "../../shared/provider.js";
import { logServerError } from "../util/sanitize.js";

export function createCapabilitiesRouter(adapter: ProviderAdapter): Router {
  const router = Router();

  router.get("/api/capabilities", async (_req, res) => {
    try {
      const descriptors = await adapter.discoverCapabilities();
      res.json(descriptors);
    } catch (err) {
      logServerError("GET /api/capabilities", err);
      // No capability could be live-confirmed — the sample level and GLB
      // import must stay usable, so this is a clear "unavailable" signal
      // rather than silently serving static/stale descriptors as current.
      res.status(503).json({
        message: "3D generation is temporarily unavailable. You can still play the sample level or import a GLB.",
      });
    }
  });

  return router;
}
