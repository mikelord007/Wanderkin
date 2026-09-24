/**
 * The character's animation.
 *
 * There is no imported clip data: every pose is authored here as a function of
 * a phase and an intensity, which suits a character whose motion has to follow
 * a physics controller exactly rather than a fixed-length baked clip. Three
 * things do the heavy lifting:
 *
 * 1. **Distance-driven stride.** The walk/run cycle advances with ground
 *    covered, never with wall-clock time, so the feet stop the instant the
 *    character stops and never skate against a wall.
 * 2. **Continuous blending.** Idle/walk/run are a weighted blend on speed
 *    rather than discrete states, and air/land/mantle layer on top. Nothing
 *    "snaps" between animations because nothing ever switches.
 * 3. **A spring per channel.** Every bone angle is spring-integrated toward its
 *    posed target instead of being assigned. Stiff, near-critically-damped
 *    springs on the legs keep footfalls crisp; loose, under-damped springs on
 *    the arms, head and scarf produce overshoot and settle — the follow-through
 *    that separates a character that is animated from one that is posed. It
 *    also means transitions are smooth by construction: there is no crossfade
 *    to get wrong.
 *
 * Pure arithmetic over typed arrays; runs and is tested in Node.
 */

import { BONE_NAMES } from "./characterRig.js";

export interface AnimatorInput {
  /** Measured horizontal speed, m/s. */
  speed: number;
  /** Top ground speed from the movement config, m/s. */
  walkSpeed: number;
  grounded: boolean;
  mantling: boolean;
  /** Signed vertical velocity, m/s. */
  verticalVelocity: number;
  /** Facing yaw in radians; used only for its rate of change. */
  yaw: number;
  deltaSeconds: number;
  reducedMotion: boolean;
}

export interface CharacterPose {
  /** Euler XYZ per bone, in `BONE_NAMES` order. */
  readonly euler: Float32Array;
  /** Vertical offset of the whole body, in normalized character units. */
  bobY: number;
  /** Forward/back lean of the whole body, radians. */
  leanX: number;
  /** Bank into a turn, radians. */
  leanZ: number;
  /** Vertical scale; width compensates so volume is preserved. */
  squash: number;
  /** 0..1 brightness modulation for the lantern. */
  lanternPulse: number;
}

const BONE_COUNT = BONE_NAMES.length;
const CHANNELS = BONE_COUNT * 3;

const INDEX = new Map(BONE_NAMES.map((name, i) => [name, i]));
function idx(name: string): number {
  const found = INDEX.get(name);
  if (found === undefined) throw new Error(`Unknown character bone "${name}".`);
  return found;
}

const HIPS = idx("hips");
const SPINE = idx("spine");
const CHEST = idx("chest");
const NECK = idx("neck");
const HEAD = idx("head");
const SHOULDER_L = idx("shoulder.L");
const SHOULDER_R = idx("shoulder.R");
const ELBOW_L = idx("elbow.L");
const ELBOW_R = idx("elbow.R");
const WRIST_L = idx("wrist.L");
const WRIST_R = idx("wrist.R");
const HIP_L = idx("hip.L");
const HIP_R = idx("hip.R");
const KNEE_L = idx("knee.L");
const KNEE_R = idx("knee.R");
const ANKLE_L = idx("ankle.L");
const ANKLE_R = idx("ankle.R");
const SCARF = [idx("scarf.1"), idx("scarf.2"), idx("scarf.3")] as const;

/** Total duration of the landing recovery overlay. */
export const LAND_RECOVERY_SECONDS = 0.34;
/** Fall speed, m/s, that produces a full-strength landing. */
export const FULL_IMPACT_SPEED = 4;
/** Duration the mantle pose plays over; matches `core/constants.ts`. */
export const MANTLE_POSE_SECONDS = 0.3;

interface SpringTuning {
  /** Natural frequency, rad/s. Higher is crisper. */
  omega: number;
  /** Damping ratio. Below 1 overshoots and settles — the follow-through. */
  zeta: number;
}

const LEG: SpringTuning = { omega: 27, zeta: 0.95 };
const CORE: SpringTuning = { omega: 19, zeta: 0.85 };
const ARM: SpringTuning = { omega: 15, zeta: 0.6 };
const LOOK: SpringTuning = { omega: 13, zeta: 0.55 };
// Loose enough to lag and wobble, damped enough that the tail never overshoots
// up over the character's own head.
const CLOTH: SpringTuning = { omega: 10.5, zeta: 0.42 };

