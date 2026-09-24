import { describe, expect, it } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import lostColors from "../../../shared/fixtures/lost-colors.json";
import { createRaceVariant } from "./raceVariant.js";

describe("createRaceVariant", () => {
  it("preserves the source and assets while creating ordered race data", () => {
    const source = lostColors as unknown as SceneManifest;
    const race = createRaceVariant(source);
    expect(source.experience?.mode.kind).toBe("collect");
    expect(race.assets).toStrictEqual(source.assets);
    expect(race.experience?.mode).toMatchObject({
      kind: "race",
      orderedCheckpointIds: ["checkpoint-1", "checkpoint-2", "checkpoint-3"],
      restartPolicy: "full-reset",
    });
    expect(race.experience?.finishPortal?.activation).toBe("all-race-checkpoints");
    expect(race.experience?.initialColorRestoration).toBe(1);
  });
});
