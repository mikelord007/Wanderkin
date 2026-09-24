import type { SceneManifest } from "@shared/index.js";
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
export function repairGuidanceFor(manifest: SceneManifest): RepairGuidance | null {
  if (manifest.courseValidation.status !== "failed") return null;

  const details = `${manifest.courseValidation.uncertaintyNotes ?? ""} ${manifest.courseValidation.evidence ?? ""}`
    .toLowerCase();
  const checkpoints = [...manifest.checkpoints].sort((a, b) => a.order - b.order);
  const checkpoint = checkpoints.at(-1);

  if (checkpoint && /checkpoint|route|reach|jump|platform/.test(details)) {
    return {
      message: "Move this checkpoint closer to the previous platform.",
      placementMode: { kind: "checkpoint", checkpointId: checkpoint.id },
    };
  }
  if (/spawn|start/.test(details)) {
    return {
      message: "Move the starting point onto a safe, walkable surface.",
      placementMode: "spawn",
    };
  }
  if (manifest.experience?.finishPortal && /finish|portal|goal/.test(details)) {
    return {
      message: "Move the finish portal onto a reachable surface.",
      placementMode: "finish-portal",
    };
  }
  if (checkpoint) {
    return {
      message: "Move the highlighted checkpoint to reconnect the course.",
      placementMode: { kind: "checkpoint", checkpointId: checkpoint.id },
    };
  }
  return {
    message: "Move the starting point onto a safe, walkable surface.",
    placementMode: "spawn",
  };
}
