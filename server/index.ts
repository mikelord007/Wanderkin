import express from "express";
import { DEFAULT_MOVEMENT_CONFIG } from "../shared/movement.js";
import { env } from "./env.js";
import { mcpClient } from "./livepeer/mcpClient.js";
import { LivepeerAdapter } from "./livepeer/adapter.js";
import { PhotoStore } from "./persistence/photoStore.js";
import { AssetStore } from "./persistence/assetStore.js";
import { JobStore, JobStoreUploadUrlCache } from "./jobs/store.js";
import { JobManager } from "./jobs/manager.js";
import { createCapabilitiesRouter } from "./routes/capabilities.js";
import { createUploadsRouter } from "./routes/uploads.js";
import { createPhotosRouter } from "./routes/photos.js";
import { createAssetsRouter } from "./routes/assets.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createLevelsRouter, LevelStore } from "./levels.js";

/**
 * Foundation API shell plus the Livepeer provider/job/asset routes (owned by
 * the Livepeer integration worker) and the manifest persistence routes
 * (`/api/levels`, `/api/levels/:id`), owned by the Level tools worker and
 * registered from their `server/levels.ts`.
 */
const app = express();
app.use(express.json({ limit: "10mb" }));

const photoStore = new PhotoStore(env.storageDir);
const assetStore = new AssetStore(env.storageDir);
const jobStore = new JobStore(env.storageDir);
const adapter = new LivepeerAdapter(mcpClient, photoStore, new JobStoreUploadUrlCache(jobStore));
const jobManager = new JobManager(jobStore, adapter, assetStore, photoStore);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/movement-config", (_req, res) => {
  res.json(DEFAULT_MOVEMENT_CONFIG);
});

app.use(createCapabilitiesRouter(adapter));
app.use(createUploadsRouter(photoStore));
app.use(createPhotosRouter(photoStore));
app.use(createAssetsRouter(assetStore));
app.use(createJobsRouter(jobManager, adapter, photoStore));
app.use(createLevelsRouter(new LevelStore(env.storageDir)));

await jobManager.resumeOnBoot();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ObjectQuest API listening on http://localhost:${env.port}`);
});
