import { useEffect, useRef, useState } from "react";
import type { SceneManifest } from "@shared/index.js";
import {
  describeApiError,
  downloadLevelBundle,
  importAsset,
  importLevelBundle,
  listLevels,
} from "../api.js";

interface StartScreenProps {
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample: (manifest: SceneManifest) => void;
  onPlaySavedLevel: (manifest: SceneManifest) => void;
  onEditSavedLevel: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
  onImportGlbReady: (assetId: string) => void;
  onImportLevelBundleReady: (manifest: SceneManifest) => void;
}

export function StartScreen({
  onPlaySample,
  onEditSample,
  onPlaySavedLevel,
  onEditSavedLevel,
  onCreateFromPhotos,
  onImportGlbReady,
  onImportLevelBundleReady,
}: StartScreenProps) {
  const [sampleLevels, setSampleLevels] = useState<SceneManifest[] | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const [savedLevels, setSavedLevels] = useState<SceneManifest[] | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);

  const [importingGlb, setImportingGlb] = useState(false);
  const [glbImportError, setGlbImportError] = useState<string | null>(null);
  const [importingBundle, setImportingBundle] = useState(false);
  const [bundleImportError, setBundleImportError] = useState<string | null>(null);
  const [exportingLevelId, setExportingLevelId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);

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

  async function handleImportGlb(file: File | null) {
    if (!file) return;
    setImportingGlb(true);
    setGlbImportError(null);
    try {
      const asset = await importAsset(file);
      onImportGlbReady(asset.id);
    } catch (error) {
      setGlbImportError(describeApiError(error));
    } finally {
      setImportingGlb(false);
      if (glbInputRef.current) glbInputRef.current.value = "";
    }
  }

  async function handleImportBundle(file: File | null) {
    if (!file) return;
    setImportingBundle(true);
    setBundleImportError(null);
    try {
      const imported = await importLevelBundle(file);
      onImportLevelBundleReady(imported);
    } catch (error) {
      setBundleImportError(describeApiError(error));
    } finally {
      setImportingBundle(false);
      if (bundleInputRef.current) bundleInputRef.current.value = "";
    }
  }

  async function handleExport(manifest: SceneManifest) {
    setExportingLevelId(manifest.levelId);
    setExportError(null);
    try {
      await downloadLevelBundle(manifest.levelId, manifest.name);
    } catch (error) {
      setExportError(describeApiError(error));
    } finally {
      setExportingLevelId(null);
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
                  <button
                    type="button"
                    className="oq-button oq-button--ghost"
                    onClick={() => handleExport(manifest)}
                    disabled={exportingLevelId !== null}
                  >
                    {exportingLevelId === manifest.levelId ? "Exporting…" : "Export"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {exportError ? <p className="oq-error-text">{exportError}</p> : null}
      </section>

      <section className="oq-panel">
        <h2>Create a new level</h2>
        <div className="oq-actions">
          <button type="button" className="oq-button oq-button--primary" onClick={onCreateFromPhotos}>
            From photos
          </button>
          <label className="oq-button oq-button--secondary">
            {importingGlb ? "Importing GLB…" : "Import a GLB file"}
            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,model/gltf-binary"
              className="oq-visually-hidden"
              disabled={importingGlb || importingBundle}
              onChange={(event) => handleImportGlb(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="oq-button oq-button--secondary">
            {importingBundle ? "Importing level…" : "Import level bundle"}
            <input
              ref={bundleInputRef}
              type="file"
              accept=".json,.objectquest.json,application/json,application/octet-stream"
              className="oq-visually-hidden"
              disabled={importingGlb || importingBundle}
              onChange={(event) => handleImportBundle(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {glbImportError ? <p className="oq-error-text">{glbImportError}</p> : null}
        {bundleImportError ? <p className="oq-error-text">{bundleImportError}</p> : null}
      </section>
    </div>
  );
}
