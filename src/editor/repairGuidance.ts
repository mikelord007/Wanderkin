import type { SceneManifest } from "@shared/index.js";
import type { PlacementRepairIssue } from "../game/placementValidation.js";
import type { PlacementMode } from "./Preview3D.js";

export interface RepairGuidance {
  message: string;
  placementMode: PlacementMode;
}

/**
 * Turns conservative course-check output into one plain-language first action.
 * The technical evidence remains available in the editor, but it is never the
 * first thing a player has to interpret.
 */
export function repairGuidanceFor(
  manifest: SceneManifest,
  issues: readonly PlacementRepairIssue[] = [],
): RepairGuidance | null {
  const issue = issues[0];
  if (issue) {
    const placementMode: PlacementMode =
      issue.kind === "checkpoint"
        ? { kind: "checkpoint", checkpointId: issue.entityId }
        : issue.kind === "color-fragment"
          ? { kind: "collectible", collectibleId: issue.entityId }
          : issue.kind === "finish-portal"
            ? "finish-portal"
            : manifest.checkpoints.some((checkpoint) => checkpoint.id === issue.entityId)
              ? { kind: "checkpoint", checkpointId: issue.entityId }
              : "spawn";
    return { message: issue.message, placementMode };
  }
  if (manifest.courseValidation.status !== "failed") return null;
  return {
    message: "Reload the course check to identify the placement that needs attention.",
    placementMode: null,
  };
}
