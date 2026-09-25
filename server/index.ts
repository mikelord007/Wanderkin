import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { DEFAULT_MOVEMENT_CONFIG } from "../shared/movement.js";
import { env } from "./env.js";
import { mcpClient } from "./livepeer/mcpClient.js";
import { LivepeerAdapter } from "./livepeer/adapter.js";
import { PhotoStore } from "./persistence/photoStore.js";
import { AssetStore } from "./persistence/assetStore.js";
import { GeneratedAssetStore } from "./persistence/generatedAssetStore.js";
import { JobStore, JobStoreUploadUrlCache } from "./jobs/store.js";
import { JobManager, ProviderConcurrencyExceededError } from "./jobs/manager.js";
import { BudgetExceededError, SpendLedger } from "./jobs/spendLedger.js";
import { PreviewCacheStore } from "./jobs/previewCache.js";
import { createCapabilitiesRouter } from "./routes/capabilities.js";
import { createUploadsRouter } from "./routes/uploads.js";
import { createPhotosRouter } from "./routes/photos.js";
import { createAssetsRouter } from "./routes/assets.js";
import { createGeneratedAssetsRouter } from "./routes/generatedAssets.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createLevelsRouter, LevelStore } from "./levels.js";
import { QuestOrchestrator, questGatewayFromManager } from "./quest/orchestrator.js";
import { createQuestRouter } from "./quest/routes.js";
import { AudioOrchestrator, audioGatewayFromManager } from "./audio/orchestrator.js";
import { createAudioRouter } from "./audio/routes.js";
import { createPostcardsRouter } from "./postcards/routes.js";
import { PostcardCacheStore } from "./postcards/store.js";
import { logServerError } from "./util/sanitize.js";
import { createRateLimiter, isBillableRoute, isUploadRoute } from "./security/rateLimit.js";
import { createDiagnosticsRouter } from "./security/diagnostics.js";
import { OwnerSecurity } from "./security/owner.js";
import { ImageDecodeBudget } from "./security/imageDimensions.js";
import { createAuthRuntime, describeAuth, installAuth } from "./auth/index.js";

/**
 * Foundation API shell plus the Livepeer provider/job/asset routes (owned by
 * the Livepeer integration worker) and the manifest persistence routes
 * (`/api/levels`, `/api/levels/:id`), owned by the Level tools worker and
 * registered from their `server/levels.ts`.
 */
const app = express();
app.set("trust proxy", env.trustProxyHops);
app.use(express.json({ limit: "10mb" }));

const billableRateLimiter = createRateLimiter({
  limit: env.billableRateLimit,
  windowMs: env.rateLimitWindowSeconds * 1_000,
  message: "Too many generation requests. Please wait before trying again.",
});
const uploadRateLimiter = createRateLimiter({
  limit: env.uploadRateLimit,
  windowMs: env.rateLimitWindowSeconds * 1_000,
  message: "Too many uploads. Please wait before trying again.",
});
app.use((req, res, next) => isBillableRoute(req) ? billableRateLimiter(req, res, next) : next());
app.use((req, res, next) => isUploadRoute(req) ? uploadRateLimiter(req, res, next) : next());

const photoStore = new PhotoStore(env.storageDir);
const assetStore = new AssetStore(env.storageDir);
const generatedAssetStore = new GeneratedAssetStore(env.storageDir);
const jobStore = new JobStore(env.storageDir);
const spendLedger = new SpendLedger(env.storageDir);
const previewCache = new PreviewCacheStore(env.storageDir);
// Sign-in (server/auth): resolves stub / Supabase / off / unconfigured from
// the environment. With sign-in on, records belong to the signed-in account
// and pre-sign-in records to the legacy owner, so the anonymous legacy-open
// mode no longer applies.
const auth = createAuthRuntime(env.storageDir);
const authOn = auth.config.mode !== "off";
const ownerSecurity = new OwnerSecurity(
  env.storageDir,
  authOn ? false : env.legacyOpen,
  env.secureOwnerCookie,
  authOn ? auth.legacy : undefined,
);
const imageDecodeBudget = new ImageDecodeBudget(env.uploadDecodeBudgetBytes);
const levelStore = new LevelStore(env.storageDir, assetStore, photoStore);
const postcardCache = new PostcardCacheStore(env.storageDir);
const sourceBytes = {
  async getPhotoBytes(id: string) {
    return (await photoStore.get(id))
      ? photoStore.getPhotoBytes(id)
      : generatedAssetStore.getImageBytes(id);
  },
};
const adapter = new LivepeerAdapter(mcpClient, sourceBytes, new JobStoreUploadUrlCache(jobStore));
const jobManager = new JobManager(jobStore, adapter, assetStore, photoStore, {
  generatedAssets: generatedAssetStore,
  spendLedger,
  perRequestLimitUsd: env.livepeerMaxRequestUsd,
  perWorldLimitUsd: env.livepeerMaxWorldUsd,
  maxRetries: env.livepeerMaxAutomaticRetries,
  maxInFlight: env.providerMaxInFlight,
  concurrencyRetrySeconds: env.providerConcurrencyRetrySeconds,
  globalLimitUsd: env.livepeerMaxGlobalUsd,
  dailyLimitUsd: env.livepeerMaxDailyUsd,
  ownerSecurity,
});
const questOrchestrator = new QuestOrchestrator(questGatewayFromManager(jobManager), levelStore);
const audioOrchestrator = new AudioOrchestrator(audioGatewayFromManager(jobManager), levelStore);

