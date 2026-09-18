/**
 * Read-only development diagnostics.
 *
 * Browser QA needs to be able to check where the character is, whether it
 * is grounded, whether a mantle is currently offered and why one was
 * refused, without reading it off the screen. This surface is strictly
 * observational: there is deliberately no way to move the player, skip to
 * a checkpoint, or mark the course complete from here, because doing so
 * would let a verification run "complete" a course the controller cannot
 * actually complete.
 *
 * Installed on `window.__objectquest` in development builds only.
 */

import type { MantleRejection } from "./core/mantle.js";

export type Vec3Tuple = readonly [number, number, number];

export interface GameDiagnostics {
  readonly playerPosition: Vec3Tuple;
  readonly playerVelocity: Vec3Tuple;
  /** Speed actually achieved last step; zero when pressed against a wall. */
  readonly measuredSpeed: number;
  readonly grounded: boolean;
  readonly mantling: boolean;
  readonly mantleAvailable: boolean;
  /** Why the most recent mantle probe refused, when it did. */
  readonly mantleRejection: MantleRejection | null;
  readonly mantleTargetPosition: Vec3Tuple | null;
  readonly checkpointsCollected: number;
  readonly checkpointsTotal: number;
  readonly nextCheckpointId: string | null;
  readonly nextCheckpointPosition: Vec3Tuple | null;
  readonly completed: boolean;
  readonly groundHeightBelow: number | null;
  readonly cameraYaw: number;
  readonly cameraPitch: number;
  readonly cameraDistance: number;
  readonly cameraOccluded: boolean;
  readonly fixedStepsRun: number;
  readonly simulatedSeconds: number;
  readonly renderedFrames: number;
  readonly lastFrameSeconds: number;
  readonly sceneBounds: { min: Vec3Tuple; max: Vec3Tuple };
  readonly collisionTriangles: number;
  readonly warnings: readonly string[];
}

export interface GameDiagnosticsApi {
  /** Current snapshot, or null before the first frame. */
  readonly get: () => GameDiagnostics | null;
  readonly levelId: string;
  readonly movementConfigId: string;
}

declare global {
  interface Window {
    __objectquest?: GameDiagnosticsApi;
  }
}

export const DIAGNOSTICS_GLOBAL = "__objectquest";

/**
 * Publishes the diagnostics getter on `window`. Returns a cleanup that
 * removes it again. No-ops outside development and outside the browser.
 */
export function installDiagnostics(api: GameDiagnosticsApi): () => void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return () => undefined;

  const frozen: GameDiagnosticsApi = Object.freeze({
    get: () => {
      const snapshot = api.get();
      return snapshot ? Object.freeze({ ...snapshot }) : null;
    },
    levelId: api.levelId,
    movementConfigId: api.movementConfigId,
  });

  window.__objectquest = frozen;

  return () => {
    if (window.__objectquest === frozen) delete window.__objectquest;
  };
}
