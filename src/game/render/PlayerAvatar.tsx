/**
 * The player character in the scene.
 *
 * The model itself is authored under `./character/`: one continuous skinned
 * surface swept from hand-written profiles over a real bone hierarchy, posed
 * every frame by `CharacterAnimator`. This file is only the bridge between the
 * simulation's frame state and that model — position, facing, whole-body lean
 * and squash, and the contact shadow that makes a jump's landing point
 * readable.
 *
 * Everything inside the character is authored in normalized units where the
 * character is exactly one unit tall, and this component scales it by the
 * capsule's real standing height. That is what keeps the visible character,
 * the collider and the camera framing at the same scale: there is no separate
 * "render scale" that could drift away from the physics.
 *
 * Driven imperatively from the stage's frame callback so the simulation never
 * causes a React re-render.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MovementConfig } from "@shared/index.js";
import { buildCharacter } from "./character/buildCharacter.js";
import { LANTERN_LIGHT } from "./character/characterDesign.js";
import { CharacterAnimator } from "./character/characterAnimator.js";

export interface AvatarFrameState {
  position: { x: number; y: number; z: number };
  yaw: number;
  /** Speed actually achieved, so the walk cycle stops against a wall. */
  speed: number;
  grounded: boolean;
  mantling: boolean;
  verticalVelocity: number;
  /** Surface height under the character for the contact shadow, if known. */
  groundY: number | null;
  deltaSeconds: number;
}

export interface PlayerAvatarHandle {
  update(state: AvatarFrameState): void;
  /** World position of the right hand, where the grappling rope starts. */
  handPosition(out: THREE.Vector3): THREE.Vector3;
}

/** Total standing height of the capsule, which is also the character's height. */
export function characterHeight(config: MovementConfig): number {
  return 2 * (config.characterHalfHeight + config.characterRadius);
}

export const PlayerAvatar = forwardRef<
  PlayerAvatarHandle,
  { config: MovementConfig; reducedMotion?: boolean }
>(function PlayerAvatar({ config, reducedMotion = false }, ref) {
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);

  const height = characterHeight(config);

  const model = useMemo(() => buildCharacter(), []);
  // The gait is paced from the body's real height; a new height means a new
  // animator rather than rescaling a live one.
  const animator = useMemo(() => new CharacterAnimator({ bodyHeight: height }), [height]);

  const shadowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      model.dispose();
      shadowMaterial.dispose();
    },
    [model, shadowMaterial],
  );

  // A point light's range and intensity are world-space and ignore the group's
  // scale, so they have to be derived from the character's real height or the
  // lantern floods a small character and the floor under it.
  useEffect(() => {
    model.lanternLight.distance = height * LANTERN_LIGHT.rangeInHeights;
  }, [model, height]);
  const lanternBase = LANTERN_LIGHT.intensityAtUnitHeight * height * height;
  const lanternPulse = LANTERN_LIGHT.pulseAtUnitHeight * height * height;

  const hand = useMemo(() => model.rig.byName.get("wrist.R") ?? null, [model]);

  useImperativeHandle(ref, () => ({
    handPosition(out) {
      if (hand) return hand.getWorldPosition(out);
      return root.current ? root.current.getWorldPosition(out) : out;
    },
    update(state) {
      const group = root.current;
      if (!group) return;

      group.position.set(state.position.x, state.position.y, state.position.z);
      group.rotation.y = state.yaw;

      const pose = animator.update({
        speed: state.speed,
        walkSpeed: config.walkSpeed,
        grounded: state.grounded,
        mantling: state.mantling,
        verticalVelocity: state.verticalVelocity,
        yaw: state.yaw,
        deltaSeconds: state.deltaSeconds,
        reducedMotion,
      });

      const bones = model.rig.bones;
      for (let i = 0; i < bones.length; i += 1) {
        bones[i]!.rotation.set(
          pose.euler[i * 3]!,
          pose.euler[i * 3 + 1]!,
          pose.euler[i * 3 + 2]!,
        );
      }

      model.group.position.y = pose.bobY;

      if (tilt.current) {
        tilt.current.rotation.x = pose.leanX;
        tilt.current.rotation.z = pose.leanZ;
        // Squash preserves volume: the body widens exactly as much as it
        // shortens, which is what makes a landing read as weight rather than
        // as the model being scaled.
        const lateral = height / Math.sqrt(Math.max(pose.squash, 0.2));
        tilt.current.scale.set(lateral, height * pose.squash, lateral);
      }

      model.lanternMaterial.emissiveIntensity = 0.95 + pose.lanternPulse * 0.28;
      model.lanternLight.intensity = lanternBase + pose.lanternPulse * lanternPulse;

      if (shadow.current) {
        if (state.groundY === null) {
          shadow.current.visible = false;
        } else {
          const feet = state.position.y - config.characterHalfHeight - config.characterRadius;
          const airGap = Math.max(0, feet - state.groundY);
          shadow.current.visible = true;
          // Placed in world space, so it stays flat on the surface while the
          // character leans and turns above it.
          shadow.current.position.set(state.position.x, state.groundY + height * 0.006, state.position.z);
          const spread = 1 - Math.min(airGap / (height * 1.7), 0.75);
          shadow.current.scale.setScalar(spread);
          shadowMaterial.opacity = 0.34 * spread;
        }
      }
    },
  }));

  return (
    <>
      {/* World-space contact shadow, deliberately outside the character group
          so it never inherits the lean or the squash. */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} material={shadowMaterial} renderOrder={1}>
        <circleGeometry args={[config.characterRadius * 1.25, 24]} />
      </mesh>

      <group ref={root}>
        <group ref={tilt} scale={height}>
          <primitive object={model.group} />
        </group>
      </group>
    </>
  );
});
