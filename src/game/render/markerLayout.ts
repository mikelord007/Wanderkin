/**
 * Where, and how big, to draw objective markers for the body actually running.
 *
 * Checkpoint and explore-destination positions are stored the way spawn points
 * are: as the capsule centre of the *authored* body standing on its surface.
 * The gameplay triggers use those stored points and radii unchanged. This file
 * never alters them, it only decides how the markers look. Drawn at the stored
 * point with authored-size meshes, a marker floats above a miniature
 * character's head and is bigger than the character itself (see
 * `opus-visual-review.md` F3). So the visuals are:
 *
 *  - seated on the same support surface the author meant, found the same way
 *    `reseatCapsuleCentre` finds it for spawns;
 *  - sized in multiples of the runtime body height, so a marker reads as a
 *    toy-sized gem next to a toy-sized hero at any scale;
 *  - given a flat footprint ring at the radius a *grounded* character is
 *    really collected at. The trigger is a sphere around the stored centre,
 *    which for a shorter body sits above its own centre, so on foot it reaches
 *    less far than `triggerRadius`. The ring shows that honest reach instead of
 *    a translucent sphere that fills the screen.
 *
 * Pure arithmetic, tested in Node.
 */

import type { MovementConfig, Vec3 } from "@shared/index.js";
import { capsuleHeight, reseatCapsuleCentre } from "../core/characterScale.js";
import { fromTuple } from "../core/vec.js";

/** Core gem diameter, in runtime body heights. */
export const MARKER_CORE_DIAMETER_IN_HEIGHTS = 0.46;
/** Core gem centre above the character's feet, in body heights: just clear
 * of the head even at the bottom of its bob, so standing on a marker never
 * buries the character in it. */
export const MARKER_CORE_LIFT_IN_HEIGHTS = 1.42;
/** Vertical bob amplitude of the active gem, in body heights. */
export const MARKER_BOB_IN_HEIGHTS = 0.09;
/** Explore destination pad radius, in body heights. */
export const DESTINATION_PAD_RADIUS_IN_HEIGHTS = 1.25;

export interface MarkerLayout {
  /** World point on the support surface directly under the stored position. */
  surface: [number, number, number];
  /** Runtime body height the sizes were derived from, metres. */
  bodyHeight: number;
  /** Core gem circumradius, metres. */
  coreRadius: number;
  /** Core gem centre above `surface`, metres. */
  coreLift: number;
  /** Active bob amplitude, metres. */
  bobAmplitude: number;
  /**
   * Horizontal distance from the stored centre at which a grounded character
   * of the runtime size is collected, metres. Equal to the trigger radius at
   * authored scale; 0 if a grounded character could never reach it.
   */
  footprintRadius: number;
  /** Radii of the guide column, bottom and top, metres. */
  beamRadiusBottom: number;
  beamRadiusTop: number;
}

/**
 * The stored centre sits a small skin above the surface (see
 * `capsuleCenterYAboveSurface` in `src/editor/geometry.ts`). Matched here, not
 * imported, so gameplay rendering does not depend on the editor module.
 */
const SKIN_MARGIN_METRES = 0.02;

/** Support-surface point implied by an authored capsule centre. */
function surfaceBelow(position: Vec3, authored: MovementConfig, runtime: MovementConfig): [number, number, number] {
  const seated = reseatCapsuleCentre(fromTuple(position), authored, runtime);
  const surfaceY = seated.y - runtime.characterHalfHeight - runtime.characterRadius - SKIN_MARGIN_METRES;
  return [seated.x, surfaceY, seated.z];
}

/**
 * Layout for a checkpoint marker whose trigger is a sphere of `triggerRadius`
 * around `position` (the capsule-centre convention of `Checkpoint.position`).
 */
export function checkpointMarkerLayout(
  position: Vec3,
  triggerRadius: number,
  authored: MovementConfig,
  runtime: MovementConfig,
): MarkerLayout {
  const bodyHeight = capsuleHeight(runtime);
  const surface = surfaceBelow(position, authored, runtime);
  // How far the grounded body's centre sits below the trigger's centre.
  const groundedCentreY = surface[1] + bodyHeight / 2 + SKIN_MARGIN_METRES;
  const drop = Math.max(0, position[1] - groundedCentreY);
  const radius = Math.max(0, triggerRadius);
  const footprintRadius = drop < radius ? Math.sqrt(radius * radius - drop * drop) : 0;
  const coreRadius = (MARKER_CORE_DIAMETER_IN_HEIGHTS * bodyHeight) / 2;
  return {
    surface,
    bodyHeight,
    coreRadius,
    coreLift: SKIN_MARGIN_METRES + MARKER_CORE_LIFT_IN_HEIGHTS * bodyHeight,
    bobAmplitude: MARKER_BOB_IN_HEIGHTS * bodyHeight,
    footprintRadius,
    beamRadiusBottom: coreRadius * 1.1,
    beamRadiusTop: coreRadius * 1.5,
  };
}

/** Layout for an explore destination pad: seated and sized like a checkpoint. */
export function destinationMarkerLayout(
  position: Vec3,
  authored: MovementConfig,
  runtime: MovementConfig,
): { surface: [number, number, number]; padRadius: number; padThickness: number } {
  const bodyHeight = capsuleHeight(runtime);
  return {
    surface: surfaceBelow(position, authored, runtime),
    padRadius: DESTINATION_PAD_RADIUS_IN_HEIGHTS * bodyHeight,
    padThickness: 0.1 * bodyHeight,
  };
}
