import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PhotoReference, SceneManifest } from "@shared/index.js";
import { describeApiError, getAsset } from "../api.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { attachProvenance, resolveAssetForManifest } from "../manifestProvenance.js";

/**
 * Scene preparation owns `src/scene`; this screen assumes a barrel export
 * at `src/scene/index.ts` re-exporting `prepareAsset`. Flagged to Astra as
 * a contract detail worth confirming — adjust this import if the scene
 * worker lands it under a different path.
 */
const scenePreparationModule = () => import("../../scene/index.js");

const LevelEditor = lazy(() =>
  import("../../editor/LevelEditor.js").then((mod) => ({ default: mod.LevelEditor })),
);

export type PreparationSource =
  | { kind: "asset"; assetId: string; sourcePhotos?: PhotoReference[] }
  | { kind: "manifest"; manifest: SceneManifest };

interface PreparationScreenProps {
  source: PreparationSource;
  onPlay: (manifest: SceneManifest) => void;
  onSave: (manifest: SceneManifest) => Promise<void>;
  onBack: () => void;
}

const STAGE_TEXT: Record<"downloading" | "decoding" | "analyzing" | "validating", string> = {
  downloading: "Downloading the generated model…",
  decoding: "Decoding the 3D model…",
  analyzing: "Analyzing surfaces for a playable course…",
  validating: "Validating the checkpoint route…",
};

export function PreparationScreen({ source, onPlay, onSave, onBack }: PreparationScreenProps) {
  const [manifest, setManifest] = useState<SceneManifest | null>(
    source.kind === "manifest" ? source.manifest : null,
  );
  const [candidates, setCandidates] = useState<SceneManifest[]>([]);
  const [stage, setStage] = useState<string>("Preparing…");
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (source.kind === "manifest") return;
    let cancelled = false;
    const { assetId, sourcePhotos } = source;

    async function run() {
      try {
        setError(null);
        setStage("Locating the generated asset…");
        const asset = await getAsset(assetId);
        if (cancelled) return;

        const { cleanAsset, sourcePhotos: resolvedSourcePhotos } = resolveAssetForManifest(
          asset,
          sourcePhotos,
        );

        const { prepareAsset } = await scenePreparationModule();
        if (cancelled) return;

        // The scene loader evicts failed cache entries on its own, so a
        // plain retry with the real, stable asset URL is enough — no
        // client-side cache-busting needed.
        const result = await prepareAsset(
          asset.url,
          {},
          (nextStage: "downloading" | "decoding" | "analyzing" | "validating") => {
            if (!cancelled) setStage(STAGE_TEXT[nextStage]);
          },
        );
        if (cancelled) return;

        setManifest(attachProvenance(result.manifest, cleanAsset, resolvedSourcePhotos));
        setCandidates(
          (result.courseCandidates ?? []).map((candidate: SceneManifest) =>
            attachProvenance(candidate, cleanAsset, resolvedSourcePhotos),
          ),
        );
      } catch (err) {
        if (!cancelled) setError(describeApiError(err));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [source, retryAttempt]);

  const candidateOptions = useMemo(() => {
    if (!manifest) return [];
    const primary = manifest;
    return [primary, ...candidates.filter((c) => c !== primary)];
  }, [manifest, candidates]);

  async function handleSave(next: SceneManifest) {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(next);
      setManifest(next);
    } catch (err) {
      setSaveError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="oq-screen oq-screen--preparation">
        <div className="oq-panel oq-panel--error">
          <p className="oq-error-text">{error}</p>
          <div className="oq-actions">
            <button
              type="button"
              className="oq-button oq-button--primary"
              onClick={() => setRetryAttempt((n) => n + 1)}
            >
              Retry
            </button>
            <button type="button" className="oq-button oq-button--ghost" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="oq-screen oq-screen--preparation">
        <LoadingScreen stage={stage} />
      </div>
    );
  }

  return (
    <div className="oq-screen oq-screen--preparation">
      <header className="oq-screen__header">
        <button type="button" className="oq-button oq-button--ghost" onClick={onBack}>
          ← Back
        </button>
        <h1>Prepare your level</h1>
      </header>

      {candidateOptions.length > 1 ? (
        <section className="oq-panel">
          <h2>Course candidates</h2>
          <p className="oq-subtitle">Pick a starting course to refine, or edit any of them below.</p>
          <div className="oq-capability-list" role="radiogroup" aria-label="Course candidate">
            {candidateOptions.map((candidate, i) => (
              <label
                key={`${candidate.levelId}-${i}`}
                className={`oq-capability-card${candidate === manifest ? " oq-capability-card--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="candidate"
                  checked={candidate === manifest}
                  onChange={() => setManifest(candidate)}
                />
                <span className="oq-capability-card__title">
                  {candidate.checkpoints.length} checkpoint{candidate.checkpoints.length === 1 ? "" : "s"}
                </span>
                <span className="oq-capability-card__meta">
                  Course status: {candidate.courseValidation.status}
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {saveError ? <p className="oq-error-text">{saveError}</p> : null}

      <Suspense fallback={<LoadingScreen stage="Loading the level editor…" />}>
        <LevelEditor manifest={manifest} onSave={handleSave} onPlay={onPlay} onBack={onBack} />
      </Suspense>
      {saving ? <p className="oq-warning-text">Saving…</p> : null}
    </div>
  );
}
