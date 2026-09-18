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
      res.status(502).json({ message: "Could not reach the model provider right now. Please try again." });
    }
  });

  return router;
}
