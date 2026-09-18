import type { SceneManifest } from "@shared/index.js";

/** Keep the prepared primary course stable while the user selects alternates. */
export function courseCandidateOptions(
  primary: SceneManifest | null,
  alternates: SceneManifest[],
): SceneManifest[] {
  if (!primary) return [];
  const seen = new Set<string>();
  return [primary, ...alternates].filter((candidate) => {
    if (seen.has(candidate.levelId)) return false;
    seen.add(candidate.levelId);
    return true;
  });
}

export function replaceSavedCandidate(
  candidates: SceneManifest[],
  requestedLevelId: string,
  saved: SceneManifest,
): SceneManifest[] {
  return candidates.map((candidate) =>
    candidate.levelId === requestedLevelId ? saved : candidate,
  );
}
