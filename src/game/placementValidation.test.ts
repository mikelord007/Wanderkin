import { describe, expect, it } from "vitest";
import { createEmptyManifest, type LevelExperience, type SceneManifest } from "@shared/index.js";
import { validateExperiencePlacements } from "./placementValidation.js";

function raceManifest(checkpointX: number): SceneManifest {
  const manifest = createEmptyManifest({ levelId: "repair-test", name: "Repair test", seed: "repair", movementConfigId: "default-v1" });
  const experience: LevelExperience = {
    schemaVersion: 1,
    style: { id: "cartoon", definitionVersion: 1 },
    mode: { kind: "race", countdownSeconds: 3, orderedCheckpointIds: ["checkpoint-1"], restartPolicy: "full-reset" },
    quest: { schemaVersion: 1, title: "Race", intro: "Race.", objective: "Reach the checkpoint." },
    collectibles: [], finishPortal: null, initialColorRestoration: 1,
  };
  return {
    ...manifest,
    entities: [{
      id: "floor", kind: "floor", transform: { position: [0, -0.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      dimensions: [10, 0.4, 10], collider: { kind: "box", halfExtents: [5, 0.2, 5] }, addedBy: "game",
    }],
    spawn: { position: [0, 0.37, 0], headingRadians: 0 },
    checkpoints: [{ id: "checkpoint-1", order: 0, position: [checkpointX, 0.37, 0], triggerRadius: 0.4, safeRespawn: { position: [checkpointX, 0.37, 0], headingRadians: 0 } }],
    experience,
  };
}

describe("experience placement validation", () => {
  it("returns a display-ready repair message for an unreachable checkpoint", () => {
    const result = validateExperiencePlacements(raceManifest(25), new Map());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({
      entityId: "checkpoint-1",
      kind: "checkpoint",
      code: "unreachable",
      message: "Move this checkpoint closer to the previous platform.",
    });
  });

  it("accepts the same checkpoint when it is on the reachable floor", () => {
    expect(validateExperiencePlacements(raceManifest(1), new Map()).ok).toBe(true);
  });
});
