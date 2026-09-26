import { describe, expect, it } from "vitest";
import type { GenerationJob, GenerationRequest } from "../../shared/index.js";
import type { SubmitOutcome } from "../jobs/manager.js";
import { QuestOrchestrator, questIdempotencyKey, type QuestGateway, type QuestGenerationInput } from "./orchestrator.js";

const input: QuestGenerationInput = { worldId: "world-1", style: "cartoon", mode: "collect", objectDescription: "red teacup" };
const now = "2026-09-24T00:00:00.000Z";

function textJob(id: string, structured: unknown, state: GenerationJob["state"] = "ready"): GenerationJob {
  return {
    schemaVersion: 1, id, idempotencyKey: id, providerId: "fixture", providerJobId: `provider-${id}`,
    capabilityRequested: "gemini-text", capabilityUsed: "gemini-text", fallbackFired: null, state,
    photoOrder: [], createdAt: now, updatedAt: now, retryCount: 0, maxRetries: 1, kind: "text",
    ...(state === "ready" ? { result: { kind: "text", output: { text: JSON.stringify(structured), structured } } } : {}),
  };
}

class FixtureGateway implements QuestGateway {
  requests: GenerationRequest[] = [];
  constructor(private readonly jobs: GenerationJob[]) {}
  async submitGenerationOrReconcile(request: GenerationRequest): Promise<SubmitOutcome> {
    this.requests.push(request);
    const job = this.jobs.shift();
    if (!job) throw new Error("No fixture job");
    return { status: "created", job };
  }
  async getPublic(): Promise<GenerationJob | undefined> { return this.jobs[0]; }
}

const valid = {
  title: "The Lost Colors of Teacup Island",
  intro: "Three bright colors have drifted away from this tiny teacup world.",
  objective: "Find every lost color, then enter the glowing portal.",
};

describe("QuestOrchestrator", () => {
  it("returns valid structured output without retrying", async () => {
    const gateway = new FixtureGateway([textJob("first", valid)]);
    const result = await new QuestOrchestrator(gateway).start(input);
    expect(result).toMatchObject({ state: "ready", fallback: false, attempt: 0, quest: { title: valid.title } });
    expect(gateway.requests).toHaveLength(1);
  });

  it("retries invalid output once through the same gateway", async () => {
    const gateway = new FixtureGateway([textJob("bad", { title: "Bad", objective: "Run eval(code)" }), textJob("retry", valid)]);
    const result = await new QuestOrchestrator(gateway).start(input);
    expect(result).toMatchObject({ state: "ready", fallback: false, attempt: 1 });
    expect(gateway.requests).toHaveLength(2);
    expect(gateway.requests[1]?.purpose).toBe("quest-text-validation-retry");
  });

  it("falls back after the single invalid retry", async () => {
    const gateway = new FixtureGateway([textJob("bad", {}), textJob("bad-again", { title: "Livepeer Land", objective: "bad" })]);
    const result = await new QuestOrchestrator(gateway).start(input);
    expect(result).toMatchObject({ state: "ready", fallback: true, attempt: 1 });
    if (result.state === "ready") expect(result.quest.title).toContain("Red Teacup");
    expect(gateway.requests).toHaveLength(2);
  });

  it("uses stable keys for unchanged inputs and separates the retry", () => {
    expect(questIdempotencyKey(input, 0)).toBe(questIdempotencyKey({ ...input }, 0));
    expect(questIdempotencyKey(input, 0)).not.toBe(questIdempotencyKey(input, 1));
  });
});
