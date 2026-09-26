/**
 * Contextual mantle probing.
 *
 * A mantle moves the capsule along a scripted path instead of resolving it
 * through the character controller, so the path has to be *proved clear
 * before the move starts*. Four independent conditions must all hold, and
 * each has its own rejection reason so tests and QA diagnostics can say
 * exactly why a mantle was refused:
 *
 *  1. There is a wall-like face within reach in front of the player.
 *  2. Its top surface is within the ledge-height envelope and standable.
 *  3. The destination has room for the whole capsule, plus the configured
 *     head clearance (this is what makes a low ceiling block a mantle).
 *  4. The capsule can actually sweep up and then forward without passing
 *     through anything (this is what stops mantling through walls).
 *
 * Tall biome props (trunks, cacti, poles) are walls, never ledges: the
 * landing search looks straight through them, so their tops are never a
 * destination, while the clearance and path sweeps still see them.
 */

import type { MovementConfig } from "@shared/index.js";
import type { RapierModule } from "./physicsWorld.js";
import {
  MANTLE_LANDING_INSET_RATIO,
  MANTLE_LANDING_SKIN,
  MAX_LEDGE_FACE_NORMAL_Y,
  MIN_STANDABLE_NORMAL_Y,
} from "./constants.js";
import { QUERY_WITHOUT_WALL_PROPS } from "./propColliders.js";
import { addScaled, normalize, type Vec3Like } from "./vec.js";

type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

export interface MantleContext {
  RAPIER: RapierModule;
  world: RapierWorld;
  playerCollider: RapierCollider;
  config: MovementConfig;
}

export interface MantleTarget {
  /** Capsule centre once standing on the ledge. */
  destination: Vec3Like;
  /** Capsule centre after the vertical leg, directly above the start. */
  apex: Vec3Like;
  /** World Y of the surface that will be stood on. */
  ledgeTopY: number;
  /** Height of that surface above the player's current feet. */
  ledgeHeight: number;
  /** Horizontal distance from the capsule axis to the ledge face. */
  faceDistance: number;
}

export type MantleRejection =
  | "no-facing-direction"
  | "no-ledge"
  | "no-top-surface"
  | "ledge-too-low"
  | "ledge-too-high"
  | "top-not-standable"
  | "destination-blocked"
  | "insufficient-headroom"
  | "path-blocked-up"
  | "path-blocked-forward";

export interface MantleProbeResult {
  target: MantleTarget | null;
  rejection: MantleRejection | null;
}

/**
 * Path sweeps use a slightly slimmer capsule than the player's. The
 * character controller keeps the real capsule within a skin-width of
 * surfaces it is touching, and a full-width sweep starting from there
 * reports a grazing hit at t=0 and refuses otherwise-valid mantles. 8% is
 * comfortably larger than the controller's skin and far smaller than any
 * gap a player could squeeze through.
 */
const PATH_PROBE_RADIUS_RATIO = 0.92;

/** Vertical sample count for the forward ledge-face search. */
const FACE_SAMPLE_COUNT = 6;

/** Vertical sample count when searching the landing column for open air. */
const COLUMN_SAMPLE_COUNT = 9;

/**
 * Radius of the "is this point in open air" probe, as a ratio of the
 * character radius. Small enough to be essentially a point test, large
 * enough not to sit exactly on a surface and report an ambiguous result.
 */
const COLUMN_PROBE_RADIUS_RATIO = 0.02;

/** A shape-cast hit closer than this is treated as a real obstruction. */
const REJECT_TOI = 1;

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

function reject(rejection: MantleRejection): MantleProbeResult {
  return { target: null, rejection };
}

/**
 * @param playerCenter Capsule centre, matching `SpawnPoint.position`.
 * @param facing Horizontal direction the mantle is attempted in; need not
 *               be normalised, but must be non-degenerate.
 */
