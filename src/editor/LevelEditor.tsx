import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MOVEMENT_CONFIG,
  identityTransform,
  type HelperEntity,
  type SceneManifest,
  type Vec3,
} from "@shared/index.js";
import { Preview3D, type EntityBounds, type PlacementMode } from "./Preview3D.js";
import {
  capsuleCenterYAboveSurface,
  calibratedUniformScale,
  degreesToRadians,
  floorAlignDeltaY,
  headingFromQuat,
  quatFromHeading,
  radiansToDegrees,
  averageScale,
  uniformVec3,
} from "./geometry.js";
import {
  addCheckpoint,
  addHelperEntity,
  removeCheckpoint,
  removeHelperEntity,
  reorderCheckpoint,
  setSpawn,
  updateCalibration,
  updateCheckpoint,
  updateEntityTransform,
  updateHelperDimensions,
} from "./manifestEdits.js";
import { clearDraft, resolveDraft, saveDraft, type EditorDraft } from "./draftStorage.js";
import { saveThenExport } from "./exportFlow.js";
import "./editor.css";

export interface LevelEditorProps {
  manifest: SceneManifest;
  isPersisted?: boolean;
  onSave: (manifest: SceneManifest) => SceneManifest | Promise<SceneManifest>;
  onExport?: (manifest: SceneManifest) => void | Promise<void>;
  onPlay: (manifest: SceneManifest) => void;
  onBack: () => void;
}

function initialEditorState(manifest: SceneManifest) {
  const resolution = resolveDraft(manifest.levelId, manifest.updatedAt);
  if (resolution.kind === "fresh") {
    return { manifest: resolution.draft.manifest, stalePrompt: null as EditorDraft | null, restoredFresh: true };
  }
  if (resolution.kind === "stale") {
    return { manifest, stalePrompt: resolution.draft, restoredFresh: false };
  }
  return { manifest, stalePrompt: null as EditorDraft | null, restoredFresh: false };
}

