/**
 * These lock down the behaviour that makes the animation read as deliberate
 * rather than as noise: feet that never skate, limbs that alternate, poses that
 * actually respond to the physics state, and springs that stay stable at any
 * frame rate.
 */

import { describe, expect, it } from "vitest";
import { MINIATURE_CAPSULE_HEIGHT } from "../../core/characterScale.js";
import {
  CharacterAnimator,
  LAND_RECOVERY_SECONDS,
  MANTLE_POSE_SECONDS,
  REFERENCE_STRIDE_RADIANS_PER_METRE,
  STRIDE_REFERENCE_HEIGHT,
  gaitTempoForHeight,
  strideRadiansPerMetre,
  createPoseLayer,
  poseLand,
  poseMantle,
  poseRun,
  poseWalk,
  type AnimatorInput,
} from "./characterAnimator.js";
import { BONE_NAMES } from "./characterRig.js";

const WALK_SPEED = 2.2;

function channel(euler: Float32Array, bone: string, axis: 0 | 1 | 2): number {
  const index = BONE_NAMES.indexOf(bone);
  return euler[index * 3 + axis]!;
}

function input(overrides: Partial<AnimatorInput> = {}): AnimatorInput {
  return {
    speed: 0,
    walkSpeed: WALK_SPEED,
    grounded: true,
    mantling: false,
    verticalVelocity: 0,
    yaw: 0,
    deltaSeconds: 1 / 60,
    reducedMotion: false,
    ...overrides,
  };
}

/** Runs the animator and returns a copy of the final pose. */
function run(
  animator: CharacterAnimator,
  frames: number,
  overrides: Partial<AnimatorInput> | ((frame: number) => Partial<AnimatorInput>),
): { euler: Float32Array; bobY: number; leanX: number; leanZ: number; squash: number } {
  let pose = animator.update(input(typeof overrides === "function" ? overrides(0) : overrides));
  for (let frame = 1; frame < frames; frame += 1) {
    pose = animator.update(
      input(typeof overrides === "function" ? overrides(frame) : overrides),
    );
  }
  return {
    euler: Float32Array.from(pose.euler),
    bobY: pose.bobY,
    leanX: pose.leanX,
    leanZ: pose.leanZ,
    squash: pose.squash,
  };
}

