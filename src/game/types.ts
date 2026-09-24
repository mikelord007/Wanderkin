/**
 * Public contract for the game runtime, per `docs/CONTRACTS.md`.
 */

import type { PublishedLevelVersion, SceneManifest, StyleId } from "@shared/index.js";
import type { GameplayEventBus } from "./events.js";
import type { GameplaySessionSnapshot } from "./modes/session.js";

/**
 * Distinct phases of getting a level playable. Downloading, decoding and
 * preparing physics are genuinely different waits and are reported as
 * such; `running` is only reached after a frame has actually been drawn.
 */
export type GameLoadStage =
  | "idle"
  | "downloading"
  | "decoding"
  | "building-physics"
  | "starting"
  | "running";

export interface GameSnapshot {
  loading: boolean;
  error: string | null;
  /** Scene, physics and first frame all ready; play only enabled here. */
  ready: boolean;
  paused: boolean;
  checkpointsCollected: number;
  checkpointsTotal: number;
  nextCheckpointId: string | null;
  mantlePromptVisible: boolean;

  // ---- Additive, optional: safe to ignore -----------------------------
  // `loading: boolean` alone cannot express *which* wait is happening, and
  // a loading screen must not show a percentage it cannot substantiate.
  // Proposed to the lead for docs/CONTRACTS.md; optional so any consumer
  // written against the eight fields above is unaffected.

  /** Which phase of loading is currently in progress. */
  stage?: GameLoadStage;
  /** Bytes of level asset downloaded so far. */
  downloadedBytes?: number;
  /** Total bytes, or null when the server reported no content length — in
   * which case a progress indicator must be indeterminate, not a made-up
   * percentage. */
  totalBytes?: number | null;
  /** True once the final checkpoint has been collected. */
  completed?: boolean;
  /** Present for v2 worlds; legacy checkpoint courses omit mode state. */
  mode?: GameplaySessionSnapshot;
}

export interface GameViewProps {
  manifest: SceneManifest;
  onExit: () => void;
  onComplete: () => void;
  onProgress?: (snapshot: GameSnapshot) => void;
  /** Optional preview/debug override; saved levels normally use experience.style.id. */
  styleId?: StyleId;
  /** Optional preview/debug override; saved levels normally use experience.style.atmosphere. */
  atmosphere?: string;
  /** Progressive Lost Colors hook. Worker 5 drives this from collected fragments. */
  colorRestoration?: number;
  /** Audio/subtitle consumers can supply an isolated bus; defaults globally. */
  eventBus?: GameplayEventBus;
  /** Immutable published version used to scope Race comparisons and bests. */
  publishedVersionId?: PublishedLevelVersion["versionId"];
}
