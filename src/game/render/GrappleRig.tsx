/**
 * The grappling hook in the scene: a small chunky hook, the rope from the
 * explorer's hand, and a puff where the hook bites.
 *
 * Styled like the explorer (`character/characterDesign.ts`): the hook's shank
 * is the boots' dark plum, its claws the cap's teal, its collar the suit's
 * orange, and the rope the mittens' pale cream, so it reads as the
 * character's own kit rather than a separate effect. Everything is sized from
 * the character's height.
 *
 * Driven imperatively from the stage's frame callback, like the avatar. The
 * rope is one instanced mesh of short segments laid along a sagging curve,
 * so it costs one draw call and allocates nothing per frame.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { GrappleView } from "../core/simulation.js";
import { PALETTE } from "./character/characterDesign.js";
import { hookPosition, ropePoints, ropeSag } from "./grappleVisuals.js";

const ROPE_SEGMENTS = 14;
const PUFF_BITS = 7;
const PUFF_SECONDS = 0.35;
const PUFF_REDUCED_SECONDS = 0.2;

export interface GrappleFrameState {
  view: GrappleView;
  /** World position of the explorer's rope hand. */
  hand: THREE.Vector3;
  deltaSeconds: number;
  reducedMotion: boolean;
}

export interface GrappleRigHandle {
  update(state: GrappleFrameState): void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Three claws splaying out from the hook's tip and curling back toward the rope. */
const CLAW_TURNS: readonly THREE.Quaternion[] = [0, 1, 2].map((i) => {
  const angle = (i / 3) * Math.PI * 2;
  const tip = new THREE.Vector3(Math.cos(angle) * 0.8, -0.6, Math.sin(angle) * 0.8).normalize();
  return new THREE.Quaternion().setFromUnitVectors(Y_AXIS, tip);
});

export const GrappleRig = forwardRef<GrappleRigHandle, { bodyHeight: number }>(function GrappleRig({ bodyHeight }, ref) {
  const hookGroup = useRef<THREE.Group>(null);
  const rope = useRef<THREE.InstancedMesh>(null);
  const puff = useRef<THREE.InstancedMesh>(null);

  const parts = useMemo(() => {
    const size = bodyHeight;
    const ropeRadius = size * 0.022;
    return {
      ropeGeometry: new THREE.CylinderGeometry(ropeRadius, ropeRadius, 1, 6, 1, true),
      ropeMaterial: new THREE.MeshStandardMaterial({ color: PALETTE.mitten, roughness: 0.85 }),
      shankGeometry: new THREE.CylinderGeometry(size * 0.035, size * 0.035, size * 0.2, 8),
      shankMaterial: new THREE.MeshStandardMaterial({ color: PALETTE.boot, roughness: 0.5, metalness: 0.2 }),
      collarGeometry: new THREE.TorusGeometry(size * 0.05, size * 0.018, 6, 12),
      collarMaterial: new THREE.MeshStandardMaterial({ color: PALETTE.suit, roughness: 0.55 }),
      clawGeometry: new THREE.ConeGeometry(size * 0.035, size * 0.12, 6),
      clawMaterial: new THREE.MeshStandardMaterial({ color: PALETTE.cap, roughness: 0.45, metalness: 0.15 }),
      puffGeometry: new THREE.IcosahedronGeometry(size * 0.05, 0),
      puffMaterial: new THREE.MeshBasicMaterial({ color: "#fff6e8", transparent: true, depthWrite: false }),
    };
  }, [bodyHeight]);

  useEffect(() => () => {
    for (const value of Object.values(parts)) value.dispose();
  }, [parts]);

  const scratch = useMemo(() => ({
    points: [] as { x: number; y: number; z: number }[],
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    anchor: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    puffAge: Infinity,
    previousPhase: "idle" as GrappleView["phase"],
  }), []);

  useImperativeHandle(ref, () => ({
    update({ view, hand, deltaSeconds, reducedMotion }) {
      const group = hookGroup.current;
      const ropeMesh = rope.current;
      const puffMesh = puff.current;
      if (!group || !ropeMesh || !puffMesh) return;

      const hook = hookPosition(hand, view);
      if (!hook) {
        group.visible = false;
        ropeMesh.visible = false;
      } else {
        // Hook: shank along local +Y, pointed along its flight, or into the
        // surface once it has bitten.
        group.visible = true;
        group.position.set(hook.x, hook.y, hook.z);
        if (view.phase === "reeling" && view.normal) {
          scratch.dir.set(-view.normal.x, -view.normal.y, -view.normal.z);
        } else {
          scratch.dir.set(hook.x - hand.x, hook.y - hand.y, hook.z - hand.z);
        }
        if (scratch.dir.lengthSq() > 1e-10) group.quaternion.setFromUnitVectors(Y_AXIS, scratch.dir.normalize());

        // Rope: from the hand to the hook's tail, sagging while slack.
        const ropeLength = hand.distanceTo(group.position);
        const sag = ropeSag(view.phase, ropeLength, view.tension);
        const points = ropePoints(hand, hook, sag, ROPE_SEGMENTS, scratch.points);
        ropeMesh.visible = ropeLength > 1e-4;
        for (let i = 0; i < ROPE_SEGMENTS; i += 1) {
          const p = points[i]!;
          const q = points[i + 1]!;
          scratch.a.set(p.x, p.y, p.z);
          scratch.b.set(q.x, q.y, q.z);
          scratch.dir.subVectors(scratch.b, scratch.a);
          const segment = scratch.dir.length();
          if (segment > 1e-8) scratch.quat.setFromUnitVectors(Y_AXIS, scratch.dir.multiplyScalar(1 / segment));
          scratch.scale.set(1, Math.max(segment, 1e-6), 1);
          scratch.a.lerp(scratch.b, 0.5);
          scratch.matrix.compose(scratch.a, scratch.quat, scratch.scale);
          ropeMesh.setMatrixAt(i, scratch.matrix);
        }
        ropeMesh.instanceMatrix.needsUpdate = true;
      }

      // Puff: a ring of bits blooming off the surface where the hook bit.
      if (view.phase === "reeling" && scratch.previousPhase === "flying" && view.target) {
        scratch.puffAge = 0;
        scratch.anchor.set(view.target.x, view.target.y, view.target.z);
        if (view.normal) scratch.normal.set(view.normal.x, view.normal.y, view.normal.z);
      }
      scratch.previousPhase = view.phase;
      const duration = reducedMotion ? PUFF_REDUCED_SECONDS : PUFF_SECONDS;
      if (scratch.puffAge < duration) {
        scratch.puffAge += deltaSeconds;
        const t = Math.min(1, scratch.puffAge / duration);
        // Reduced motion: the puff fades in place instead of bursting outward.
        const spread = reducedMotion ? 0.35 : 0.2 + 0.9 * (1 - (1 - t) * (1 - t));
        puffMesh.visible = t < 1;
        parts.puffMaterial.opacity = 0.9 * (1 - t);
        scratch.quat.setFromUnitVectors(Y_AXIS, scratch.normal);
        for (let i = 0; i < PUFF_BITS; i += 1) {
          const angle = (i / PUFF_BITS) * Math.PI * 2;
          scratch.dir.set(Math.cos(angle), 0.35, Math.sin(angle)).applyQuaternion(scratch.quat);
          scratch.a.copy(scratch.anchor).addScaledVector(scratch.dir, bodyHeight * 0.18 * spread);
          const bit = (reducedMotion ? 0.8 : 1.2 - 0.6 * t) * (i % 2 === 0 ? 1 : 0.7);
          scratch.scale.setScalar(bit);
          scratch.matrix.compose(scratch.a, scratch.quat, scratch.scale);
          puffMesh.setMatrixAt(i, scratch.matrix);
        }
        puffMesh.instanceMatrix.needsUpdate = true;
      } else {
        puffMesh.visible = false;
      }
    },
  }), [scratch, parts, bodyHeight]);

  const claw = bodyHeight * 0.06;
  return (
    <>
      <group ref={hookGroup} visible={false}>
        <mesh geometry={parts.shankGeometry} material={parts.shankMaterial} castShadow />
        <mesh geometry={parts.collarGeometry} material={parts.collarMaterial}
          position={[0, -bodyHeight * 0.09, 0]} rotation={[Math.PI / 2, 0, 0]} />
        {CLAW_TURNS.map((turn, i) => {
          const angle = (i / CLAW_TURNS.length) * Math.PI * 2;
          return (
            <mesh key={i} geometry={parts.clawGeometry} material={parts.clawMaterial} castShadow
              position={[Math.cos(angle) * claw, bodyHeight * 0.07, Math.sin(angle) * claw]}
              quaternion={turn} />
          );
        })}
      </group>
      <instancedMesh ref={rope} args={[parts.ropeGeometry, parts.ropeMaterial, ROPE_SEGMENTS]}
        visible={false} frustumCulled={false} castShadow />
      <instancedMesh ref={puff} args={[parts.puffGeometry, parts.puffMaterial, PUFF_BITS]}
        visible={false} frustumCulled={false} renderOrder={2} />
    </>
  );
});
