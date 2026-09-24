import type { SceneManifest } from "@shared/index.js";

interface FinishScreenProps {
  manifest: SceneManifest;
  onReplay: () => void;
  onBackToLevel: () => void;
  onBackToStart: () => void;
  isShared?: boolean;
}

export function FinishScreen({ manifest, onReplay, onBackToLevel, onBackToStart, isShared = false }: FinishScreenProps) {
  return (
    <div className="oq-screen oq-screen--finish">
      <div className="oq-finish-card">
        <p className="oq-finish-card__badge">Course complete</p>
        <h1>Nicely done!</h1>
        <p className="oq-subtitle">
          You collected all {manifest.checkpoints.length} checkpoints in {manifest.name}.
        </p>
        <div className="oq-actions oq-actions--stacked">
          <button type="button" className="oq-button oq-button--primary oq-button--large" onClick={onReplay}>
            Play again
          </button>
          <button type="button" className="oq-button oq-button--secondary" onClick={onBackToLevel}>
            {isShared ? "Back to challenge" : "Back to saved level"}
          </button>
          <button type="button" className="oq-button oq-button--ghost" onClick={onBackToStart}>
            Return to start
          </button>
        </div>
      </div>
    </div>
  );
}
