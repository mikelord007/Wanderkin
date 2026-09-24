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
 *    the old walk span is only about a third of the unchanged flat jump range,
 *    so it stays comfortably reachable. `characterScale.test.ts` pins that
 *    margin down, and `authoredCourse.test.ts` drives the real controller up
 *    the authored climb at this scale as the end-to-end check.
 *
 * No saved manifest is rewritten and no asset or world is rescaled.
 *
 * The visible result is the point: assets are normalized so their longest
 * horizontal extent becomes eight game metres (`DEFAULT_ASSUMED_EXTENT_METERS`
 * in `src/scene/normalize.ts`), so a real sofa is about eight metres long and
 * three and a half tall in game space. Against the authored 0.70 m capsule the
 * character was roughly a fifth of the sofa's height — a cat on a sofa. At
 * 0.35 m it is about a tenth of its height and some twenty-three body-lengths
 * along it, and the camera boom halves to match. Because the collider shrinks
 * with the body, this is real scale rather than a rendered-only trick: the
 * character can get into gaps it could not reach before.
 */

import type { MovementConfig } from "@shared/index.js";
import type { Vec3Like } from "./vec.js";

/** Standing height of the miniature capsule, in metres. */
export const MINIATURE_CAPSULE_HEIGHT = 0.35;

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

  return {
    ...base,
    characterRadius: base.characterRadius * factor,
    characterHalfHeight: base.characterHalfHeight * factor,
    mantle: {
      ...base.mantle,
      // Exactly the capsule's height: the contract is that a mantle
      // destination must fit the whole capsule, and demanding the old, taller
      // clearance would reject destinations the character now fits in.
      requiredClearanceHeight: MINIATURE_CAPSULE_HEIGHT,
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
