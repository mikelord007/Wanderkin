import { Router } from "express";
import type { ProviderAdapter } from "../../shared/provider.js";

export function createCapabilitiesRouter(adapter: ProviderAdapter): Router {
  const router = Router();

  router.get("/api/capabilities", async (_req, res) => {
    try {
      const descriptors = await adapter.discoverCapabilities();
      res.json(descriptors);
    } catch (err) {
      res.status(502).json({ error: "Failed to discover provider capabilities", detail: (err as Error).message });
    }
  });

  return router;
}
