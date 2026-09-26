import { describe, expect, it } from "vitest";
import type { GenerationJob, GenerationRequest } from "../../shared/index.js";
import type { SubmitOutcome } from "../jobs/manager.js";
import { AudioOrchestrator, type AudioGateway } from "./orchestrator.js";
import { AUDIO_CUES, audioKey, buildAudioRequests, type AudioPromptInput } from "./prompts.js";

const input: AudioPromptInput = { worldId: "world-1", style: "hand-painted", objectDescription: "a ceramic fox", atmosphere: "enchanted forest" };
const now = "2026-09-24T00:00:00.000Z";

function job(request: GenerationRequest, state: GenerationJob["state"]): GenerationJob {
  return { schemaVersion: 1, id: `job-${request.purpose}`, idempotencyKey: request.idempotencyKey, providerId: "fixture", providerJobId: `provider-${request.purpose}`, capabilityRequested: request.capability, capabilityUsed: request.capability, fallbackFired: null, state, photoOrder: [], createdAt: now, updatedAt: now, retryCount: 0, maxRetries: 1, kind: request.kind, request };
}

class FixtureGateway implements AudioGateway {
  requests: GenerationRequest[] = [];
  async submitGenerationOrReconcile(request: GenerationRequest): Promise<SubmitOutcome> {
    this.requests.push(request);
    if (request.purpose === "audio:completion") throw new Error("fixture sfx unavailable");
    return { status: "created", job: job(request, request.purpose === "audio:ambience" ? "failed" : "generating") };
  }
  async getPublic(): Promise<GenerationJob | undefined> { return undefined; }
  async retry(): Promise<GenerationJob | undefined> { return undefined; }
}

describe("audio orchestration", () => {
  it("builds music, ambience and event SFX with style-specific prompts and stable cache keys", () => {
    const requests = buildAudioRequests(input);
    expect(requests).toHaveLength(9);
    expect(requests.find((item) => item.cue === "music")?.request).toMatchObject({ kind: "music", durationSeconds: 15, instrumental: true, loop: true });
    expect(requests.find((item) => item.cue === "ambience")?.request).toMatchObject({ kind: "sfx", durationSeconds: 15, loop: true });
    const eventSfx = requests.filter((item) => item.request.kind === "sfx" && item.cue !== "ambience");
    expect(eventSfx).toHaveLength(7);
    for (const item of eventSfx) expect(item.request).toMatchObject({ durationSeconds: 3, loop: false });
    expect(audioKey(input, "music")).toBe(audioKey({ ...input }, "music"));
  });

  it("never requests narration or any other TTS for a new world", () => {
    const requests = buildAudioRequests(input);
    expect(requests.some((item) => item.request.kind === "tts")).toBe(false);
    expect(requests.map((item) => item.cue)).not.toContain("narration");
    expect(AUDIO_CUES).not.toContain("narration");
  });

  it("keeps existing SFX idempotency keys unchanged so stored jobs still reconcile", () => {
    // Pinned from the keys issued before narration was removed.
    expect(audioKey(input, "completion")).toBe("audio-completion-f8ca0168");
    expect(audioKey(input, "fragment-pickup")).toBe(audioKey({ ...input }, "fragment-pickup"));
  });

  it("gives music and ambience new keys whenever their prompts change, so a stored job never conflicts", () => {
    // Music: audio-music-e04d36a3 before the no-vocals prompt, then
    // audio-music-16798c14 until it became upbeat chiptune.
    expect(audioKey(input, "music")).not.toBe("audio-music-e04d36a3");
    expect(audioKey(input, "music")).not.toBe("audio-music-16798c14");
    // Ambience is unchanged since the no-vocals prompt.
    expect(audioKey(input, "ambience")).toBe("audio-ambience-66ab8f7f");
  });

  it("asks for upbeat chiptune music, never sad", () => {
    const music = buildAudioRequests(input).find((item) => item.cue === "music")!.request;
    const prompt = music.kind === "music" ? music.prompt : "";
    expect(prompt).toMatch(/^Upbeat, bright, bouncy major-key chiptune/);
    expect(prompt).toContain("Never slow, melancholic, ambient or sad");
  });

  it("asks for instrumental background music and ambience with vocals banned in words", () => {
    const requests = buildAudioRequests(input);
    for (const cue of ["music", "ambience"] as const) {
      const request = requests.find((item) => item.cue === cue)!.request;
      expect(request.kind === "music" || request.kind === "sfx" ? request.prompt : "").toContain("instrumental only, no vocals, no singing, no lyrics, no spoken words");
    }
    const music = requests.find((item) => item.cue === "music")!.request;
    expect(music).toMatchObject({ instrumental: true, durationSeconds: 15 });
    expect(music.kind === "music" ? music.prompt : "").toMatch(/seamless 15-second loop.*background music/);
    expect(music.kind === "music" ? music.prompt : "").toContain("a ceramic fox");
  });

  it("runs jobs independently and keeps the world playable on optional failures", async () => {
    const gateway = new FixtureGateway();
    const result = await new AudioOrchestrator(gateway).start(input);
    expect(result.playable).toBe(true);
    expect(result.failedCues).toEqual(expect.arrayContaining(["ambience", "completion"]));
    expect(result.pendingCues).toContain("music");
    expect(gateway.requests).toHaveLength(9);
    expect(gateway.requests.some((request) => request.kind === "image-to-3d" || request.kind === "tts")).toBe(false);
  });
});
