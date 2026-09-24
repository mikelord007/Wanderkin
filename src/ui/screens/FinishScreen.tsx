import type { SceneManifest } from "@shared/index.js";
import { Button } from "../components/Button.js";
import { Icon } from "../components/Icon.js";
import "./finish-screen.css";

interface FinishScreenProps {
  manifest: SceneManifest;
  onReplay: () => void;
  onTryRace: () => void;
  onShare?: () => void;
  onCreateAnother: () => void;
}

export function FinishScreen({ manifest, onReplay, onTryRace, onShare, onCreateAnother }: FinishScreenProps) {
  const isCollect = manifest.experience?.mode.kind === "collect";
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
        <h1 id="completion-title">{isCollect ? "You brought the colors back." : "What a wonderful little adventure."}</h1>
        <p className="oq-finish__copy">
          {isCollect
            ? "Every fragment is home, the portal is glowing, and this tiny world is bright again."
            : `You completed ${manifest.name}. The same world is ready whenever you want another run.`}
        </p>
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
