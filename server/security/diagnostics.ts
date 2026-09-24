import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { SpendLedger } from "../jobs/spendLedger.js";

function safeTokenEquals(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/** Read-only diagnostics. The route is indistinguishable from absent unless configured. */
export function createDiagnosticsRouter(spendLedger: SpendLedger, token: string): Router {
  const router = Router();
  router.get("/api/admin/spend", async (req, res) => {
    if (!token) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const authorization = req.get("authorization");
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    const provided = req.get("x-admin-token") ?? bearer;
    if (!safeTokenEquals(provided, token)) {
      res.status(401).json({ message: "Invalid diagnostics token" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(await spendLedger.summaryAll());
  });
  return router;
}
