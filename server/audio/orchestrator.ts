import type { AudioAssetReference, GenerationJob, GenerationRequest, SceneManifest } from "../../shared/index.js";
import type { SubmitOutcome } from "../jobs/manager.js";
import type { LevelStore } from "../levels.js";
import type { JobManager } from "../jobs/manager.js";
import { AUDIO_CUES, buildAudioRequests, type AudioCue, type AudioPromptInput } from "./prompts.js";

export interface AudioGateway {
  submitGenerationOrReconcile(request: GenerationRequest, options?: { worldId?: string; ownerId?: string }): Promise<SubmitOutcome>;
  getPublic(jobId: string): Promise<GenerationJob | undefined>;
  retry(jobId: string): Promise<GenerationJob | undefined>;
}

export interface AudioJobResult {
  cue: AudioCue;
  state: GenerationJob["state"] | "submission-failed";
  job?: GenerationJob;
  asset?: AudioAssetReference;
  error?: string;
}

export interface AudioGenerationResult {
  playable: true;
  jobs: AudioJobResult[];
  readyAssets: AudioAssetReference[];
  pendingCues: AudioCue[];
  failedCues: AudioCue[];
}

export class AudioOrchestrator {
  constructor(
    private readonly gateway: AudioGateway,
    private readonly levels?: Pick<LevelStore, "get" | "save">,
  ) {}

  async start(input: AudioPromptInput, ownerId?: string): Promise<AudioGenerationResult> {
    const settled = await Promise.allSettled(buildAudioRequests(input).map(async ({ cue, request }) => {
      const outcome = await this.gateway.submitGenerationOrReconcile(request, {
        worldId: input.worldId,
        ...(ownerId ? { ownerId } : {}),
      });
      if (outcome.status === "conflict") throw new Error(`Audio idempotency conflict for ${cue}.`);
      return fromJob(cue, outcome.job);
    }));
    if (settled.every((result) => result.status === "rejected")) throw settled[0]!.reason;
    const jobs = settled.map((result, index): AudioJobResult => result.status === "fulfilled"
      ? result.value
      : { cue: AUDIO_CUES[index]!, state: "submission-failed", error: safeError(result.reason) });
    return summarize(jobs);
  }

  async refresh(jobIds: Partial<Record<AudioCue, string>>): Promise<AudioGenerationResult> {
    const jobs = await Promise.all(AUDIO_CUES.filter((cue) => jobIds[cue]).map(async (cue): Promise<AudioJobResult> => {
      const job = await this.gateway.getPublic(jobIds[cue]!);
      return job ? fromJob(cue, job) : { cue, state: "submission-failed", error: "Audio job was not found." };
    }));
    return summarize(jobs);
  }

  async retry(cue: AudioCue, jobId: string): Promise<AudioGenerationResult> {
    const job = await this.gateway.retry(jobId);
    return summarize([job ? fromJob(cue, job) : { cue, state: "submission-failed", error: "Audio job was not found." }]);
  }

  async persist(levelId: string, result: AudioGenerationResult): Promise<SceneManifest> {
    if (!this.levels) throw new Error("Level persistence is not configured.");
    const manifest = await this.levels.get(levelId);
    if (!manifest) throw new Error("Level was not found.");
    const readyIds = new Set(result.readyAssets.map((asset) => asset.id));
    const existing = (manifest.media?.audio ?? []).filter((asset) => !readyIds.has(asset.id));
    return this.levels.save(levelId, {
      ...manifest,
      media: {
        audio: [...existing, ...result.readyAssets],
        video: manifest.media?.video ?? [],
      },
    });
  }
}

export function audioGatewayFromManager(manager: JobManager): AudioGateway {
  return {
    submitGenerationOrReconcile: (request, options) => manager.submitGenerationOrReconcile(request, options),
    getPublic: (jobId) => manager.getPublic(jobId),
    retry: (jobId) => manager.retry(jobId),
  };
}

function fromJob(cue: AudioCue, job: GenerationJob): AudioJobResult {
  const result = job.result;
  const asset = result?.kind === "music" || result?.kind === "sfx" || result?.kind === "tts" ? result.asset : undefined;
  return {
    cue,
    state: job.state,
    job,
    ...(asset ? { asset } : {}),
    ...(job.lastError?.message ? { error: job.lastError.message } : {}),
  };
}

function summarize(jobs: AudioJobResult[]): AudioGenerationResult {
  return {
    playable: true,
    jobs,
    readyAssets: jobs.flatMap((entry) => entry.asset ? [entry.asset] : []),
    pendingCues: jobs.filter((entry) => !["ready", "failed", "submission-failed"].includes(entry.state)).map((entry) => entry.cue),
    failedCues: jobs.filter((entry) => entry.state === "failed" || entry.state === "submission-failed").map((entry) => entry.cue),
  };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : "Audio submission failed.";
}