installAuth(app, auth);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/movement-config", (_req, res) => {
  res.json(DEFAULT_MOVEMENT_CONFIG);
});

app.use(createCapabilitiesRouter(adapter));
app.use(createDiagnosticsRouter(spendLedger, env.diagnosticsToken));
app.use(createUploadsRouter(photoStore, ownerSecurity, {
  limits: {
    maxWidth: env.uploadMaxImageWidth,
    maxHeight: env.uploadMaxImageHeight,
    maxPixels: env.uploadMaxImagePixels,
  },
  budget: imageDecodeBudget,
}));
app.use(createPhotosRouter(photoStore, ownerSecurity));
app.use(createAssetsRouter(assetStore, ownerSecurity));
app.use(createGeneratedAssetsRouter(generatedAssetStore, ownerSecurity));
app.use(createJobsRouter(jobManager, adapter, photoStore, generatedAssetStore, previewCache, spendLedger, ownerSecurity));
app.use(createQuestRouter(questOrchestrator, ownerSecurity));
app.use(createAudioRouter(audioOrchestrator, ownerSecurity));
app.use(createPostcardsRouter(levelStore, generatedAssetStore, jobManager, postcardCache, ownerSecurity, {
  limits: {
    maxWidth: env.uploadMaxImageWidth,
    maxHeight: env.uploadMaxImageHeight,
    maxPixels: env.uploadMaxImagePixels,
  },
  budget: imageDecodeBudget,
}));
app.use(createLevelsRouter(levelStore, undefined, ownerSecurity));

const terminalErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "Uploaded file exceeds the allowed size limit." });
      return;
    }
    res.status(400).json({ message: "The multipart upload is invalid or exceeds an upload limit." });
    return;
  }

  if (error instanceof ProviderConcurrencyExceededError) {
    res.setHeader("Retry-After", String(error.retryAfterSeconds));
    res.status(429).json({ message: error.message });
    return;
  }
  if (error instanceof BudgetExceededError) {
    res.status(402).json({ message: error.message, code: error.code });
    return;
  }

  const requestError = error as { type?: unknown; status?: unknown; expose?: unknown };
  if (requestError.type === "entity.too.large") {
    res.status(413).json({ message: "Request body exceeds the allowed size limit." });
    return;
  }
  if (requestError.type === "entity.parse.failed") {
    res.status(400).json({ message: "Request body is not valid JSON." });
    return;
  }
  if (
    req.is("multipart/form-data") &&
    error instanceof Error &&
    /boundary|multipart|unexpected end of form/i.test(error.message)
  ) {
    res.status(400).json({ message: "The multipart upload is malformed." });
    return;
  }
  if (
    typeof requestError.status === "number" &&
    requestError.status >= 400 &&
    requestError.status < 500 &&
    requestError.expose === true
  ) {
    res.status(requestError.status).json({ message: "Request body could not be processed." });
    return;
  }

  logServerError(`${req.method} ${req.path}`, error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

app.use(terminalErrorHandler);

await jobManager.resumeOnBoot();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ObjectQuest API listening on http://localhost:${env.port}`);
  // eslint-disable-next-line no-console
  console.log(describeAuth(auth.config));
});
