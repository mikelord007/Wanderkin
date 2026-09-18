/**
 * Glowing checkpoint markers.
 *
 * Because checkpoints must be collected in order, the markers are drawn in
 * three distinct states: the active objective is bright, pulsing and lit so
 * it can be picked out from across a furniture scene; later ones are dim
 * and still, so the player is never misled about where to go next; and
 * collected ones fade to a calm green. The translucent sphere is drawn at
 * the real `triggerRadius`, so what looks collectable is exactly what is.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Checkpoint, SceneManifest } from "@shared/index.js";

const ACTIVE = new THREE.Color("#ffd166");
const PENDING = new THREE.Color("#5b6b86");
const DONE = new THREE.Color("#5ddc9a");

export interface CheckpointMarkersProps {
  manifest: SceneManifest;
  /** Id of the next checkpoint, or null once the course is complete. */
  activeId: string | null;
  collectedIds: ReadonlySet<string>;
}

function CheckpointMarker({
  checkpoint,
  state,
}: {
  checkpoint: Checkpoint;
  state: "active" | "pending" | "collected";
}) {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const time = performance.now() / 1000;
    if (core.current) {
      core.current.rotation.y += delta * (state === "active" ? 1.1 : 0.2);
      core.current.rotation.x += delta * 0.35;
      const bob = state === "active" ? Math.sin(time * 2.2) * 0.035 : 0;
      core.current.position.y = bob;
      const pulse = state === "active" ? 1 + Math.sin(time * 3.4) * 0.08 : 1;
      core.current.scale.setScalar(pulse);
    }
    if (halo.current) {
      const material = halo.current.material as THREE.MeshBasicMaterial;
      material.opacity = state === "active" ? 0.14 + Math.sin(time * 2.6) * 0.05 : 0.05;
    }
    if (beam.current) {
      beam.current.visible = state === "active";
      const material = beam.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.1 + Math.sin(time * 2.6) * 0.04;
    }
  });

  const colour = state === "collected" ? DONE : state === "active" ? ACTIVE : PENDING;
  const coreRadius = Math.min(checkpoint.triggerRadius * 0.34, 0.16);

  return (
    <group position={checkpoint.position as unknown as [number, number, number]}>
      <mesh ref={core}>
        <icosahedronGeometry args={[coreRadius, 0]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={state === "active" ? 2.4 : state === "collected" ? 0.9 : 0.35}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>

      {/* The real trigger volume, drawn honestly at triggerRadius. */}
      <mesh ref={halo}>
        <sphereGeometry args={[checkpoint.triggerRadius, 20, 16]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* A soft column so the active objective can be found from a distance
          even when the marker itself is behind furniture. */}
      <mesh ref={beam} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[coreRadius * 0.7, coreRadius * 0.9, 2.4, 12, 1, true]} />
        <meshBasicMaterial
          color={ACTIVE}
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {state === "active" ? (
        <pointLight color={ACTIVE} intensity={1.1} distance={2.6} decay={2} />
      ) : null}
    </group>
  );
}

export function CheckpointMarkers({ manifest, activeId, collectedIds }: CheckpointMarkersProps) {
  return (
    <group>
      {manifest.checkpoints.map((checkpoint) => (
        <CheckpointMarker
          key={checkpoint.id}
          checkpoint={checkpoint}
          state={
            collectedIds.has(checkpoint.id)
              ? "collected"
              : checkpoint.id === activeId
                ? "active"
                : "pending"
          }
        />
      ))}
    </group>
  );
}
