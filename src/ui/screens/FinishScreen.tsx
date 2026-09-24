import type { SceneManifest } from "@shared/index.js";
import { Button } from "../components/Button.js";
import { Icon } from "../components/Icon.js";
import type { GameCompletionResult } from "../../game/types.js";
import "./finish-screen.css";

interface FinishScreenProps {
  manifest: SceneManifest;
  result: GameCompletionResult;
  onReplay: () => void;
  onTryRace: () => void;
  onShare?: () => void;
  onCreateAnother: () => void;
}

function formatTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const tenths = Math.floor((milliseconds % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

export function FinishScreen({ manifest, result, onReplay, onTryRace, onShare, onCreateAnother }: FinishScreenProps) {
  const isCollect = manifest.experience?.mode.kind === "collect";
  const isRace = result.mode === "race";
  return (
    <main className="oq-finish" aria-labelledby="completion-title">
      <div className="oq-finish__glow" aria-hidden="true" />
      <section className="oq-finish__world" aria-label={`${manifest.name}, fully restored`}>
        <div className="oq-finish__island" aria-hidden="true">
          <span className="oq-finish__fragment oq-finish__fragment--red" />
          <span className="oq-finish__fragment oq-finish__fragment--yellow" />
          <span className="oq-finish__fragment oq-finish__fragment--blue" />
          <span className="oq-finish__portal" />
        </div>
        <p><Icon name="spark" /> World fully restored</p>
        <strong>{manifest.name}</strong>
      </section>

      <section className="oq-finish__card">
        <p className="oq-finish__eyebrow">Adventure complete</p>
        <h1 id="completion-title">{isCollect ? "You brought the colors back." : isRace ? "Race finished!" : "What a wonderful little adventure."}</h1>
        <p className="oq-finish__copy">
          {isCollect
            ? "Every fragment is home, the portal is glowing, and this tiny world is bright again."
            : `You completed ${manifest.name}. The same world is ready whenever you want another run.`}
        </p>
        {isRace && result.elapsedMilliseconds !== null ? (
          <dl className="oq-finish__results">
            <div><dt>Your time</dt><dd>{formatTime(result.elapsedMilliseconds)}</dd></div>
            <div><dt>Personal best</dt><dd>{formatTime(result.bestMilliseconds ?? result.elapsedMilliseconds)}</dd></div>
          </dl>
        ) : null}
        <div className="oq-finish__actions">
          <Button onClick={onReplay}><Icon name="play" />Play again</Button>
          <Button variant="secondary" onClick={onTryRace}>Try Race mode</Button>
          <Button
            variant="secondary"
            onClick={onShare}
            disabled={!onShare}
            title={onShare ? undefined : "Publish this world before sharing it"}
          >
            Share this world
          </Button>
          <Button variant="ghost" onClick={onCreateAnother}>Create another world</Button>
        </div>
        {!onShare ? <p className="oq-finish__note">Publish this world to unlock a playable sharing link.</p> : null}
        <p className="oq-finish__note">Replay and Race reuse this world’s existing assets — no new generation is started.</p>
      </section>
    </main>
  );
}
