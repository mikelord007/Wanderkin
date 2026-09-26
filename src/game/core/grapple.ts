/**
 * Grappling hook: aim selection and reel tuning.
 *
 * The hook is a player ability in every world and look. It never adds a
 * joint or a dynamic body: `GameSimulation` reels the capsule toward the
 * anchor through the same `KinematicCharacterController` that walks it, so
 * collisions, autostep and mantling keep working mid-flight, and the capsule
 * can never be pulled into geometry — the solver stops it at first contact.
 *
 * An anchor is chosen by a ray from the camera through the screen centre
 * (the reticle). Biome props are never anchors: the aim ray looks straight
 * through them, and a prop between the player's hand and the anchor blocks
 * the shot instead. Level geometry between the hand and the aimed point
 * catches the rope where it touches — aiming at the top of a sofa from
 * below hooks its front lip — which is how the hook reads in a third-person
 * view, where the camera can see over edges the character cannot.
 *
 * Every anchor resolves to one of three kinds, which decides where the
 * capsule is pulled to (`target`, a capsule centre):
 *  - `surface`: standable ground or a tabletop; the character is pulled to
 *    stand on it.
 *  - `ledge`: a wall face with a standable top a mantle-height above the
 *    hook; the character is pulled up and over onto that top.
 *  - `wall`: anything else (a tall face, an overhang); the character is
 *    pulled up to it, then mantles if a ledge is in reach or drops with a hop.
 */

import type { MovementConfig } from "@shared/index.js";
import type { RapierModule } from "./physicsWorld.js";
import { MANTLE_LANDING_INSET_RATIO, MANTLE_LANDING_SKIN, MIN_STANDABLE_NORMAL_Y } from "./constants.js";
import { QUERY_WITHOUT_PROPS, isPropGroups } from "./propColliders.js";
import { addScaled, distance, dot, normalize, sub, type Vec3Like } from "./vec.js";

type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

/** Hook range as a multiple of the main object's height. */
export const GRAPPLE_RANGE_HEIGHT_RATIO = 2.5;
/** The hook always reaches at least this far, however small the object. */
export const GRAPPLE_MIN_RANGE_METERS = 1;
/** Anchors closer than this many capsule heights are refused (no hooking your feet). */
export const GRAPPLE_MIN_ANCHOR_HEIGHTS = 2;
/** How far the hook sits off the surface it bites, so it is never inside it. */
export const GRAPPLE_SURFACE_OFFSET = 0.01;

/** Hook projectile speed; flight time is clamped to the window below. */
export const HOOK_FLIGHT_SPEED = 30;
export const HOOK_MIN_FLIGHT_SECONDS = 0.15;
export const HOOK_MAX_FLIGHT_SECONDS = 0.3;
/** A shot with no anchor flies out and snaps back over this long. */
export const HOOK_RETRACT_SECONDS = 0.2;

/** Top reel speed, as a multiple of walk speed. */
export const REEL_SPEED_RATIO = 3.5;
/** Reel acceleration (m/s²): top speed in about a quarter of a second. */
export const REEL_ACCELERATION = 30;
/** Braking (m/s²) near the target, so the character arrives rather than overshoots. */
export const REEL_BRAKE = 24;
/** Slowest the final approach may get, so the reel never crawls. */
export const REEL_MIN_SPEED = 0.8;
/** The path aims this fraction of the horizontal distance above the target. */
export const REEL_LOFT_RATIO = 0.35;
/** Within this distance of the anchor the reel ends (walls) or may mantle. */
export const REEL_ARRIVE_DISTANCE = 0.6;
/** No progress toward the target for this long counts as blocked. */
export const REEL_STUCK_SECONDS = 0.18;
/** Hard ceiling on a reel's duration, whatever happens. */
export const REEL_TIMEOUT_SECONDS = 3;
/** Upward speed of the small hop when a reel ends without a mantle or a floor. */
export const REEL_END_HOP_SPEED = 1.4;
/** A reel that ends short drifts toward its target at up to this speed... */
export const REEL_END_NUDGE_SPEED = 1.2;
/** ...covering the remaining horizontal gap in about this long. */
export const REEL_END_NUDGE_SECONDS = 0.35;
/** Time after the hook is free again before it can fire. */
export const GRAPPLE_COOLDOWN_SECONDS = 0.6;
/** Rope tension ramps from slack to taut over this long once attached. */
export const ROPE_TENSION_SECONDS = 0.12;

