import type { LevelExperience } from "./experience.js";
import type { SceneManifest } from "./manifest.js";
import { PUBLISHED_LEVEL_SCHEMA_VERSION } from "./schema-version.js";

/** Creation workflow/job metadata stays private even when photos are shared. */
export type PublishedSceneManifest = Omit<SceneManifest, "workflow"> & { experience: LevelExperience };

export type PublishedChallenge =
  | { kind: "completion" }
  | {
      kind: "race";
      targetMilliseconds: number;
      /** Current architecture has no authoritative score server. */
      verification: "personal-unverified";
    };

/**
 * An immutable copy. Editing the source level creates a new publication; it
 * never mutates an existing share ID or race challenge.
 */
export interface PublishedLevelVersion {
  schemaVersion: typeof PUBLISHED_LEVEL_SCHEMA_VERSION;
  versionId: string;
  shareId: string;
  sourceLevelId: string;
  sourceUpdatedAt: string;
  publishedAt: string;
  manifest: PublishedSceneManifest;
  challenge: PublishedChallenge;
  includesSourcePhotos: boolean;
}
