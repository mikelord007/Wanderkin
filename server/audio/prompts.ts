import { STYLE_DEFINITIONS, type GenerationRequest, type StyleId } from "../../shared/index.js";

export const AUDIO_CUES = [
  "music",
  "ambience",
  "fragment-pickup",
  "portal-activate",
  "checkpoint",
  "fall-respawn",
  "race-start",
  "race-finish",
  "completion",
] as const;

export type AudioCue = typeof AUDIO_CUES[number];

export interface AudioPromptInput {
  worldId: string;
  style: StyleId;
  objectDescription: string;
  atmosphere?: string;
}

export function buildAudioRequests(input: AudioPromptInput): ReadonlyArray<{ cue: AudioCue; request: GenerationRequest }> {
  const definition = STYLE_DEFINITIONS[input.style];
  const context = [input.objectDescription.trim(), input.atmosphere?.trim()].filter(Boolean).join(", ");
  const finish = (description: string) => `${description}. ${definition.label} miniature adventure; ${context}; clean game-ready sound, no speech, no copyrighted melody.`;
  return [
    { cue: "music", request: { schemaVersion: 1, kind: "music", capability: "music", idempotencyKey: audioKey(input, "music"), purpose: "audio:music", prompt: finish(definition.audioPrompts.music), durationSeconds: 15, instrumental: true, loop: true } },
    { cue: "ambience", request: { schemaVersion: 1, kind: "sfx", capability: "mirelo-sfx", idempotencyKey: audioKey(input, "ambience"), purpose: "audio:ambience", prompt: finish(definition.audioPrompts.ambience), durationSeconds: 15, loop: true } },
    { cue: "fragment-pickup", request: sfx(input, "fragment-pickup", finish(definition.audioPrompts.collectSfx), 3) },
    { cue: "portal-activate", request: sfx(input, "portal-activate", finish(definition.audioPrompts.portalSfx), 3) },
    { cue: "checkpoint", request: sfx(input, "checkpoint", finish("short bright checkpoint confirmation"), 3) },
    { cue: "fall-respawn", request: sfx(input, "fall-respawn", finish("soft descending whoosh followed by a gentle return pop"), 3) },
    { cue: "race-start", request: sfx(input, "race-start", finish("crisp playful three-count start flourish"), 3) },
    { cue: "race-finish", request: sfx(input, "race-finish", finish("quick triumphant race finish fanfare"), 3) },
    { cue: "completion", request: sfx(input, "completion", finish("warm magical world completion flourish"), 3) },
  ];
}

function sfx(input: AudioPromptInput, cue: Exclude<AudioCue, "music" | "ambience">, prompt: string, durationSeconds: number): GenerationRequest {
  return { schemaVersion: 1, kind: "sfx", capability: "mirelo-sfx", idempotencyKey: audioKey(input, cue), purpose: `audio:${cue}`, prompt, durationSeconds, loop: false };
}

export function audioKey(input: AudioPromptInput, cue: AudioCue): string {
  const normalized = JSON.stringify({
    worldId: input.worldId,
    style: input.style,
    objectDescription: input.objectDescription.trim().replace(/\s+/g, " "),
    atmosphere: input.atmosphere?.trim().replace(/\s+/g, " ") ?? "",
    // Always empty since narration was removed; kept so every existing cue's
    // key is unchanged and resubmitting a world reconciles its stored jobs.
    narrationScript: "",
    cue,
  });
  // Browser-compatible FNV-1a is sufficient for deterministic idempotency;
  // the gateway still compares the complete request before reconciliation.
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `audio-${cue}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