export interface GrappleContext {
  RAPIER: RapierModule;
  world: RapierWorld;
  playerCollider: RapierCollider;
  config: MovementConfig;
}

/** A camera ray: from the camera through the reticle. */
export interface GrappleAim {
  origin: Vec3Like;
  direction: Vec3Like;
}

export type GrappleAnchorKind = "surface" | "ledge" | "wall";

export interface GrappleAnchor {
  kind: GrappleAnchorKind;
  /** Where the hook bites, offset off the surface along its normal. */
  point: Vec3Like;
  normal: Vec3Like;
  /** Capsule centre the reel pulls toward. */
  target: Vec3Like;
  /**
   * Capsule centre the reel passes through first, when the straight way to
   * `target` is blocked: out past a lip and above it. Both legs are swept.
   */
  waypoint: Vec3Like | null;
  /** Where the rope wraps over a lip on its way to the hook, if it does. */
  bend: Vec3Like | null;
  /** Straight-line distance from the hand to `point` at selection time. */
  distance: number;
}

export type GrappleRejection = "no-aim" | "no-surface" | "out-of-range" | "too-close" | "blocked" | "no-room";

export interface GrappleAimResult {
  anchor: GrappleAnchor | null;
  rejection: GrappleRejection | null;
  /** Where the hook would fly: the anchor, or the end of a missed shot. */
  aimPoint: Vec3Like | null;
}

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const UP: Vec3Like = { x: 0, y: 1, z: 0 };
/** Sweeps and fit tests use a slightly slim capsule, as the mantle probe does. */
const FIT_RADIUS_RATIO = 0.92;
/** Sweeps start this many radii above the capsule, clear of the floor it rests on. */
const SWEEP_LIFT_RATIO = 0.1;
/** The lip search walks back toward the player in at most this many steps. */
const LIP_SEARCH_STEPS = 40;
/** Halvings that narrow the lip down once the walk has stepped over it. */
const LIP_BISECTIONS = 5;
/** The waypoint sits this many radii out past the lip. */
const LIP_WAYPOINT_OUT_RATIO = 3;

/**
 * Hook range for an object `objectHeight` metres tall: 2.5× its height,
 * never less than a metre.
 */
export function grappleRange(objectHeight: number): number {
  const height = Number.isFinite(objectHeight) && objectHeight > 0 ? objectHeight : 0;
  return Math.max(GRAPPLE_MIN_RANGE_METERS, height * GRAPPLE_RANGE_HEIGHT_RATIO);
}

/** Seconds the hook takes to fly `distance` metres. */
export function hookFlightSeconds(distanceMeters: number): number {
  const seconds = distanceMeters / HOOK_FLIGHT_SPEED;
  return Math.min(HOOK_MAX_FLIGHT_SECONDS, Math.max(HOOK_MIN_FLIGHT_SECONDS, seconds));
}

/** Where the rope leaves the character: a little above the capsule centre. */
export function grappleHandPosition(center: Vec3Like, config: MovementConfig): Vec3Like {
  return { x: center.x, y: center.y + config.characterHalfHeight * 0.5, z: center.z };
}

/**
 * Reel speed for the next step: accelerate toward the top speed, but never
 * faster than a braking curve allows at `remaining` metres from the target.
 */
export function nextReelSpeed(current: number, remaining: number, walkSpeed: number, dt: number): number {
  const top = walkSpeed * REEL_SPEED_RATIO;
  const accelerated = Math.min(top, Math.max(0, current) + REEL_ACCELERATION * dt);
  const braked = Math.max(REEL_MIN_SPEED, Math.sqrt(2 * REEL_BRAKE * Math.max(0, remaining)));
  return Math.min(accelerated, braked);
}

/**
 * The point the reel steers at: the target, raised by a fraction of the
 * remaining horizontal distance. Far away that lofts the path well above a
 * lip; close in it converges on the target itself.
 */
export function reelSteerPoint(position: Vec3Like, target: Vec3Like): Vec3Like {
  const horizontal = Math.hypot(target.x - position.x, target.z - position.z);
  return { x: target.x, y: target.y + horizontal * REEL_LOFT_RATIO, z: target.z };
}

function halfTotal(config: MovementConfig): number {
  return config.characterHalfHeight + config.characterRadius;
}

function isStandable(normal: Vec3Like): boolean {
  return normal.y >= MIN_STANDABLE_NORMAL_Y;
}

