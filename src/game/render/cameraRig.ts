/**
 * Collision-aware third-person camera.
 *
 * The tiny character spends most of the game underneath and between large
 * furniture, so an orbit camera that ignores geometry would spend normal
 * play inside a desk. The boom is shortened by a sphere-cast towards the
 * desired position: it pulls in instantly when something gets in the way
 * (clipping is worse than a fast cut) and eases back out afterwards so the
 * view does not snap around every time the player brushes past a table leg.
 */

import type { MovementConfig } from "@shared/index.js";
import type { RapierModule } from "../core/physicsWorld.js";
import { CAMERA_EXTEND_RATE, CAMERA_MIN_DISTANCE_RATIO, CAMERA_TARGET_LIFT_RATIO } from "../core/constants.js";
import { QUERY_WITHOUT_PROPS } from "../core/propColliders.js";
import { approach, clamp, type Vec3Like } from "../core/vec.js";

type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

export interface CameraPose {
  position: Vec3Like;
  target: Vec3Like;
  /** Boom length actually used after collision, for diagnostics. */
  distance: number;
  occluded: boolean;
}

export class CameraRig {
  private readonly config: MovementConfig;
  private readonly RAPIER: RapierModule;
  private currentDistance: number;

  constructor(RAPIER: RapierModule, config: MovementConfig) {
    this.RAPIER = RAPIER;
    this.config = config;
    this.currentDistance = config.camera.distance;
  }

  /** Snaps the boom back to full length, e.g. after a respawn. */
  reset(): void {
    this.currentDistance = this.config.camera.distance;
  }

  update(
    world: RapierWorld,
    playerCollider: RapierCollider,
    playerCenter: Vec3Like,
    yaw: number,
    pitch: number,
    deltaSeconds: number,
  ): CameraPose {
    const camera = this.config.camera;
    const radius = this.config.characterRadius;

    // Aim a little above the capsule centre: framing the character's head
    // rather than its middle keeps more of the scene ahead in view.
    const target: Vec3Like = {
      x: playerCenter.x,
      y: playerCenter.y + radius * CAMERA_TARGET_LIFT_RATIO,
      z: playerCenter.z,
    };

    const cosPitch = Math.cos(pitch);
    const direction: Vec3Like = {
      x: -Math.sin(yaw) * cosPitch,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cosPitch,
    };

    const maxDistance = camera.distance;
    const minDistance = radius * CAMERA_MIN_DISTANCE_RATIO;

    const hit = world.castShape(
      target,
      IDENTITY_ROTATION,
      { x: direction.x * maxDistance, y: direction.y * maxDistance, z: direction.z * maxDistance },
      new this.RAPIER.Ball(camera.collisionPadding),
      0,
      1,
      true,
      this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      // Biome props are solid for the character but not for the boom: their
      // own camera fade handles a trunk in the way (`propColliders.ts`).
      QUERY_WITHOUT_PROPS,
      playerCollider,
    );

    const allowed = hit ? clamp(maxDistance * hit.time_of_impact, minDistance, maxDistance) : maxDistance;

    if (allowed < this.currentDistance) {
      // Pull in immediately: a frame spent inside a sofa is very obvious.
      this.currentDistance = allowed;
    } else {
      this.currentDistance = approach(this.currentDistance, allowed, CAMERA_EXTEND_RATE, deltaSeconds);
    }

    return {
      position: {
        x: target.x + direction.x * this.currentDistance,
        y: target.y + direction.y * this.currentDistance,
        z: target.z + direction.z * this.currentDistance,
      },
      target,
      distance: this.currentDistance,
      occluded: hit !== null,
    };
  }
}
