import { describe, expect, it } from "vitest";
import { createEmptyManifest } from "./manifest.js";
import { SCENE_MANIFEST_SCHEMA_VERSION } from "./schema-version.js";
import { COORDINATE_CONVENTION } from "./geometry.js";
import { isTerminalJobState } from "./job.js";
import legacyFixture from "./fixtures/legacy-scene-manifest-v1.json";
import { migrateSceneManifest, sceneManifestReaderSchema } from "./manifest-migration.js";
import lostColorsFixture from "./fixtures/lost-colors.json";
import generationJobCases from "./fixtures/generation-job-cases.json";
import workflowFixture from "./fixtures/world-workflow-v1.json";
import { SAMPLE_LEVELS } from "../src/scene/samples.js";

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

describe("legacy manifest compatibility", () => {
  it("round-trips supported biome metadata without changing the source or mission", () => {
    const input = { ...lostColorsFixture, biome: { id: "tropical", seed: "safe-seed" } };
    const parsed = migrateSceneManifest(input);
    expect(parsed.biome).toEqual(input.biome);
    expect(parsed.entities).toEqual(input.entities);
    expect(parsed.experience).toEqual(input.experience);
    expect(sceneManifestReaderSchema.safeParse({ ...input, biome: { id: "unknown", seed: "a" } }).success).toBe(false);
    for (const id of ["alpine", "autumn", "ember"]) {
      const themed = { ...lostColorsFixture, biome: { id, seed: "safe-seed" } };
      expect(migrateSceneManifest(themed).biome).toEqual(themed.biome);
    }
    expect(sceneManifestReaderSchema.safeParse({ ...input, biome: { id: "desert", seed: "a", assetUrl: "https://untrusted.test/a" } }).success).toBe(false);
  });
  it("round-trips the generated-adventure marker and rejects unknown templates or extra fields", () => {
    const adventure = { template: "reach-beacon", seed: "s:1", generator: 1 };
    expect(migrateSceneManifest({ ...lostColorsFixture, adventure }).adventure).toEqual(adventure);
    expect(migrateSceneManifest(lostColorsFixture).adventure).toBeUndefined();
    for (const bad of [
      { ...adventure, template: "escort" },
      { ...adventure, generator: 2 },
      { ...adventure, spawn: [0, 0, 0] },
      { ...adventure, seed: "" },
    ]) {
      expect(sceneManifestReaderSchema.safeParse({ ...lostColorsFixture, adventure: bad }).success).toBe(false);
    }
  });
  it("loads the pre-v2 saved-level fixture without changing its envelope version", () => {
    expect(sceneManifestReaderSchema.parse(legacyFixture).schemaVersion).toBe(1);

    const migrated = migrateSceneManifest(legacyFixture);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.experience.mode.kind).toBe("explore");
    expect(migrated.experience.quest.title).toBe(legacyFixture.name);
    expect(migrated.experience.collectibles).toEqual([]);
  });

  it("loads both original bundled sample manifests through the compatible reader", () => {
    expect(SAMPLE_LEVELS).toHaveLength(2);
    for (const sample of SAMPLE_LEVELS) {
      const migrated = migrateSceneManifest(JSON.parse(JSON.stringify(sample)));
      expect(migrated.levelId).toBe(sample.levelId);
      expect(migrated.assets).toEqual(sample.assets);
      expect(migrated.entities).toEqual(sample.entities);
      expect(migrated.experience.mode.kind).toBe("explore");
    }
  });
});

describe("v2 reference fixtures", () => {
  it("round-trips the optional workflow snapshot without changing the manifest envelope", () => {
    const input = { ...lostColorsFixture, workflow: workflowFixture };
    const parsed = migrateSceneManifest(input);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.workflow).toEqual(workflowFixture);
    expect(migrateSceneManifest(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("validates the complete Lost Colors fixture", () => {
    const manifest = migrateSceneManifest(lostColorsFixture);
    expect(manifest.assets[0]?.url).toBe("/samples/rodin.glb");
    expect(manifest.experience.style.id).toBe("cartoon");
    expect(manifest.experience.mode.kind).toBe("collect");
    expect(manifest.experience.collectibles).toHaveLength(3);
    expect(manifest.experience.finishPortal?.activation).toBe("all-required-collectibles");
    expect(manifest.experience.quest.title).toBe("The Lost Colors of Teacup Island");

    const roundTrip = migrateSceneManifest(JSON.parse(JSON.stringify(manifest)));
    expect(roundTrip).toEqual(manifest);
  });

  it("provides matching request and response fixtures for every job kind", () => {
    const expected = ["image-to-3d", "image-edit", "text", "music", "sfx", "tts", "video"];
    expect(generationJobCases.map((item) => item.request.kind)).toEqual(expected);
    for (const fixture of generationJobCases) {
      expect(fixture.request.schemaVersion).toBe(1);
      expect(fixture.response.schemaVersion).toBe(1);
      expect(fixture.response.kind).toBe(fixture.request.kind);
      expect(fixture.response.provenance.requestedCapability).toBe(fixture.request.capability);
      expect(fixture.response.provenance.applicationJobId).toBe(fixture.response.applicationJobId);
      expect(fixture.response.provenance).toHaveProperty("reportedCost");
      expect(fixture.response.result?.kind).toBe(fixture.request.kind);
    }
  });
});