describe("locomotion clips", () => {
  it("never hyperextends a knee", () => {
    const layer = createPoseLayer();
    for (let step = 0; step < 240; step += 1) {
      const phase = (step / 240) * Math.PI * 2;
      for (const pose of [poseWalk, poseRun]) {
        pose(layer, phase);
        expect(channel(layer.euler, "knee.L", 0)).toBeGreaterThanOrEqual(0);
        expect(channel(layer.euler, "knee.R", 0)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("swings the legs in opposition and the arms against them", () => {
    const layer = createPoseLayer();
    poseWalk(layer, Math.PI / 2); // peak of the swing
    const hipL = channel(layer.euler, "hip.L", 0);
    const hipR = channel(layer.euler, "hip.R", 0);
    const shoulderL = channel(layer.euler, "shoulder.L", 0);

    expect(Math.sign(hipL)).toBe(-Math.sign(hipR));
    expect(Math.abs(hipL)).toBeGreaterThan(0.3);
    // The arm on the same side swings with the *opposite* leg.
    expect(Math.sign(shoulderL)).toBe(-Math.sign(hipL));
  });

  it("runs with more reach than it walks", () => {
    const walk = createPoseLayer();
    const runPose = createPoseLayer();
    poseWalk(walk, Math.PI / 2);
    poseRun(runPose, Math.PI / 2);

    expect(Math.abs(channel(runPose.euler, "hip.L", 0))).toBeGreaterThan(
      Math.abs(channel(walk.euler, "hip.L", 0)),
    );
    expect(channel(runPose.euler, "elbow.L", 0)).toBeGreaterThan(
      channel(walk.euler, "elbow.L", 0),
    );
    expect(runPose.leanX).toBeGreaterThan(walk.leanX);
  });

  it("puts the hands overhead through the whole mantle", () => {
    const layer = createPoseLayer();
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      poseMantle(layer, progress);
      expect(channel(layer.euler, "shoulder.L", 0)).toBeLessThan(-2);
      expect(channel(layer.euler, "shoulder.R", 0)).toBeLessThan(-2);
    }
    // The trailing knee drives up as the body is pulled over the lip.
    poseMantle(layer, 0);
    const early = channel(layer.euler, "knee.L", 0);
    poseMantle(layer, 1);
    expect(channel(layer.euler, "knee.L", 0)).toBeGreaterThan(early);
  });

  it("compresses on landing in proportion to the impact", () => {
    const soft = createPoseLayer();
    const hard = createPoseLayer();
    poseLand(soft, 0.2);
    poseLand(hard, 1);
    expect(hard.squash).toBeLessThan(soft.squash);
    expect(hard.squash).toBeLessThan(1);
    expect(hard.bobY).toBeLessThan(soft.bobY);
    expect(channel(hard.euler, "knee.L", 0)).toBeGreaterThan(channel(soft.euler, "knee.L", 0));
  });
});

describe("CharacterAnimator", () => {
  it("does not advance the stride while standing still", () => {
    const animator = new CharacterAnimator();
    const pose = run(animator, 180, { speed: 0 });
    // Idle only tilts the hips a few hundredths; a stride would be ~0.5 rad.
    expect(Math.abs(channel(pose.euler, "hip.L", 0))).toBeLessThan(0.12);
    expect(Math.abs(channel(pose.euler, "knee.L", 0))).toBeLessThan(0.2);
  });

  it("advances the stride with distance covered, not with time", () => {
    // Two metres of ground covered must put the legs at the same point in the
    // cycle however that distance was spent — that is what stops the feet
    // skating when the frame rate or the speed changes.
    const atSixty = new CharacterAnimator();
    run(atSixty, 60, { speed: 2, deltaSeconds: 1 / 60 });

    const atOneTwenty = new CharacterAnimator();
    run(atOneTwenty, 120, { speed: 2, deltaSeconds: 1 / 120 });

    const halfSpeedTwiceAsLong = new CharacterAnimator();
    run(halfSpeedTwiceAsLong, 120, { speed: 1, deltaSeconds: 1 / 60 });

    expect(atOneTwenty.stridePhaseRadians).toBeCloseTo(atSixty.stridePhaseRadians, 6);
    expect(halfSpeedTwiceAsLong.stridePhaseRadians).toBeCloseTo(atSixty.stridePhaseRadians, 6);

    // Standing still burns no stride at all.
    const parked = new CharacterAnimator();
    run(parked, 300, { speed: 0 });
    expect(parked.stridePhaseRadians).toBe(0);

    // At the same speed, the actual pose matches across frame rates too.
    const sixtyPose = run(new CharacterAnimator(), 60, { speed: 2, deltaSeconds: 1 / 60 });
    const oneTwentyPose = run(new CharacterAnimator(), 120, { speed: 2, deltaSeconds: 1 / 120 });
    for (const bone of ["hip.L", "hip.R", "knee.L", "knee.R"]) {
      expect(channel(sixtyPose.euler, bone, 0)).toBeCloseTo(
        channel(oneTwentyPose.euler, bone, 0),
        1,
      );
    }
  });

  it("reaches for the ledge when the simulation reports a mantle", () => {
    const animator = new CharacterAnimator();
    const frames = Math.round(MANTLE_POSE_SECONDS * 0.6 * 60);
    const pose = run(animator, frames, { mantling: true, grounded: false, speed: 0 });
    expect(channel(pose.euler, "shoulder.L", 0)).toBeLessThan(-1.4);
    expect(channel(pose.euler, "shoulder.R", 0)).toBeLessThan(-1.4);
  });

  it("absorbs a landing and then recovers out of it", () => {
    const animator = new CharacterAnimator();
    // Fall hard, then touch down.
    run(animator, 30, { grounded: false, verticalVelocity: -5, speed: 0 });
    const onTouchdown = run(animator, 6, { grounded: true, verticalVelocity: 0, speed: 0 });
    expect(onTouchdown.squash).toBeLessThan(0.97);
    expect(onTouchdown.bobY).toBeLessThan(-0.01);

    const recovered = run(animator, Math.round((LAND_RECOVERY_SECONDS + 0.6) * 60), {
      grounded: true,
      speed: 0,
    });
    expect(recovered.squash).toBeGreaterThan(0.99);
    expect(Math.abs(recovered.bobY)).toBeLessThan(0.02);
  });

  it("scales the landing with how fast the character was falling", () => {
    const gentle = new CharacterAnimator();
    run(gentle, 10, { grounded: false, verticalVelocity: -0.6, speed: 0 });
    const gentlePose = run(gentle, 5, { grounded: true, speed: 0 });

    const heavy = new CharacterAnimator();
    run(heavy, 10, { grounded: false, verticalVelocity: -6, speed: 0 });
    const heavyPose = run(heavy, 5, { grounded: true, speed: 0 });

    expect(heavyPose.squash).toBeLessThan(gentlePose.squash);
  });

  it("streams the scarf backwards as the character speeds up", () => {
    const still = new CharacterAnimator();
    const stillPose = run(still, 120, { speed: 0 });

    const sprinting = new CharacterAnimator();
    const sprintPose = run(sprinting, 120, { speed: WALK_SPEED });

    // Positive X on the scarf bones swings the tail back and up (asserted
    // against the real rig in characterRig.test.ts).
    expect(channel(sprintPose.euler, "scarf.1", 0)).toBeGreaterThan(
      channel(stillPose.euler, "scarf.1", 0) + 0.2,
    );
  });

  it("banks into a turn and leads it with the head", () => {
    const animator = new CharacterAnimator();
    const pose = run(animator, 90, (frame) => ({
      speed: WALK_SPEED,
      yaw: frame * (1 / 60) * 2.5,
    }));
    expect(pose.leanZ).toBeLessThan(-0.005);
    expect(channel(pose.euler, "head", 1)).toBeGreaterThan(0.02);
  });

  it("holds a still, readable pose under reduced motion", () => {
    const animator = new CharacterAnimator();
    const settled = run(animator, 400, { speed: WALK_SPEED, reducedMotion: true });
    const later = run(animator, 120, { speed: WALK_SPEED, reducedMotion: true });
    for (let i = 0; i < settled.euler.length; i += 1) {
      expect(later.euler[i]!).toBeCloseTo(settled.euler[i]!, 3);
    }
    expect(later.squash).toBeCloseTo(1, 2);
  });

  it("stays finite and bounded through violent state changes", () => {
    // Springs are the one place a bad frame could blow up; this hammers them
    // with alternating states, long frames and reversed velocities.
    const animator = new CharacterAnimator();
    let maxAngle = 0;
    for (let frame = 0; frame < 2000; frame += 1) {
      const pose = animator.update(
        input({
          speed: frame % 7 < 3 ? WALK_SPEED : 0,
          grounded: frame % 11 < 6,
          mantling: frame % 37 < 5,
          verticalVelocity: Math.sin(frame) * 6,
          yaw: Math.sin(frame * 0.31) * 3,
          deltaSeconds: frame % 5 === 0 ? 0.1 : 1 / 240,
        }),
      );
      for (const value of pose.euler) {
        expect(Number.isFinite(value)).toBe(true);
        maxAngle = Math.max(maxAngle, Math.abs(value));
      }
      expect(Number.isFinite(pose.squash)).toBe(true);
      expect(pose.squash).toBeGreaterThan(0.5);
      expect(pose.squash).toBeLessThan(1.6);
    }
    // Nothing should ever wind past a bit over half a turn.
    expect(maxAngle).toBeLessThan(4);
  });

  it("moves smoothly frame to frame even when the state snaps", () => {
    const animator = new CharacterAnimator();
    run(animator, 120, { speed: WALK_SPEED });
    let previousPose = Float32Array.from(animator.update(input({ speed: WALK_SPEED })).euler);
    let previousTarget = Float32Array.from(animator.unsmoothedTarget);
    let worstPose = 0;
    let worstTarget = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      // Hard cut from a full run into a jump, then back again. Nothing eases
      // the state itself: `grounded` flips between one frame and the next.
      const airborne = frame > 20 && frame < 70;
      const pose = animator.update(
        input({
          speed: WALK_SPEED,
          grounded: !airborne,
          verticalVelocity: airborne ? 3 - frame * 0.1 : 0,
        }),
      );
      for (let i = 0; i < pose.euler.length; i += 1) {
        worstPose = Math.max(worstPose, Math.abs(pose.euler[i]! - previousPose[i]!));
        worstTarget = Math.max(
          worstTarget,
          Math.abs(animator.unsmoothedTarget[i]! - previousTarget[i]!),
        );
      }
      previousPose = Float32Array.from(pose.euler);
      previousTarget = Float32Array.from(animator.unsmoothedTarget);
    }

    // The clip target really does step — over a radian in a single frame — so
    // this is a live demonstration that the springs are what smooths it.
    expect(worstTarget).toBeGreaterThan(1);
    expect(worstPose).toBeLessThan(worstTarget * 0.35);
    // And in absolute terms no joint exceeds a plausible limb speed (~19 rad/s).
    expect(worstPose).toBeLessThan(0.32);
  });

  it("keeps the original tuning when no body height is given", () => {
    const animator = new CharacterAnimator();
    expect(animator.gaitTempo).toBe(1);
    expect(animator.strideRadiansPerMetre).toBe(REFERENCE_STRIDE_RADIANS_PER_METRE);
    expect(new CharacterAnimator({ bodyHeight: STRIDE_REFERENCE_HEIGHT }).strideRadiansPerMetre).toBe(
      REFERENCE_STRIDE_RADIANS_PER_METRE,
    );
  });

  it("resets cleanly for a respawn", () => {
    const animator = new CharacterAnimator();
    run(animator, 200, { speed: WALK_SPEED, grounded: false, verticalVelocity: -8 });
    animator.reset();
    const pose = animator.update(input({ speed: 0 }));
    for (const value of pose.euler) expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(pose.squash)).toBe(true);
  });
});

describe("gait paced to body size", () => {
  // Measured full-run ground speed in the shipped game (opus-visual-review.md).
  const RUN_SPEED = 1.9;
  const TINY = MINIATURE_CAPSULE_HEIGHT;

  /** Ground covered per footfall (two per stride cycle), in metres. */
  function footfallLength(height: number): number {
    return Math.PI / strideRadiansPerMetre(height);
  }

  /** Peak |hip swing| over the last second of a two-second run. */
  function peakHipSwing(animator: CharacterAnimator): number {
    run(animator, 60, { speed: WALK_SPEED });
    let peak = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const pose = animator.update(input({ speed: WALK_SPEED }));
      peak = Math.max(peak, Math.abs(channel(pose.euler, "hip.L", 0)));
    }
    return peak;
  }

  it("takes more, shorter steps as the body shrinks, sub-linearly", () => {
    expect(gaitTempoForHeight(STRIDE_REFERENCE_HEIGHT)).toBe(1);
    expect(gaitTempoForHeight(0.35)).toBeCloseTo(Math.SQRT2, 9);
    expect(gaitTempoForHeight(TINY)).toBeCloseTo(2, 9);
    expect(gaitTempoForHeight(1.4)).toBeCloseTo(Math.SQRT1_2, 9);

    // Linear scaling would keep the reference footfall in body heights; the
    // chosen curve lets each footfall grow to about one body height instead.
    const tinyFootfall = footfallLength(TINY);
    expect(tinyFootfall / TINY).toBeGreaterThan(0.9);
    expect(tinyFootfall / TINY).toBeLessThan(1.2);
    expect(footfallLength(STRIDE_REFERENCE_HEIGHT)).toBeCloseTo(0.374, 3);

    // A scurry, not a blur: roughly 10 footfalls a second at a full run,
    // against ~5 unscaled and ~20 if scaled linearly.
    const stepsPerSecond = RUN_SPEED / tinyFootfall;
    expect(stepsPerSecond).toBeGreaterThan(8);
    expect(stepsPerSecond).toBeLessThan(13);
  });

  it("falls back to the reference for nonsense heights and bounds extremes", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(gaitTempoForHeight(bad)).toBe(1);
    }
    expect(gaitTempoForHeight(0.001)).toBe(3);
    expect(gaitTempoForHeight(100)).toBe(0.5);
  });

  it("advances by distance at a fixed per-metre rate, never compounding", () => {
    const tiny = new CharacterAnimator({ bodyHeight: TINY });
    const reference = new CharacterAnimator();
    run(tiny, 120, { speed: 1.5 });
    run(reference, 120, { speed: 1.5 });
    // Exactly the tempo ratio after two seconds, so nothing is re-applied per
    // frame or per update.
    expect(tiny.stridePhaseRadians / reference.stridePhaseRadians).toBeCloseTo(2, 6);

    const firstSecond = new CharacterAnimator({ bodyHeight: TINY });
    run(firstSecond, 60, { speed: 1.5 });
    const afterOne = firstSecond.stridePhaseRadians;
    run(firstSecond, 60, { speed: 1.5 });
    expect(firstSecond.stridePhaseRadians - afterOne).toBeCloseTo(afterOne, 6);
    expect(afterOne).toBeCloseTo(1.5 * strideRadiansPerMetre(TINY), 4);

    // Same height, same input, same result: construction is deterministic.
    const again = new CharacterAnimator({ bodyHeight: TINY });
    run(again, 120, { speed: 1.5 });
    expect(again.stridePhaseRadians).toBe(tiny.stridePhaseRadians);

    // And still frame-rate independent at the miniature size.
    const fast = new CharacterAnimator({ bodyHeight: TINY });
    run(fast, 240, { speed: 1.5, deltaSeconds: 1 / 120 });
    expect(fast.stridePhaseRadians).toBeCloseTo(tiny.stridePhaseRadians, 5);
  });

  it("keeps the legs swinging fully at the faster cadence", () => {
    // Springs tuned for the reference cadence would filter a doubled cycle
    // down to a shuffle; the gait springs speed up with it.
    const reference = peakHipSwing(new CharacterAnimator());
    for (const height of [0.35, TINY, 0.12]) {
      const peak = peakHipSwing(new CharacterAnimator({ bodyHeight: height }));
      expect(peak).toBeGreaterThan(reference * 0.85);
      expect(peak).toBeLessThan(reference * 1.25);
    }
  });

  it("still blends run, jump, landing and mantle smoothly at miniature size", () => {
    /** Largest single-frame joint move in each window of a run → jump →
     * land → mantle → run sequence with hard state cuts. */
    function transitionJumps(bodyHeight?: number) {
      const animator = new CharacterAnimator(bodyHeight ? { bodyHeight } : {});
      run(animator, 120, { speed: WALK_SPEED });
      let previous = Float32Array.from(animator.update(input({ speed: WALK_SPEED })).euler);
      const worst = { air: 0, landing: 0, mantle: 0, all: 0 };
      for (let frame = 0; frame < 200; frame += 1) {
        const airborne = frame > 20 && frame < 70;
        const mantling = frame >= 120 && frame < 140;
        const pose = animator.update(
          input({
            speed: mantling ? 0 : WALK_SPEED,
            grounded: !airborne && !mantling,
            mantling,
            verticalVelocity: airborne ? 3 - frame * 0.1 : 0,
          }),
        );
        let step = 0;
        for (let i = 0; i < pose.euler.length; i += 1) {
          expect(Number.isFinite(pose.euler[i]!)).toBe(true);
          step = Math.max(step, Math.abs(pose.euler[i]! - previous[i]!));
        }
        if (airborne) worst.air = Math.max(worst.air, step);
        if (frame >= 70 && frame < 90) worst.landing = Math.max(worst.landing, step);
        if (mantling) worst.mantle = Math.max(worst.mantle, step);
        worst.all = Math.max(worst.all, step);
        if (frame === 132) expect(channel(pose.euler, "shoulder.L", 0)).toBeLessThan(-1.4);
        previous = Float32Array.from(pose.euler);
      }
      return worst;
    }

    const reference = transitionJumps();
    const tiny = transitionJumps(TINY);
    // Air and mantle run on the authored springs at every size.
    expect(tiny.air).toBeLessThan(reference.air * 1.05 + 1e-3);
    expect(tiny.mantle).toBeLessThan(reference.mantle * 1.05 + 1e-3);
    // Touching down into a run eases the faster springs in, not snaps them.
    expect(tiny.landing).toBeLessThan(reference.landing * 1.35);
    expect(tiny.all).toBeLessThan(reference.all * 1.35);

    const landing = new CharacterAnimator({ bodyHeight: TINY });
    run(landing, 30, { grounded: false, verticalVelocity: -5, speed: 0 });
    expect(run(landing, 6, { grounded: true, speed: 0 }).squash).toBeLessThan(0.97);
    const recovered = run(landing, Math.round((LAND_RECOVERY_SECONDS + 0.6) * 60), { grounded: true, speed: 0 });
    expect(recovered.squash).toBeGreaterThan(0.99);
  });

  it("stays finite at the fastest bounded tempo under violent input", () => {
    const animator = new CharacterAnimator({ bodyHeight: 0.01 });
    expect(animator.gaitTempo).toBe(3);
    for (let frame = 0; frame < 2000; frame += 1) {
      const pose = animator.update(
        input({
          speed: frame % 7 < 3 ? WALK_SPEED : 0,
          grounded: frame % 11 < 6,
          mantling: frame % 37 < 5,
          verticalVelocity: Math.sin(frame) * 6,
          yaw: Math.sin(frame * 0.31) * 3,
          deltaSeconds: frame % 5 === 0 ? 0.1 : 1 / 240,
        }),
      );
      for (const value of pose.euler) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThan(4);
      }
      expect(pose.squash).toBeGreaterThan(0.5);
      expect(pose.squash).toBeLessThan(1.6);
    }
  });
});
