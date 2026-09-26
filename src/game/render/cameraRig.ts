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
import { approach, clamp, headingRight, type Vec3Like } from "../core/vec.js";
import {
  AIM_RISE_HEIGHTS,
  AIM_SHOULDER_HEIGHTS,
  AIM_SHOULDER_SWAP_RATE,
  aimFrameOffset,
  chooseShoulder,
  type Shoulder,
} from "./aimFraming.js";

type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

export interface CameraPose {
  position: Vec3Like;
  target: Vec3Like;
  /** Boom length actually used after collision, for diagnostics. */
  distance: number;
  occluded: boolean;
  /** Shoulder the aim frame is over (+1 right, -1 left). */
  shoulder: Shoulder;
  /** Signed sideways offset of the look-at point actually applied, in metres. */
  lateral: number;
}

/** Aim framing for one frame: the eased 0..1 blend and the explorer's height. */
export interface CameraAimFrame {
  blend: number;
  bodyHeight: number;
  /** Cut straight to a new shoulder rather than sliding across. */
  reducedMotion?: boolean;
}

export class CameraRig {
  private readonly config: MovementConfig;
  private readonly RAPIER: RapierModule;
  private currentDistance: number;
  private shoulder: Shoulder = 1;
  private signedLateral = 0;

  constructor(RAPIER: RapierModule, config: MovementConfig) {
    this.RAPIER = RAPIER;
    this.config = config;
    this.currentDistance = config.camera.distance;
  }

  /** Snaps the boom back to full length, e.g. after a respawn. */
  reset(): void {
    this.currentDistance = this.config.camera.distance;
    this.signedLateral = 0;
  }

  /**
   * Room beside the explorer on each side of the camera, out to `wanted`:
   * the same ball the boom uses, swept sideways from the look-at point.
   * Props are ignored here exactly as they are by the boom.
   */
  private shoulderClearance(world: RapierWorld, playerCollider: RapierCollider, from: Vec3Like, yaw: number, wanted: number) {
    const padding = this.config.camera.collisionPadding;
    const right = headingRight(yaw);
    const reach = wanted + padding;
    const probe = (side: Shoulder) => {
      const hit = world.castShape(
        from,
        IDENTITY_ROTATION,
        { x: right.x * side * reach, y: 0, z: right.z * side * reach },
        new this.RAPIER.Ball(padding),
        0,
        1,
        true,
        this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        QUERY_WITHOUT_PROPS,
        playerCollider,
      );
      return hit ? Math.max(0, hit.time_of_impact * reach - padding) : wanted;
    };
    return { right: probe(1), left: probe(-1) };
  }

  update(
    world: RapierWorld,
    playerCollider: RapierCollider,
    playerCenter: Vec3Like,
    yaw: number,
    pitch: number,
    deltaSeconds: number,
    aim?: CameraAimFrame,
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

    // Over the shoulder while aiming: slide the look-at point sideways (to
    // whichever side has room) and up. The boom below then sweeps from there,
    // so its collision handling is unchanged.
    const blend = aim ? clamp(aim.blend, 0, 1) : 0;
    let wantedLateral = 0;
    if (aim && blend > 0) {
      const wanted = AIM_SHOULDER_HEIGHTS * aim.bodyHeight;
      const room = this.shoulderClearance(world, playerCollider, target, yaw, wanted);
      const choice = chooseShoulder(this.shoulder, room.right, room.left, wanted);
      this.shoulder = choice.side;
      wantedLateral = choice.side * choice.lateral;
      // Never slide further than the probe allows on the side now in use.
      const allowed = this.shoulder === 1 ? room.right : room.left;
      if (Math.abs(this.signedLateral) > allowed && Math.sign(this.signedLateral) === this.shoulder) {
        this.signedLateral = this.shoulder * allowed;
      }
    }
    this.signedLateral = aim?.reducedMotion || blend === 0
      ? wantedLateral
      : approach(this.signedLateral, wantedLateral, AIM_SHOULDER_SWAP_RATE, deltaSeconds);
    if (blend > 0 && aim) {
      const offset = aimFrameOffset(yaw, this.signedLateral, AIM_RISE_HEIGHTS * aim.bodyHeight, blend);
      target.x += offset.x;
      target.y += offset.y;
      target.z += offset.z;
    }

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
      shoulder: this.shoulder,
      lateral: this.signedLateral * blend,
    };
  }
}