/** True when a capsule centred at `center` overlaps nothing but the player. */
function capsuleFits(ctx: GrappleContext, center: Vec3Like): boolean {
  const { RAPIER, world, playerCollider, config } = ctx;
  const blocker = world.intersectionWithShape(
    center,
    IDENTITY_ROTATION,
    new RAPIER.Capsule(config.characterHalfHeight, config.characterRadius * FIT_RADIUS_RATIO),
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    playerCollider,
  );
  return !blocker;
}

/**
 * For a hook on a wall face: the standable top within a mantle's height above
 * it, as a capsule centre inset past the face, or null when the face keeps
 * rising (or the top has no room to stand).
 */
function ledgeTargetAbove(ctx: GrappleContext, point: Vec3Like, normal: Vec3Like): Vec3Like | null {
  const { RAPIER, world, playerCollider, config } = ctx;
  const inward = normalize({ x: -normal.x, y: 0, z: -normal.z });
  if (inward.x === 0 && inward.z === 0) return null;
  const inset = config.characterRadius * (1 + MANTLE_LANDING_INSET_RATIO);
  const column = addScaled(point, inward, inset);
  const reach = config.mantle.maxLedgeHeight;
  const topY = point.y + reach;
  // The drop has to start in open air, or a solid ray reports a hit at zero.
  const occupied = world.intersectionWithShape(
    { x: column.x, y: topY, z: column.z },
    IDENTITY_ROTATION,
    new RAPIER.Ball(config.characterRadius * 0.02),
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    QUERY_WITHOUT_PROPS,
    playerCollider,
  );
  if (occupied) return null;
  const down = world.castRayAndGetNormal(
    new RAPIER.Ray({ x: column.x, y: topY, z: column.z }, { x: 0, y: -1, z: 0 }),
    reach + config.characterRadius,
    true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    QUERY_WITHOUT_PROPS,
    playerCollider,
  );
  if (!down || !isStandable(down.normal)) return null;
  const surfaceY = topY - down.timeOfImpact;
  if (surfaceY < point.y - config.characterRadius) return null;
  const target = { x: column.x, y: surfaceY + halfTotal(config) + MANTLE_LANDING_SKIN, z: column.z };
  return capsuleFits(ctx, target) ? target : null;
}

/** True when the slim capsule can sweep in a straight line from `from` to `to`. */
function sweepClear(ctx: GrappleContext, from: Vec3Like, to: Vec3Like): boolean {
  const { RAPIER, world, playerCollider, config } = ctx;
  // Lifted a hair so a capsule resting on the floor does not graze it at t = 0.
  const start = { x: from.x, y: from.y + config.characterRadius * SWEEP_LIFT_RATIO, z: from.z };
  const delta = sub(to, start);
  if (Math.hypot(delta.x, delta.y, delta.z) < 1e-6) return true;
  const probe = new RAPIER.Capsule(config.characterHalfHeight, config.characterRadius * FIT_RADIUS_RATIO);
  return world.castShape(
    start, IDENTITY_ROTATION, delta, probe, 0, 1, true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, playerCollider,
  ) === null;
}

/** True when a ray from `from` to `to` meets anything on the way. */
function rayObstructed(ctx: GrappleContext, from: Vec3Like, to: Vec3Like): boolean {
  const { RAPIER, world, playerCollider } = ctx;
  const delta = sub(to, from);
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length < GRAPPLE_SURFACE_OFFSET * 2) return false;
  return world.castRay(
    new RAPIER.Ray(from, normalize(delta)),
    length - GRAPPLE_SURFACE_OFFSET * 2,
    true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    playerCollider,
  ) !== null;
}

/**
 * For a hook on top of something: walk from the hook back toward the player
 * until the top ends, and return that lip and a waypoint just out past it and
 * above it. Pulled via the waypoint, the character rises in open air in front
 * of the lip — clear of any overhang, like a desk top over its drawers — and
 * only then crosses onto the top. Null when the top never ends on the way
 * back (the player is standing on it).
 */
