import { useCallback, useState } from "react";
import type { GenerationJob, SceneManifest } from "@shared/index.js";
import { StartScreen } from "./ui/screens/StartScreen.js";
import { PhotosScreen } from "./ui/screens/PhotosScreen.js";
import { GenerationScreen } from "./ui/screens/GenerationScreen.js";
import { PreparationScreen, type PreparationSource } from "./ui/screens/PreparationScreen.js";
import { PlayScreen } from "./ui/screens/PlayScreen.js";
import { FinishScreen } from "./ui/screens/FinishScreen.js";
import {
  clearActiveSource,
  clearPendingSubmission,
  loadActiveSource,
  resolveResumeState,
  saveActiveSource,
} from "./ui/jobStorage.js";
import { createLevel, saveLevel } from "./ui/api.js";

type Screen =
  | { name: "start" }
  | { name: "photos" }
  | { name: "generation"; jobId: string }
  | { name: "preparation"; source: PreparationSource; isNew: boolean }
  | { name: "play"; manifest: SceneManifest }
  | { name: "finish"; manifest: SceneManifest };

function initialScreen(): Screen {
  const resume = resolveResumeState();
  if (resume.screen === "generation") return { name: "generation", jobId: resume.jobId };
  if (resume.screen === "preparation") {
    const { assetId, photos } = resume;
    return {
      name: "preparation",
      source: photos.length > 0 ? { kind: "asset", assetId, sourcePhotos: photos } : { kind: "asset", assetId },
      isNew: true,
    };
  }
  if (resume.screen === "photos") return { name: "photos" };
  return { name: "start" };
}

/**
 * Top-level router between start/photos/generation/preparation/play/finish.
 * Owns navigation only — each screen owns its own data fetching and
 * composes the scene/editor/game modules per docs/CONTRACTS.md.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);

  const goStart = useCallback(() => setScreen({ name: "start" }), []);

  const handleJobStarted = useCallback((jobId: string) => {
    // PhotosScreen already persisted the ActiveSource record (kind "job",
    // with its source photos) and cleared the PendingSubmission the moment
    // the POST response confirmed a durable job id — navigation is all
    // that's left.
    setScreen({ name: "generation", jobId });
  }, []);

  const handleJobReady = useCallback((job: GenerationJob) => {
    const current = loadActiveSource();
    const sourcePhotos = current?.kind === "job" ? current.photos : [];
    if (!job.resultAssetId) {
      clearActiveSource();
      setScreen({ name: "start" });
      return;
    }
    // Update the SAME record in place rather than clearing it — it stays
    // durable until the level is saved or the user explicitly leaves, so a
    // reload of a ready job returns straight to Preparation from this same
    // persisted asset instead of losing which source photos it came from
    // (AssetReference itself carries no photo refs).
    saveActiveSource({ kind: "job", jobId: job.id, photos: sourcePhotos, resultAssetId: job.resultAssetId });
    setScreen({
      name: "preparation",
      source:
        sourcePhotos.length > 0
          ? { kind: "asset", assetId: job.resultAssetId, sourcePhotos }
          : { kind: "asset", assetId: job.resultAssetId },
      isNew: true,
    });
  }, []);

  const handleJobCancelled = useCallback(() => {
    // Deliberately abandoning this job (not a reload) — clear both so the
    // next submission from Photos gets a fresh idempotency key instead of
    // resuming this one.
    clearActiveSource();
    clearPendingSubmission();
    setScreen({ name: "photos" });
  }, []);

  const handleSavePreparedLevel = useCallback(
    async (manifest: SceneManifest) => {
      if (screen.name !== "preparation") return;
      const saved = screen.isNew ? await createLevel(manifest) : await saveLevel(manifest.levelId, manifest);
      // The source photos are now durable inside the saved SceneManifest —
      // the transient reload-recovery record is no longer needed.
      clearActiveSource();
      setScreen({ name: "preparation", source: { kind: "manifest", manifest: saved }, isNew: false });
    },
    [screen],
  );

  const handlePreparationBack = useCallback(() => {
    // Only ever set for an unsaved asset-sourced preparation; a no-op
    // otherwise. Leaving without saving is a deliberate abandonment.
    clearActiveSource();
    setScreen({ name: "start" });
  }, []);

  switch (screen.name) {
    case "start":
      return (
        <StartScreen
          onPlaySample={(manifest) => setScreen({ name: "play", manifest })}
          onEditSample={(manifest) =>
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: true })
          }
          onPlaySavedLevel={(manifest) => setScreen({ name: "play", manifest })}
          onEditSavedLevel={(manifest) =>
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false })
          }
          onCreateFromPhotos={() => setScreen({ name: "photos" })}
          onImportGlbReady={(assetId) => {
            saveActiveSource({ kind: "import", assetId });
            setScreen({ name: "preparation", source: { kind: "asset", assetId }, isNew: true });
          }}
        />
      );

    case "photos":
      return <PhotosScreen onJobStarted={handleJobStarted} onBack={goStart} />;

    case "generation":
      return (
        <GenerationScreen jobId={screen.jobId} onReady={handleJobReady} onCancel={handleJobCancelled} />
      );

    case "preparation":
      return (
        <PreparationScreen
          source={screen.source}
          onPlay={(manifest) => setScreen({ name: "play", manifest })}
          onSave={handleSavePreparedLevel}
          onBack={handlePreparationBack}
        />
      );

    case "play":
      return (
        <PlayScreen
          manifest={screen.manifest}
          onExit={goStart}
          onComplete={() => setScreen({ name: "finish", manifest: screen.manifest })}
        />
      );

    case "finish":
      return (
        <FinishScreen
          manifest={screen.manifest}
          onReplay={() => setScreen({ name: "play", manifest: screen.manifest })}
          onBackToLevel={() =>
            setScreen({
              name: "preparation",
              source: { kind: "manifest", manifest: screen.manifest },
              isNew: false,
            })
          }
          onBackToStart={goStart}
        />
      );

    default:
      return null;
  }
}
