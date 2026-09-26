/**
 * The playable level.
 *
 * Owns the whole life cycle of a level: downloading and decoding its
 * assets, building the physics world, running the fixed-step simulation
 * inside an R3F canvas, and reporting progress through `GameSnapshot`.
 *
 * Two design points worth stating, because both are requirements rather
 * than preferences:
 *
 *  - `ready` is only ever true once a frame has genuinely been drawn with
 *    physics in place. Every earlier stage is reported for what it is, and
 *    a download percentage is only shown when a real content length exists.
 *  - The same code runs every level. Everything specific to a room lives
 *    in the manifest; the only other input is the shared `MovementConfig`,
 *    so jump height and mantle rules cannot drift between levels.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { DEFAULT_MOVEMENT_CONFIG, type SceneManifest } from "@shared/index.js";
import { loadSceneAsset, type LoadedSceneAsset } from "./assets/loadSceneAsset.js";
import { initRapier, type RapierModule } from "./core/physicsWorld.js";
import { GameSimulation, type SimulationEvent } from "./core/simulation.js";
import type { TriangleSoup } from "./core/soup.js";
import { InputController } from "./input/inputController.js";
import { installDiagnostics, type GameDiagnostics } from "./diagnostics.js";
import { resolveScenePresentation } from "../scene/style.js";
import { Hud } from "./hud/Hud.js";
import { GameStage as StageContents, type HudSignals } from "./render/GameStage.js";
import { usePrefersReducedMotion } from "./render/useReducedMotion.js";
import { ColorRestorationAdapter } from "./restorationAdapter.js";
import type { GameLoadStage, GameSnapshot, GameViewHandle, GameViewProps } from "./types.js";
import { GameplaySession, type GameplaySessionSnapshot } from "./modes/session.js";
import { updateGameplayProximity } from "./modes/proximity.js";
import { gameplayEvents } from "./events.js";
import type { Vec3Like } from "./core/vec.js";
import { lookAmbienceUrl } from "../audio/assets.js";
import { useGameAudio } from "../audio/useGameAudio.js";
import { useBiomeAdventure } from "../biome/useBiomeAdventure.js";
import { adventureHudCopy } from "../biome/missionCopy.js";
import { AdventureControls } from "../ui/components/AdventureControls.js";

interface Runtime {
  simulation: GameSimulation;
  rapier: RapierModule;
  assets: ReadonlyMap<string, LoadedSceneAsset>;
  input: InputController;
}

const EMPTY_SIGNALS: HudSignals = {
  checkpointsCollected: 0,
  checkpointsTotal: 0,
  nextCheckpointId: null,
  mantlePromptVisible: false,
};

/**
 * Stable signature of everything in a manifest that affects gameplay.
 * Reloading is keyed on this rather than on object identity, so a parent
 * re-rendering with an equivalent manifest does not rebuild the world,
 * while a genuine edit to spawn, checkpoints or geometry does.
 */
function gameplaySignature(manifest: SceneManifest): string {
  return JSON.stringify([
    manifest.levelId,
    manifest.assets.map((asset) => [asset.id, asset.url]),
    manifest.entities,
    manifest.spawn,
    manifest.checkpoints,
    manifest.movementConfigId,
    manifest.experience,
  ]);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred while preparing this level.";
}