function tuningFor(name: string): SpringTuning {
  if (name.startsWith("scarf")) return CLOTH;
  if (name === "head" || name === "neck") return LOOK;
  if (name.startsWith("shoulder") || name.startsWith("elbow") || name.startsWith("wrist")) return ARM;
  if (name.startsWith("hip.") || name.startsWith("knee") || name.startsWith("ankle")) return LEG;
  return CORE;
}

const CHANNEL_OMEGA = new Float32Array(CHANNELS);
const CHANNEL_ZETA = new Float32Array(CHANNELS);
for (let b = 0; b < BONE_COUNT; b += 1) {
  const tuning = tuningFor(BONE_NAMES[b]!);
  for (let c = 0; c < 3; c += 1) {
    CHANNEL_OMEGA[b * 3 + c] = tuning.omega;
    CHANNEL_ZETA[b * 3 + c] = tuning.zeta;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Smooth 0→1 ramp with zero slope at both ends. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Writes bone euler XYZ into a pose buffer. */
function set(buffer: Float32Array, bone: number, x: number, y: number, z: number): void {
  buffer[bone * 3] = x;
  buffer[bone * 3 + 1] = y;
  buffer[bone * 3 + 2] = z;
}

interface Layer {
  euler: Float32Array;
  bobY: number;
  leanX: number;
  leanZ: number;
  squash: number;
}

function newLayer(): Layer {
  return { euler: new Float32Array(CHANNELS), bobY: 0, leanX: 0, leanZ: 0, squash: 1 };
}

function resetLayer(layer: Layer): void {
  layer.euler.fill(0);
  layer.bobY = 0;
  layer.leanX = 0;
  layer.leanZ = 0;
  layer.squash = 1;
}

function accumulate(into: Layer, from: Layer, weight: number): void {
  if (weight <= 0) return;
  for (let i = 0; i < CHANNELS; i += 1) into.euler[i] = into.euler[i]! + from.euler[i]! * weight;
  into.bobY += from.bobY * weight;
  into.leanX += from.leanX * weight;
  into.leanZ += from.leanZ * weight;
  into.squash += (from.squash - 1) * weight;
}

/* ------------------------------------------------------------------ clips */

/**
 * Idle: breathing on the spine, a slow weight shift through the hips, and an
 * occasional look around. Three frequencies that do not divide into each other,
 * so the loop never visibly repeats.
 */
export function poseIdle(out: Layer, time: number): void {
  resetLayer(out);
  const breath = Math.sin(time * 1.35);
  const sway = Math.sin(time * 0.62);
  const glance = Math.sin(time * 0.31) * Math.sin(time * 0.17 + 1.1);

  set(out.euler, SPINE, -0.018 - breath * 0.022, sway * 0.05, 0);
  set(out.euler, CHEST, breath * 0.03, 0, 0);
  set(out.euler, HIPS, 0.012, -sway * 0.04, sway * 0.035);
  set(out.euler, NECK, breath * 0.012, glance * 0.16, 0);
  set(out.euler, HEAD, -0.03 - breath * 0.02, glance * 0.3, sway * 0.02);

  // Arms hang slightly away from the body and drift with the breath.
  set(out.euler, SHOULDER_L, breath * 0.03, 0, -0.22 - sway * 0.025);
  set(out.euler, SHOULDER_R, breath * 0.03, 0, 0.22 + sway * 0.025);
  set(out.euler, ELBOW_L, 0.2, 0, -0.06);
  set(out.euler, ELBOW_R, 0.2, 0, 0.06);
  set(out.euler, WRIST_L, 0.08, 0, 0);
  set(out.euler, WRIST_R, 0.08, 0, 0);

  set(out.euler, HIP_L, 0.02, 0, 0.012);
  set(out.euler, HIP_R, 0.02, 0, -0.012);
  set(out.euler, KNEE_L, 0.05, 0, 0);
  set(out.euler, KNEE_R, 0.05, 0, 0);

  out.bobY = breath * 0.006;
  out.leanX = 0.01;
}

/**
 * Shared structure for the two locomotion clips. `gait` scales everything that
 * should grow between a walk and a run, which keeps the two clips genuinely
 * the same motion at two energies — that is why blending between them never
 * produces a broken in-between pose.
 */
function poseGait(out: Layer, phase: number, gait: number): void {
  resetLayer(out);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  // Double-frequency bounce: one dip per footfall, two per stride.
  const bounce = Math.cos(phase * 2);

  const swing = 0.5 + gait * 0.42;
  const lift = 0.42 + gait * 0.62;

  // Legs. The knee may not hyperextend, so its bend is clamped at zero; the
  // offset phase is what makes the foot pick up behind and reach out in front.
  const kneeL = Math.max(0, 0.22 + gait * 0.35 + Math.sin(phase + 1.35) * lift * 0.62);
  const kneeR = Math.max(0, 0.22 + gait * 0.35 + Math.sin(phase + 1.35 + Math.PI) * lift * 0.62);
  set(out.euler, HIP_L, -s * swing, 0, 0.02);
  set(out.euler, HIP_R, s * swing, 0, -0.02);
  set(out.euler, KNEE_L, kneeL, 0, 0);
  set(out.euler, KNEE_R, kneeR, 0, 0);
  // Ankles roll through the step: toe-off behind, heel-lead in front.
  set(out.euler, ANKLE_L, clamp(s * 0.42 - kneeL * 0.3, -0.5, 0.45), 0, 0);
  set(out.euler, ANKLE_R, clamp(-s * 0.42 - kneeR * 0.3, -0.5, 0.45), 0, 0);

  // Pelvis and torso counter-rotate. This is the single biggest readability
  // win in a walk: without it the upper body looks bolted on.
  set(out.euler, HIPS, 0.02 + gait * 0.05, s * (0.11 + gait * 0.1), c * (0.05 + gait * 0.05));
  set(out.euler, SPINE, -0.02 - gait * 0.08, -s * (0.08 + gait * 0.09), -c * 0.03);
  set(out.euler, CHEST, -0.02 - gait * 0.1, -s * (0.07 + gait * 0.1), 0);
  set(out.euler, NECK, 0.02 + gait * 0.06, s * 0.05, 0);
  // Head stays level while the body bounces underneath it.
  set(out.euler, HEAD, 0.03 + bounce * 0.05 + gait * 0.04, s * 0.07, -c * 0.03);

  // Arms swing opposite the legs, and fold up as the gait gets faster.
  const armSwing = 0.38 + gait * 0.46;
  const elbowBase = 0.26 + gait * 1.0;
  set(out.euler, SHOULDER_L, s * armSwing, -s * 0.12, -0.13 - gait * 0.08);
  set(out.euler, SHOULDER_R, -s * armSwing, s * 0.12, 0.13 + gait * 0.08);
  set(out.euler, ELBOW_L, elbowBase + Math.max(0, s) * (0.2 + gait * 0.35), 0, -0.05);
  set(out.euler, ELBOW_R, elbowBase + Math.max(0, -s) * (0.2 + gait * 0.35), 0, 0.05);
  set(out.euler, WRIST_L, 0.1 + gait * 0.15, 0, 0);
  set(out.euler, WRIST_R, 0.1 + gait * 0.15, 0, 0);

  out.bobY = (bounce - 1) * (0.012 + gait * 0.02) * 0.5;
  out.leanX = 0.05 + gait * 0.2;
  out.squash = 1 - bounce * (0.012 + gait * 0.016);
}

export function poseWalk(out: Layer, phase: number): void {
  poseGait(out, phase, 0);
}

export function poseRun(out: Layer, phase: number): void {
  poseGait(out, phase, 1);
}

/** Rising: arms thrown up and out, knees tucked, chest opened. */
export function poseRise(out: Layer, progress: number): void {
  resetLayer(out);
  const t = clamp(progress, 0, 1);
  set(out.euler, HIPS, -0.1, 0, 0);
  set(out.euler, SPINE, -0.12, 0, 0);
  set(out.euler, CHEST, -0.1, 0, 0);
  set(out.euler, NECK, -0.06, 0, 0);
  set(out.euler, HEAD, -0.12, 0, 0);
  set(out.euler, SHOULDER_L, -1.85 - t * 0.35, 0.1, -0.42);
  set(out.euler, SHOULDER_R, -1.85 - t * 0.35, -0.1, 0.42);
  set(out.euler, ELBOW_L, 0.32, 0, -0.14);
  set(out.euler, ELBOW_R, 0.32, 0, 0.14);
  set(out.euler, WRIST_L, -0.2, 0, 0);
  set(out.euler, WRIST_R, -0.2, 0, 0);
  set(out.euler, HIP_L, -0.62, 0, 0.06);
  set(out.euler, HIP_R, -0.38, 0, -0.06);
  set(out.euler, KNEE_L, 0.95, 0, 0);
  set(out.euler, KNEE_R, 0.66, 0, 0);
  set(out.euler, ANKLE_L, -0.34, 0, 0);
  set(out.euler, ANKLE_R, -0.34, 0, 0);
  out.leanX = -0.08;
  out.squash = 1.055;
}

/** Falling: arms out wide to balance, legs reaching for the ground. */
export function poseFall(out: Layer, progress: number): void {
  resetLayer(out);
  const t = clamp(progress, 0, 1);
  set(out.euler, HIPS, 0.06, 0, 0);
  set(out.euler, SPINE, 0.1, 0, 0);
  set(out.euler, CHEST, 0.08, 0, 0);
  set(out.euler, NECK, 0.08, 0, 0);
  set(out.euler, HEAD, 0.16, 0, 0);
  set(out.euler, SHOULDER_L, -1.15, 0.2, -0.8 - t * 0.2);
  set(out.euler, SHOULDER_R, -1.15, -0.2, 0.8 + t * 0.2);
  set(out.euler, ELBOW_L, 0.5, 0, -0.2);
  set(out.euler, ELBOW_R, 0.5, 0, 0.2);
  set(out.euler, WRIST_L, 0.1, 0, 0);
  set(out.euler, WRIST_R, 0.1, 0, 0);
  // The legs straighten out and spread as the ground gets closer, which is
  // what makes the landing read as anticipated rather than a sudden snap.
  set(out.euler, HIP_L, -0.1 + t * 0.22, 0, 0.11);
  set(out.euler, HIP_R, 0.14 - t * 0.1, 0, -0.11);
  set(out.euler, KNEE_L, 0.5 - t * 0.34, 0, 0);
  set(out.euler, KNEE_R, 0.3 - t * 0.2, 0, 0);
  set(out.euler, ANKLE_L, -0.16, 0, 0);
  set(out.euler, ANKLE_R, -0.16, 0, 0);
  out.leanX = 0.1;
  out.squash = 1.03 - t * 0.03;
}

/**
 * Landing, applied additively on top of whatever the character is doing next,
 * so a player who keeps running lands into a stride instead of stopping to
 * play a landing animation.
 */
export function poseLand(out: Layer, strength: number): void {
  resetLayer(out);
  const s = clamp(strength, 0, 1);
  set(out.euler, HIPS, 0.28 * s, 0, 0);
  set(out.euler, SPINE, 0.3 * s, 0, 0);
  set(out.euler, CHEST, 0.16 * s, 0, 0);
  set(out.euler, NECK, -0.1 * s, 0, 0);
  set(out.euler, HEAD, -0.22 * s, 0, 0);
  set(out.euler, SHOULDER_L, 0.72 * s, 0, -0.34 * s);
  set(out.euler, SHOULDER_R, 0.72 * s, 0, 0.34 * s);
  set(out.euler, ELBOW_L, 0.5 * s, 0, 0);
  set(out.euler, ELBOW_R, 0.5 * s, 0, 0);
  set(out.euler, HIP_L, 0.34 * s, 0, 0.14 * s);
  set(out.euler, HIP_R, 0.34 * s, 0, -0.14 * s);
  set(out.euler, KNEE_L, 1.15 * s, 0, 0);
  set(out.euler, KNEE_R, 1.15 * s, 0, 0);
  set(out.euler, ANKLE_L, -0.4 * s, 0, 0);
  set(out.euler, ANKLE_R, -0.4 * s, 0, 0);
  out.bobY = -0.075 * s;
  out.leanX = 0.24 * s;
  out.squash = 1 - 0.17 * s;
}

/**
 * Mantle: reach for the lip in the first half, pull the body over it in the
 * second. `progress` is the same 0..1 the scripted mantle movement runs on.
 */
export function poseMantle(out: Layer, progress: number): void {
  resetLayer(out);
  const t = clamp(progress, 0, 1);
  const reach = 1 - smoothstep(0.3, 0.75, t);
  const pull = smoothstep(0.25, 0.9, t);

  set(out.euler, HIPS, 0.3 * reach - 0.14 * pull, 0, 0);
  set(out.euler, SPINE, 0.34 * reach - 0.22 * pull, 0.05, 0);
  set(out.euler, CHEST, 0.2 * reach - 0.26 * pull, -0.05, 0);
  set(out.euler, NECK, -0.28 * reach + 0.1 * pull, 0, 0);
  set(out.euler, HEAD, -0.36 * reach + 0.14 * pull, 0, 0);

  // Overhead through the whole move. The elbows only close a little: folding
  // them hard drags the hands back down to chest height, which reads as
  // holding something rather than as hauling yourself over a lip.
  // Spread as well as raised, so the hands grip the lip out to either side
  // instead of parking in front of the character's own face.
  const overhead = -2.6 - 0.15 * reach;
  set(out.euler, SHOULDER_L, overhead, 0.12, -0.5);
  set(out.euler, SHOULDER_R, overhead, -0.12, 0.5);
  set(out.euler, ELBOW_L, 0.18 + pull * 0.5, 0, -0.1);
  set(out.euler, ELBOW_R, 0.18 + pull * 0.5, 0, 0.1);
  set(out.euler, WRIST_L, -0.3, 0, 0);
  set(out.euler, WRIST_R, -0.3, 0, 0);

  // One knee drives up onto the ledge while the other trails.
  set(out.euler, HIP_L, -0.5 - pull * 0.75, 0, 0.1);
  set(out.euler, HIP_R, 0.28 - pull * 0.28, 0, -0.08);
  set(out.euler, KNEE_L, 0.7 + pull * 0.85, 0, 0);
  set(out.euler, KNEE_R, 0.34 + pull * 0.3, 0, 0);
  set(out.euler, ANKLE_L, -0.2, 0, 0);
  set(out.euler, ANKLE_R, -0.3, 0, 0);

  out.leanX = 0.1 * reach + 0.16 * pull;
  out.squash = 1.04;
}

/* --------------------------------------------------------------- animator */

export class CharacterAnimator {
  private readonly current = new Float32Array(CHANNELS);
  private readonly velocity = new Float32Array(CHANNELS);
  private readonly target: Layer = newLayer();
  private readonly scratch: Layer = newLayer();
  private readonly overlay: Layer = newLayer();

  private extraCurrent = new Float32Array(4); // bobY, leanX, leanZ, squash
  private extraVelocity = new Float32Array(4);

  private stridePhase = 0;
  private clock = 0;
  private airTime = 0;
  private mantleTime = 0;
  private landTime = Number.POSITIVE_INFINITY;
  private landStrength = 0;
  private lastAirborneFallSpeed = 0;
  private wasGrounded = true;
  private previousYaw: number | null = null;
  private yawRate = 0;

  private readonly pose: CharacterPose = {
    euler: this.current,
    bobY: 0,
    leanX: 0,
    leanZ: 0,
    squash: 1,
    lanternPulse: 0,
  };

  constructor() {
    this.extraCurrent[3] = 1;
  }

  /** Stride angle accumulated so far. Advances with distance covered, never
   * with time; exposed for diagnostics and tests. */
  get stridePhaseRadians(): number {
    return this.stridePhase;
  }

  /** The blended clip output *before* the springs smooth it. Exposed so a test
   * can show how much of a hard state change the springs actually absorb. */
  get unsmoothedTarget(): Readonly<Float32Array> {
    return this.target.euler;
  }

  /** Snaps to the current target, e.g. after a respawn, so the character does
   * not spring across the level from its old pose. */
  reset(): void {
    this.velocity.fill(0);
    this.extraVelocity.fill(0);
    this.stridePhase = 0;
    this.airTime = 0;
    this.mantleTime = 0;
    this.landTime = Number.POSITIVE_INFINITY;
    this.landStrength = 0;
    this.wasGrounded = true;
    this.previousYaw = null;
    this.yawRate = 0;
  }

  update(input: AnimatorInput): CharacterPose {
    const dt = clamp(input.deltaSeconds, 0, 0.1);
    this.clock += dt;

    const airborne = !input.grounded || input.mantling;
    const speedFactor = clamp(input.speed / Math.max(input.walkSpeed, 1e-3), 0, 1);

    // --- timers ------------------------------------------------------------
    if (airborne) {
      this.airTime += dt;
      if (input.verticalVelocity < 0) {
        this.lastAirborneFallSpeed = Math.max(this.lastAirborneFallSpeed, -input.verticalVelocity);
      }
    } else {
      if (!this.wasGrounded) {
        this.landStrength = clamp(this.lastAirborneFallSpeed / FULL_IMPACT_SPEED, 0.18, 1);
        this.landTime = 0;
      }
      this.airTime = 0;
      this.lastAirborneFallSpeed = 0;
    }
    this.wasGrounded = !airborne;
    if (this.landTime !== Number.POSITIVE_INFINITY) this.landTime += dt;
    this.mantleTime = input.mantling ? this.mantleTime + dt : 0;

    if (this.previousYaw === null) this.previousYaw = input.yaw;
    let yawDelta = input.yaw - this.previousYaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    this.previousYaw = input.yaw;
    const instantYawRate = dt > 1e-5 ? yawDelta / dt : 0;
    this.yawRate += (instantYawRate - this.yawRate) * clamp(dt * 9, 0, 1);

    // --- stride ------------------------------------------------------------
    // Advanced by distance covered, so the feet never skate.
    if (!input.reducedMotion && !airborne) {
      // 2.6 stride radians per metre keeps the step length a believable
      // fraction of the character's own leg length at every speed.
      this.stridePhase += input.speed * dt * 8.4;
    } else if (!input.reducedMotion) {
      this.stridePhase += dt * 1.5;
    }
    if (this.stridePhase > Math.PI * 2048) this.stridePhase -= Math.PI * 2048;

    // --- layer weights -----------------------------------------------------
    const groundWeight = airborne ? 0 : 1;
    const runWeight = smoothstep(0.42, 0.95, speedFactor);
    const moveWeight = smoothstep(0.04, 0.3, speedFactor);
    const idleWeight = (1 - moveWeight) * groundWeight;
    const walkWeight = moveWeight * (1 - runWeight) * groundWeight;
    const runW = moveWeight * runWeight * groundWeight;

    // Rise → fall crossfades on vertical velocity rather than on a state
    // change, so the apex of a jump is a real in-between pose.
    const fallWeight = smoothstep(1.2, -1.6, input.verticalVelocity);
    const airWeight = airborne ? 1 : 0;

    resetLayer(this.target);
    if (input.reducedMotion) {
      // Reduced motion keeps posture and state readability but drops the
      // cyclic movement entirely.
      poseIdle(this.scratch, 0);
      accumulate(this.target, this.scratch, groundWeight);
      if (airWeight > 0) {
        poseFall(this.scratch, 0.5);
        accumulate(this.target, this.scratch, airWeight);
      }
    } else {
      if (idleWeight > 0) {
        poseIdle(this.scratch, this.clock);
        accumulate(this.target, this.scratch, idleWeight);
      }
      if (walkWeight > 0) {
        poseWalk(this.scratch, this.stridePhase);
        accumulate(this.target, this.scratch, walkWeight);
      }
      if (runW > 0) {
        poseRun(this.scratch, this.stridePhase);
        accumulate(this.target, this.scratch, runW);
      }
      if (airWeight > 0) {
        poseRise(this.scratch, clamp(this.airTime / 0.35, 0, 1));
        accumulate(this.target, this.scratch, airWeight * (1 - fallWeight));
        poseFall(this.scratch, clamp((this.airTime - 0.2) / 0.7, 0, 1));
        accumulate(this.target, this.scratch, airWeight * fallWeight);
      }
    }

    // Mantle replaces rather than blends: it is a scripted movement and a
    // half-mantle pose would not match where the body actually goes.
    if (input.mantling) {
      const progress = clamp(this.mantleTime / MANTLE_POSE_SECONDS, 0, 1);
      poseMantle(this.overlay, progress);
      const takeover = input.reducedMotion ? 1 : smoothstep(0, 0.08, this.mantleTime);
      for (let i = 0; i < CHANNELS; i += 1) {
        this.target.euler[i] =
          this.target.euler[i]! + (this.overlay.euler[i]! - this.target.euler[i]!) * takeover;
      }
      this.target.bobY += (this.overlay.bobY - this.target.bobY) * takeover;
      this.target.leanX += (this.overlay.leanX - this.target.leanX) * takeover;
      this.target.squash += (this.overlay.squash - this.target.squash) * takeover;
    }

    // Landing rides on top, decaying out of the way.
    if (!input.reducedMotion && this.landTime < LAND_RECOVERY_SECONDS) {
      const t = this.landTime / LAND_RECOVERY_SECONDS;
      const envelope = (1 - t) ** 1.7;
      poseLand(this.overlay, this.landStrength * envelope);
      accumulate(this.target, this.overlay, 1);
    }

    if (!input.reducedMotion) {
      this.applyMotionDrivenLayers(input, speedFactor, airborne);
    }

    // --- integrate ---------------------------------------------------------
    this.integrate(dt);

    this.pose.bobY = this.extraCurrent[0]!;
    this.pose.leanX = this.extraCurrent[1]!;
    this.pose.leanZ = this.extraCurrent[2]!;
    this.pose.squash = this.extraCurrent[3]!;
    this.pose.lanternPulse = input.reducedMotion
      ? 0
      : Math.sin(this.clock * 2.1) * 0.5 + Math.sin(this.clock * 0.7) * 0.2;
    return this.pose;
  }

  /**
   * Scarf and head reactions that come from how the character is moving rather
   * than from which clip is playing. Layered after the clips so they survive
   * every blend.
   */
  private applyMotionDrivenLayers(
    input: AnimatorInput,
    speedFactor: number,
    airborne: boolean,
  ): void {
    const bank = clamp(-this.yawRate * 0.07, -0.16, 0.16) * speedFactor;
    this.target.leanZ += bank;

    // The head leads a turn slightly; the loose spring on it then lags the
    // rest of the body back into line.
    const lead = clamp(this.yawRate * 0.075, -0.32, 0.32);
    this.target.euler[HEAD * 3 + 1] = this.target.euler[HEAD * 3 + 1]! + lead;
    this.target.euler[NECK * 3 + 1] = this.target.euler[NECK * 3 + 1]! + lead * 0.35;

    // Scarf. Positive X on these bones swings the tail back and up, so the
    // stream grows with speed; the sideways term throws it out of a turn, and
    // the airborne term lifts it as the character drops.
    const stream = speedFactor * 0.62 + (airborne ? clamp(-input.verticalVelocity * 0.05, -0.16, 0.3) : 0);
    const sideways = clamp(this.yawRate * 0.16, -0.6, 0.6);
    const flutter = Math.sin(this.clock * 3.7) * (0.04 + speedFactor * 0.1);
    for (let i = 0; i < SCARF.length; i += 1) {
      const bone = SCARF[i]!;
      // Tapers hard down the tail, and capped: the three joints compound, so
      // without both of these the scarf whips up over the character's own head
      // on a jump, which reads as a bug rather than as momentum.
      const falloff = 1 - i * 0.3;
      this.target.euler[bone * 3] =
        this.target.euler[bone * 3]! + clamp((stream * 0.55 + flutter) * falloff, -0.24, 0.32);
      this.target.euler[bone * 3 + 1] =
        this.target.euler[bone * 3 + 1]! + sideways * falloff;
      this.target.euler[bone * 3 + 2] =
        this.target.euler[bone * 3 + 2]! + Math.sin(this.clock * 2.3 + i) * 0.05 * falloff;
    }
  }

  /**
   * Semi-implicit spring integration, sub-stepped so a long frame can never
   * make a stiff channel explode. Every channel keeps its own velocity, which
   * is what produces overshoot on the loose ones.
   */
  private integrate(dt: number): void {
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-6 && guard < 16) {
      const h = Math.min(remaining, 1 / 120);
      remaining -= h;
      guard += 1;

      for (let i = 0; i < CHANNELS; i += 1) {
        const omega = CHANNEL_OMEGA[i]!;
        const zeta = CHANNEL_ZETA[i]!;
        const x = this.current[i]!;
        const v = this.velocity[i]!;
        const nextV = v + (-2 * zeta * omega * v - omega * omega * (x - this.target.euler[i]!)) * h;
        this.velocity[i] = nextV;
        this.current[i] = x + nextV * h;
      }

      this.stepExtra(0, this.target.bobY, 24, 0.85, h);
      this.stepExtra(1, this.target.leanX, 11, 0.7, h);
      this.stepExtra(2, this.target.leanZ, 9, 0.6, h);
      this.stepExtra(3, this.target.squash, 26, 0.72, h);
    }
  }

  private stepExtra(slot: number, target: number, omega: number, zeta: number, h: number): void {
    const x = this.extraCurrent[slot]!;
    const v = this.extraVelocity[slot]!;
    const nextV = v + (-2 * zeta * omega * v - omega * omega * (x - target)) * h;
    this.extraVelocity[slot] = nextV;
    this.extraCurrent[slot] = x + nextV * h;
  }
}

export { newLayer as createPoseLayer, type Layer as PoseLayer };
