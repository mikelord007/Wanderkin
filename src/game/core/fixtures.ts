/**
 * Synthetic level builders.
 *
 * Used by the physics tests so invariants are checked against small,
 * exactly-known geometry (a floor, a wall, a ledge, a low ceiling) rather
 * than against a 50k-triangle generated mesh where a failure could not be
 * attributed to the controller or to the mesh. Nothing in the shipped game
 * imports this module.
 */

import {
  DEFAULT_MOVEMENT_CONFIG,
  IDENTITY_QUAT,
  createEmptyManifest,
  type Checkpoint,
  type HelperEntity,
  type Quat,
  type SceneManifest,
  type SpawnPoint,
  type Vec3,
} from "@shared/index.js";

/** Axis-aligned solid box; `position` is its centre. */
export function boxEntity(id: string, dimensions: Vec3, position: Vec3): HelperEntity {
  return {
    id,
    kind: "box",
    transform: { position, rotation: IDENTITY_QUAT, scale: [1, 1, 1] },
    dimensions,
    collider: { kind: "box", halfExtents: [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2] },
    addedBy: "game",
  };
}

/** Floor slab whose TOP surface sits at `topY`. */
export function floorEntity(id: string, size: number, topY: number, thickness = 1): HelperEntity {
  return {
    ...boxEntity(id, [size, thickness, size], [0, topY - thickness / 2, 0]),
    kind: "floor",
  };
}

export function rampEntity(
  id: string,
  dimensions: Vec3,
  position: Vec3,
  rotation: Quat = IDENTITY_QUAT,
): HelperEntity {
  return {
    id,
    kind: "ramp",
    transform: { position, rotation, scale: [1, 1, 1] },
    dimensions,
    collider: { kind: "triangle-mesh" },
    addedBy: "game",
  };
}

export const HALF_CAPSULE_HEIGHT =
  DEFAULT_MOVEMENT_CONFIG.characterHalfHeight + DEFAULT_MOVEMENT_CONFIG.characterRadius;

/** Capsule-centre spawn for a character standing on `surfaceY`. */
export function standingSpawn(surfaceY: number, x = 0, z = 0, headingRadians = 0): SpawnPoint {
  return { position: [x, surfaceY + HALF_CAPSULE_HEIGHT + 0.02, z], headingRadians };
}

export function checkpointAt(
  id: string,
  order: number,
  position: Vec3,
  triggerRadius = 0.5,
  safeRespawn?: SpawnPoint,
): Checkpoint {
  return {
    id,
    order,
    position,
    triggerRadius,
    safeRespawn: safeRespawn ?? { position, headingRadians: 0 },
  };
}

export function makeManifest(params: {
  entities: HelperEntity[];
  spawn: SpawnPoint;
  checkpoints?: Checkpoint[];
  name?: string;
}): SceneManifest {
  const manifest = createEmptyManifest({
    levelId: "test-level",
    name: params.name ?? "Test level",
    seed: "test-seed",
    movementConfigId: DEFAULT_MOVEMENT_CONFIG.id,
  });
  manifest.entities = params.entities;
  manifest.spawn = params.spawn;
  manifest.checkpoints = params.checkpoints ?? [];
  return manifest;
}

/** Camera yaw that makes "forward" point along +X. */
export const YAW_TOWARD_PLUS_X = Math.PI / 2;
/** Camera yaw that makes "forward" point along -X. */
export const YAW_TOWARD_MINUS_X = -Math.PI / 2;
