import type { SceneManifest } from "@shared/index.js";
import { SampleWorlds, useSampleLevels } from "../library/SampleWorlds.js";
import "./dashboard.css";

/** Borrow a sample: the built-in worlds, ready to play or to copy and edit. */
export function BorrowScreen({ onPlaySample, onEditSample, onCreateFromPhotos }: {
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
}) {
  const { samples, error } = useSampleLevels();
  return (
    <main className="wk-page" aria-labelledby="borrow-heading">
      <header className="wk-page__head">
        <div>
          <h1 id="borrow-heading">Borrow a sample</h1>
          <p className="wk-page__lede">Built-in worlds, ready to play with keyboard and mouse. Edit a course to make a copy of your own.</p>
        </div>
      </header>
      <SampleWorlds samples={samples} error={error} onPlaySample={onPlaySample} onEditSample={onEditSample} onCreateFromPhotos={onCreateFromPhotos} />
    </main>
  );
}
