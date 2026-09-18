/**
 * The toy character.
 *
 * Simple primitives rather than a rigged model: the brief calls for an
 * appealing toy-sized character without making character generation a
 * prerequisite. The parts that matter for playability are the ones that
 * communicate state at a glance in a cluttered furniture scene — a walk
 * cycle, a lean into movement, squash on landing, a glowing antenna so the
 * character stays findable against dark wood, and a contact shadow that
 * makes it possible to judge where a jump will land.
 *
 * Driven imperatively from the stage's frame callback so the simulation
 * never causes a React re-render.
 */

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MovementConfig } from "@shared/index.js";

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
}

const BODY_COLOUR = "#ff8a4c";
const SHELL_COLOUR = "#fff1e2";
const DARK = "#2b2438";
const GLOW = "#7cf4ff";

export const PlayerAvatar = forwardRef<PlayerAvatarHandle, { config: MovementConfig }>(
  function PlayerAvatar({ config }, ref) {
    const root = useRef<THREE.Group>(null);
    const tilt = useRef<THREE.Group>(null);
    const bob = useRef<THREE.Group>(null);
    const leftLeg = useRef<THREE.Group>(null);
    const rightLeg = useRef<THREE.Group>(null);
    const leftArm = useRef<THREE.Group>(null);
    const rightArm = useRef<THREE.Group>(null);
    const antenna = useRef<THREE.Mesh>(null);
    const shadow = useRef<THREE.Mesh>(null);

    const walkPhase = useRef(0);
    const squash = useRef(1);
    const lean = useRef(0);

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

    useImperativeHandle(ref, () => ({
      update(state) {
        const group = root.current;
        if (!group) return;

        const dt = Math.min(state.deltaSeconds, 0.1);
        group.position.set(state.position.x, state.position.y, state.position.z);
        group.rotation.y = state.yaw;

        const speedFactor = Math.min(state.speed / Math.max(config.walkSpeed, 0.001), 1);

        // Walk cycle advances with distance covered, not with time, so the
        // legs stop moving the instant the character stops.
        if (state.grounded && !state.mantling) {
          walkPhase.current += state.speed * dt * 11;
        } else {
          walkPhase.current += dt * 2;
        }

        const swing = Math.sin(walkPhase.current);
        const airborne = !state.grounded || state.mantling;

        if (leftLeg.current && rightLeg.current) {
          const legSwing = airborne ? 0.45 : swing * 0.7 * speedFactor;
          leftLeg.current.rotation.x = airborne ? -legSwing : legSwing;
          rightLeg.current.rotation.x = airborne ? -legSwing * 0.6 : -legSwing;
        }

        if (leftArm.current && rightArm.current) {
          // Arms go up during a mantle: it reads as pulling yourself up.
          const armSwing = state.mantling ? -1.9 : airborne ? -0.9 : -swing * 0.55 * speedFactor;
          leftArm.current.rotation.x = armSwing;
          rightArm.current.rotation.x = state.mantling ? -1.9 : -armSwing;
        }

        if (bob.current) {
          bob.current.position.y = airborne ? 0 : Math.abs(Math.sin(walkPhase.current)) * 0.014 * speedFactor;
        }

        // Squash on landing, stretch while rising.
        const targetSquash = airborne ? 1 + Math.max(-0.12, Math.min(0.12, state.verticalVelocity * 0.03)) : 1;
        squash.current += (targetSquash - squash.current) * Math.min(1, dt * 14);

        const targetLean = airborne ? 0.05 : speedFactor * 0.16;
        lean.current += (targetLean - lean.current) * Math.min(1, dt * 10);

        if (tilt.current) {
          tilt.current.rotation.x = lean.current;
          tilt.current.scale.set(1 / Math.sqrt(squash.current), squash.current, 1 / Math.sqrt(squash.current));
        }

        if (antenna.current) {
          const material = antenna.current.material as THREE.MeshStandardMaterial;
          material.emissiveIntensity = 1.6 + Math.sin(walkPhase.current * 0.7) * 0.25;
        }

        if (shadow.current) {
          if (state.groundY === null) {
            shadow.current.visible = false;
          } else {
            const height = Math.max(0, state.position.y - config.characterHalfHeight - config.characterRadius - state.groundY);
            shadow.current.visible = true;
            // Placed in world space, so it stays flat on the surface while
            // the character leans and turns above it.
            shadow.current.position.set(
              state.position.x,
              state.groundY + 0.004,
              state.position.z,
            );
            const spread = 1 - Math.min(height / 1.2, 0.75);
            shadow.current.scale.setScalar(spread);
            shadowMaterial.opacity = 0.34 * spread;
          }
        }
      },
    }));

    const radius = config.characterRadius;

    return (
      <>
        {/* World-space contact shadow, deliberately outside the character
            group so it never inherits the lean or the squash. */}
        <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} material={shadowMaterial} renderOrder={1}>
          <circleGeometry args={[radius * 1.15, 24]} />
        </mesh>

        <group ref={root}>
          <group ref={tilt}>
            <group ref={bob}>
              {/* Body */}
              <mesh castShadow position={[0, 0.02, 0]}>
                <capsuleGeometry args={[0.125, 0.15, 6, 20]} />
                <meshStandardMaterial color={BODY_COLOUR} roughness={0.45} metalness={0.05} />
              </mesh>

              {/* Chest plate, so the front of the character is readable */}
              <mesh position={[0, 0.02, 0.105]}>
                <sphereGeometry args={[0.055, 16, 12]} />
                <meshStandardMaterial color={SHELL_COLOUR} roughness={0.35} />
              </mesh>

              {/* Head */}
              <mesh castShadow position={[0, 0.235, 0]}>
                <sphereGeometry args={[0.112, 20, 16]} />
                <meshStandardMaterial color={SHELL_COLOUR} roughness={0.4} />
              </mesh>

              {/* Eyes */}
              <mesh position={[-0.042, 0.255, 0.092]}>
                <sphereGeometry args={[0.026, 12, 10]} />
                <meshStandardMaterial color={DARK} roughness={0.25} />
              </mesh>
              <mesh position={[0.042, 0.255, 0.092]}>
                <sphereGeometry args={[0.026, 12, 10]} />
                <meshStandardMaterial color={DARK} roughness={0.25} />
              </mesh>

              {/* Antenna: a small self-lit marker that keeps the character
                  visible against dark furniture from any camera angle. */}
              <mesh position={[0, 0.325, 0]}>
                <cylinderGeometry args={[0.006, 0.006, 0.07, 6]} />
                <meshStandardMaterial color={DARK} roughness={0.5} />
              </mesh>
              <mesh ref={antenna} position={[0, 0.375, 0]}>
                <sphereGeometry args={[0.026, 14, 12]} />
                <meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={1.6} roughness={0.2} />
              </mesh>
              <pointLight position={[0, 0.375, 0]} color={GLOW} intensity={0.35} distance={1.6} decay={2} />

              {/* Arms pivot from the shoulder */}
              <group ref={leftArm} position={[-0.135, 0.09, 0]}>
                <mesh castShadow position={[0, -0.06, 0]}>
                  <capsuleGeometry args={[0.032, 0.07, 4, 10]} />
                  <meshStandardMaterial color={BODY_COLOUR} roughness={0.45} />
                </mesh>
              </group>
              <group ref={rightArm} position={[0.135, 0.09, 0]}>
                <mesh castShadow position={[0, -0.06, 0]}>
                  <capsuleGeometry args={[0.032, 0.07, 4, 10]} />
                  <meshStandardMaterial color={BODY_COLOUR} roughness={0.45} />
                </mesh>
              </group>

              {/* Legs pivot from the hip */}
              <group ref={leftLeg} position={[-0.062, -0.13, 0]}>
                <mesh castShadow position={[0, -0.075, 0]}>
                  <capsuleGeometry args={[0.038, 0.06, 4, 10]} />
                  <meshStandardMaterial color={DARK} roughness={0.6} />
                </mesh>
                <mesh castShadow position={[0, -0.135, 0.018]} scale={[1, 0.6, 1.35]}>
                  <sphereGeometry args={[0.045, 12, 10]} />
                  <meshStandardMaterial color={SHELL_COLOUR} roughness={0.5} />
                </mesh>
              </group>
              <group ref={rightLeg} position={[0.062, -0.13, 0]}>
                <mesh castShadow position={[0, -0.075, 0]}>
                  <capsuleGeometry args={[0.038, 0.06, 4, 10]} />
                  <meshStandardMaterial color={DARK} roughness={0.6} />
                </mesh>
                <mesh castShadow position={[0, -0.135, 0.018]} scale={[1, 0.6, 1.35]}>
                  <sphereGeometry args={[0.045, 12, 10]} />
                  <meshStandardMaterial color={SHELL_COLOUR} roughness={0.5} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </>
    );
  },
);
