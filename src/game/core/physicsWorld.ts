/**
 * Builds the Rapier world for a level.
 *
 * All level geometry is static (`fixed` bodies) and the player is a
 * kinematic-position-based capsule driven by Rapier's
 * `KinematicCharacterController`. There are no dynamic bodies, which is
 * what lets the whole simulation be stepped deterministically at a fixed
 * timestep and re-run identically inside Node for tests.
 */

import type { MovementConfig, SceneManifest } from "@shared/index.js";
import type { SceneCollision } from "./sceneCollision.js";
import type { Bounds } from "./soup.js";
import { FALL_MARGIN_METERS, HORIZONTAL_BOUNDS_MARGIN_METERS } from "./constants.js";
import { fromTuple, type Vec3Like } from "./vec.js";

export type RapierModule = typeof import("@dimforge/rapier3d-compat");
type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierRigidBody = ReturnType<RapierWorld["createRigidBody"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

export interface PlayLimits {
  /** Below this Y the player is considered to have fallen out of the level. */
  fallThresholdY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PhysicsScene {
  world: RapierWorld;
  playerBody: RapierRigidBody;
  playerCollider: RapierCollider;
  /** Combined bounds of level collision, or a spawn-relative fallback. */
  bounds: Bounds;
  limits: PlayLimits;
  triangleCount: number;
  colliderCount: number;
  warnings: string[];
  dispose(): void;
}

let rapierReady: Promise<RapierModule> | null = null;

/**
 * Loads and initialises the Rapier WASM module exactly once per page/process.
 * Safe to await from several places concurrently.
 */
export async function initRapier(): Promise<RapierModule> {
  if (!rapierReady) {
    rapierReady = import("@dimforge/rapier3d-compat").then(async (mod) => {
      await mod.init();
      return mod;
    });
  }
  return rapierReady;
}

function fallbackBounds(spawn: Vec3Like): Bounds {
  return {
    min: { x: spawn.x - 10, y: spawn.y - 2, z: spawn.z - 10 },
    max: { x: spawn.x + 10, y: spawn.y + 10, z: spawn.z + 10 },
  };
}

export function computePlayLimits(bounds: Bounds, spawn: Vec3Like): PlayLimits {
  return {
    fallThresholdY: Math.min(bounds.min.y, spawn.y) - FALL_MARGIN_METERS,
    minX: bounds.min.x - HORIZONTAL_BOUNDS_MARGIN_METERS,
    maxX: bounds.max.x + HORIZONTAL_BOUNDS_MARGIN_METERS,
    minZ: bounds.min.z - HORIZONTAL_BOUNDS_MARGIN_METERS,
    maxZ: bounds.max.z + HORIZONTAL_BOUNDS_MARGIN_METERS,
  };
}

export function isOutOfPlayArea(position: Vec3Like, limits: PlayLimits): boolean {
  return (
    position.y < limits.fallThresholdY ||
    position.x < limits.minX ||
    position.x > limits.maxX ||
    position.z < limits.minZ ||
    position.z > limits.maxZ
  );
}

export function createPhysicsScene(
  RAPIER: RapierModule,
  collision: SceneCollision,
  manifest: SceneManifest,
  config: MovementConfig,
): PhysicsScene {
  const world = new RAPIER.World({ x: 0, y: -config.gravity, z: 0 });
  world.timestep = config.fixedTimestepSeconds;

  const warnings = [...collision.warnings];
  let colliderCount = 0;

  const staticBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  for (const entity of collision.entities) {
    const shape = entity.shape;
    let desc;

    switch (shape.kind) {
      case "trimesh":
        // Vertices already carry the entity transform, so the collider is
        // left at the origin with identity rotation on purpose.
        desc = RAPIER.ColliderDesc.trimesh(shape.soup.vertices, shape.soup.indices);
        break;
      case "cuboid":
        desc = RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
          .setTranslation(shape.position.x, shape.position.y, shape.position.z)
          .setRotation(shape.rotation);
        break;
      case "capsule":
        desc = RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius)
          .setTranslation(shape.position.x, shape.position.y, shape.position.z)
          .setRotation(shape.rotation);
        break;
    }

    world.createCollider(desc, staticBody);
    colliderCount += 1;
  }

  const spawn = fromTuple(manifest.spawn.position);
  const bounds = collision.bounds ?? fallbackBounds(spawn);

  const playerBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
  );
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(config.characterHalfHeight, config.characterRadius),
    playerBody,
  );

  // Ray/shape queries (mantle probes, camera collision) read the query
  // pipeline, which is only populated by a step or an explicit refresh.
  // Without this the very first mantle probe of a level would miss.
  world.updateSceneQueries();

  return {
    world,
    playerBody,
    playerCollider,
    bounds,
    limits: computePlayLimits(bounds, spawn),
    triangleCount: collision.triangleCount,
    colliderCount,
    warnings,
    dispose() {
      world.free();
    },
  };
}
