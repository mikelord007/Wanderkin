import { MOVEMENT_CONFIG_SCHEMA_VERSION } from "./schema-version.js";

/**
 * Centralized movement tuning. Every level references a `MovementConfig` by
 * id/version instead of levels carrying their own physics numbers — the
 * same controller, jump height, and mantle rules must behave identically
 * on every scene. Change values here, not per-level.
 */
export interface MovementConfig {
  schemaVersion: typeof MOVEMENT_CONFIG_SCHEMA_VERSION;
  /** Stable label for the tuning set in use, e.g. "default-v1". Manifests
   * record this id so a replay/save can detect a tuning change. */
  id: string;
  /** Fixed physics timestep in seconds (e.g. 1/60). Rapier steps at this
   * rate regardless of render frame rate. */
  fixedTimestepSeconds: number;
  maxSubSteps: number;
  gravity: number;
  walkSpeed: number;
  airControl: number;
  groundFriction: number;
  /** Capsule total standing height = 2 * (characterHalfHeight + characterRadius).
   * Keep `mantle.requiredClearanceHeight >= that total` so a mantle
   * destination is guaranteed to fit the whole capsule. */
  characterRadius: number;
  characterHalfHeight: number;
  jumpHeight: number;
  mantle: {
    minLedgeHeight: number;
    maxLedgeHeight: number;
    maxReachDistance: number;
    requiredClearanceHeight: number;
  };
  camera: {
    distance: number;
    minPitchRadians: number;
    maxPitchRadians: number;
    collisionPadding: number;
  };
}

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  schemaVersion: MOVEMENT_CONFIG_SCHEMA_VERSION,
  id: "default-v1",
  fixedTimestepSeconds: 1 / 60,
  maxSubSteps: 4,
  gravity: 9.81,
  walkSpeed: 2.2,
  airControl: 0.3,
  groundFriction: 6,
  // Toy-scale capsule: total height 2 * (0.17 + 0.18) = 0.7m.
  characterRadius: 0.18,
  characterHalfHeight: 0.17,
  jumpHeight: 0.6,
  mantle: {
    minLedgeHeight: 0.3,
    maxLedgeHeight: 0.9,
    maxReachDistance: 0.6,
    requiredClearanceHeight: 0.7,
  },
  camera: {
    distance: 2.5,
    minPitchRadians: -0.4,
    maxPitchRadians: 1.2,
    collisionPadding: 0.15,
  },
};