export const GameView = forwardRef<GameViewHandle, GameViewProps>(function GameView({
  manifest,
  onExit,
  onComplete,
  onProgress,
  styleId,
  atmosphere,
  colorRestoration: colorRestorationOverride,
  eventBus,
  publishedVersionId,
  onToggleCapture,
  onAdventurePrepared,
}, ref) {
  const config = DEFAULT_MOVEMENT_CONFIG;
  const reducedMotion = usePrefersReducedMotion();
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const signature = useMemo(() => gameplaySignature(manifest), [manifest]);
  const resolvedEventBus = eventBus ?? gameplayEvents;
  const audio = useGameAudio({
    eventBus: resolvedEventBus,
    ...(manifest.media ? { media: manifest.media } : {}),
  });
  // Read inside the `M` keyboard-shortcut handler below, which is wired
  // once per InputController construction rather than on every render.
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const gameplaySession = useMemo(
    () => manifest.experience
      ? new GameplaySession({
          experience: manifest.experience,
          worldId: manifest.levelId,
          eventBus: resolvedEventBus,
          ...(publishedVersionId === undefined ? {} : { publishedVersionId }),
        })
      : null,
    [signature, resolvedEventBus, publishedVersionId],
  );
  const {
    style,
    atmosphere: resolvedAtmosphere,
    colorRestoration: initialColorRestoration,
  } = resolveScenePresentation(manifest, {
    ...(styleId === undefined ? {} : { styleId }),
    ...(atmosphere === undefined ? {} : { atmosphere }),
    ...(colorRestorationOverride === undefined
      ? {}
      : { colorRestoration: colorRestorationOverride }),
  });
  const [colorRestoration, setColorRestoration] = useState(initialColorRestoration);
  const restorationAdapter = useMemo(
    () => new ColorRestorationAdapter({ setColorRestoration }, initialColorRestoration),
    [signature],
  );

  useEffect(() => {
    restorationAdapter.reset(initialColorRestoration);
  }, [initialColorRestoration, restorationAdapter]);

  const [stage, setStage] = useState<GameLoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  // Look and new-adventure state sit outside the gameplay session: a look
  // change never rebuilds physics or touches objectives and progress.
  const biome = useBiomeAdventure({
    manifest,
    assets: runtime?.assets ?? null,
    movement: runtime?.simulation.config ?? null,
    onAdventure: onAdventurePrepared,
  });
  // A look with its own soundscape (Monsoon's rain) replaces the ambience loop.
  const { setLookAmbience } = audio;
  useEffect(() => { setLookAmbience(lookAmbienceUrl(biome.presented.id)); }, [setLookAmbience, biome.presented.id]);
  const adventureCopy = useMemo(
    () => adventureHudCopy(manifest, biome.definition),
    [manifest, biome.definition],
  );
  const adventureCopyRef = useRef(adventureCopy);
  adventureCopyRef.current = adventureCopy;
  const [loadToken, setLoadToken] = useState(0);

  const [started, setStarted] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completionSeconds, setCompletionSeconds] = useState(0);
  const [collectedIds, setCollectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [signals, setSignals] = useState<HudSignals>(EMPTY_SIGNALS);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [modeState, setModeState] = useState<GameplaySessionSnapshot | null>(
    () => gameplaySession?.snapshot ?? null,
  );
  const [introVisible, setIntroVisible] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const objectiveArrowRef = useRef<HTMLDivElement>(null);
  const objectiveDistanceRef = useRef<HTMLSpanElement>(null);
  const diagnosticsRef = useRef<GameDiagnostics | null>(null);
  const runningRef = useRef(false);
  const completionHandledRef = useRef(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastModeHudUpdateRef = useRef(0);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onToggleCaptureRef = useRef(onToggleCapture);
  onToggleCaptureRef.current = onToggleCapture;
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    const next = gameplaySession?.snapshot ?? null;
    setModeState(next);
    if (next) restorationAdapter.reset(next.restoration);
  }, [gameplaySession, restorationAdapter]);

  useEffect(() => () => {
    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => resolvedEventBus.on("fragmentCollected", (event) => {
    setFeedback(adventureCopyRef.current?.pickup(event.collected, event.required)
      ?? `Color found — ${event.collected} of ${event.required}`);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
  }), [resolvedEventBus]);

  // ---- Load assets and build the world --------------------------------

  useEffect(() => {
    let cancelled = false;
    let built: GameSimulation | null = null;

    const current = manifestRef.current;
    setStage("downloading");
    setError(null);
    setRuntime(null);
    setStarted(false);
    setPaused(false);
    setCompleted(false);
    setCollectedIds(new Set());
    setSignals(EMPTY_SIGNALS);
    setDownloadedBytes(0);
    setTotalBytes(null);
    completionHandledRef.current = false;
    runningRef.current = false;

    void (async () => {
      try {
        const required = new Set(
          current.entities.flatMap((entity) => (entity.kind === "generated-mesh" ? [entity.assetId] : [])),
        );
        const assetRefs = current.assets.filter((asset) => required.has(asset.id));

        for (const assetId of required) {
          if (!assetRefs.some((asset) => asset.id === assetId)) {
            throw new Error(`Level references asset "${assetId}", which is not listed in the manifest.`);
          }
        }

        const progressByAsset = new Map<string, { loaded: number; total: number | null }>();
        const loaded = new Map<string, LoadedSceneAsset>();

        for (const assetRef of assetRefs) {
          const result = await loadSceneAsset(assetRef.url, (progress) => {
            if (cancelled) return;
            progressByAsset.set(assetRef.id, { loaded: progress.loadedBytes, total: progress.totalBytes });

            let sumLoaded = 0;
            let sumTotal = 0;
            let everyTotalKnown = true;
            for (const entry of progressByAsset.values()) {
              sumLoaded += entry.loaded;
              if (entry.total === null) everyTotalKnown = false;
              else sumTotal += entry.total;
            }

            setDownloadedBytes(sumLoaded);
            // Only report a total once every asset in flight has one; a
            // partial total would produce a misleading percentage.
            setTotalBytes(everyTotalKnown && progressByAsset.size === assetRefs.length ? sumTotal : null);
            setStage(progress.stage === "decoding" ? "decoding" : "downloading");
          });
          if (cancelled) return;
          loaded.set(assetRef.id, result);
        }

        setStage("building-physics");
        // Let the loading screen paint the new stage before the main thread
        // is taken up by WASM init and collider construction.
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        if (cancelled) return;

        const rapier = await initRapier();
        if (cancelled) return;

        const assetGeometry = new Map<string, TriangleSoup>();
        for (const [assetId, asset] of loaded) assetGeometry.set(assetId, asset.collision);

        const simulation = new GameSimulation(rapier, {
          manifest: current,
          config,
          assetGeometry,
        });
        built = simulation;

        if (cancelled) {
          simulation.dispose();
          return;
        }

        const input = new InputController(config, current.spawn.headingRadians, {
          onPauseRequested: () => {
            runningRef.current = false;
            gameplaySession?.setPaused(true);
            if (gameplaySession) setModeState(gameplaySession.snapshot);
            setPaused(true);
          },
          onPointerLockChange: setPointerLocked,
          onToggleMute: () => {
            const current = audioRef.current;
            current.setSettings({ ...current.settings, muted: !current.settings.muted });
          },
          onToggleCapture: () => onToggleCaptureRef.current?.(),
        });

        setRuntime({ simulation, rapier, assets: loaded, input });
        setStage("starting");
      } catch (loadError) {
        if (cancelled) return;
        built?.dispose();
        setStage("idle");
        setError(describeError(loadError));
      }
    })();

    return () => {
      cancelled = true;
      built?.dispose();
    };
    // `config` is a module constant; `signature` captures every manifest
    // change that requires a rebuild.
  }, [signature, loadToken, config, gameplaySession]);

  // Tear the world down when it is replaced or the view unmounts.
  useEffect(() => {
    if (!runtime) return undefined;
    return () => {
      runtime.simulation.dispose();
    };
  }, [runtime]);

  // ---- Input wiring ---------------------------------------------------

  useEffect(() => {
    const element = containerRef.current;
    if (!runtime || !element) return undefined;
    return runtime.input.attach(element);
  }, [runtime]);

  // ---- Diagnostics ----------------------------------------------------

  useEffect(() => {
    if (!runtime) return undefined;
    return installDiagnostics({
      get: () => diagnosticsRef.current,
      audio: audio.getDiagnostics,
      levelId: manifestRef.current.levelId,
      movementConfigId: config.id,
    });
  }, [runtime, config.id, audio.getDiagnostics]);

  // ---- Running state --------------------------------------------------

  const ready = stage === "running";
  useEffect(() => {
    runningRef.current = ready && started && !paused && !completed && error === null;
  }, [ready, started, paused, completed, error]);

  // A pointer-lock request can be silently refused — most often by the
  // browser's cool-down right after the user pressed Escape. Without this
  // the player would be left in a running game with a camera they cannot
  // move and no way back, so fall back to the pause screen, which offers
  // Resume. The grace period keeps the normal path (lock engages within a
  // frame or two) from flashing the overlay.
  useEffect(() => {
    if (!ready || !started || paused || completed || pointerLocked) return undefined;
    const timer = setTimeout(() => {
      gameplaySession?.setPaused(true);
      if (gameplaySession) setModeState(gameplaySession.snapshot);
      setPaused(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [ready, started, paused, completed, pointerLocked, gameplaySession]);

  const handleFirstFrame = useCallback(() => {
    setStage((previous) => (previous === "starting" ? "running" : previous));
  }, []);

  const handleHudSignals = useCallback((next: HudSignals) => {
    setSignals((previous) =>
      previous.checkpointsCollected === next.checkpointsCollected &&
      previous.checkpointsTotal === next.checkpointsTotal &&
      previous.nextCheckpointId === next.nextCheckpointId &&
      previous.mantlePromptVisible === next.mantlePromptVisible
        ? previous
        : next,
    );
  }, []);

  const finishGameplay = useCallback((nextModeState: GameplaySessionSnapshot | null) => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    runningRef.current = false;
    setCompleted(true);
    setCompletionSeconds(
      nextModeState?.mode === "race"
        ? nextModeState.race.elapsedMilliseconds / 1000
        : runtime?.simulation.simulatedSeconds ?? 0,
    );
    runtime?.input.releasePointerLock();
    onCompleteRef.current({
      mode: nextModeState?.mode ?? "legacy",
      elapsedMilliseconds: nextModeState?.mode === "race"
        ? nextModeState.race.elapsedMilliseconds
        : nextModeState === null
          ? Math.round((runtime?.simulation.simulatedSeconds ?? 0) * 1000)
          : null,
      bestMilliseconds: nextModeState?.mode === "race"
        ? nextModeState.race.bestMilliseconds
        : null,
      publishedVersionId: nextModeState?.race.publishedVersionId ?? null,
    });
  }, [runtime]);

  const syncModeState = useCallback((force = false) => {
    if (!gameplaySession) return;
    const next = gameplaySession.snapshot;
    restorationAdapter.apply(next.restoration);
    const now = performance.now();
    if (force || next.mode !== "race" || now - lastModeHudUpdateRef.current >= 50 || next.completed) {
      lastModeHudUpdateRef.current = now;
      setModeState(next);
    }
    if (next.completed) finishGameplay(next);
  }, [gameplaySession, restorationAdapter, finishGameplay]);

  const handleEvent = useCallback(
    (event: SimulationEvent) => {
      if (event.type === "checkpoint") {
        setCollectedIds((previous) => {
          const next = new Set(previous);
          next.add(event.id);
          return next;
        });
        if (gameplaySession?.reachCheckpoint(event.id)) syncModeState(true);
        return;
      }
      if (event.type === "respawn") {
        const checkpointIndex = runtime?.simulation.checkpointState.lastActivatedIndex ?? -1;
        const checkpointId = checkpointIndex >= 0
          ? runtime?.simulation.checkpointState.checkpoints[checkpointIndex]?.id ?? null
          : null;
        gameplaySession?.respawn(event.reason, checkpointId);
        return;
      }
      if (event.type === "complete") {
        if (!gameplaySession) finishGameplay(null);
      }
    },
    [runtime, gameplaySession, syncModeState, finishGameplay],
  );

  const handleGameplayFrame = useCallback((position: Vec3Like) => {
    if (!gameplaySession || !manifestRef.current.experience) return;
    gameplaySession.update();
    const changed = updateGameplayProximity(
      gameplaySession,
      manifestRef.current.experience,
      position,
    );
    syncModeState(changed);
  }, [gameplaySession, syncModeState]);

  // ---- Player actions -------------------------------------------------

  const handleStart = useCallback(() => {
    if (!runtime) return;
    void audio.unlock();
    if (gameplaySession?.showIntroOnce()) {
      setIntroVisible(true);
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      introTimerRef.current = setTimeout(() => setIntroVisible(false), 5200);
    }
    gameplaySession?.start();
    syncModeState(true);
    setStarted(true);
    setPaused(false);
    runtime.input.requestPointerLock();
  }, [runtime, gameplaySession, syncModeState, audio]);

  const handleResume = useCallback(() => {
    if (!runtime) return;
    gameplaySession?.setPaused(false);
    syncModeState(true);
    setPaused(false);
    setStarted(true);
    runtime.input.requestPointerLock();
  }, [runtime, gameplaySession, syncModeState]);

  const handlePause = useCallback(() => {
    runningRef.current = false;
    gameplaySession?.setPaused(true);
    syncModeState(true);
    runtime?.input.releasePointerLock();
    setPaused(true);
  }, [runtime, gameplaySession, syncModeState]);

  const handleRestart = useCallback(() => {
    // A world being replaced may already be freed; reset() would query it.
    if (!runtime || runtime.simulation.isDisposed) return;
    runtime.simulation.reset();
    gameplaySession?.restart();
    runtime.input.setYaw(manifestRef.current.spawn.headingRadians);
    setCollectedIds(new Set());
    setCompleted(false);
    setCompletionSeconds(0);
    setPaused(false);
    setStarted(true);
    setSignals(EMPTY_SIGNALS);
    setFeedback(null);
    completionHandledRef.current = false;
    if (gameplaySession) {
      const next = gameplaySession.snapshot;
      setModeState(next);
      restorationAdapter.reset(next.restoration);
    }
    runtime.input.requestPointerLock();
  }, [runtime, gameplaySession, restorationAdapter]);

  const handleRetry = useCallback(() => {
    setLoadToken((token) => token + 1);
  }, []);

  const handleExit = useCallback(() => {
    runtime?.input.releasePointerLock();
    onExit();
  }, [runtime, onExit]);

  // Explicitly releases pointer lock without pausing — used by HUD controls
  // (Sound) and by the caller's own overlay controls (PlayScreen's gameplay
  // capture button) so a real cursor is available for the click that
  // follows. Nothing here ever re-requests the lock: only the Play/Resume
  // gestures do that, so a HUD click can never trigger an accidental relock.
  const handleReleaseForHud = useCallback(() => {
    runtime?.input.releasePointerLock();
  }, [runtime]);

  useImperativeHandle(ref, () => ({
    releasePointerLockForOverlay: handleReleaseForHud,
  }), [handleReleaseForHud]);

  // ---- Snapshot reporting ---------------------------------------------

  const snapshot = useMemo<GameSnapshot>(
    () => ({
      loading: !ready && error === null,
      error,
      ready,
      paused,
      checkpointsCollected: signals.checkpointsCollected,
      checkpointsTotal: signals.checkpointsTotal || manifest.checkpoints.length,
      nextCheckpointId: signals.nextCheckpointId,
      mantlePromptVisible: signals.mantlePromptVisible,
      stage,
      downloadedBytes,
      totalBytes,
      completed,
      ...(modeState ? { mode: modeState } : {}),
    }),
    [ready, error, paused, signals, manifest.checkpoints.length, stage, downloadedBytes, totalBytes, completed, modeState],
  );

  const objectivePosition = useMemo<Vec3Like | null>(() => {
    const experience = manifest.experience;
    if (!experience || !modeState) return null;
    if (experience.mode.kind === "collect") {
      const nextId = experience.mode.requiredCollectibleIds.find(
        (id) => !modeState.collectedFragmentIds.has(id),
      );
      const fragment = experience.collectibles.find((item) => item.id === nextId);
      if (fragment) {
        const [x, y, z] = fragment.transform.position;
        return { x, y, z };
      }
    }
    if (experience.mode.kind === "explore") {
      const destination = experience.mode.destinations.find(
        (item) => !modeState.destinationsReached.has(item.id),
      );
      if (destination) {
        const [x, y, z] = destination.position;
        return { x, y, z };
      }
    }
    if (modeState.portalActive && experience.finishPortal) {
      const [x, y, z] = experience.finishPortal.transform.position;
      return { x, y, z };
    }
    return null;
  }, [manifest.experience, modeState]);

  // Held in a ref so an inline `onProgress` from the parent cannot make
  // this fire on every render of the parent, which would be an easy way
  // for a consumer to build an accidental render loop.
  onProgressRef.current = onProgress;
  useEffect(() => {
    onProgressRef.current?.(snapshot);
  }, [snapshot]);

  // ---- Render ---------------------------------------------------------

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0d1119" }}
    >
      {runtime ? (
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
          // A near plane of 2cm matters at toy scale: the collision-aware
          // camera can legitimately sit under 30cm from the character.
          camera={{ fov: 55, near: 0.02, far: 600 }}
        >
          <StageContents
            simulation={runtime.simulation}
            config={config}
            manifest={manifest}
            assets={runtime.assets}
            input={runtime.input}
            rapier={runtime.rapier}
            runningRef={runningRef}
            collectedIds={collectedIds}
            activeCheckpointId={signals.nextCheckpointId}
            onFirstFrame={handleFirstFrame}
            onEvent={handleEvent}
            onHudSignals={handleHudSignals}
            objectiveArrowRef={objectiveArrowRef}
            objectiveDistanceRef={objectiveDistanceRef}
            diagnosticsRef={diagnosticsRef}
            style={style}
            atmosphere={resolvedAtmosphere}
            colorRestoration={colorRestoration}
            reducedMotion={reducedMotion}
            modeState={modeState}
            objectivePosition={objectivePosition}
            onGameplayFrame={handleGameplayFrame}
            biomeDefinition={biome.definition}
            biomeLayout={biome.presented.layout}
            effectsQuality={biome.presented.quality}
          />
        </Canvas>
      ) : null}

      <Hud
        stage={stage}
        error={error}
        paused={paused}
        completed={completed}
        awaitingPointerLock={!started}
        checkpointsCollected={signals.checkpointsCollected}
        checkpointsTotal={signals.checkpointsTotal || manifest.checkpoints.length}
        mantlePromptVisible={signals.mantlePromptVisible}
        downloadedBytes={downloadedBytes}
        totalBytes={totalBytes}
        elapsedSeconds={completionSeconds}
        warnings={runtime?.simulation.warnings ?? []}
        levelName={manifest.name}
        objectiveArrowRef={objectiveArrowRef}
        objectiveDistanceRef={objectiveDistanceRef}
        onResume={handleResume}
        onRestart={handleRestart}
        onRetry={handleRetry}
        onExit={handleExit}
        onStart={handleStart}
        onPause={handlePause}
        modeState={modeState}
        objective={manifest.experience?.quest.objective}
        adventureCopy={adventureCopy}
        settingsPanel={
          // Only reachable from the pause and click-to-play cards, where the
          // pointer is already released.
          <AdventureControls
            biomeId={biome.selectedId}
            template={biome.template}
            quality={biome.selectedQuality}
            busy={biome.busy}
            error={biome.error}
            confirmReset={started}
            newAdventureAvailable={biome.canStartNewAdventure}
            onBiomeChange={biome.setBiome}
            onTemplateChange={biome.setTemplate}
            onQualityChange={biome.setQuality}
            onNewAdventure={biome.newAdventure}
          />
        }
        introVisible={introVisible}
        feedback={feedback}
        audioSettings={audio.settings}
        onAudioSettingsChange={audio.setSettings}
        onRequestPointerRelease={handleReleaseForHud}
      />
    </div>
  );
});
