import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  PublishedChallenge,
  PublishedLevelVersion,
  PublishedSceneManifest,
  SceneManifest,
} from "../shared/index.js";
import { PUBLISHED_LEVEL_SCHEMA_VERSION, migrateSceneManifest } from "../shared/index.js";
import { JsonFileStore } from "./persistence/jsonStore.js";

interface PublicationIndex {
  byShareId: Record<string, PublishedLevelVersion>;
  shareIdsBySourceLevel: Record<string, string[]>;
}

export interface PublishLevelOptions {
  challenge: PublishedChallenge;
  includesSourcePhotos?: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function publicManifest(source: SceneManifest, includesSourcePhotos: boolean): PublishedSceneManifest {
  const hydrated = migrateSceneManifest(source);
  // Workflow data contains private source-selection ids and generation job
  // bookkeeping. Friends only need the immutable playable snapshot.
  const { workflow: _workflow, ...playable } = clone(hydrated);
  return {
    ...playable,
    photos: includesSourcePhotos ? clone(hydrated.photos) : [],
  };
}

function validateChallenge(manifest: PublishedSceneManifest, challenge: PublishedChallenge): void {
  if (challenge.kind === "race") {
    if (!Number.isFinite(challenge.targetMilliseconds) || challenge.targetMilliseconds <= 0) {
      throw new Error("Race target must be a positive number of milliseconds");
    }
    if (challenge.verification !== "personal-unverified") {
      throw new Error("Race challenges must be labelled personal-unverified");
    }
    if (manifest.experience.mode.kind !== "race") {
      throw new Error("A race challenge requires a Race mode level");
    }
  }
}

/**
 * Durable immutable publication snapshots. Every publish call creates a new
 * version/share identity and deep-copies the source manifest. No method can
 * update a stored version, so later private saves cannot change old links.
 */
export class PublicationStore {
  private readonly file: JsonFileStore<PublicationIndex>;

  constructor(storageDir: string) {
    this.file = new JsonFileStore(join(storageDir, "published-levels.json"), () => ({
      byShareId: {},
      shareIdsBySourceLevel: {},
    }));
  }

  async publish(source: SceneManifest, options: PublishLevelOptions): Promise<PublishedLevelVersion> {
    const includesSourcePhotos = options.includesSourcePhotos === true;
    const manifest = publicManifest(source, includesSourcePhotos);
    validateChallenge(manifest, options.challenge);

    const published: PublishedLevelVersion = {
      schemaVersion: PUBLISHED_LEVEL_SCHEMA_VERSION,
      versionId: randomUUID(),
      shareId: randomUUID(),
      sourceLevelId: source.levelId,
      sourceUpdatedAt: source.updatedAt,
      publishedAt: new Date().toISOString(),
      manifest,
      challenge: clone(options.challenge),
      includesSourcePhotos,
    };

    await this.file.update((index) => {
      if (index.byShareId[published.shareId]) throw new Error("Share id collision");
      index.byShareId[published.shareId] = clone(published);
      (index.shareIdsBySourceLevel[source.levelId] ??= []).push(published.shareId);
    });
    return clone(published);
  }

  async getByShareId(shareId: string): Promise<PublishedLevelVersion | undefined> {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(shareId)) return undefined;
    const publication = (await this.file.read()).byShareId[shareId];
    return publication ? clone(publication) : undefined;
  }

  async listForSourceLevel(sourceLevelId: string): Promise<PublishedLevelVersion[]> {
    const index = await this.file.read();
    return (index.shareIdsBySourceLevel[sourceLevelId] ?? [])
      .map((shareId) => index.byShareId[shareId])
      .filter((publication): publication is PublishedLevelVersion => publication !== undefined)
      .map(clone);
  }
}