export function LevelEditor({
  manifest,
  isPersisted = true,
  onSave,
  onExport,
  onPlay,
  onBack,
}: LevelEditorProps) {
  const initial = useState(() => initialEditorState(manifest))[0];
  const baseUpdatedAtRef = useRef(manifest.updatedAt);

  const [workingManifest, setWorkingManifest] = useState<SceneManifest>(initial.manifest);
  const [savedManifestSnapshot, setSavedManifestSnapshot] = useState<SceneManifest | null>(
    isPersisted ? manifest : null,
  );
  const [stalePromptDraft, setStalePromptDraft] = useState<EditorDraft | null>(initial.stalePrompt);
  const [restoredFreshNotice, setRestoredFreshNotice] = useState(initial.restoredFresh);

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    () => workingManifest.entities.find((e) => e.kind === "generated-mesh")?.id ?? null,
  );
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [entityBounds, setEntityBounds] = useState<Record<string, EntityBounds>>({});
  const [previewErrors, setPreviewErrors] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const didMountRef = useRef(false);
  const skipNextDraftWriteRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (skipNextDraftWriteRef.current) {
      skipNextDraftWriteRef.current = false;
      return;
    }
    setExportNotice(null);
    saveDraft({
      levelId: workingManifest.levelId,
      baseUpdatedAt: baseUpdatedAtRef.current,
      manifest: workingManifest,
      savedAt: new Date().toISOString(),
    });
  }, [workingManifest]);

  const selectedEntity = useMemo(
    () => workingManifest.entities.find((e) => e.id === selectedEntityId) ?? null,
    [workingManifest.entities, selectedEntityId],
  );
  const selectedBounds = selectedEntityId ? entityBounds[selectedEntityId] : undefined;
  const hasUnsavedChanges = savedManifestSnapshot !== workingManifest;

  function acceptAuthoritativeSave(saved: SceneManifest, previousLevelId: string) {
    clearDraft(previousLevelId);
    if (saved.levelId !== previousLevelId) clearDraft(saved.levelId);
    baseUpdatedAtRef.current = saved.updatedAt;
    skipNextDraftWriteRef.current = true;
    setWorkingManifest(saved);
    setSavedManifestSnapshot(saved);
  }

  function handleSurfaceClick(point: Vec3, walkable: boolean) {
    if (!placementMode) return;
    if (!walkable) {
      setPlacementError("Choose a real upward-facing surface that is flat enough to stand on.");
      return;
    }
    setPlacementError(null);
    const capsuleY = capsuleCenterYAboveSurface(point[1], DEFAULT_MOVEMENT_CONFIG);
    const position: Vec3 = [point[0], capsuleY, point[2]];
    if (placementMode === "spawn") {
      setWorkingManifest((m) => setSpawn(m, { position, headingRadians: m.spawn.headingRadians }));
    } else {
      const checkpointId = placementMode.checkpointId;
      setWorkingManifest((m) =>
        updateCheckpoint(m, checkpointId, {
          position,
          safeRespawn: {
            position,
            headingRadians: m.checkpoints.find((checkpoint) => checkpoint.id === checkpointId)?.safeRespawn.headingRadians ?? 0,
          },
        }),
      );
    }
    setPlacementMode(null);
  }

  function handleBoundsReport(entityId: string, bounds: EntityBounds) {
    setEntityBounds((prev) => {
      const existing = prev[entityId];
      if (existing && existing.minY === bounds.minY && existing.sizeX === bounds.sizeX && existing.sizeZ === bounds.sizeZ) {
        return prev;
      }
      return { ...prev, [entityId]: bounds };
    });
  }

  function handleLoadError(entityId: string) {
    setPreviewErrors((prev) => (prev.has(entityId) ? prev : new Set(prev).add(entityId)));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setExportNotice(null);
    try {
      const previousLevelId = workingManifest.levelId;
      const saved = await Promise.resolve(onSave(workingManifest));
      acceptAuthoritativeSave(saved, previousLevelId);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save this level. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!onExport) return;
    setExporting(true);
    setSaveError(null);
    setExportNotice(hasUnsavedChanges ? "Saving the latest changes before export…" : "Preparing bundle…");
    try {
      const previousLevelId = workingManifest.levelId;
      await saveThenExport({
        workingManifest,
        needsSave: hasUnsavedChanges,
        onSave,
        onPersisted: (saved) => acceptAuthoritativeSave(saved, previousLevelId),
        onExport,
      });
      setExportNotice("Bundle downloaded.");
    } catch (err) {
      setExportNotice(null);
      setSaveError(err instanceof Error ? err.message : "Could not export this level. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function handleDiscardDraft() {
    clearDraft(manifest.levelId);
    setWorkingManifest(manifest);
    setStalePromptDraft(null);
    setRestoredFreshNotice(false);
  }

  function handleResumeStaleDraft() {
    if (!stalePromptDraft) return;
    setWorkingManifest(stalePromptDraft.manifest);
    setStalePromptDraft(null);
  }

  function handleDiscardStaleDraft() {
    if (!stalePromptDraft) return;
    clearDraft(manifest.levelId);
    setStalePromptDraft(null);
  }

  return (
    <div className="oq-editor">
      {stalePromptDraft ? (
        <div className="oq-editor__banner oq-editor__banner--warning">
          <p>
            You have unsaved edits from before, but this level's saved version has changed since then (maybe
            saved elsewhere). Resuming your draft could overwrite that newer save.
          </p>
          <div className="oq-editor__banner-actions">
            <button type="button" className="oq-button oq-button--secondary" onClick={handleResumeStaleDraft}>
              Resume my unsaved draft anyway
            </button>
            <button type="button" className="oq-button oq-button--ghost" onClick={handleDiscardStaleDraft}>
              Discard it, use the latest saved version
            </button>
          </div>
        </div>
      ) : null}

      {restoredFreshNotice && !stalePromptDraft ? (
        <div className="oq-editor__banner">
          <p>Restored your unsaved edits from before the reload.</p>
          <button type="button" className="oq-button oq-button--ghost" onClick={handleDiscardDraft}>
            Discard draft
          </button>
        </div>
      ) : null}

      <div className="oq-editor__layout">
        <div className="oq-editor__preview">
          <Preview3D
            manifest={workingManifest}
            selectedEntityId={selectedEntityId}
            placementMode={placementMode}
            onSurfaceClick={handleSurfaceClick}
            onLoadError={handleLoadError}
            onBoundsReport={handleBoundsReport}
          />
          {placementMode ? (
            <div className="oq-editor__placement-hint">
              Click a surface in the view to place{" "}
              {placementMode === "spawn" ? "the spawn point" : "this checkpoint"}.
              {placementError ? <span className="oq-error-text">{placementError}</span> : null}
              <button
                type="button"
                className="oq-button oq-button--ghost"
                onClick={() => {
                  setPlacementMode(null);
                  setPlacementError(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}
          {previewErrors.size > 0 ? (
            <p className="oq-editor__preview-note">
              {previewErrors.size} mesh{previewErrors.size === 1 ? "" : "es"} couldn't be previewed (shown as a
              placeholder box) — gameplay still uses the real asset.
            </p>
          ) : null}
        </div>

        <div className="oq-editor__panels">
          <ValidationPanel manifest={workingManifest} />

          <EntityPanel
            manifest={workingManifest}
            selectedEntity={selectedEntity}
            selectedBounds={selectedBounds}
            onSelect={setSelectedEntityId}
            onChange={(next) => setWorkingManifest(next)}
          />

          <SpawnCheckpointPanel
            manifest={workingManifest}
            placementMode={placementMode}
            onSetPlacementMode={(mode) => {
              setPlacementError(null);
              setPlacementMode(mode);
            }}
            onChange={(next) => setWorkingManifest(next)}
          />

          <HelperGeometryPanel manifest={workingManifest} onChange={(next) => setWorkingManifest(next)} />

          {saveError ? <p className="oq-error-text">{saveError}</p> : null}
          {savedNotice ? <p className="oq-editor__saved-notice">Saved.</p> : null}
          {exportNotice ? <p className="oq-editor__saved-notice">{exportNotice}</p> : null}
          {onExport && hasUnsavedChanges ? (
            <p className="oq-editor__meta">Export will save these changes first so the bundle is complete.</p>
          ) : null}

          <div className="oq-actions">
            <button type="button" className="oq-button oq-button--ghost" onClick={onBack}>
              Back
            </button>
            <button
              type="button"
              className="oq-button oq-button--secondary"
              onClick={handleSave}
              disabled={saving || exporting}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {onExport ? (
              <button
                type="button"
                className="oq-button oq-button--secondary"
                onClick={handleExport}
                disabled={saving || exporting}
              >
                {exporting ? "Exporting…" : hasUnsavedChanges ? "Save & export" : "Export"}
              </button>
            ) : null}
            <button
              type="button"
              className="oq-button oq-button--primary"
              onClick={() => onPlay(workingManifest)}
              disabled={saving || exporting}
            >
              Play
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Panels -----------------------------------------------------------

function ValidationPanel({ manifest }: { manifest: SceneManifest }) {
  const { status, checkedAt, evidence, uncertaintyNotes } = manifest.courseValidation;
  const label =
    status === "validated"
      ? "Automated check passed"
      : status === "failed"
        ? "Needs adjustment"
        : status === "manually-adjusted"
          ? "Play-test recommended"
          : "Not checked yet";
  const summary =
    status === "validated"
      ? "Automated reachability checks passed. A real play-test is still recommended."
      : status === "failed"
        ? "Automated checks found a route problem. Adjust the course before relying on it."
        : status === "manually-adjusted"
          ? "This course includes manual edits. Confirm the route in Play mode before relying on it."
          : "Reachability has not been checked. Play-test this course before relying on it.";
  const displayEvidence = evidence?.replace(/\s*\(see\s+[^)]+\)\.?/gi, ".");
  const hasTechnicalDetails = Boolean(displayEvidence || uncertaintyNotes || checkedAt);
  return (
    <section className="oq-panel oq-editor-panel">
      <h2>Course status</h2>
      <p className={`oq-editor__status-badge oq-editor__status-badge--${status}`}>{label}</p>
      <p className="oq-editor__validation-summary">{summary}</p>
      {hasTechnicalDetails ? (
        <details className="oq-editor__technical">
          <summary>Technical validation details</summary>
          <div className="oq-editor__technical-content">
            {uncertaintyNotes ? <p>{uncertaintyNotes}</p> : null}
            {displayEvidence ? <p>Evidence: {displayEvidence}</p> : null}
            {checkedAt ? <p>Checked: {new Date(checkedAt).toLocaleString()}</p> : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function EntityPanel({
  manifest,
  selectedEntity,
  selectedBounds,
  onSelect,
  onChange,
}: {
  manifest: SceneManifest;
  selectedEntity: SceneManifest["entities"][number] | null;
  selectedBounds: EntityBounds | undefined;
  onSelect: (id: string) => void;
  onChange: (manifest: SceneManifest) => void;
}) {
  const generatedMeshes = manifest.entities.filter((e) => e.kind === "generated-mesh");
  const [calibrationInput, setCalibrationInput] = useState("");
  const [calibrationDescription, setCalibrationDescription] = useState("");

  if (generatedMeshes.length === 0) {
    return (
      <section className="oq-panel oq-editor-panel">
        <h2>Model orientation</h2>
        <p className="oq-empty-hint">No generated mesh in this level.</p>
      </section>
    );
  }

  const heading =
    selectedEntity && selectedEntity.kind === "generated-mesh"
      ? radiansToDegrees(headingFromQuat(selectedEntity.transform.rotation))
      : 0;
  const scale =
    selectedEntity && selectedEntity.kind === "generated-mesh" ? averageScale(selectedEntity.transform.scale) : 1;

  return (
    <section className="oq-panel oq-editor-panel">
      <h2>Model orientation</h2>
      {generatedMeshes.length > 1 ? (
        <select value={selectedEntity?.id ?? ""} onChange={(e) => onSelect(e.target.value)}>
          {generatedMeshes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id}
            </option>
          ))}
        </select>
      ) : null}

      {selectedEntity && selectedEntity.kind === "generated-mesh" ? (
        <>
          <label className="oq-editor__field">
            Rotate (heading, degrees)
            <input
              type="number"
              step={5}
              value={Math.round(heading)}
              onChange={(e) => {
                const degrees = finiteInput(e.target.value, heading);
                onChange(
                  updateEntityTransform(manifest, selectedEntity.id, {
                    rotation: quatFromHeading(degreesToRadians(degrees)),
                  }),
                );
              }}
            />
          </label>

          <label className="oq-editor__field">
            Uniform scale
            <input
              type="number"
              step={0.05}
              min={0.01}
              value={Number(scale.toFixed(3))}
              onChange={(e) => {
                const nextScale = positiveInput(e.target.value, scale);
                onChange(updateEntityTransform(manifest, selectedEntity.id, { scale: uniformVec3(nextScale) }));
              }}
            />
          </label>

          <button
            type="button"
            className="oq-button oq-button--secondary"
            disabled={!selectedBounds}
            title={selectedBounds ? undefined : "Waiting for the preview to load"}
            onClick={() => {
              if (!selectedBounds) return;
              const delta = floorAlignDeltaY(selectedBounds.minY);
              const [px, py, pz] = selectedEntity.transform.position;
              onChange(
                updateEntityTransform(manifest, selectedEntity.id, { position: [px, py + delta, pz] }),
              );
            }}
          >
            Align to floor
          </button>
          {!selectedBounds ? (
            <p className="oq-editor__meta">Floor alignment needs the preview to finish loading.</p>
          ) : null}

          <div className="oq-editor__calibrate">
            <p className="oq-subtitle">
              Calibrate: if you know a real-world measurement (e.g. desk width), enter it here to rescale.
            </p>
            <label className="oq-editor__field">
              Feature description
              <input
                type="text"
                placeholder="e.g. desk width"
                value={calibrationDescription}
                onChange={(e) => setCalibrationDescription(e.target.value)}
              />
            </label>
            <label className="oq-editor__field">
              Real size (meters)
              <input
                type="number"
                step={0.05}
                min={0}
                value={calibrationInput}
                onChange={(e) => setCalibrationInput(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="oq-button oq-button--secondary"
              disabled={
                !selectedBounds ||
                !calibrationInput ||
                !Number.isFinite(Number(calibrationInput)) ||
                Number(calibrationInput) <= 0
              }
              title={selectedBounds ? undefined : "Waiting for the preview to load"}
              onClick={() => {
                if (!selectedBounds) return;
                const desired = Number(calibrationInput);
                if (!Number.isFinite(desired) || desired <= 0) return;
                const currentExtent = Math.max(selectedBounds.sizeX, selectedBounds.sizeZ);
                const newScale = calibratedUniformScale(scale, currentExtent, desired);
                const withTransform = updateEntityTransform(manifest, selectedEntity.id, {
                  scale: uniformVec3(newScale),
                });
                onChange(
                  updateCalibration(withTransform, {
                    assumedExtentMeters: manifest.calibration.assumedExtentMeters,
                    measuredDimension: {
                      description: calibrationDescription || "user-measured feature",
                      meters: desired,
                    },
                  }),
                );
              }}
            >
              Apply calibration
            </button>
          </div>

          {manifest.calibration.measuredDimension ? (
            <p className="oq-editor__meta">
              Calibrated against: {manifest.calibration.measuredDimension.description} ={" "}
              {manifest.calibration.measuredDimension.meters}m
            </p>
          ) : (
            <p className="oq-editor__meta">
              Using the default assumed extent ({manifest.calibration.assumedExtentMeters}m) — not a measured
              real-world scale.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

function SpawnCheckpointPanel({
  manifest,
  placementMode,
  onSetPlacementMode,
  onChange,
}: {
  manifest: SceneManifest;
  placementMode: PlacementMode;
  onSetPlacementMode: (mode: PlacementMode) => void;
  onChange: (manifest: SceneManifest) => void;
}) {
  const sortedCheckpoints = [...manifest.checkpoints].sort((a, b) => a.order - b.order);
  return (
    <section className="oq-panel oq-editor-panel">
      <h2>Spawn &amp; checkpoints</h2>

      <div className="oq-editor__row">
        <span>Spawn</span>
        <button
          type="button"
          className={`oq-button oq-button--secondary${placementMode === "spawn" ? " oq-button--active" : ""}`}
          onClick={() => onSetPlacementMode(placementMode === "spawn" ? null : "spawn")}
        >
          {placementMode === "spawn" ? "Click the view…" : "Place in view"}
        </button>
      </div>
      <PositionInputs
        position={manifest.spawn.position}
        onChange={(position) => onChange(setSpawn(manifest, { position, headingRadians: manifest.spawn.headingRadians }))}
      />
      <label className="oq-editor__field">
        Spawn heading (degrees)
        <input
          type="number"
          step={5}
          value={Number(radiansToDegrees(manifest.spawn.headingRadians).toFixed(1))}
          onChange={(event) =>
            onChange(
              setSpawn(manifest, {
                position: manifest.spawn.position,
                headingRadians: degreesToRadians(
                  finiteInput(event.target.value, radiansToDegrees(manifest.spawn.headingRadians)),
                ),
              }),
            )
          }
        />
      </label>

      <h3>Checkpoints ({sortedCheckpoints.length})</h3>
      {sortedCheckpoints.length === 0 ? <p className="oq-empty-hint">No checkpoints yet.</p> : null}
      <ol className="oq-editor__checkpoint-list">
        {sortedCheckpoints.map((checkpoint, index) => {
          const active =
            typeof placementMode === "object" && placementMode !== null && placementMode.checkpointId === checkpoint.id;
          return (
            <li key={checkpoint.id} className="oq-editor__checkpoint-item">
              <div className="oq-editor__row">
                <span>#{checkpoint.order + 1}</span>
                <button
                  type="button"
                  className={`oq-button oq-button--secondary${active ? " oq-button--active" : ""}`}
                  onClick={() => onSetPlacementMode(active ? null : { checkpointId: checkpoint.id })}
                >
                  {active ? "Click the view…" : "Place in view"}
                </button>
                <button
                  type="button"
                  className="oq-button oq-button--ghost"
                  disabled={index === 0}
                  onClick={() => onChange(reorderCheckpoint(manifest, checkpoint.id, "up"))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="oq-button oq-button--ghost"
                  disabled={index === sortedCheckpoints.length - 1}
                  onClick={() => onChange(reorderCheckpoint(manifest, checkpoint.id, "down"))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="oq-button oq-button--ghost"
                  onClick={() => onChange(removeCheckpoint(manifest, checkpoint.id))}
                >
                  Remove
                </button>
              </div>
              <PositionInputs
                position={checkpoint.position}
                onChange={(position) => onChange(updateCheckpoint(manifest, checkpoint.id, { position }))}
              />
              <label className="oq-editor__field">
                Trigger radius (m)
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={checkpoint.triggerRadius}
                  onChange={(e) =>
                    onChange(
                      updateCheckpoint(manifest, checkpoint.id, {
                        triggerRadius: positiveInput(e.target.value, checkpoint.triggerRadius),
                      }),
                    )
                  }
                />
              </label>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="oq-button oq-button--secondary"
        onClick={() => onChange(addCheckpoint(manifest, { position: manifest.spawn.position, triggerRadius: 0.5 }))}
      >
        Add checkpoint
      </button>
    </section>
  );
}

function PositionInputs({ position, onChange }: { position: Vec3; onChange: (position: Vec3) => void }) {
  return (
    <div className="oq-editor__vec3">
      {(["x", "y", "z"] as const).map((axis, index) => (
        <label key={axis} className="oq-editor__field oq-editor__field--compact">
          {axis.toUpperCase()}
          <input
            type="number"
            step={0.1}
            value={Number((position[index] ?? 0).toFixed(3))}
            onChange={(e) => {
              const next: Vec3 = [...position];
              (next as [number, number, number])[index] = finiteInput(e.target.value, position[index] ?? 0);
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function finiteInput(raw: string, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function positiveInput(raw: string, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const HELPER_KINDS = ["floor", "box", "ramp"] as const;

function HelperGeometryPanel({
  manifest,
  onChange,
}: {
  manifest: SceneManifest;
  onChange: (manifest: SceneManifest) => void;
}) {
  const helpers = manifest.entities.filter((e): e is HelperEntity => e.kind !== "generated-mesh");
  const [kind, setKind] = useState<(typeof HELPER_KINDS)[number]>("box");
  const [position, setPosition] = useState<Vec3>([0, 0.25, 0]);
  const [dimensions, setDimensions] = useState<Vec3>([1, 0.5, 1]);
  const [headingDegrees, setHeadingDegrees] = useState(0);

  return (
    <section className="oq-panel oq-editor-panel">
      <h2>Helper geometry (ramps &amp; platforms)</h2>
      <p className="oq-subtitle">
        Added game aids, not reconstructed furniture — always saved as distinct level geometry.
      </p>

      {helpers.length === 0 ? (
        <p className="oq-empty-hint">No helper geometry yet.</p>
      ) : (
        <ul className="oq-editor__helper-list">
          {helpers.map((entity) => {
            const dims = entity.dimensions;
            return (
              <li key={entity.id} className="oq-editor__row">
                <span>{entity.kind}</span>
                <div className="oq-editor__vec3">
                  {(["width", "height", "depth"] as const).map((label, index) => (
                    <label key={label} className="oq-editor__field oq-editor__field--compact">
                      {label}
                      <input
                        type="number"
                        step={0.1}
                        min={0.05}
                        value={Number((dims[index] ?? 0).toFixed(2))}
                        onChange={(e) => {
                          const next: [number, number, number] = [dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0];
                          next[index] = positiveInput(e.target.value, dims[index] ?? 0.05);
                          onChange(updateHelperDimensions(manifest, entity.id, next));
                        }}
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="oq-button oq-button--ghost"
                  onClick={() => onChange(removeHelperEntity(manifest, entity.id))}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="oq-editor__add-helper">
        <label className="oq-editor__field">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as (typeof HELPER_KINDS)[number])}>
            {HELPER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <PositionInputs position={position} onChange={setPosition} />
        <div className="oq-editor__vec3">
          {(["width", "height", "depth"] as const).map((label, index) => (
            <label key={label} className="oq-editor__field oq-editor__field--compact">
              {label}
              <input
                type="number"
                step={0.1}
                min={0.05}
                value={dimensions[index]}
                onChange={(e) => {
                  const next: Vec3 = [...dimensions];
                  (next as [number, number, number])[index] = positiveInput(
                    e.target.value,
                    dimensions[index] ?? 0.05,
                  );
                  setDimensions(next);
                }}
              />
            </label>
          ))}
        </div>
        {kind === "ramp" ? (
          <label className="oq-editor__field">
            Heading (degrees, around Y)
            <input
              type="number"
              step={5}
              value={headingDegrees}
              onChange={(e) => setHeadingDegrees(finiteInput(e.target.value, headingDegrees))}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="oq-button oq-button--secondary"
          onClick={() => {
            const rotation = kind === "ramp" ? quatFromHeading(degreesToRadians(headingDegrees)) : [0, 0, 0, 1] as const;
            onChange(
              addHelperEntity(manifest, {
                kind,
                transform: { ...identityTransform(), position, rotation },
                dimensions,
                collider:
                  kind === "ramp"
                    ? { kind: "triangle-mesh" }
                    : { kind: "box", halfExtents: [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2] },
              }),
            );
          }}
        >
          Add {kind}
        </button>
      </div>
    </section>
  );
}
