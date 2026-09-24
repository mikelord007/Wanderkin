import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from "../ui/components/index.js";

const STORAGE_KEY = "objectquest:audio-settings:v1";

export function loadAudioSettings(storage: Storage | null = safeStorage()): AudioSettings {
  if (!storage) return DEFAULT_AUDIO_SETTINGS;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Partial<AudioSettings> | null;
    if (!parsed) return DEFAULT_AUDIO_SETTINGS;
    return {
      master: percent(parsed.master, DEFAULT_AUDIO_SETTINGS.master),
      music: percent(parsed.music, DEFAULT_AUDIO_SETTINGS.music),
      effects: percent(parsed.effects, DEFAULT_AUDIO_SETTINGS.effects),
      voice: percent(parsed.voice, DEFAULT_AUDIO_SETTINGS.voice),
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_AUDIO_SETTINGS.muted,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(settings: AudioSettings, storage: Storage | null = safeStorage()): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private/blocked storage keeps runtime settings only */ }
}

function percent(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

function safeStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
