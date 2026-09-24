import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import lostColorsFixture from "../shared/fixtures/lost-colors.json";
import workflowFixture from "../shared/fixtures/world-workflow-v1.json";
import { migrateSceneManifest } from "../shared/index.js";
import { PublicationStore } from "./publications.js";

describe("PublicationStore", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "objectquest-publications-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates an immutable snapshot with a stable share id and private photos by default", async () => {
    const store = new PublicationStore(directory);
    const source = migrateSceneManifest({ ...lostColorsFixture, workflow: workflowFixture });
    const publication = await store.publish(source, { challenge: { kind: "completion" } });

    expect(publication.versionId).toBeTruthy();
    expect(publication.shareId).toBeTruthy();
    expect(publication.includesSourcePhotos).toBe(false);
    expect(publication.manifest.photos).toEqual([]);
    expect(publication.manifest).not.toHaveProperty("workflow");
    expect(publication.manifest.assets).toEqual(source.assets);
    expect(publication.manifest.experience).toEqual(source.experience);

    source.name = "Private edit after publishing";
    source.entities[0]!.transform.position = [99, 99, 99];
    const reopened = new PublicationStore(directory);
    const shared = await reopened.getByShareId(publication.shareId);
    expect(shared).toEqual(publication);
    expect(shared?.manifest.name).toBe(lostColorsFixture.name);
  });

  it("does not resolve malformed share ids", async () => {
    const store = new PublicationStore(directory);
    expect(await store.getByShareId("__proto__")).toBeUndefined();
  });

  it("creates a new immutable identity for every later publication", async () => {
    const store = new PublicationStore(directory);
    const source = migrateSceneManifest(lostColorsFixture);
    const first = await store.publish(source, { challenge: { kind: "completion" } });
    const edited = { ...source, name: "A private revision", updatedAt: "2026-09-24T12:00:00.000Z" };
    const second = await store.publish(edited, { challenge: { kind: "completion" } });

    expect(second.versionId).not.toBe(first.versionId);
    expect(second.shareId).not.toBe(first.shareId);
    expect((await store.getByShareId(first.shareId))?.manifest.name).toBe(lostColorsFixture.name);
    expect((await store.getByShareId(second.shareId))?.manifest.name).toBe("A private revision");
  });

  it("includes source photos only with explicit consent", async () => {
    const store = new PublicationStore(directory);
    const source = migrateSceneManifest(lostColorsFixture);
    const publication = await store.publish(source, {
      challenge: { kind: "completion" },
      includesSourcePhotos: true,
    });
    expect(publication.includesSourcePhotos).toBe(true);
    expect(publication.manifest.photos).toEqual(source.photos);
  });

  it("accepts only honest Race targets on Race mode publications", async () => {
    const store = new PublicationStore(directory);
    const source = migrateSceneManifest(lostColorsFixture);
    await expect(
      store.publish(source, {
        challenge: { kind: "race", targetMilliseconds: 12_345, verification: "personal-unverified" },
      }),
    ).rejects.toThrow(/Race mode/);

    const race = {
      ...source,
      experience: {
        ...source.experience,
        mode: {
          kind: "race" as const,
          countdownSeconds: 3,
          orderedCheckpointIds: source.checkpoints.map((checkpoint) => checkpoint.id),
          restartPolicy: "full-reset" as const,
        },
      },
    };
    const publication = await store.publish(race, {
      challenge: { kind: "race", targetMilliseconds: 12_345, verification: "personal-unverified" },
    });
    expect(publication.challenge).toEqual({
      kind: "race",
      targetMilliseconds: 12_345,
      verification: "personal-unverified",
    });
  });
});
