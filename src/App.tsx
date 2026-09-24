import { useCallback, useState } from "react";
import type { GenerationJob, PublishedLevelVersion, SceneManifest } from "@shared/index.js";
import { StartScreen } from "./ui/screens/StartScreen.js";
import { PhotosScreen } from "./ui/screens/PhotosScreen.js";
import { GenerationScreen } from "./ui/screens/GenerationScreen.js";
import { PreparationScreen, type PreparationSource } from "./ui/screens/PreparationScreen.js";
import { PlayScreen } from "./ui/screens/PlayScreen.js";
import { FinishScreen } from "./ui/screens/FinishScreen.js";
import { FriendLandingScreen } from "./ui/screens/FriendLandingScreen.js";
import { publishedManifestForPlay, shareIdFromPath } from "./ui/shareRouting.js";
import {
  clearActiveSource,
  clearPendingSubmission,
  loadActiveSource,
  resolveResumeState,
  saveActiveSource,
} from "./ui/jobStorage.js";
import { createLevel, downloadLevelBundle, saveLevel } from "./ui/api.js";
import { loadActiveCreation } from "./ui/creationStorage.js";

type Screen =
  | { name: "start" }
  | { name: "friend"; shareId: string }
  | { name: "photos" }
  | { name: "generation"; jobId: string }
  | { name: "preparation"; source: PreparationSource; isNew: boolean }
  | { name: "play"; manifest: SceneManifest; publication?: PublishedLevelVersion }
  | { name: "finish"; manifest: SceneManifest; publication?: PublishedLevelVersion };

function initialScreen(): Screen {
  const shareId = shareIdFromPath(window.location.pathname);
  if (shareId) return { name: "friend", shareId };
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
  const creation = loadActiveCreation();
  if (creation && creation.step !== "ready") return { name: "photos" };
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
    // Leaving progress never cancels or forgets durable work. My worlds can
    // reopen the same application job without another submission.
    setScreen({ name: "start" });
  }, []);

  const handleSavePreparedLevel = useCallback(
    async (manifest: SceneManifest) => {
      if (screen.name !== "preparation") {
        throw new Error("Level saving is only available from the preparation screen.");
      }
      const saved = screen.isNew ? await createLevel(manifest) : await saveLevel(manifest.levelId, manifest);
      // The source photos are now durable inside the saved SceneManifest —
      // the transient reload-recovery record is no longer needed.
      clearActiveSource();
      setScreen({ name: "preparation", source: { kind: "manifest", manifest: saved }, isNew: false });
      return saved;
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
          onImportLevelBundleReady={(manifest) => {
            clearActiveSource();
            clearPendingSubmission();
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false });
          }}
        />
      );

    case "friend":
      return (
        <FriendLandingScreen
          shareId={screen.shareId}
          onPlay={(publication) =>
            setScreen({
              name: "play",
              manifest: publishedManifestForPlay(publication),
              publication,
            })
          }
          onHome={goStart}
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
          isNew={screen.isNew}
          onPlay={(manifest) => setScreen({ name: "play", manifest })}
          onSave={handleSavePreparedLevel}
          onExport={(manifest) => downloadLevelBundle(manifest.levelId, manifest.name)}
          onBack={handlePreparationBack}
        />
      );

    case "play":
      return (
        <PlayScreen
          manifest={screen.manifest}
          onExit={() =>
            screen.publication
              ? setScreen({ name: "friend", shareId: screen.publication.shareId })
              : goStart()
          }
          onComplete={() =>
            setScreen(
              screen.publication
                ? { name: "finish", manifest: screen.manifest, publication: screen.publication }
                : { name: "finish", manifest: screen.manifest },
            )
          }
        />
      );

    case "finish":
      return (
        <FinishScreen
          manifest={screen.manifest}
          isShared={Boolean(screen.publication)}
          onReplay={() =>
            setScreen(
              screen.publication
                ? { name: "play", manifest: screen.manifest, publication: screen.publication }
                : { name: "play", manifest: screen.manifest },
            )
          }
          onBackToLevel={() =>
            screen.publication
              ? setScreen({ name: "friend", shareId: screen.publication.shareId })
              : setScreen({
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
