import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PhotoReference, SceneManifest } from "@shared/index.js";
import { describeApiError, getAsset } from "../api.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { courseCandidateOptions, replaceSavedCandidate } from "../courseCandidates.js";
import { attachProvenance, resolveAssetForManifest } from "../manifestProvenance.js";
import { repairGuidanceFor, type RepairGuidance } from "../../editor/repairGuidance.js";
import { validateExperiencePlacements } from "../../game/placementValidation.js";
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
const Preview3D = lazy(() =>
  import("../../editor/Preview3D.js").then((mod) => ({ default: mod.Preview3D })),
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

async function validateForRepair(manifest: SceneManifest) {
  const scene = await scenePreparationModule();
  const geometry = new Map();
  try {
    const referenced = new Set(
      manifest.entities.flatMap((entity) => entity.kind === "generated-mesh" ? [entity.assetId] : []),
    );
    for (const asset of manifest.assets) {
      if (!referenced.has(asset.id)) continue;
      const loaded = scene.getCachedAsset(asset.url) ?? await scene.loadAsset(asset.url);
      geometry.set(asset.id, loaded.triangles);
    }
  } catch {
    // The shared validator will convert missing geometry into a typed,
    // display-ready repair issue instead of leaving a blank preview.
  }
  const result = validateExperiencePlacements(manifest, geometry);
  const validated = { ...manifest, courseValidation: result.validation };
  return { manifest: validated, guidance: repairGuidanceFor(validated, result.issues) };
}

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
  const [view, setView] = useState<"ready" | "editor">(source.kind === "manifest" ? "editor" : "ready");
  const [repairFocus, setRepairFocus] = useState<RepairGuidance | null>(
    null,
  );

  useEffect(() => {
    if (source.kind !== "manifest") return;
    let cancelled = false;
    void validateForRepair(source.manifest).then((checked) => {
      if (cancelled) return;
      setPrimaryManifest(checked.manifest);
      setManifest(checked.manifest);
      setRepairFocus(checked.guidance);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

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

        const primary = attachProvenance(result.manifest, cleanAsset, resolvedSourcePhotos);
        const candidateManifests = (result.courseCandidates ?? []).map((candidate: SceneManifest) =>
          attachProvenance(candidate, cleanAsset, resolvedSourcePhotos),
        );
        const checkedPrimary = await validateForRepair(primary);
        const checkedCandidates = await Promise.all(candidateManifests.map(validateForRepair));
        if (cancelled) return;
        const preparedPrimary = checkedPrimary.manifest;
        const preparedCandidates = checkedCandidates.map((checked) => checked.manifest);
        setPrimaryManifest(preparedPrimary);
        setManifest(preparedPrimary);
        setCandidates(preparedCandidates);
        const guidance = checkedPrimary.guidance;
        setRepairFocus(guidance);
        setView(guidance ? "editor" : "ready");
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
    void validateForRepair(candidate).then((checked) => {
      setManifest(checked.manifest);
      setRepairFocus(checked.guidance);
      setView(checked.guidance ? "editor" : "ready");
    });
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
        <h1>{view === "ready" ? `Welcome to ${manifest.experience?.quest.title ?? manifest.name}` : "Adjust your course"}</h1>
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

      {view === "ready" ? (
        <section className="oq-panel oq-world-ready" aria-labelledby="world-ready-title">
          <div className="oq-world-ready__copy">
            <p className="oq-kit-eyebrow">
              {manifest.courseValidation.status === "validated" ? "Course checked" : "Course prepared"}
            </p>
            <h2 id="world-ready-title">{manifest.experience?.quest.title ?? manifest.name}</h2>
            <p>{manifest.experience?.quest.intro ?? `Explore ${manifest.name}.`}</p>
            <p className="oq-world-ready__objective">
              {manifest.experience?.quest.objective ?? "Explore the world at your own pace."}
            </p>
            <div className="oq-actions">
              <button type="button" className="oq-button oq-button--primary" onClick={() => onPlay(manifest)}>
                Enter world
              </button>
              <button
                type="button"
                className="oq-button oq-button--secondary"
                onClick={() => {
                  setRepairFocus(null);
                  setView("editor");
                }}
              >
                Adjust course
              </button>
              <button
                type="button"
                className="oq-button oq-button--ghost"
                onClick={() => {
                  setRepairFocus(null);
                  setView("editor");
                }}
              >
                World settings
              </button>
            </div>
          </div>
          <div className="oq-world-ready__preview" aria-label="Rendered world preview">
            <Suspense fallback={<LoadingScreen stage="Loading your world preview…" />}>
              <Preview3D
                manifest={manifest}
                selectedEntityId={null}
                placementMode={null}
                onSurfaceClick={() => undefined}
                onLoadError={() => undefined}
                onBoundsReport={() => undefined}
              />
            </Suspense>
          </div>
        </section>
      ) : (
        <Suspense fallback={<LoadingScreen stage="Loading the level editor…" />}>
          <LevelEditor
            key={`${manifest.levelId}-${repairFocus?.message ?? "manual"}`}
            manifest={manifest}
            isPersisted={!isNew}
            onSave={handleSave}
            onExport={onExport}
            onPlay={onPlay}
            onBack={() => {
              if (source.kind === "asset" && !repairFocus) setView("ready");
              else onBack();
            }}
            repairFocus={repairFocus}
          />
        </Suspense>
      )}
      {saving ? <p className="oq-warning-text">Saving…</p> : null}
    </div>
  );
}
