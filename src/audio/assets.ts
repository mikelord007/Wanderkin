import type { AudioAssetReference, LevelMedia } from "@shared/index.js";

export const EFFECT_CUES = ["fragment-pickup", "portal-activate", "checkpoint", "fall-respawn", "race-start", "race-finish", "completion"] as const;
export type EffectCue = typeof EFFECT_CUES[number];
export type AudioCue = "music" | "ambience" | EffectCue;

export const BUNDLED_AUDIO_URLS: Readonly<Record<AudioCue, string>> = {
  music: "/audio/lost-colors-loop.wav",
  ambience: "/audio/gentle-breeze.wav",
  "fragment-pickup": "/audio/fragment-pickup.wav",
  "portal-activate": "/audio/portal-activate.wav",
  checkpoint: "/audio/checkpoint.wav",
  "fall-respawn": "/audio/fall-respawn.wav",
  "race-start": "/audio/race-start.wav",
  "race-finish": "/audio/race-finish.wav",
  completion: "/audio/completion.wav",
};

/** Shared media currently stores SFX as a flat array. The server writes them
 * in this documented canonical order; generated kind-specific assets win,
 * while a missing optional asset falls back to the tiny bundled sound.
 * Narration assets in older manifests are ignored. */
export function resolveAudioUrls(media?: LevelMedia): Readonly<Record<AudioCue, string>> {
  const result = { ...BUNDLED_AUDIO_URLS };
  if (!media) return result;
  const find = (kind: AudioAssetReference["kind"]) => media.audio.find((asset) => asset.kind === kind);
  result.music = find("music")?.url ?? result.music;
  result.ambience = find("ambience")?.url ?? result.ambience;
  const effects = media.audio.filter((asset) => asset.kind === "sfx");
  EFFECT_CUES.forEach((cue, index) => { result[cue] = effects[index]?.url ?? result[cue]; });
  return result;
}
