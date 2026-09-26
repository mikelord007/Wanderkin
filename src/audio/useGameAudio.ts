import { useCallback, useEffect, useRef, useState } from "react";
import type { LevelMedia } from "@shared/index.js";
import type { GameplayEvent, GameplayEventBus } from "../game/events.js";
import type { AudioSettings } from "../ui/components/index.js";
import { GameAudioEngine, installAudioReport } from "./engine.js";
import { loadAudioSettings, saveAudioSettings } from "./settings.js";

export function useGameAudio(options: {
  media?: LevelMedia;
  eventBus: GameplayEventBus;
}) {
  const [settings, setSettingsState] = useState<AudioSettings>(loadAudioSettings);
  const engineRef = useRef<GameAudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new GameAudioEngine(settings);
  const engine = engineRef.current;

  useEffect(() => { engine.configure(options.media); }, [engine, options.media]);
  useEffect(() => () => engine.stop(), [engine]);

  const setSettings = useCallback((next: AudioSettings) => {
    setSettingsState(next);
    saveAudioSettings(next);
    engine.setSettings(next);
  }, [engine]);

  useEffect(() => options.eventBus.on("*", (event) => {
    engine.noteGameplayEvent(event.type);
    handleEvent(engine, event);
  }), [engine, options.eventBus]);
  // `window.__wanderkinAudio()` in the console: the last audio happenings.
  useEffect(() => installAudioReport(engine), [engine]);

  const unlock = useCallback(() => engine.unlockAndStart(), [engine]);
  const getDiagnostics = useCallback(() => engine.diagnostics(), [engine]);
  const mediaRef = useRef(options.media);
  mediaRef.current = options.media;
  /** The shown look's own ambience loop (null = the world's). */
  const setLookAmbience = useCallback((url: string | null) => engine.setAmbienceOverride(url, mediaRef.current), [engine]);
  return { settings, setSettings, unlock, getDiagnostics, setLookAmbience };
}

export function handleEvent(
  engine: Pick<GameAudioEngine, "play"> & Partial<Pick<GameAudioEngine, "playGrappleBite">>,
  event: GameplayEvent,
): void {
  switch (event.type) {
    case "fragmentCollected": void engine.play("fragment-pickup"); break;
    case "portalActivated": void engine.play("portal-activate"); break;
    case "checkpointReached": void engine.play("checkpoint"); break;
    case "respawned": void engine.play("fall-respawn"); break;
    case "raceStarted": void engine.play("race-start"); break;
    case "raceFinished": void engine.play("race-finish"); break;
    case "worldCompleted": void engine.play("completion"); break;
    case "grappleAttached": engine.playGrappleBite?.(); break;
    default: break;
  }
}
