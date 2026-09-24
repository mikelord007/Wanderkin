import { describe, expect, it } from "vitest";
import type { GenerationJob, GenerationRequest } from "../../shared/index.js";
import type { SubmitOutcome } from "../jobs/manager.js";
import { AudioOrchestrator, type AudioGateway } from "./orchestrator.js";
import { audioKey, buildAudioRequests, type AudioPromptInput } from "./prompts.js";

const input: AudioPromptInput = { worldId: "world-1", style: "hand-painted", objectDescription: "a ceramic fox", atmosphere: "enchanted forest", narrationScript: "Welcome to the little fox world. Find every lost color and enter the portal." };
const now = "2026-09-24T00:00:00.000Z";

function job(request: GenerationRequest, state: GenerationJob["state"]): GenerationJob {
  return { schemaVersion: 1, id: `job-${request.purpose}`, idempotencyKey: request.idempotencyKey, providerId: "fixture", providerJobId: `provider-${request.purpose}`, capabilityRequested: request.capability, capabilityUsed: request.capability, fallbackFired: null, state, photoOrder: [], createdAt: now, updatedAt: now, retryCount: 0, maxRetries: 1, kind: request.kind, request };
}

class FixtureGateway implements AudioGateway {
  requests: GenerationRequest[] = [];
  async submitGenerationOrReconcile(request: GenerationRequest): Promise<SubmitOutcome> {
    this.requests.push(request);
    if (request.purpose === "audio:narration") throw new Error("fixture voice unavailable");
    return { status: "created", job: job(request, request.purpose === "audio:ambience" ? "failed" : "generating") };
  }
  async getPublic(): Promise<GenerationJob | undefined> { return undefined; }
}

describe("audio orchestration", () => {
  it("builds every requested kind with style-specific prompts and stable cache keys", () => {
    const requests = buildAudioRequests(input);
    expect(requests).toHaveLength(10);
    expect(requests.find((item) => item.cue === "music")?.request).toMatchObject({ kind: "music", instrumental: true, loop: true });
    expect(requests.find((item) => item.cue === "ambience")?.request).toMatchObject({ kind: "sfx", loop: true });
    expect(requests.find((item) => item.cue === "narration")?.request).toMatchObject({ kind: "tts", text: input.narrationScript });
    expect(audioKey(input, "music")).toBe(audioKey({ ...input }, "music"));
  });

  it("runs jobs independently and keeps the world playable on optional failures", async () => {
    const gateway = new FixtureGateway();
    const result = await new AudioOrchestrator(gateway).start(input);
    expect(result.playable).toBe(true);
    expect(result.failedCues).toEqual(expect.arrayContaining(["ambience", "narration"]));
    expect(result.pendingCues).toContain("music");
    expect(gateway.requests).toHaveLength(10);
    expect(gateway.requests.some((request) => request.kind === "image-to-3d")).toBe(false);
  });
});
