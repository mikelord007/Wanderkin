/**
 * Miniature scale: a toy-sized character in a giant world.
 *
 * WHY THIS EXISTS AS A TRANSFORM RATHER THAN AS TUNING VALUES
 * ----------------------------------------------------------
 * Scale properly belongs in the shared `DEFAULT_MOVEMENT_CONFIG`, which is the
 * single place physics, camera, editor placement and course validation all read
 * it from. That file is not owned by this module, so the transform is applied
 * here instead, at the one point every gameplay consumer flows through
 * (`GameSimulation`). {@link toMiniatureScale} is written to be a no-op once the
 * shared tuning set itself is miniature, so moving it there later is a
 * one-line change and cannot double-shrink anything in the meantime.
 *
 * WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT
 * --------------------------------------------
 * Only the character's *body* shrinks: capsule radius and half-height, the
 * clearance a mantle destination must offer, and the camera framing that
 * follows from them. Its *capability envelope* — gravity, walk speed, jump
 * height, and the mantle ledge/reach limits — is left exactly as authored.
 *
 * That split is what keeps existing courses playable. `src/scene/route.ts`
 * derives every reachability limit from this config, and a body-only shrink
 * moves them as follows:
 *
 *  - Jump height, flat jump range, walk speed, step height and the mantle
 *    ledge/reach envelope: **unchanged**. These are what decide whether a gap
 *    can be crossed at all.
 *  - Clearance limits: **more permissive**. A narrower, shorter capsule fits
 *    through more gaps, and a lower required clearance makes more mantle
 *    destinations valid.
 *  - `walkMaxSpan`: **smaller**, because the planner's surface sampling grid
 *    (`defaultSurfaceOptions`) sizes its cells from the character's radius. A
 *    gap that used to be crossed by a walk edge may now need a jump edge — but
 *    the walk span stays a small fraction of the unchanged flat jump range at
 *    every scale explored here (down to about a tenth at 0.175 m), so it stays
 *    comfortably reachable. `characterScale.test.ts` pins that margin down,
 *    and `authoredCourse.test.ts` drives the real controller up the authored
 *    climb at this scale as the end-to-end check.
 *
 * No saved manifest is rewritten and no asset or world is rescaled.
 *
 * The visible result is the point: assets are normalized so their longest
 * horizontal extent becomes eight game metres (`DEFAULT_ASSUMED_EXTENT_METERS`
 * in `src/scene/normalize.ts`), so a real sofa is about eight metres long and
 * three and a half tall in game space. Against the authored 0.70 m capsule the
 * character was roughly a fifth of the sofa's height — a cat on a sofa. The
 * first miniature pass, 0.35 m, read as about a tenth. At this size, 0.175 m
 * (half that again), the sofa is roughly nineteen character-heights tall and
 * forty-six body-lengths long, and the camera boom shrinks to a quarter of the
 * authored length to match. Because the collider shrinks with the body, this
 * is real scale rather than a rendered-only trick: the character can get into
 * gaps it could not reach before.
 *
 * WHY 0.175 M AND NOT SOMETHING ELSE IN THE 0.15–0.20 M RANGE EXPLORED
 * ---------------------------------------------------------------------
 * All of 0.20 / 0.175 / 0.15 m pass the reachability, camera-collision and
 * real-browser checks with margin to spare (see `scale-refinement.md`). The
 * deciding factors for picking the middle value:
 *  - It is a clean second halving of the previous 0.35 m pass (0.70 → 0.35 →
 *    0.175), which is easy to reason about and keeps the walkMaxSpan/jump-range
 *    margin comfortably away from the tighter end of the explored range.
 *  - The third-person camera's boom and target-lift are ratios of the
 *    capsule's own height ({@link "./cameraRig.js" CameraRig}), so the
 *    character's *apparent size on screen* is framing-invariant across this
 *    whole range — confirmed in real Chrome spawn screenshots at 0.35 / 0.20 /
 *    0.175 / 0.15 m, which are visually near-identical. Going smaller does not
 *    buy extra on-screen legibility, only a bigger jump in the walk-speed and
 *    jump-height-in-body-heights ratios below.
 *  - `walkSpeed` and `jumpHeight` stay authored (unchanged in metres) at every
 *    scale, by design (see above) — so as the body shrinks, the same absolute
 *    speed/jump reads as faster/higher relative to the body. At 0.35 m that
 *    was already ~6.3 body-heights/s and a ~1.7-body-height jump; at 0.175 m
 *    it is ~12.6 body-heights/s and a ~3.4-body-height jump. That is a real,
 *    quantified trade-off of picking the middle of the range rather than its
 *    top end, accepted here as "a small energetic toy", not tuned away: doing
 *    so would mean touching the capability envelope that keeps existing
 *    courses reachable, which is out of scope for this pass.
 */

import type { MovementConfig } from "@shared/index.js";
import type { Vec3Like } from "./vec.js";

/** Standing height of the miniature capsule, in metres. */
export const MINIATURE_CAPSULE_HEIGHT = 0.175;

/** Total standing height of the capsule described by a config. */
export function capsuleHeight(config: MovementConfig): number {
  return 2 * (config.characterHalfHeight + config.characterRadius);
}

/**
 * True when a config is already at (or below) miniature scale, in which case
 * {@link toMiniatureScale} returns it untouched.
 */
export function isMiniatureScale(config: MovementConfig): boolean {
  return capsuleHeight(config) <= MINIATURE_CAPSULE_HEIGHT * 1.001;
}

/**
 * Shrinks the character's body to {@link MINIATURE_CAPSULE_HEIGHT}, leaving the
 * movement capability envelope alone. Returns the input unchanged when it is
 * already miniature.
 */
export function toMiniatureScale(base: MovementConfig): MovementConfig {
  if (isMiniatureScale(base)) return base;
  const factor = MINIATURE_CAPSULE_HEIGHT / capsuleHeight(base);
  const characterRadius = base.characterRadius * factor;
  const characterHalfHeight = base.characterHalfHeight * factor;

  return {
    ...base,
    characterRadius,
    characterHalfHeight,
    mantle: {
      ...base.mantle,
      // Derived from the *actual* scaled radius/half-height rather than the
      // nominal `MINIATURE_CAPSULE_HEIGHT` constant, so it can never fall a
      // float-rounding hair short of the capsule it is meant to clear: the
      // contract is that a mantle destination must fit the whole capsule,
      // and demanding the old, taller clearance would reject destinations
      // the character now fits in.
      requiredClearanceHeight: 2 * (characterHalfHeight + characterRadius),
    },
    camera: {
      ...base.camera,
      distance: base.camera.distance * factor,
      collisionPadding: base.camera.collisionPadding * factor,
    },
  };
}

/**
 * Re-seats a capsule-centre position authored for `base` onto the same surface
 * for `scaled`.
 *
 * Spawn points and checkpoint respawns in saved manifests record the *centre*
 * of the capsule, placed a fixed skin above the surface the feet rest on (see
 * `capsuleCenterYAboveSurface` in `src/editor/geometry.ts`). A shorter capsule
 * placed at the same centre would start with its feet in mid-air and drop on
 * every spawn, so lower the centre by exactly the difference in half-heights
 * and the feet land where the author put them. Saved data is untouched; this is
 * a read-time correction.
 */
export function reseatCapsuleCentre(
  position: Vec3Like,
  base: MovementConfig,
  scaled: MovementConfig,
): Vec3Like {
  const drop = (capsuleHeight(base) - capsuleHeight(scaled)) / 2;
  if (drop === 0) return { ...position };
  return { x: position.x, y: position.y - drop, z: position.z };
}
