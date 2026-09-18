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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { DEFAULT_MOVEMENT_CONFIG, type SceneManifest } from "@shared/index.js";
import { loadSceneAsset, type LoadedSceneAsset } from "./assets/loadSceneAsset.js";
import { initRapier, type RapierModule } from "./core/physicsWorld.js";
import { GameSimulation, type SimulationEvent } from "./core/simulation.js";
import type { TriangleSoup } from "./core/soup.js";
import { InputController } from "./input/inputController.js";
import { installDiagnostics, type GameDiagnostics } from "./diagnostics.js";
import { Hud } from "./hud/Hud.js";
import { GameStage as StageContents, type HudSignals } from "./render/GameStage.js";
import type { GameLoadStage, GameSnapshot, GameViewProps } from "./types.js";

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
  ]);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred while preparing this level.";
}

export function GameView({ manifest, onExit, onComplete, onProgress }: GameViewProps) {
  const config = DEFAULT_MOVEMENT_CONFIG;

  const [stage, setStage] = useState<GameLoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
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

  const containerRef = useRef<HTMLDivElement>(null);
  const objectiveArrowRef = useRef<HTMLDivElement>(null);
  const objectiveDistanceRef = useRef<HTMLSpanElement>(null);
  const diagnosticsRef = useRef<GameDiagnostics | null>(null);
  const runningRef = useRef(false);

  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const signature = useMemo(() => gameplaySignature(manifest), [manifest]);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onProgressRef = useRef(onProgress);

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
            setPaused(true);
          },
          onPointerLockChange: setPointerLocked,
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
  }, [signature, loadToken, config]);

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
      levelId: manifestRef.current.levelId,
      movementConfigId: config.id,
    });
  }, [runtime, config.id]);

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
    const timer = setTimeout(() => setPaused(true), 600);
    return () => clearTimeout(timer);
  }, [ready, started, paused, completed, pointerLocked]);

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

  const handleEvent = useCallback(
    (event: SimulationEvent) => {
      if (event.type === "checkpoint") {
        setCollectedIds((previous) => {
          const next = new Set(previous);
          next.add(event.id);
          return next;
        });
        return;
      }
      if (event.type === "complete") {
        runningRef.current = false;
        setCompleted(true);
        setCompletionSeconds(runtime?.simulation.simulatedSeconds ?? 0);
        runtime?.input.releasePointerLock();
        onCompleteRef.current();
      }
    },
    [runtime],
  );

  // ---- Player actions -------------------------------------------------

  const handleStart = useCallback(() => {
    if (!runtime) return;
    setStarted(true);
    setPaused(false);
    runtime.input.requestPointerLock();
  }, [runtime]);

  const handleResume = useCallback(() => {
    if (!runtime) return;
    setPaused(false);
    setStarted(true);
    runtime.input.requestPointerLock();
  }, [runtime]);

  const handleRestart = useCallback(() => {
    if (!runtime) return;
    runtime.simulation.reset();
    runtime.input.setYaw(manifestRef.current.spawn.headingRadians);
    setCollectedIds(new Set());
    setCompleted(false);
    setCompletionSeconds(0);
    setPaused(false);
    setStarted(true);
    setSignals(EMPTY_SIGNALS);
    runtime.input.requestPointerLock();
  }, [runtime]);

  const handleRetry = useCallback(() => {
    setLoadToken((token) => token + 1);
  }, []);

  const handleExit = useCallback(() => {
    runtime?.input.releasePointerLock();
    onExit();
  }, [runtime, onExit]);

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
    }),
    [ready, error, paused, signals, manifest.checkpoints.length, stage, downloadedBytes, totalBytes, completed],
  );

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
          gl={{ antialias: true, powerPreference: "high-performance" }}
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
      />
    </div>
  );
}
