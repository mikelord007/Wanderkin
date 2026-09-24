import { describe, expect, it } from "vitest";
import lostColorsFixture from "../../shared/fixtures/lost-colors.json";
import { migrateSceneManifest, type PublishedLevelVersion } from "@shared/index.js";
import { publishedManifestForPlay, shareIdFromPath, sharePath } from "./shareRouting.js";

describe("share routing", () => {
  it("recognizes only a single safe share path segment", () => {
    expect(shareIdFromPath("/share/abc-123")).toBe("abc-123");
    expect(shareIdFromPath("/share/abc-123/")).toBe("abc-123");
    expect(shareIdFromPath("/share/abc/extra")).toBeNull();
    expect(shareIdFromPath("/api/shares/abc")).toBeNull();
  });

  it("builds a stable encoded share path", () => {
    expect(sharePath("version_123")).toBe("/share/version_123");
  });

  it("binds a race target to the immutable publication identity", () => {
    const manifest = migrateSceneManifest(lostColorsFixture);
    const publication: PublishedLevelVersion = {
      schemaVersion: 1,
      versionId: "version-7",
      shareId: "share-7",
      sourceLevelId: manifest.levelId,
      sourceUpdatedAt: manifest.updatedAt,
      publishedAt: manifest.updatedAt,
      manifest: {
        ...manifest,
        experience: {
          ...manifest.experience,
          mode: {
            kind: "race",
            countdownSeconds: 3,
            orderedCheckpointIds: manifest.checkpoints.map((checkpoint) => checkpoint.id),
            restartPolicy: "full-reset",
          },
        },
      },
      challenge: { kind: "race", targetMilliseconds: 12_345, verification: "personal-unverified" },
      includesSourcePhotos: false,
    };

    const playable = publishedManifestForPlay(publication);
    expect(playable.levelId).toBe("published-version-7");
    expect(playable.experience?.mode).toMatchObject({ kind: "race", personalBestMilliseconds: 12_345 });
    expect(publication.manifest.levelId).toBe(manifest.levelId);
  });
});