export function lipWaypoint(
  ctx: GrappleContext,
  surface: Vec3Like,
  hand: Vec3Like,
): { edge: Vec3Like; waypoint: Vec3Like } | null {
  const { RAPIER, world, playerCollider, config } = ctx;
  const back = { x: hand.x - surface.x, y: 0, z: hand.z - surface.z };
  const horizontal = Math.hypot(back.x, back.z);
  if (horizontal < 1e-4) return null;
  const toward = { x: back.x / horizontal, y: 0, z: back.z / horizontal };
  const radius = config.characterRadius;
  // The lip can be level with the player or just behind them (standing
  // under a desk top), so the walk runs a little past them.
  const searchLength = horizontal + config.mantle.maxLedgeHeight;
  const step = Math.max(radius, searchLength / LIP_SEARCH_STEPS);
  const drop = halfTotal(config) * 2;
  const originY = surface.y + drop;
  const topAt = (along: number): number => {
    const probe = addScaled(surface, toward, along);
    const down = world.castRay(
      new RAPIER.Ray({ x: probe.x, y: originY, z: probe.z }, { x: 0, y: -1, z: 0 }),
      drop * 2,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      QUERY_WITHOUT_PROPS,
      playerCollider,
    );
    return down ? originY - down.timeOfImpact : -Infinity;
  };
  const dropsAway = (topY: number) => topY < surface.y - halfTotal(config);
  let inside = 0;
  let outside: number | null = null;
  // Things standing on the top (a book, a cushion) are crossed, not taken
  // for its end; the waypoint rises to clear the tallest of them.
  let highest = surface.y;
  for (let k = 1; k * step <= searchLength; k += 1) {
    const topY = topAt(k * step);
    if (dropsAway(topY)) {
      outside = k * step;
      break;
    }
    highest = Math.max(highest, topY);
    inside = k * step;
  }
  if (outside === null) return null;
  // Narrow the lip down to a few millimetres.
  let beyond: number = outside;
  for (let i = 0; i < LIP_BISECTIONS; i += 1) {
    const middle: number = (inside + beyond) / 2;
    if (dropsAway(topAt(middle))) beyond = middle;
    else inside = middle;
  }
  const edge = addScaled(surface, toward, inside);
  edge.y = topAt(inside);
  const waypoint = addScaled(edge, toward, radius * LIP_WAYPOINT_OUT_RATIO);
  waypoint.y = highest + halfTotal(config) + radius + MANTLE_LANDING_SKIN;
  return { edge, waypoint };
}

/**
 * A hook on a standable surface: the character is pulled to stand on it,
 * straight there when the capsule can sweep that way, else via the lip
 * nearest the player. Null when neither way is clear.
 */
function surfaceAnchor(
  ctx: GrappleContext,
  playerCenter: Vec3Like,
  hand: Vec3Like,
  surface: Vec3Like,
  normal: Vec3Like,
): GrappleAimResult | null {
  const point = addScaled(surface, normal, GRAPPLE_SURFACE_OFFSET);
  const target = addScaled(surface, UP, halfTotal(ctx.config) + MANTLE_LANDING_SKIN);
  if (!capsuleFits(ctx, target)) return { anchor: null, rejection: "no-room", aimPoint: point };
  const reach = distance(hand, surface);
  if (sweepClear(ctx, playerCenter, target)) {
    return {
      anchor: { kind: "surface", point, normal, target, waypoint: null, bend: null, distance: reach },
      rejection: null,
      aimPoint: point,
    };
  }
  const lip = lipWaypoint(ctx, surface, hand);
  if (!lip || !capsuleFits(ctx, lip.waypoint)) return null;
  if (!sweepClear(ctx, playerCenter, lip.waypoint) || !sweepClear(ctx, lip.waypoint, target)) return null;
  // The rope wraps over the lip when the straight line would pass through it.
  const bend = rayObstructed(ctx, hand, surface)
    ? { x: lip.edge.x, y: lip.edge.y + GRAPPLE_SURFACE_OFFSET, z: lip.edge.z }
    : null;
  return {
    anchor: { kind: "surface", point, normal, target, waypoint: lip.waypoint, bend, distance: reach },
    rejection: null,
    aimPoint: point,
  };
}

/**
 * A hook on a face, a chamfer or a lip with a top within a mantle's height
 * above it. The hook moves up to bite the top's lip nearest the player, and
 * the character is taken out past that lip, above it, and across onto the
 * top — around any overhang between them (a desk top over its drawers).
 * Null when there is no such top or the capsule cannot sweep that way.
 */
