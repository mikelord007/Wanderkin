import { useCallback, useState } from "react";
import type { GenerationJob, SceneManifest } from "@shared/index.js";
import { StartScreen } from "./ui/screens/StartScreen.js";
import { PhotosScreen } from "./ui/screens/PhotosScreen.js";
import { GenerationScreen } from "./ui/screens/GenerationScreen.js";
import { PreparationScreen, type PreparationSource } from "./ui/screens/PreparationScreen.js";
import { PlayScreen } from "./ui/screens/PlayScreen.js";
import { FinishScreen } from "./ui/screens/FinishScreen.js";
import { clearActiveJobId, loadActiveJobId, saveActiveJobId } from "./ui/jobStorage.js";
import { createLevel, saveLevel } from "./ui/api.js";

type Screen =
  | { name: "start" }
  | { name: "photos" }
  | { name: "generation"; jobId: string }
  | { name: "preparation"; source: PreparationSource; isNew: boolean }
  | { name: "play"; manifest: SceneManifest }
  | { name: "finish"; manifest: SceneManifest };

function initialScreen(): Screen {
  const resumeJobId = loadActiveJobId();
  return resumeJobId ? { name: "generation", jobId: resumeJobId } : { name: "start" };
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
    saveActiveJobId(jobId);
    setScreen({ name: "generation", jobId });
  }, []);

  const handleJobReady = useCallback((job: GenerationJob) => {
    clearActiveJobId();
    if (!job.resultAssetId) {
      setScreen({ name: "start" });
      return;
    }
    setScreen({
      name: "preparation",
      source: { kind: "asset", assetId: job.resultAssetId },
      isNew: true,
    });
  }, []);

  const handleJobCancelled = useCallback(() => {
    clearActiveJobId();
    setScreen({ name: "photos" });
  }, []);

  const handleSavePreparedLevel = useCallback(
    async (manifest: SceneManifest) => {
      if (screen.name !== "preparation") return;
      const saved = screen.isNew ? await createLevel(manifest) : await saveLevel(manifest.levelId, manifest);
      setScreen({ name: "preparation", source: { kind: "manifest", manifest: saved }, isNew: false });
    },
    [screen],
  );

  switch (screen.name) {
    case "start":
      return (
        <StartScreen
          onPlaySample={(manifest) => setScreen({ name: "play", manifest })}
          onPlaySavedLevel={(manifest) => setScreen({ name: "play", manifest })}
          onEditSavedLevel={(manifest) =>
            setScreen({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false })
          }
          onCreateFromPhotos={() => setScreen({ name: "photos" })}
          onImportGlbReady={(assetId) =>
            setScreen({ name: "preparation", source: { kind: "asset", assetId }, isNew: true })
          }
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
          onBack={goStart}
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
