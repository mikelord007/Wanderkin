import { createHash } from "node:crypto";
import type { GenerationJob, GenerationRequest, QuestTextBlock, SceneManifest } from "../../shared/index.js";
import type { JobManager, SubmitOutcome } from "../jobs/manager.js";
import type { LevelStore } from "../levels.js";
import { buildQuestPrompt, fallbackQuest, type QuestPromptInput } from "./templates.js";
import { validateQuestOutput } from "./validation.js";

export interface QuestGateway {
  submitGenerationOrReconcile(request: GenerationRequest, options?: { worldId?: string }): Promise<SubmitOutcome>;
  getPublic(jobId: string): Promise<GenerationJob | undefined>;
}

export type QuestGenerationState =
  | { state: "pending"; job: GenerationJob; attempt: 0 | 1 }
  | { state: "ready"; job: GenerationJob; quest: QuestTextBlock; attempt: 0 | 1; fallback: boolean; validationErrors: string[] };

export interface QuestGenerationInput extends QuestPromptInput {
  worldId: string;
}

export class QuestOrchestrator {
  constructor(
    private readonly gateway: QuestGateway,
    private readonly levels?: Pick<LevelStore, "get" | "save">,
  ) {}

  async start(input: QuestGenerationInput): Promise<QuestGenerationState> {
    const job = await this.submit(input, 0);
    return this.resolve(input, job, 0);
  }

  async continue(input: QuestGenerationInput, jobId: string, attempt: 0 | 1): Promise<QuestGenerationState> {
    const job = await this.gateway.getPublic(jobId);
    if (!job) throw new Error("Quest generation job was not found.");
    return this.resolve(input, job, attempt);
  }

  async persist(levelId: string, quest: QuestTextBlock): Promise<SceneManifest> {
    if (!this.levels) throw new Error("Level persistence is not configured.");
    const manifest = await this.levels.get(levelId);
    if (!manifest) throw new Error("Level was not found.");
    if (!manifest.experience) throw new Error("Level does not have a v2 experience block.");
    return this.levels.save(levelId, {
      ...manifest,
      name: quest.title,
      experience: { ...manifest.experience, quest },
    });
  }

  private async submit(input: QuestGenerationInput, attempt: 0 | 1): Promise<GenerationJob> {
    const request: GenerationRequest = {
      schemaVersion: 1,
      kind: "text",
      capability: "gemini-text",
      idempotencyKey: questIdempotencyKey(input, attempt),
      purpose: attempt === 0 ? "quest-text" : "quest-text-validation-retry",
      prompt: buildQuestPrompt(input, attempt === 1),
      output: "quest-json",
      maxCharacters: 1200,
    };
    const outcome = await this.gateway.submitGenerationOrReconcile(request, { worldId: input.worldId });
    if (outcome.status === "conflict") throw new Error("Quest generation idempotency conflict.");
    return outcome.job;
  }

  private async resolve(input: QuestGenerationInput, job: GenerationJob, attempt: 0 | 1): Promise<QuestGenerationState> {
    if (job.state !== "ready" && job.state !== "failed") return { state: "pending", job, attempt };
    if (job.state === "ready" && job.result?.kind === "text") {
      const result = validateQuestOutput(job.result.output.structured ?? job.result.output.text);
      if (result.ok && result.value) {
        return { state: "ready", job, quest: result.value, attempt, fallback: false, validationErrors: [] };
      }
      if (attempt === 0) {
        const retry = await this.submit(input, 1);
        return this.resolve(input, retry, 1);
      }
      return {
        state: "ready",
        job,
        quest: fallbackQuest(input),
        attempt,
        fallback: true,
        validationErrors: result.errors,
      };
    }
    return {
      state: "ready",
      job,
      quest: fallbackQuest(input),
      attempt,
      fallback: true,
      validationErrors: [job.lastError?.message ?? "Quest generation did not complete."],
    };
  }
}

export function questIdempotencyKey(input: QuestGenerationInput, attempt: 0 | 1): string {
  const normalized = JSON.stringify({
    worldId: input.worldId,
    style: input.style,
    mode: input.mode,
    objectDescription: input.objectDescription.trim().replace(/\s+/g, " "),
    atmosphere: input.atmosphere?.trim().replace(/\s+/g, " ") ?? "",
    attempt,
  });
  return `quest-${createHash("sha256").update(normalized).digest("hex")}`;
}

export function questGatewayFromManager(manager: JobManager): QuestGateway {
  return {
    submitGenerationOrReconcile: (request, options) => manager.submitGenerationOrReconcile(request, options),
    getPublic: (jobId) => manager.getPublic(jobId),
  };
}
