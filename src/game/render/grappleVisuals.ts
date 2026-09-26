/**
 * Pure maths behind the grappling hook's look: where the hook is along its
 * flight, the rope's sag, the camera's reel kick, and the reticle's state.
 * Kept free of Three and React so each rule is unit-tested on its own.
 */

import type { GrapplePhase, GrappleView } from "../core/simulation.js";
import type { Vec3Like } from "../core/vec.js";

/** Peak height of the hook's arc, as a fraction of the throw's length. */
export const HOOK_ARC_RATIO = 0.08;
/** Slack rope sags by this fraction of its length at the middle. */
export const ROPE_SAG_RATIO = 0.12;
/** Extra field of view at full reel tension, in degrees. */
export const REEL_FOV_KICK_DEGREES = 5;
/** Rope-tension shake at the moment the hook bites, as a fraction of body height. */
export const REEL_SHAKE_HEIGHTS = 0.05;
/** How long the bite shake lasts. */
export const REEL_SHAKE_SECONDS = 0.18;

function lerp(a: Vec3Like, b: Vec3Like, t: number): Vec3Like {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function length(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Where the hook is drawn: along a straight throw with a slight upward arc
 * while flying (or flying out and back on a miss), on the anchor once it bit,
 * and nowhere when idle.
 */
export function hookPosition(hand: Vec3Like, view: Pick<GrappleView, "phase" | "target" | "progress">): Vec3Like | null {
  if (!view.target || view.phase === "idle") return null;
  if (view.phase === "reeling") return { ...view.target };
  const t = Math.min(1, Math.max(0, view.progress));
  const point = lerp(hand, view.target, t);
  point.y += HOOK_ARC_RATIO * length(hand, view.target) * 4 * t * (1 - t);
  return point;
}

/**
 * Mid-rope sag in metres. Slack while the hook flies (it pays out behind the
 * hook), straightening as the reel takes up the tension.
 */
export function ropeSag(phase: GrapplePhase, ropeLength: number, tension: number): number {
  if (phase === "idle") return 0;
  const slack = phase === "reeling" ? 1 - Math.min(1, Math.max(0, tension)) : 1;
  return ROPE_SAG_RATIO * ropeLength * slack;
}

/**
 * `count + 1` points from `a` to `b` along a parabola sagging `sag` metres at
 * the middle (a catenary is indistinguishable at this sag). Writes into `out`
 * so the per-frame update allocates nothing once warm.
 */
export function ropePoints(a: Vec3Like, b: Vec3Like, sag: number, count: number, out: Vec3Like[] = []): Vec3Like[] {
  out.length = count + 1;
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const point = out[i] ?? { x: 0, y: 0, z: 0 };
    point.x = a.x + (b.x - a.x) * t;
    point.y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
    point.z = a.z + (b.z - a.z) * t;
    out[i] = point;
  }
  return out;
}

export interface ReelCameraEffect {
  /** Degrees added to the field of view. */
  fovKick: number;
  /** Positional shake amplitude in metres. */
  shake: number;
}

/**
 * The camera's response to the reel: a mild FOV kick that follows the rope's
 * tension and a brief shake when the hook bites. Reduced motion keeps the
 * mechanic and drops both.
 */
export function reelCameraEffect(
  phase: GrapplePhase,
  tension: number,
  secondsSinceBite: number,
  bodyHeight: number,
  reducedMotion: boolean,
): ReelCameraEffect {
  if (reducedMotion || phase !== "reeling") return { fovKick: 0, shake: 0 };
  const taut = Math.min(1, Math.max(0, tension));
  const fade = Math.max(0, 1 - secondsSinceBite / REEL_SHAKE_SECONDS);
  return { fovKick: REEL_FOV_KICK_DEGREES * taut, shake: REEL_SHAKE_HEIGHTS * bodyHeight * fade };
}

/** `hidden` outside play, `locked` over a valid anchor, `open` over nothing, `busy` while the hook is out or cooling down. */
export type ReticleState = "hidden" | "locked" | "open" | "busy";

export function reticleState(running: boolean, ready: boolean, anchorUnderReticle: boolean): ReticleState {
  if (!running) return "hidden";
  if (!ready) return "busy";
  return anchorUnderReticle ? "locked" : "open";
}
