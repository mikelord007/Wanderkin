import { useEffect, useRef, useState } from "react";
import type { SceneManifest } from "@shared/index.js";
import { describeApiError, importAsset, listLevels } from "../api.js";

interface StartScreenProps {
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample: (manifest: SceneManifest) => void;
  onPlaySavedLevel: (manifest: SceneManifest) => void;
  onEditSavedLevel: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
  onImportGlbReady: (assetId: string) => void;
}

export function StartScreen({
  onPlaySample,
  onEditSample,
  onPlaySavedLevel,
  onEditSavedLevel,
  onCreateFromPhotos,
  onImportGlbReady,
}: StartScreenProps) {
  const [sampleLevels, setSampleLevels] = useState<SceneManifest[] | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const [savedLevels, setSavedLevels] = useState<SceneManifest[] | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    import("../../scene/samples.js")
      .then((mod) => setSampleLevels(mod.SAMPLE_LEVELS))
      .catch((error) =>
        setSampleError(error instanceof Error ? error.message : "Bundled samples are unavailable."),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    listLevels()
      .then((levels) => {
        if (!cancelled) setSavedLevels(levels);
      })
      .catch((error) => {
        if (!cancelled) setSavedError(describeApiError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const asset = await importAsset(file);
      onImportGlbReady(asset.id);
    } catch (error) {
      setImportError(describeApiError(error));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="oq-screen oq-screen--start">
      <header className="oq-screen__header oq-screen__header--hero">
        <h1>ObjectQuest</h1>
        <p className="oq-subtitle">
          Turn a photo of a room into a tiny playground. Jump, climb, and collect checkpoints
          across furniture-scale terrain.
        </p>
      </header>

      <section className="oq-panel">
        <h2>Play a sample</h2>
        {sampleError ? (
          <p className="oq-error-text">{sampleError}</p>
        ) : !sampleLevels ? (
          <p className="oq-empty-hint">Loading bundled samples…</p>
        ) : sampleLevels.length === 0 ? (
          <p className="oq-empty-hint">No bundled samples available.</p>
        ) : (
          <div className="oq-card-grid">
            {sampleLevels.map((manifest) => (
              <article key={manifest.levelId} className="oq-level-card">
                <h3>{manifest.name}</h3>
                <p className="oq-level-card__meta">
                  {manifest.checkpoints.length} checkpoint{manifest.checkpoints.length === 1 ? "" : "s"}
                </p>
                <div className="oq-actions">
                  <button
                    type="button"
                    className="oq-button oq-button--primary"
                    onClick={() => onPlaySample(manifest)}
                  >
                    Play now
                  </button>
                  <button
                    type="button"
                    className="oq-button oq-button--secondary"
                    onClick={() => onEditSample(manifest)}
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="oq-panel">
        <h2>Your saved levels</h2>
        {savedError ? (
          <p className="oq-error-text">{savedError}</p>
        ) : !savedLevels ? (
          <p className="oq-empty-hint">Loading saved levels…</p>
        ) : savedLevels.length === 0 ? (
          <p className="oq-empty-hint">No saved levels yet — create one from photos below.</p>
        ) : (
          <div className="oq-card-grid">
            {savedLevels.map((manifest) => (
              <article key={manifest.levelId} className="oq-level-card">
                <h3>{manifest.name}</h3>
                <p className="oq-level-card__meta">
                  {manifest.checkpoints.length} checkpoint{manifest.checkpoints.length === 1 ? "" : "s"} ·{" "}
                  {manifest.courseValidation.status}
                </p>
                <div className="oq-actions">
                  <button
                    type="button"
                    className="oq-button oq-button--primary"
                    onClick={() => onPlaySavedLevel(manifest)}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    className="oq-button oq-button--secondary"
                    onClick={() => onEditSavedLevel(manifest)}
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="oq-panel">
        <h2>Create a new level</h2>
        <div className="oq-actions">
          <button type="button" className="oq-button oq-button--primary" onClick={onCreateFromPhotos}>
            From photos
          </button>
          <label className="oq-button oq-button--secondary">
            {importing ? "Importing…" : "Import a GLB file"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,model/gltf-binary"
              className="oq-visually-hidden"
              onChange={(event) => handleImportFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {importError ? <p className="oq-error-text">{importError}</p> : null}
      </section>
    </div>
  );
}
