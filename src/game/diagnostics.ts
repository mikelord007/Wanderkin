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
import type { GameAudioDiagnostics } from "../audio/engine.js";

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
  /** Grappling hook: its phase, whether it can fire, and what the reticle is over. */
  readonly grapple?: {
    readonly phase: string;
    readonly ready: boolean;
    readonly range: number;
    readonly aimAnchor: string | null;
    readonly aimRejection: string | null;
    readonly aimPoint: Vec3Tuple | null;
    readonly target: Vec3Tuple | null;
    readonly tension: number;
    readonly fov: number;
    /** Why the hook last let go (player, arrived, mantle, blocked, cancelled). */
    readonly lastRelease: string | null;
    /** Holding the hook button past a tap: the over-the-shoulder aim is on. */
    readonly aiming: boolean;
    /** 0 chase frame .. 1 aim frame. */
    readonly aimBlend: number;
    /** +1 right shoulder, -1 left. */
    readonly shoulder: number;
    /** The explorer's centre in normalised screen space (-1..1). */
    readonly playerScreen: readonly [number, number];
  };
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
  readonly biome?: { readonly id: string; readonly seed: string; readonly props: number;
    readonly patches: number; readonly drawCalls: number; readonly geometries: number;
    readonly textures: number; readonly fragments: number; readonly destinations: number;
    /** Solid biome props live in physics, and those waiting for the player to move clear. */
    readonly propColliders?: number; readonly propCollidersDeferred?: number };
}

export interface GameDiagnosticsApi {
  /** Current snapshot, or null before the first frame. */
  readonly get: () => GameDiagnostics | null;
  /** Current read-only Web Audio state. */
  readonly audio: () => GameAudioDiagnostics;
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
    audio: () => {
      const diagnostics = api.audio();
      return Object.freeze({ ...diagnostics, activeLoops: Object.freeze([...diagnostics.activeLoops]) });
    },
    levelId: api.levelId,
    movementConfigId: api.movementConfigId,
  });

  window.__objectquest = frozen;

  return () => {
    if (window.__objectquest === frozen) delete window.__objectquest;
  };
}
