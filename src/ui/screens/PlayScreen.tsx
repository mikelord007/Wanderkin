import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import type { PublishedLevelVersion, SceneManifest } from "@shared/index.js";
import type { GameCompletionResult } from "../../game/types.js";
import { LoadingScreen } from "../components/LoadingScreen.js";

const GameView = lazy(() =>
  import("../../game/GameView.js").then((mod) => ({ default: mod.GameView })),
);

interface PlayScreenProps {
  manifest: SceneManifest;
  onExit: () => void;
  onComplete: (result: GameCompletionResult) => void;
  publishedVersionId?: PublishedLevelVersion["versionId"];
}

/** Thin wrapper — GameView owns gameplay HUD, mantle prompt, pause, and
 * respawn controls. This screen only supplies the lazy boundary and the
 * exit/complete callbacks. */
export function PlayScreen({ manifest, onExit, onComplete, publishedVersionId }: PlayScreenProps) {
  const [loadError, setLoadError] = useState<string | null>(null);

  if (loadError) {
    return (
      <div className="oq-screen oq-screen--play">
        <div className="oq-panel oq-panel--error">
          <p className="oq-error-text">{loadError}</p>
          <div className="oq-actions">
            <button type="button" className="oq-button oq-button--ghost" onClick={onExit}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="oq-screen oq-screen--play oq-screen--full-bleed">
      <ErrorBoundary onError={setLoadError}>
        <Suspense fallback={<LoadingScreen stage="Loading the game…" />}>
          <GameView
            manifest={manifest}
            onExit={onExit}
            onComplete={onComplete}
            {...(publishedVersionId === undefined ? {} : { publishedVersionId })}
          />
        </Suspense>
      </ErrorBoundary>
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
