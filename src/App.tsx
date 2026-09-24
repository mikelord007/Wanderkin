import { useCallback, useState } from "react";
import type {
  GenerationJob,
  PublishedChallenge,
  PublishedLevelVersion,
  SceneManifest,
} from "@shared/index.js";
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
import { createLevel, downloadLevelBundle, publishLevel, saveLevel } from "./ui/api.js";
import { createRaceVariant } from "./game/modes/raceVariant.js";
import type { GameCompletionResult } from "./game/types.js";
import {
  loadActiveCreation,
  loadCreationWorldItems,
  setActiveCreationId,
} from "./ui/creationStorage.js";

type Screen =
  | { name: "start" }
  | { name: "friend"; shareId: string }
  | { name: "photos" }
  | { name: "generation"; jobId: string }
  | { name: "preparation"; source: PreparationSource; isNew: boolean }
  | { name: "play"; manifest: SceneManifest; publishable: boolean; publication?: PublishedLevelVersion }
  | {
      name: "finish";
      manifest: SceneManifest;
      result: GameCompletionResult;
      publishable: boolean;
      publication?: PublishedLevelVersion;
    };

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

function challengeFor(result: GameCompletionResult): PublishedChallenge {
  const target = result.bestMilliseconds ?? result.elapsedMilliseconds;
  return result.mode === "race" && target !== null && target > 0
    ? { kind: "race", targetMilliseconds: target, verification: "personal-unverified" }
    : { kind: "completion" };
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
          onPlaySample={(manifest) => setScreen({ name: "play", manifest, publishable: false })}
          onEditSample={(manifest) =>
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: true })
          }
          onPlaySavedLevel={(manifest) =>
            manifest.courseValidation.status === "failed"
              ? setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false })
              : setScreen({ name: "play", manifest, publishable: true })
          }
          onEditSavedLevel={(manifest) =>
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false })
          }
          onResumeDraft={(manifest, isPersisted) =>
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: !isPersisted })
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
          additionalWorldItems={loadCreationWorldItems()}
          onResumePendingWorld={(creationId) => {
            setActiveCreationId(creationId);
            setScreen({ name: "photos" });
          }}
          onRetryFailedWorld={(creationId) => {
            setActiveCreationId(creationId);
            setScreen({ name: "photos" });
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
              publishable: false,
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
          onPlay={(manifest) => setScreen({ name: "play", manifest, publishable: !screen.isNew })}
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
          onComplete={(result) =>
            setScreen(
              screen.publication
                ? {
                    name: "finish",
                    manifest: screen.manifest,
                    result,
                    publishable: false,
                    publication: screen.publication,
                  }
                : {
                    name: "finish",
                    manifest: screen.manifest,
                    result,
                    publishable: screen.publishable,
                  },
            )
          }
          {...(screen.publication ? { publishedVersionId: screen.publication.versionId } : {})}
        />
      );

    case "finish":
      return (
        <FinishScreen
          manifest={screen.manifest}
          result={screen.result}
          onReplay={() =>
            setScreen(
              screen.publication
                ? {
                    name: "play",
                    manifest: screen.manifest,
                    publishable: false,
                    publication: screen.publication,
                  }
                : { name: "play", manifest: screen.manifest, publishable: screen.publishable },
            )
          }
          {...(!screen.publication
            ? {
                onTryRace: () =>
                  setScreen({
                    name: "play",
                    manifest: createRaceVariant(screen.manifest),
                    publishable: screen.publishable,
                  }),
              }
            : {})}
          {...(screen.publishable
            ? {
                onShare: () => publishLevel(screen.manifest.levelId, challengeFor(screen.result), false),
              }
            : {})}
          onCreateAnother={screen.publication ? goStart : () => setScreen({ name: "photos" })}
        />
      );

    default:
      return null;
  }
}
