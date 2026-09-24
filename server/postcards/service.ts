import { createHash } from "node:crypto";
import type { GenerationJob } from "../../shared/job.js";
import type { SceneManifest } from "../../shared/manifest.js";
import type { VideoGenerationRequest } from "../../shared/generation.js";
import type { LevelStore } from "../levels.js";
import type { JobManager, SubmitOutcome } from "../jobs/manager.js";
import type { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import type { PostcardCacheRecord, PostcardCacheStore } from "./store.js";

export const POSTCARD_DURATION_SECONDS = 5;
export const POSTCARD_MAX_COST_USD = 0.34125;

export type PostcardStatus =
  | { state: "none"; cacheHit: false }
  | { state: "job"; cacheHit: boolean; job: GenerationJob };

export function fingerprintWorld(manifest: SceneManifest): string {
  const durableWorld = {
    schemaVersion: manifest.schemaVersion,
    levelId: manifest.levelId,
    name: manifest.name,
    seed: manifest.seed,
    calibration: manifest.calibration,
    assets: manifest.assets.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    entities: manifest.entities,
    spawn: manifest.spawn,
    checkpoints: manifest.checkpoints,
    experience: manifest.experience ?? null,
  };
  return createHash("sha256").update(JSON.stringify(durableWorld)).digest("hex");
}

export function postcardPrompt(manifest: SceneManifest): string {
  const style = manifest.experience?.style.id ?? "cartoon";
  const atmosphere = manifest.experience?.style.atmosphere?.trim();
  return [
    `Create a gentle five-second animated postcard of ${manifest.name}.`,
    `Preserve the exact recognizable world, composition, and ${style.replace("-", " ")} art direction from the source image.`,
    atmosphere ? `Atmosphere: ${atmosphere}.` : "Use calm, inviting miniature-world atmosphere.",
    "Use a slow cinematic camera drift with subtle environmental motion.",
    "Do not add captions, interface elements, characters, scene cuts, or new objects.",
  ].join(" ");
}

function requestFor(manifest: SceneManifest, fingerprint: string, screenshotAssetId: string): VideoGenerationRequest {
  return {
    schemaVersion: 1,
    kind: "video",
    capability: "pixverse-i2v",
    idempotencyKey: `postcard_${fingerprint}`,
    purpose: "animated-postcard",
    sourceImageAssetId: screenshotAssetId,
    prompt: postcardPrompt(manifest),
    durationSeconds: POSTCARD_DURATION_SECONDS,
  };
}

function withWorkflowJob(manifest: SceneManifest, job: GenerationJob, consumedByAssetId?: string): SceneManifest {
  if (!manifest.workflow) return manifest;
  const next = {
    kind: "video" as const,
    jobId: job.id,
    status: job.state,
    ...(job.providerJobId ? { providerJobId: job.providerJobId } : {}),
    updatedAt: job.updatedAt,
    ...(consumedByAssetId ? { consumedByAssetId } : {}),
  };
  return {
    ...manifest,
    workflow: {
      ...manifest.workflow,
      jobs: [...manifest.workflow.jobs.filter((item) => item.jobId !== job.id), next],
    },
  };
}

export class PostcardService {
  constructor(
    private readonly levels: Pick<LevelStore, "get" | "save">,
    private readonly assets: Pick<GeneratedAssetStore, "getProviderImage">,
    private readonly jobs: Pick<JobManager, "getPublic" | "submitGenerationOrReconcile" | "retry">,
    private readonly cache: Pick<PostcardCacheStore, "get" | "put">,
  ) {}

  async status(levelId: string): Promise<PostcardStatus> {
    const manifest = await this.levels.get(levelId);
    if (!manifest) throw new Error("WORLD_NOT_FOUND");
    const cached = await this.cache.get(levelId);
    if (!cached || cached.worldFingerprint !== fingerprintWorld(manifest)) return { state: "none", cacheHit: false };
    const job = await this.jobs.getPublic(cached.jobId);
    if (!job) return { state: "none", cacheHit: false };
    await this.syncManifest(manifest, job);
    return { state: "job", cacheHit: true, job };
  }

  async create(levelId: string, screenshotAssetId: string): Promise<PostcardStatus> {
    const manifest = await this.levels.get(levelId);
    if (!manifest) throw new Error("WORLD_NOT_FOUND");
    const fingerprint = fingerprintWorld(manifest);
    const existing = await this.cache.get(levelId);
    if (existing?.worldFingerprint === fingerprint) {
      const job = await this.jobs.getPublic(existing.jobId);
      if (job) {
        await this.syncManifest(manifest, job);
        return { state: "job", cacheHit: true, job };
      }
    }

    const screenshot = await this.assets.getProviderImage(screenshotAssetId);
    if (!screenshot || screenshot.provenance.requestedCapability !== "browser-world-capture") {
      throw new Error("INVALID_SCREENSHOT");
    }
    const outcome: SubmitOutcome = await this.jobs.submitGenerationOrReconcile(
      requestFor(manifest, fingerprint, screenshotAssetId),
      { worldId: levelId, requestLimitOverrideUsd: POSTCARD_MAX_COST_USD },
    );
    if (outcome.status === "conflict") throw new Error("POSTCARD_CONFLICT");
    const record: PostcardCacheRecord = {
      levelId,
      worldFingerprint: fingerprint,
      screenshotAssetId,
      jobId: outcome.job.id,
      updatedAt: new Date().toISOString(),
    };
    await this.cache.put(record);
    await this.syncManifest(manifest, outcome.job);
    return { state: "job", cacheHit: outcome.status === "reconciled", job: outcome.job };
  }

  async retry(levelId: string): Promise<PostcardStatus> {
    const manifest = await this.levels.get(levelId);
    if (!manifest) throw new Error("WORLD_NOT_FOUND");
    const cached = await this.cache.get(levelId);
    if (!cached || cached.worldFingerprint !== fingerprintWorld(manifest)) return { state: "none", cacheHit: false };
    const job = await this.jobs.retry(cached.jobId);
    if (!job) return { state: "none", cacheHit: false };
    await this.syncManifest(manifest, job);
    return { state: "job", cacheHit: true, job };
  }

  private async syncManifest(manifest: SceneManifest, job: GenerationJob): Promise<void> {
    const video = job.state === "ready" && job.result?.kind === "video" ? job.result.asset : undefined;
    const currentVideos = manifest.media?.video ?? [];
    const hasVideo = video ? currentVideos.some((item) => item.id === video.id) : false;
    const next = withWorkflowJob(manifest, job, video?.id);
    if (next === manifest && (!video || hasVideo)) return;
    await this.levels.save(manifest.levelId, {
      ...next,
      ...(video && !hasVideo
        ? { media: { audio: manifest.media?.audio ?? [], video: [...currentVideos, video] } }
        : {}),
    });
  }
}
