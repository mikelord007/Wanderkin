import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PhotoReference, SceneManifest } from "@shared/index.js";
import { describeApiError, getAsset } from "../api.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { courseCandidateOptions, replaceSavedCandidate } from "../courseCandidates.js";
import { attachProvenance, resolveAssetForManifest } from "../manifestProvenance.js";
import { loadActiveCreation, saveCreationRecord } from "../creationStorage.js";
import { withCreationUpdate } from "../creationFlow.js";
import { WorldReadyScreen } from "./WorldReadyScreen.js";
import { repairGuidanceFor, type RepairGuidance } from "../../editor/repairGuidance.js";
import "../../editor/editor.css";

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
  isNew: boolean;
  onPlay: (manifest: SceneManifest) => void;
  onSave: (manifest: SceneManifest) => Promise<SceneManifest>;
  onExport: (manifest: SceneManifest) => Promise<void>;
  onBack: () => void;
}

const STAGE_TEXT: Record<"downloading" | "decoding" | "analyzing" | "validating", string> = {
  downloading: "Downloading the generated model…",
  decoding: "Decoding the 3D model…",
  analyzing: "Analyzing surfaces for a playable course…",
  validating: "Validating the checkpoint route…",
};

export function PreparationScreen({ source, isNew, onPlay, onSave, onExport, onBack }: PreparationScreenProps) {
  const [primaryManifest, setPrimaryManifest] = useState<SceneManifest | null>(
    source.kind === "manifest" ? source.manifest : null,
  );
  const [manifest, setManifest] = useState<SceneManifest | null>(
    source.kind === "manifest" ? source.manifest : null,
  );
  const [candidates, setCandidates] = useState<SceneManifest[]>([]);
  const [stage, setStage] = useState<string>("Preparing…");
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState(source.kind === "manifest");
  const [repairFocus, setRepairFocus] = useState<RepairGuidance | null>(
    source.kind === "manifest" ? repairGuidanceFor(source.manifest) : null,
  );

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

        const preparedPrimary = attachProvenance(result.manifest, cleanAsset, resolvedSourcePhotos);
        const preparedCandidates = (result.courseCandidates ?? []).map((candidate: SceneManifest) =>
          attachProvenance(candidate, cleanAsset, resolvedSourcePhotos),
        );
        setPrimaryManifest(preparedPrimary);
        setManifest(preparedPrimary);
        setCandidates(preparedCandidates);
        const creation = loadActiveCreation();
        if (creation) saveCreationRecord(withCreationUpdate(creation, { step: "ready", title: preparedPrimary.name }));
        const guidance = repairGuidanceFor(preparedPrimary);
        setRepairFocus(guidance);
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
    return courseCandidateOptions(primaryManifest, candidates);
  }, [primaryManifest, candidates]);

  async function handleSave(next: SceneManifest): Promise<SceneManifest> {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave(next);
      setPrimaryManifest((current) => (current?.levelId === next.levelId ? saved : current));
      setCandidates((current) => replaceSavedCandidate(current, next.levelId, saved));
      setManifest(saved);
      return saved;
    } catch (err) {
      setSaveError(describeApiError(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function selectCandidate(candidate: SceneManifest) {
    const guidance = repairGuidanceFor(candidate);
    setManifest(candidate);
    setRepairFocus(guidance);
    setEditing(false);
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

  if (!editing) {
    return <WorldReadyScreen
      manifest={manifest}
      onEnter={() => onPlay(manifest)}
      onAdjustCourse={() => {
        setRepairFocus(repairGuidanceFor(manifest));
        setEditing(true);
      }}
      onBack={onBack}
    />;
  }

  return (
    <div className="oq-screen oq-screen--preparation">
      <header className="oq-screen__header">
        <button type="button" className="oq-button oq-button--ghost" onClick={onBack}>
          ← Back
        </button>
        <h1>Adjust your course</h1>
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
                  onChange={() => selectCandidate(candidate)}
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
        <LevelEditor
          key={`${manifest.levelId}-${repairFocus?.message ?? "manual"}`}
          manifest={manifest}
          isPersisted={!isNew}
          onSave={handleSave}
          onExport={onExport}
          onPlay={onPlay}
          onBack={() => {
            if (source.kind === "asset") {
              setRepairFocus(repairGuidanceFor(manifest));
              setEditing(false);
            } else onBack();
          }}
          repairFocus={repairFocus}
        />
      </Suspense>
      {saving ? <p className="oq-warning-text">Saving…</p> : null}
    </div>
  );
}
