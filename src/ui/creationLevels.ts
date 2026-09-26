import type { SceneManifest } from "@shared/index.js";
import type { PendingWorld } from "./pendingWorlds.js";

/*
 * A world from Create becomes a saved level the moment it is first played.
 * Until that level exists, its creation stays on My worlds as a playable
 * card; once it exists, the saved level's tile takes over. The two are
 * matched by the 3D build job the level's workflow records.
 */

/** The 3D build jobs behind saved levels that came from Create. */
function savedBuildJobIds(levels: readonly SceneManifest[]): Set<string> {
  return new Set(levels.flatMap((level) => (level.workflow?.jobs ?? []).filter((job) => job.kind === "image-to-3d").map((job) => job.jobId)));
}

/** The build cards whose world has no saved level yet. While the saved list
 * is still loading (`null`), every card stays. */
export function unsavedBuilds(cards: readonly PendingWorld[], levels: readonly SceneManifest[] | null): PendingWorld[] {
  if (!levels) return [...cards];
  const saved = savedBuildJobIds(levels);
  return cards.filter((card) => !saved.has(card.shapeJobId));
}

export interface PlayPreparedDeps {
  signedIn: boolean;
  /** Creates the level on the server (with the player's credentials). */
  save: (manifest: SceneManifest) => Promise<SceneManifest>;
  playSaved: (saved: SceneManifest) => void;
  playDraft: (manifest: SceneManifest) => void;
  /** The save failed: say why. Play does not start, so the world's card on
   * My worlds stays and Play there tries again. */
  saveFailed: (message: string) => void;
}

/**
 * Plays a course just prepared. A signed-in player's world from Create (it
 * carries a workflow) is saved first, so it can never be lost by leaving
 * play; anything else plays as an unsaved draft, as before.
 */
export async function playPreparedWorld(manifest: SceneManifest, deps: PlayPreparedDeps): Promise<void> {
  if (!deps.signedIn || !manifest.workflow) {
    deps.playDraft(manifest);
    return;
  }
  let saved: SceneManifest;
  try {
    saved = await deps.save(manifest);
  } catch (error) {
    deps.saveFailed(error instanceof Error ? error.message : String(error));
    return;
  }
  deps.playSaved(saved);
}