function ledgeAnchor(
  ctx: GrappleContext,
  playerCenter: Vec3Like,
  hand: Vec3Like,
  surface: Vec3Like,
  normal: Vec3Like,
): GrappleAnchor | null {
  const { config } = ctx;
  const top = ledgeTargetAbove(ctx, surface, normal);
  if (!top) return null;
  const standHeight = halfTotal(config) + MANTLE_LANDING_SKIN;
  const topSurface = { x: top.x, y: top.y - standHeight, z: top.z };
  const lip = lipWaypoint(ctx, topSurface, hand);
  if (!lip) return null;
  const inward = normalize({ x: lip.edge.x - lip.waypoint.x, y: 0, z: lip.edge.z - lip.waypoint.z });
  const target = addScaled(lip.edge, inward, config.characterRadius * (1 + MANTLE_LANDING_INSET_RATIO));
  target.y = lip.edge.y + standHeight;
  if (!capsuleFits(ctx, target) || !capsuleFits(ctx, lip.waypoint)) return null;
  if (!sweepClear(ctx, playerCenter, lip.waypoint) || !sweepClear(ctx, lip.waypoint, target)) return null;
  const point = { x: lip.edge.x, y: lip.edge.y + GRAPPLE_SURFACE_OFFSET, z: lip.edge.z };
  return { kind: "ledge", point, normal: { ...UP }, target, waypoint: lip.waypoint, bend: null, distance: distance(hand, point) };
}

/**
 * Resolves the hook's anchor for a camera ray. Pure with respect to the
 * world: the same call on the same scene gives the same answer, which is
 * what lets the reticle preview exactly the shot the key press will fire.
 *
 * Every anchor it returns has had the character's route swept: the capsule
 * can get from where it stands to the target the way the reel will take it,
 * so the hook never offers a ledge it cannot deliver.
 */
export function selectGrappleAnchor(
  ctx: GrappleContext,
  playerCenter: Vec3Like,
  aim: GrappleAim | null | undefined,
  range: number,
  /** Whether a prop (enabled in physics or not) crosses the rope from `hand` to a point. */
  ropeHitsProp: (hand: Vec3Like, point: Vec3Like) => boolean = () => false,
): GrappleAimResult {
  if (!aim) return { anchor: null, rejection: "no-aim", aimPoint: null };
  const { RAPIER, world, playerCollider, config } = ctx;
  const direction = normalize(aim.direction);
  if (direction.x === 0 && direction.y === 0 && direction.z === 0) {
    return { anchor: null, rejection: "no-aim", aimPoint: null };
  }

  const hand = grappleHandPosition(playerCenter, config);
  // Start the aim ray level with the character, not at the camera: anything
  // between the camera and the player (a chair back behind them) is not
  // something they are aiming at.
  const alongToPlayer = Math.max(0, dot(sub(hand, aim.origin), direction));
  const start = addScaled(aim.origin, direction, alongToPlayer);
  const offAxis = distance(start, hand);
  const missPoint = addScaled(start, direction, range);

  // Looks past the range so a surface just too far reads as out of range,
  // not as empty sky.
  const hit = world.castRayAndGetNormal(
    new RAPIER.Ray(start, direction),
    range * 2 + offAxis,
    true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    QUERY_WITHOUT_PROPS,
    playerCollider,
  );
  if (!hit) return { anchor: null, rejection: "no-surface", aimPoint: missPoint };

  const aimed = addScaled(start, direction, hit.timeOfImpact);
  const aimedNormal = normalize(hit.normal);
  if (distance(hand, aimed) > range) {
    return { anchor: null, rejection: "out-of-range", aimPoint: addScaled(hand, normalize(sub(aimed, hand)), range) };
  }
  const minDistance = GRAPPLE_MIN_ANCHOR_HEIGHTS * 2 * halfTotal(config);
  if (distance(hand, aimed) < minDistance) return { anchor: null, rejection: "too-close", aimPoint: aimed };
  if (ropeHitsProp(hand, aimed)) return { anchor: null, rejection: "blocked", aimPoint: aimed };

  // Aimed at a top: the hook bites where the reticle is, and the character
  // is brought round the lip onto it.
  if (isStandable(aimedNormal)) {
    const onTop = surfaceAnchor(ctx, playerCenter, hand, aimed, aimedNormal);
    if (onTop) return onTop;
  }

  // Otherwise the rope runs straight from the hand. A prop in the way blocks
  // the shot; level geometry in the way is where the rope catches.
  let surface = aimed;
  let normal = aimedNormal;
  const toSurface = sub(surface, hand);
  const ropeLength = Math.hypot(toSurface.x, toSurface.y, toSurface.z);
  if (ropeLength > 1e-6) {
    const ropeDir = normalize(toSurface);
    const obstruction = world.castRayAndGetNormal(
      new RAPIER.Ray(hand, ropeDir),
      Math.max(0, ropeLength - GRAPPLE_SURFACE_OFFSET * 2),
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      playerCollider,
    );
    if (obstruction) {
      if (isPropGroups(obstruction.collider.collisionGroups())) {
        return { anchor: null, rejection: "blocked", aimPoint: addScaled(hand, ropeDir, obstruction.timeOfImpact) };
      }
      surface = addScaled(hand, ropeDir, obstruction.timeOfImpact);
      normal = normalize(obstruction.normal);
    }
  }

  const reach = distance(hand, surface);
  if (reach < minDistance) return { anchor: null, rejection: "too-close", aimPoint: surface };

  const point = addScaled(surface, normal, GRAPPLE_SURFACE_OFFSET);
  if (isStandable(normal)) {
    const caught = surfaceAnchor(ctx, playerCenter, hand, surface, normal);
    if (caught) return caught;
  } else if (normal.y > -0.95) {
    const ledge = ledgeAnchor(ctx, playerCenter, hand, surface, normal);
    if (ledge) return { anchor: ledge, rejection: null, aimPoint: ledge.point };
  }

  // Anything else: pulled up to hang just off the face (below an overhang),
  // then a mantle if one is in reach, or a drop.
  const clearance = normal.y < -0.5 ? halfTotal(config) : config.characterRadius;
  const target = addScaled(surface, normal, clearance + MANTLE_LANDING_SKIN);
  return {
    anchor: { kind: "wall", point, normal, target, waypoint: null, bend: null, distance: reach },
    rejection: null,
    aimPoint: point,
  };
}