export function probeMantle(
  ctx: MantleContext,
  playerCenter: Vec3Like,
  facing: Vec3Like,
): MantleProbeResult {
  const { RAPIER, world, playerCollider, config } = ctx;
  const radius = config.characterRadius;
  const halfHeight = config.characterHalfHeight;
  const halfTotal = halfHeight + radius;
  const capsuleHeight = halfTotal * 2;
  const feetY = playerCenter.y - halfTotal;

  const { minLedgeHeight, maxLedgeHeight, maxReachDistance, requiredClearanceHeight } = config.mantle;

  const forward = normalize({ x: facing.x, y: 0, z: facing.z });
  if (forward.x === 0 && forward.z === 0) return reject("no-facing-direction");

  // ---- 1. Find the nearest wall-like face in front of the player --------
  const maxFaceDistance = maxReachDistance + radius;
  let faceDistance = Infinity;

  for (let i = 0; i < FACE_SAMPLE_COUNT; i += 1) {
    // Sample from just above the feet to just under the tallest ledge we
    // could climb, so both a low kerb and a chest-high shelf are found.
    const t = (i + 0.5) / FACE_SAMPLE_COUNT;
    const sampleY = feetY + maxLedgeHeight * t;
    const hit = world.castRayAndGetNormal(
      new RAPIER.Ray({ x: playerCenter.x, y: sampleY, z: playerCenter.z }, forward),
      maxFaceDistance,
      true,
      undefined,
      undefined,
      playerCollider,
    );
    if (!hit) continue;
    if (Math.abs(hit.normal.y) > MAX_LEDGE_FACE_NORMAL_Y) continue; // floor/ceiling, not a face
    if (hit.timeOfImpact < faceDistance) faceDistance = hit.timeOfImpact;
  }

  if (!Number.isFinite(faceDistance)) return reject("no-ledge");

  // ---- 2. Find the surface that would be stood on ----------------------
  const landingDistance = faceDistance + radius * MANTLE_LANDING_INSET_RATIO;
  const landing = addScaled(playerCenter, forward, landingDistance);

  // The down-probe has to start from a point that is actually in open air.
  // Dropping a ray from a fixed height fails whenever that height happens
  // to be inside something — a ceiling over a low ledge, or a wall taller
  // than the envelope — and a solid ray-cast started inside a convex shape
  // reports a zero-distance hit that looks like a surface at the probe
  // height. So scan the landing column downwards for the highest free
  // point inside the climbable envelope and drop from there.
  const envelopeTopY = feetY + maxLedgeHeight + MANTLE_LANDING_SKIN;
  const envelopeBottomY = feetY + minLedgeHeight;
  const probePoint = new RAPIER.Ball(radius * COLUMN_PROBE_RADIUS_RATIO);
  let originY: number | null = null;

  for (let i = 0; i < COLUMN_SAMPLE_COUNT; i += 1) {
    const y = envelopeTopY - ((envelopeTopY - envelopeBottomY) * i) / (COLUMN_SAMPLE_COUNT - 1);
    const occupied = world.intersectionWithShape(
      { x: landing.x, y, z: landing.z },
      IDENTITY_ROTATION,
      probePoint,
      undefined,
      QUERY_WITHOUT_WALL_PROPS,
      playerCollider,
    );
    if (!occupied) {
      originY = y;
      break;
    }
  }

  // Solid all the way through the climbable envelope: whatever is in front
  // rises past the height this character can pull itself onto.
  if (originY === null) return reject("ledge-too-high");

  const down = world.castRayAndGetNormal(
    new RAPIER.Ray({ x: landing.x, y: originY, z: landing.z }, { x: 0, y: -1, z: 0 }),
    // Reach below the feet so a too-low step is reported as such rather
    // than as "nothing there".
    originY - feetY + capsuleHeight,
    true,
    undefined,
    QUERY_WITHOUT_WALL_PROPS,
    playerCollider,
  );

  if (!down) return reject("no-top-surface");

  const ledgeTopY = originY - down.timeOfImpact;
  const ledgeHeight = ledgeTopY - feetY;

  if (ledgeHeight > maxLedgeHeight) return reject("ledge-too-high");
  if (ledgeHeight < minLedgeHeight) return reject("ledge-too-low");
  if (down.normal.y < MIN_STANDABLE_NORMAL_Y) return reject("top-not-standable");

  // ---- 3. Destination space and head clearance -------------------------
  const destination: Vec3Like = {
    x: landing.x,
    y: ledgeTopY + halfTotal + MANTLE_LANDING_SKIN,
    z: landing.z,
  };

  // One test covering both "does the capsule fit" and "is there enough
  // head room"; they coincide when requiredClearanceHeight equals the
  // capsule height, which is the default tuning.
  const clearance = Math.max(requiredClearanceHeight, capsuleHeight);
  const clearanceHalfHeight = Math.max(clearance / 2 - radius, 1e-4);
  const clearanceCenter: Vec3Like = {
    x: landing.x,
    y: ledgeTopY + MANTLE_LANDING_SKIN + radius + clearanceHalfHeight,
    z: landing.z,
  };

  const clearanceBlocker = world.intersectionWithShape(
    clearanceCenter,
    IDENTITY_ROTATION,
    new RAPIER.Capsule(clearanceHalfHeight, radius),
    undefined,
    undefined,
    playerCollider,
  );

  if (clearanceBlocker) {
    // Distinguish "the capsule itself does not fit" from "it fits but the
    // ceiling is lower than the configured clearance".
    const capsuleBlocker = world.intersectionWithShape(
      destination,
      IDENTITY_ROTATION,
      new RAPIER.Capsule(halfHeight, radius),
      undefined,
      undefined,
      playerCollider,
    );
    return reject(capsuleBlocker ? "destination-blocked" : "insufficient-headroom");
  }

  // ---- 4. The capsule must be able to sweep there ----------------------
  const apex: Vec3Like = { x: playerCenter.x, y: destination.y, z: playerCenter.z };
  const probeShape = new RAPIER.Capsule(halfHeight, radius * PATH_PROBE_RADIUS_RATIO);

  const rise = apex.y - playerCenter.y;
  if (rise > 1e-6) {
    const upHit = world.castShape(
      playerCenter,
      IDENTITY_ROTATION,
      { x: 0, y: rise, z: 0 },
      probeShape,
      0,
      REJECT_TOI,
      true,
      undefined,
      undefined,
      playerCollider,
    );
    if (upHit) return reject("path-blocked-up");
  }

  const across = {
    x: destination.x - apex.x,
    y: destination.y - apex.y,
    z: destination.z - apex.z,
  };
  if (Math.abs(across.x) > 1e-6 || Math.abs(across.z) > 1e-6) {
    const acrossHit = world.castShape(
      apex,
      IDENTITY_ROTATION,
      across,
      probeShape,
      0,
      REJECT_TOI,
      true,
      undefined,
      undefined,
      playerCollider,
    );
    if (acrossHit) return reject("path-blocked-forward");
  }

  return {
    target: { destination, apex, ledgeTopY, ledgeHeight, faceDistance },
    rejection: null,
  };
}
