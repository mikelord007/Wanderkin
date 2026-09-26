/**
 * Solid biome decoration: primitive static colliders for the props a look
 * draws (tree trunks, cacti, rocks, stumps, bushes, poles).
 *
 * A look is chosen after the physics world is built and can change at any
 * time, so these colliders are attached to and detached from the running
 * world as a set (`GameSimulation.setPropColliders`). They are plain data
 * here — the renderer derives them from the members it actually draws (see
 * `src/biome/assets/colliders.ts`) — and nothing in this module knows about
 * art. They are only ever cheap convex primitives (capsule, cylinder,
 * cuboid), never meshes.
 *
 * Three height classes, measured against the running character:
 *  - lower than the controller's autostep height: not installed at all. The
 *    capsule would step over them anyway, and skipping them keeps pebbles
 *    from nudging it up and down while walking;
 *  - up to {@link PROP_WALL_HEIGHT_RATIO} body heights: solid, and their
 *    tops count as ledges (a stump or boulder can be hopped onto);
 *  - taller: solid walls. They are in their own collision group, which the
 *    mantle probe ignores when looking for something to stand on, so the
 *    character never climbs onto a trunk or a cactus.
 *
 * Walking straight into a round prop stops the character. Rapier's
 * controller slides along whatever it touches, and a trunk hit dead-centre is
 * an unstable contact: from a millimetre of offset the capsule would glide
 * round a thin trunk in a fifth of a second, which reads as walking through
 * it. So a push within {@link HEAD_ON_PROP_DEGREES} of straight into a
 * capsule or cylinder prop stops the capsule against it; a glancing one still
 * slides smoothly round. Box props (rocks, logs) behave like walls.
 *
 * Only props near the character are enabled. Rapier charges every enabled
 * static collider about a microsecond per step even with nothing near it
 * (~0.1 ms a step for a full layout), while a disabled one costs nothing, so
 * the simulation enables the props within {@link propActivationRadius} of the
 * character and refreshes that set every
 * {@link PROP_ACTIVATION_INTERVAL_STEPS} steps and on every teleport. The
 * radius covers everything a step or a mantle probe can reach before the
 * next refresh, so which props are enabled never changes what happens.
 *
 * The camera rig ignores every prop collider, exactly as before props were
 * solid: the props' own camera fade handles a trunk between the camera and
 * the character, and the boom does not snap in and out past thin trunks.
 */

import type { MovementConfig } from "@shared/index.js";
import { MANTLE_LANDING_INSET_RATIO } from "./constants.js";
import type { QuatLike, Vec3Like } from "./vec.js";

export type PropColliderShape =
  /** Axis along local +Y, `halfHeight` of the straight section. */
  | { kind: "capsule"; radius: number; halfHeight: number }
  /** Axis along local +Y. */
  | { kind: "cylinder"; radius: number; halfHeight: number }
  | { kind: "cuboid"; halfExtents: Vec3Like };

export interface PropCollider {
  /** Placement id plus member slot; stable for a layout. */
  id: string;
  shape: PropColliderShape;
  /** World centre of the shape. */
  position: Vec3Like;
  rotation: QuatLike;
  /** World Y of the ground the prop stands on. */
  baseY: number;
  /** Height of the solid body above `baseY`. */
  height: number;
  /** Horizontal distance from `position` that the shape can reach. */
  reach: number;
}

/**
 * Props at least this many body heights tall are walls: not mantle targets.
 * Two body heights is the tallest thing that still reads as "something you
 * could stand on" (boulders, stumps, bushes) rather than a tree.
 */
export const PROP_WALL_HEIGHT_RATIO = 2;

/**
 * Most prop colliders one layout may install. The richest look draws up to
 * 160 placements, and each cluster contributes its primary plus a few solid
 * companions; past this the smallest companions are left non-solid first.
 */
export const PROP_COLLIDER_BUDGET = 400;

// Rapier interaction groups: high 16 bits are memberships, low 16 bits the
// filter. Level geometry and the player keep the default (all bits).
const LEDGE_PROP_BIT = 0x0002;
const WALL_PROP_BIT = 0x0004;
const ALL = 0xffff;

function groups(memberships: number, filter: number): number {
  return ((memberships << 16) | filter) >>> 0;
}

/** Collision groups for a prop whose top may be stood on. */
export const LEDGE_PROP_GROUPS = groups(LEDGE_PROP_BIT, ALL);
/** Collision groups for a tall prop (trunk, cactus, pole). */
export const WALL_PROP_GROUPS = groups(WALL_PROP_BIT, ALL);
/** Query filter that sees level geometry but no prop at all (camera). */
export const QUERY_WITHOUT_PROPS = groups(ALL, ALL & ~(LEDGE_PROP_BIT | WALL_PROP_BIT));
/** Query filter that sees everything except tall props (mantle ledges). */
export const QUERY_WITHOUT_WALL_PROPS = groups(ALL, ALL & ~WALL_PROP_BIT);

/** True for the collision groups of a prop collider (level geometry keeps all bits). */
export function isPropGroups(collisionGroups: number): boolean {
  const memberships = collisionGroups >>> 16;
  return memberships === LEDGE_PROP_BIT || memberships === WALL_PROP_BIT;
}

/** Fixed steps between refreshes of which props are enabled near the player. */
export const PROP_ACTIVATION_INTERVAL_STEPS = 6;

/** Extra slack on the activation radius beyond what the character can reach. */
const PROP_ACTIVATION_MARGIN_METERS = 0.5;

/**
 * Horizontal distance from the character within which a prop's collider is
 * enabled: the farthest a mantle probe looks (reach plus the landing inset),
 * plus the farthest the character can move between refreshes, plus a margin.
 */
export function propActivationRadius(config: MovementConfig): number {
  const probe = config.mantle.maxReachDistance + config.characterRadius * (1 + MANTLE_LANDING_INSET_RATIO);
  const travel = config.walkSpeed * config.fixedTimestepSeconds * PROP_ACTIVATION_INTERVAL_STEPS;
  return probe + travel + PROP_ACTIVATION_MARGIN_METERS;
}

/** Pushing within this angle of straight into a prop stops rather than slides. */
export const HEAD_ON_PROP_DEGREES = 25;

export type PropColliderClass = "skip" | "ledge" | "wall";

/**
 * Which class a prop collider falls in for a character whose controller
 * steps up `stepHeight` and whose capsule is `bodyHeight` tall.
 */
export function classifyPropCollider(height: number, stepHeight: number, bodyHeight: number): PropColliderClass {
  if (!(height > stepHeight)) return "skip";
  return height >= bodyHeight * PROP_WALL_HEIGHT_RATIO ? "wall" : "ledge";
}

/** True when every number in the collider is finite and every size positive. */
export function isValidPropCollider(collider: PropCollider): boolean {
  const finite = (...values: number[]) => values.every(Number.isFinite);
  const { position: p, rotation: q, shape } = collider;
  if (!finite(p.x, p.y, p.z, q.x, q.y, q.z, q.w, collider.baseY, collider.height, collider.reach)) return false;
  if (shape.kind === "cuboid") {
    const h = shape.halfExtents;
    return finite(h.x, h.y, h.z) && h.x > 0 && h.y > 0 && h.z > 0;
  }
  return finite(shape.radius, shape.halfHeight) && shape.radius > 0 && shape.halfHeight >= 0;
}