/** A stalled reel may pull over onto its target from at most this many capsule heights away. */
export const PULL_OVER_REACH_HEIGHTS = 3;

/**
 * When a reel toward a ledge or surface stalls at the rim (a rounded arm, a
 * lip the slide will not climb), the character is pulled over onto the
 * target with the mantle's scripted move — straight up, then across — but
 * only once a slim capsule sweep has proved both legs clear. Returns the
 * apex of that move, or null when it would pass through anything.
 */
export function pullOverApex(ctx: GrappleContext, from: Vec3Like, destination: Vec3Like): Vec3Like | null {
  const { config } = ctx;
  const reach = PULL_OVER_REACH_HEIGHTS * 2 * halfTotal(config);
  if (distance(from, destination) > reach) return null;
  const apex = { x: from.x, y: Math.max(from.y, destination.y), z: from.z };
  return sweepClear(ctx, from, apex) && sweepClear(ctx, apex, destination) ? apex : null;
}

/**
 * True when the segment `a`→`b` passes through the upright cylinder a prop
 * occupies (`reach` around its position, from `baseY` up `height`). Props far
 * from the character are disabled in physics to save their per-step cost, so
 * the rope is also tested against every prop's data, enabled or not.
 */
export function segmentHitsProp(
  a: Vec3Like,
  b: Vec3Like,
  prop: { position: Vec3Like; reach: number; baseY: number; height: number },
): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - prop.position.x;
  const fz = a.z - prop.position.z;
  const r = prop.reach;
  const qa = dx * dx + dz * dz;
  const qb = 2 * (fx * dx + fz * dz);
  const qc = fx * fx + fz * fz - r * r;
  let t0: number;
  let t1: number;
  if (qa < 1e-12) {
    if (qc > 0) return false;
    t0 = 0;
    t1 = 1;
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return false;
    const root = Math.sqrt(disc);
    t0 = Math.max(0, (-qb - root) / (2 * qa));
    t1 = Math.min(1, (-qb + root) / (2 * qa));
    if (t0 > t1) return false;
  }
  const y0 = a.y + (b.y - a.y) * t0;
  const y1 = a.y + (b.y - a.y) * t1;
  const top = prop.baseY + prop.height;
  return Math.max(y0, y1) >= prop.baseY && Math.min(y0, y1) <= top;
}

/** Height of the main object: the tallest generated-mesh collision, else the scene. */
export function mainObjectHeight(
  meshBounds: readonly { min: Vec3Like; max: Vec3Like }[],
  sceneBounds: { min: Vec3Like; max: Vec3Like },
): number {
  let height = 0;
  for (const bounds of meshBounds) height = Math.max(height, bounds.max.y - bounds.min.y);
  return height > 0 ? height : Math.max(0, sceneBounds.max.y - sceneBounds.min.y);
}
