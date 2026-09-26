/**
 * Over-the-shoulder framing for aiming the grappling hook.
 *
 * The chase camera keeps the explorer dead centre, which is exactly where the
 * reticle is — so while aiming (and while the hook flies and reels) the
 * camera's look-at point slides sideways and up. The explorer drops into the
 * lower-left third, the reticle stays at screen centre clear of the body, and
 * the rope and hook are seen from the side. The slide is to the right unless
 * the camera's collision probe finds that side blocked, then to the left.
 *
 * Only the numbers live here; `CameraRig` runs the probe and the boom.
 */

import { headingRight, type Vec3Like } from "../core/vec.js";

/** Ease into the aim frame over this long... */
export const AIM_EASE_IN_SECONDS = 0.18;
/** ...and back out to the chase frame over this long. */
export const AIM_EASE_OUT_SECONDS = 0.25;
/** Sideways offset, in explorer heights (0.35 m at the 0.175 m runtime body). */
export const AIM_SHOULDER_HEIGHTS = 2;
/** Rise of the look-at point, in explorer heights, so the explorer sits low. */
export const AIM_RISE_HEIGHTS = 0.6;
/** Field of view taken off at full aim, in degrees (none under reduced motion). */
export const AIM_ZOOM_DEGREES = 6;
/** How fast a change of shoulder slides across (1/s); instant under reduced motion. */
export const AIM_SHOULDER_SWAP_RATE = 10;

/** +1 over the right shoulder, -1 over the left. */
export type Shoulder = 1 | -1;

/**
 * Moves the 0..1 aim blend toward on (aiming or hook out) or off, at the ease
 * rates above. Reduced motion cuts straight to the end state.
 */
export function advanceAimBlend(blend: number, wanted: boolean, deltaSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return wanted ? 1 : 0;
  const rate = wanted ? 1 / AIM_EASE_IN_SECONDS : -1 / AIM_EASE_OUT_SECONDS;
  return Math.min(1, Math.max(0, blend + rate * Math.max(0, deltaSeconds)));
}

/** The eased blend actually applied: smooth at both ends, never a snap. */
export function easeAimBlend(blend: number): number {
  const t = Math.min(1, Math.max(0, blend));
  return t * t * (3 - 2 * t);
}

/**
 * Which shoulder to frame over, and how far out, given the clearance the
 * collision probe found on each side. Keeps the current shoulder while it
 * has room (no flip-flopping), else takes the other, else whichever side is
 * roomier at whatever offset fits.
 */
export function chooseShoulder(
  current: Shoulder,
  rightClearance: number,
  leftClearance: number,
  wanted: number,
): { side: Shoulder; lateral: number } {
  const clearance = (side: Shoulder) => (side === 1 ? rightClearance : leftClearance);
  if (clearance(current) >= wanted) return { side: current, lateral: wanted };
  const other: Shoulder = current === 1 ? -1 : 1;
  if (clearance(other) >= wanted) return { side: other, lateral: wanted };
  const roomier: Shoulder = rightClearance >= leftClearance ? 1 : -1;
  return { side: roomier, lateral: Math.max(0, Math.min(wanted, clearance(roomier))) };
}

/**
 * The look-at offset for a signed sideways distance (`+` = right of the
 * camera) and a rise, both scaled by the eased blend.
 */
export function aimFrameOffset(yaw: number, signedLateral: number, rise: number, eased: number): Vec3Like {
  const right = headingRight(yaw);
  return {
    x: right.x * signedLateral * eased,
    y: rise * eased,
    z: right.z * signedLateral * eased,
  };
}

/** Field of view for the blend: a mild zoom-in, dropped under reduced motion. */
export function aimFieldOfView(baseDegrees: number, eased: number, reducedMotion: boolean): number {
  return reducedMotion ? baseDegrees : baseDegrees - AIM_ZOOM_DEGREES * eased;
}
