import { useCallback, useEffect, useRef, useState } from "react";
import type { LevelMedia } from "@shared/index.js";
import type { GameplayEvent, GameplayEventBus } from "../game/events.js";
import type { AudioSettings } from "../ui/components/index.js";
import { GameAudioEngine } from "./engine.js";
import { loadAudioSettings, saveAudioSettings } from "./settings.js";

export interface SubtitleState { text: string; speaker: string; visible: boolean }

export function useGameAudio(options: {
  worldId: string;
  media?: LevelMedia;
  narrationScript?: string;
  eventBus: GameplayEventBus;
}) {
  const [settings, setSettingsState] = useState<AudioSettings>(loadAudioSettings);
  const [subtitle, setSubtitle] = useState<SubtitleState>({ text: "", speaker: "Your guide", visible: false });
  const engineRef = useRef<GameAudioEngine | null>(null);
  const subtitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!engineRef.current) engineRef.current = new GameAudioEngine(settings);
  const engine = engineRef.current;

  useEffect(() => { engine.configure(options.media); }, [engine, options.media]);
  useEffect(() => () => {
    if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
    engine.stop();
  }, [engine]);

  const setSettings = useCallback((next: AudioSettings) => {
    setSettingsState(next);
    saveAudioSettings(next);
    engine.setSettings(next);
  }, [engine]);

  useEffect(() => options.eventBus.on("*", (event) => {
    handleEvent(engine, event);
    if (event.type === "introShown") {
      const text = options.narrationScript?.trim();
      if (!text) return;
      setSubtitle({ text, speaker: "Your guide", visible: true });
      if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
      const milliseconds = Math.max(3200, Math.min(12_000, text.split(/\s+/).length * 420));
      subtitleTimer.current = setTimeout(() => setSubtitle((current) => ({ ...current, visible: false })), milliseconds);
    }
  }), [engine, options.eventBus, options.narrationScript]);

  const unlock = useCallback(() => engine.unlockAndStart(), [engine]);
  return { settings, setSettings, subtitle, unlock };
}

function handleEvent(engine: GameAudioEngine, event: GameplayEvent): void {
  switch (event.type) {
    case "introShown": void engine.playNarrationOnce(event.worldId); break;
    case "fragmentCollected": void engine.play("fragment-pickup"); break;
    case "portalActivated": void engine.play("portal-activate"); break;
    case "checkpointReached": void engine.play("checkpoint"); break;
    case "respawned": void engine.play("fall-respawn"); break;
    case "raceStarted": void engine.play("race-start"); break;
    case "raceFinished": void engine.play("race-finish"); break;
    case "worldCompleted": void engine.play("completion"); break;
    default: break;
  }
}
