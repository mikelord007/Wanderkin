import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { PublishedLevelVersion, SceneManifest } from "@shared/index.js";
import type { GameCompletionResult, GameViewHandle } from "../../game/types.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { Button } from "../components/Button.js";
import { GameplayRecorder, supportsGameplayRecording, type GameplayHighlight } from "../../capture/recorder.js";
import { captureWorldScreenshot } from "../../capture/screenshot.js";
import type { CompletedRunMedia } from "../../capture/types.js";
import "../../capture/media.css";

const GameView = lazy(() =>
  import("../../game/GameView.js").then((mod) => ({ default: mod.GameView })),
);

interface PlayScreenProps {
  manifest: SceneManifest;
  onExit: () => void;
  onComplete: (result: GameCompletionResult, media: CompletedRunMedia) => void;
  publishedVersionId?: PublishedLevelVersion["versionId"];
}

/** Thin wrapper — GameView owns gameplay HUD, mantle prompt, pause, and
 * respawn controls. This screen only supplies the lazy boundary and the
 * exit/complete callbacks. */
export function PlayScreen({ manifest, onExit, onComplete, publishedVersionId }: PlayScreenProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [captureState, setCaptureState] = useState<"idle" | "recording" | "stopping" | "ready">("idle");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [recordingSupported] = useState(() => supportsGameplayRecording());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const gameViewRef = useRef<GameViewHandle>(null);
  const recorderRef = useRef<GameplayRecorder | null>(null);
  const highlightRef = useRef<GameplayHighlight | null>(null);
  const recordingErrorRef = useRef<string | null>(null);

  useEffect(() => () => recorderRef.current?.dispose(), []);

  function renderedCanvas(): HTMLCanvasElement | null {
    return wrapperRef.current?.querySelector("canvas") ?? null;
  }

  function startCapture() {
    const canvas = renderedCanvas();
    if (!canvas) {
      setCaptureError("Wait for the world to finish loading, then try again.");
      return;
    }
    setCaptureError(null);
    recordingErrorRef.current = null;
    const recorder = new GameplayRecorder(canvas, manifest.name, (state) => {
      if (state === "recording" || state === "stopping" || state === "ready") setCaptureState(state);
      if (state === "error") {
        const message = recorder.error?.message ?? "Gameplay recording stopped unexpectedly.";
        recordingErrorRef.current = message;
        setCaptureError(message);
      }
    });
    recorderRef.current = recorder;
    recorder.start();
  }

  async function stopCapture(): Promise<GameplayHighlight | null> {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return highlightRef.current;
    try {
      const highlight = await recorder.stop();
      highlightRef.current = highlight;
      return highlight;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gameplay recording could not be finished.";
      recordingErrorRef.current = message;
      setCaptureError(message);
      return null;
    }
  }

  /** Wired to GameView's `C` keyboard shortcut, which works even while the
   * pointer is locked (unlike a click on the button below, which needs the
   * lock released first — see `startCapture`/`stopCapture` button handlers). */
  function handleToggleCapture() {
    if (captureState === "recording") void stopCapture();
    else if (captureState === "idle") startCapture();
  }

  async function handleComplete(result: GameCompletionResult) {
    const canvas = renderedCanvas();
    let screenshot = null;
    let screenshotError: string | null = null;
    if (canvas) {
      try {
        screenshot = await captureWorldScreenshot(canvas, manifest);
      } catch (error) {
        screenshotError = error instanceof Error ? error.message : "The world screenshot could not be captured.";
      }
    } else {
      screenshotError = "The rendered world was unavailable for a screenshot.";
    }
    const highlight = await stopCapture();
    onComplete(result, {
      screenshot,
      highlight,
      screenshotError,
      recordingError: recordingErrorRef.current,
      recordingSupported,
    });
  }

  if (loadError) {
    return (
      <div className="oq-screen oq-screen--play">
        <div className="oq-panel oq-panel--error">
          <h1>This world couldn’t load</h1>
          <p className="oq-error-text">A saved 3D asset may be missing or expired. Restore it, then retry loading.</p>
          <details><summary>Technical detail</summary><p>{loadError}</p></details>
          <div className="oq-actions">
            <button
              type="button"
              className="oq-button oq-button--primary"
              onClick={() => {
                setLoadError(null);
                setRetryAttempt((attempt) => attempt + 1);
              }}
            >
              Retry loading
            </button>
            <button type="button" className="oq-button oq-button--ghost" onClick={onExit}>
              My worlds
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="oq-screen oq-screen--play oq-screen--full-bleed">
      <ErrorBoundary key={retryAttempt} onError={setLoadError}>
        <Suspense fallback={<LoadingScreen stage="Loading the game…" />}>
          <GameView
            ref={gameViewRef}
            manifest={manifest}
            onExit={onExit}
            onComplete={handleComplete}
            onToggleCapture={handleToggleCapture}
            {...(publishedVersionId === undefined ? {} : { publishedVersionId })}
          />
        </Suspense>
      </ErrorBoundary>
      <div className="oq-capture-controls" data-recording={captureState === "recording"} aria-label="Gameplay highlight controls">
        {!recordingSupported ? <p>Gameplay recording isn’t supported by this browser.</p>
          : captureState === "idle" ? (
            <Button
              variant="secondary"
              title="Start gameplay capture (C)"
              onClick={() => {
                // A click on this button is not reliably delivered while
                // the pointer is locked, so release it first — the `C` key
                // (wired above via onToggleCapture) works during lock too.
                gameViewRef.current?.releasePointerLockForOverlay();
                startCapture();
              }}
            >
              Start gameplay capture
            </Button>
          )
          : captureState === "recording" ? (
            <Button
              variant="secondary"
              title="Stop gameplay capture (C)"
              onClick={() => {
                gameViewRef.current?.releasePointerLockForOverlay();
                void stopCapture();
              }}
            >
              Stop gameplay capture
            </Button>
          )
          : captureState === "stopping" ? <p role="status">Finishing gameplay highlight…</p>
          : <p role="status">Gameplay highlight ready</p>}
        {captureError ? <p role="alert">{captureError}</p> : null}
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  onError: (message: string) => void;
  children: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps> {
  override componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : "Could not load the game.");
  }

  override render() {
    return this.props.children;
  }
}
