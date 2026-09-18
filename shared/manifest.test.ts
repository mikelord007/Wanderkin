import { describe, expect, it } from "vitest";
import { createEmptyManifest } from "./manifest.js";
import { SCENE_MANIFEST_SCHEMA_VERSION } from "./schema-version.js";
import { COORDINATE_CONVENTION } from "./geometry.js";
import { isTerminalJobState } from "./job.js";

describe("createEmptyManifest", () => {
  it("produces a schema-versioned manifest with the shared coordinate convention", () => {
    const manifest = createEmptyManifest({
      levelId: "level-1",
      name: "Test Level",
      seed: "seed-1",
      movementConfigId: "default-v1",
    });

    expect(manifest.schemaVersion).toBe(SCENE_MANIFEST_SCHEMA_VERSION);
    expect(manifest.coordinateConvention).toBe(COORDINATE_CONVENTION);
    expect(manifest.courseValidation.status).toBe("unvalidated");
    expect(manifest.checkpoints).toHaveLength(0);
  });
});

describe("isTerminalJobState", () => {
  it("treats ready and failed as terminal, others as in-progress", () => {
    expect(isTerminalJobState("ready")).toBe(true);
    expect(isTerminalJobState("failed")).toBe(true);
    expect(isTerminalJobState("generating")).toBe(false);
    expect(isTerminalJobState("queued")).toBe(false);
  });
});
