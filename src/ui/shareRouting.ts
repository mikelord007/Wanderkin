import type { PublishedLevelVersion, SceneManifest } from "@shared/index.js";

const SHARE_PATH = /^\/share\/([a-zA-Z0-9_-]+)\/?$/;

export function shareIdFromPath(pathname: string): string | null {
  const match = SHARE_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

export function sharePath(shareId: string): string {
  return `/share/${encodeURIComponent(shareId)}`;
}

/** Uses the immutable publication id as the local gameplay/race identity. */
export function publishedManifestForPlay(publication: PublishedLevelVersion): SceneManifest {
  const manifest = publication.manifest;
  const mode = manifest.experience.mode;
  return {
    ...manifest,
    levelId: `published-${publication.versionId}`,
    experience: {
      ...manifest.experience,
      mode:
        publication.challenge.kind === "race" && mode.kind === "race"
          ? { ...mode, personalBestMilliseconds: publication.challenge.targetMilliseconds }
          : mode,
    },
  };
}
