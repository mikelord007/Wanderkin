import { describe, expect, it } from "vitest";
import { createEmptyManifest } from "@shared/index.js";
import { repairGuidanceFor } from "./repairGuidance.js";

function manifest() {
  return createEmptyManifest({
    levelId: "repair-level",
    name: "Repair world",
    seed: "repair-seed",
    movementConfigId: "default-v1",
  });
}

describe("repairGuidanceFor", () => {
  it("does not route a usable course through guided repair", () => {
    expect(repairGuidanceFor(manifest())).toBeNull();
  });

  it("focuses a reported route problem on the last checkpoint", () => {
    const input = manifest();
    input.checkpoints = [
      {
        id: "checkpoint-1",
        order: 0,
        position: [1, 1, 1],
        triggerRadius: 0.5,
        safeRespawn: { position: [1, 1, 1], headingRadians: 0 },
      },
    ];
    input.courseValidation = { status: "failed" };

    expect(repairGuidanceFor(input, [{
      entityId: "checkpoint-1",
      kind: "checkpoint",
      code: "unreachable",
      message: "Move this checkpoint closer to the previous platform.",
    }])).toEqual({
      message: "Move this checkpoint closer to the previous platform.",
      placementMode: { kind: "checkpoint", checkpointId: "checkpoint-1" },
    });
  });

  it("does not invent an entity focus when typed validator output is unavailable", () => {
    const input = manifest();
    input.courseValidation = { status: "failed", evidence: "No safe surface found." };
    expect(repairGuidanceFor(input)).toEqual({
      message: "Reload the course check to identify the placement that needs attention.",
      placementMode: null,
    });
  });
});
