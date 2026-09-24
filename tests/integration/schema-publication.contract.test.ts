import { describe, expect, it } from "vitest";
import legacyManifest from "../../shared/fixtures/legacy-scene-manifest-v1.json";
import lostColorsManifest from "../../shared/fixtures/lost-colors.json";
import { migrateSceneManifest, sceneManifestReaderSchema } from "../../shared/manifest-migration.js";

describe("ObjectQuest v2 schema and publication integration contracts", () => {
  it.skip("migrates a legacy saved level through persistence without changing its playable geometry", () => {
    // Given shared/fixtures/legacy-scene-manifest-v1.json imported through the
    // real Worker 7 saved-level boundary (not only the schema helper),
    const legacy = sceneManifestReaderSchema.parse(legacyManifest);

    // when it is loaded, migrated, stored, reloaded, and prepared for play,
    const migrated = migrateSceneManifest(legacy);

    // then level identity, assets, mesh/helper transforms, spawn, checkpoints,
    // coordinate convention, and movement config remain equal to the legacy
    // values while the additive v2 experience defaults to Explore.
    expect(migrated.experience.mode.kind).toBe("explore");
    expect(migrated.entities).toEqual(legacyManifest.entities);
    expect(migrated.spawn).toEqual(legacyManifest.spawn);
    expect(migrated.checkpoints).toEqual(legacyManifest.checkpoints);
    throw new Error("Contract stub: connect the Worker 7 persistence/import boundary");
  });

  it.skip("round-trips the complete Lost Colors fixture through the saved-level store", () => {
    // Given shared/fixtures/lost-colors.json with style, quest, collectibles,
    // portal, media, and generation provenance,
    const expected = migrateSceneManifest(lostColorsManifest);

    // when the manifest is saved, read back, JSON serialized, and migrated,
    const jsonRoundTrip = migrateSceneManifest(JSON.parse(JSON.stringify(expected)));

    // then no authored field or asset reference is lost or silently replaced.
    expect(jsonRoundTrip).toEqual(expected);
    throw new Error("Contract stub: add the real saved-level store round trip");
  });

  it.skip("keeps an existing published version stable after its private source is edited", () => {
    // Given a Lost Colors draft published with a completion or race challenge,
    // capture its versionId, shareId, manifest bytes, challenge, and asset IDs.
    void lostColorsManifest;

    // When the creator edits style, entities, mission, media, and race target
    // on the private source and saves or publishes a second version,

    // then reopening the original shareId in an isolated reader returns the
    // original immutable manifest and challenge; the new publication has new
    // version/share identity and neither path submits generation work.
    throw new Error("Contract stub: connect Worker 7 publish/read/edit adapters");
  });
});
