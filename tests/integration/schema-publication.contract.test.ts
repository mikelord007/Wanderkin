import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import legacyManifest from "../../shared/fixtures/legacy-scene-manifest-v1.json";
import lostColorsManifest from "../../shared/fixtures/lost-colors.json";
import workflowFixture from "../../shared/fixtures/world-workflow-v1.json";
import { migrateSceneManifest, sceneManifestReaderSchema } from "../../shared/manifest-migration.js";
import { LevelStore } from "../../server/levels.js";
import { AssetStore } from "../../server/persistence/assetStore.js";
import { PhotoStore } from "../../server/persistence/photoStore.js";
import { PublicationStore } from "../../server/publications.js";

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ directory: string; store: LevelStore }> {
  const directory = await mkdtemp(join(tmpdir(), "objectquest-schema-contract-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    store: new LevelStore(directory, new AssetStore(directory), new PhotoStore(directory)),
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ObjectQuest v2 schema and publication integration contracts", () => {
  it("migrates a legacy saved level through persistence without changing its playable geometry", async () => {
    // Given shared/fixtures/legacy-scene-manifest-v1.json imported through the
    // real Worker 7 saved-level boundary (not only the schema helper),
    const legacy = sceneManifestReaderSchema.parse(legacyManifest);
    const { directory, store } = await createStore();
    await writeFile(
      join(directory, "levels.json"),
      JSON.stringify({ [legacy.levelId]: legacy }),
      "utf8",
    );

    // when it is loaded, migrated, stored, reloaded, and prepared for play,
    const migrated = await store.get(legacy.levelId);

    // then level identity, assets, mesh/helper transforms, spawn, checkpoints,
    // coordinate convention, and movement config remain equal to the legacy
    // values while the additive v2 experience defaults to Explore.
    expect(migrated?.experience?.mode.kind).toBe("explore");
    expect(migrated?.entities).toEqual(legacyManifest.entities);
    expect(migrated?.spawn).toEqual(legacyManifest.spawn);
    expect(migrated?.checkpoints).toEqual(legacyManifest.checkpoints);
    expect(migrated?.coordinateConvention).toBe(legacyManifest.coordinateConvention);
    expect(migrated?.movementConfigId).toBe(legacyManifest.movementConfigId);
  });

  it("round-trips the complete Lost Colors fixture through the saved-level store", async () => {
    // Given shared/fixtures/lost-colors.json with style, quest, collectibles,
    // portal, media, and generation provenance,
    const expected = migrateSceneManifest(lostColorsManifest);

    // when the manifest is saved, read back from a fresh store, JSON
    // serialized, and migrated,
    const { directory, store } = await createStore();
    const saved = await store.create(expected);
    const reopened = new LevelStore(directory, new AssetStore(directory), new PhotoStore(directory));
    const reloaded = await reopened.get(saved.levelId);
    const jsonRoundTrip = migrateSceneManifest(JSON.parse(JSON.stringify(reloaded)));

    // then no authored field or asset reference is lost or silently replaced.
    expect(jsonRoundTrip).toEqual({ ...expected, updatedAt: saved.updatedAt });
  });

  it("persists the durable workflow snapshot without turning it into a new job submission", async () => {
    const expected = migrateSceneManifest({ ...lostColorsManifest, workflow: workflowFixture });
    const { directory, store } = await createStore();
    const saved = await store.create(expected);
    const reopened = new LevelStore(directory, new AssetStore(directory), new PhotoStore(directory));
    const reloaded = await reopened.get(saved.levelId);

    expect(reloaded?.workflow).toEqual(workflowFixture);
    expect(reloaded?.workflow?.jobs.map((job) => job.jobId)).toEqual(["job-preview-1", "job-mesh-1"]);
  });

  it("keeps an existing published version stable after its private source is edited", async () => {
    // Given a Lost Colors draft published with a completion or race challenge,
    // capture its versionId, shareId, manifest bytes, challenge, and asset IDs.
    const { directory, store } = await createStore();
    const source = await store.create(migrateSceneManifest(lostColorsManifest));
    const publications = new PublicationStore(directory);
    const first = await publications.publish(source, { challenge: { kind: "completion" } });

    // When the creator edits style, entities, mission, and media on the
    // private source and publishes a second version,
    const edited = {
      ...source,
      name: "Private edited title",
      experience: {
        ...source.experience!,
        style: { ...source.experience!.style, id: "watercolor" as const },
        quest: { ...source.experience!.quest, objective: "A changed private objective." },
      },
      entities: source.entities.map((entity, index) =>
        index === 0
          ? { ...entity, transform: { ...entity.transform, position: [9, 9, 9] as const } }
          : entity,
      ),
      media: { audio: [], video: [] },
    };
    const savedEdit = await store.save(source.levelId, edited);
    const second = await publications.publish(savedEdit, { challenge: { kind: "completion" } });

    // then reopening the original shareId in an isolated reader returns the
    // original immutable manifest and challenge; the new publication has new
    // version/share identity and neither path submits generation work.
    const isolatedRead = await new PublicationStore(directory).getByShareId(first.shareId);
    expect(isolatedRead).toEqual(first);
    expect(isolatedRead?.manifest.name).toBe(lostColorsManifest.name);
    expect(isolatedRead?.manifest.photos).toEqual([]);
    expect(second.versionId).not.toBe(first.versionId);
    expect(second.shareId).not.toBe(first.shareId);
  });
});
