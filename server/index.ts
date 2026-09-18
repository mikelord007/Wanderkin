import express from "express";
import { DEFAULT_MOVEMENT_CONFIG } from "../shared/movement.js";
import { env } from "./env.js";

/**
 * Foundation API shell. Provider adapters (shared/provider.ts), durable job
 * routes (shared/job.ts), and manifest persistence are owned by the
 * Livepeer and Level tools workers and land as additional routers here.
 */
const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/movement-config", (_req, res) => {
  res.json(DEFAULT_MOVEMENT_CONFIG);
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ObjectQuest API listening on http://localhost:${env.port}`);
});
