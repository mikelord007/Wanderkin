import { migrateSceneManifest, type SceneManifest } from "@shared/index.js";

/** Creates an unsaved Race run without mutating the source world or assets. */
export function createRaceVariant(manifest: SceneManifest): SceneManifest {
  const hydrated = migrateSceneManifest(manifest);
  const orderedCheckpointIds = [...hydrated.checkpoints]
    .sort((a, b) => a.order - b.order)
    .map((checkpoint) => checkpoint.id);
  return {
    ...hydrated,
    experience: {
      ...hydrated.experience,
      mode: {
        kind: "race",
        countdownSeconds: 3,
        orderedCheckpointIds,
        ...(hydrated.experience.finishPortal
          ? { finishPortalId: hydrated.experience.finishPortal.id }
          : {}),
        restartPolicy: "full-reset",
      },
      quest: {
        ...hydrated.experience.quest,
        objective: hydrated.experience.finishPortal
          ? `Reach all ${orderedCheckpointIds.length} checkpoints in order, then enter the portal.`
          : `Reach all ${orderedCheckpointIds.length} checkpoints in order.`,
      },
      finishPortal: hydrated.experience.finishPortal
        ? { ...hydrated.experience.finishPortal, activation: "all-race-checkpoints" }
        : null,
      initialColorRestoration: 1,
    },
  };
}
