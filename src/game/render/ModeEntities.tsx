import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ColorFragmentEntity, LevelExperience } from "@shared/index.js";
import type { GameplaySessionSnapshot } from "../modes/session.js";

function Fragment({ fragment, reducedMotion }: { fragment: ColorFragmentEntity; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const color = new THREE.Color(fragment.color);
  useFrame((state, delta) => {
    if (!group.current || reducedMotion) return;
    group.current.rotation.y += delta * 1.4;
    group.current.position.y = fragment.transform.position[1] + Math.sin(state.clock.elapsedTime * 2.2) * 0.055;
  });
  return (
    <group
      ref={group}
      position={fragment.transform.position as unknown as [number, number, number]}
      quaternion={fragment.transform.rotation as unknown as [number, number, number, number]}
      scale={fragment.transform.scale as unknown as [number, number, number]}
    >
      <mesh castShadow>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} roughness={0.2} />
      </mesh>
      <mesh scale={2.25}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <pointLight color={color} intensity={1.8} distance={2.5} decay={2} />
    </group>
  );
}

function Portal({ experience, active, reducedMotion }: {
  experience: LevelExperience;
  active: boolean;
  reducedMotion: boolean;
}) {
  const portal = experience.finishPortal;
  const ring = useRef<THREE.Mesh>(null);
  const color = new THREE.Color(portal ? (active ? portal.activeColor : portal.inactiveColor) : "#000000");
  useFrame((state, delta) => {
    if (!ring.current) return;
    if (!reducedMotion) ring.current.rotation.z += delta * (active ? 0.7 : 0.12);
    const material = ring.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = active && !reducedMotion ? 1.8 + Math.sin(state.clock.elapsedTime * 3) * 0.45 : active ? 1.8 : 0.2;
  });
  if (!portal) return null;
  return (
    <group
      position={portal.transform.position as unknown as [number, number, number]}
      quaternion={portal.transform.rotation as unknown as [number, number, number, number]}
      scale={portal.transform.scale as unknown as [number, number, number]}
    >
      <mesh ref={ring}>
        <torusGeometry args={[0.62, 0.11, 14, 36]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.8 : 0.2} roughness={0.3} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.28 : 0.06} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {active ? <pointLight color={color} intensity={2.1} distance={3.2} decay={2} /> : null}
    </group>
  );
}

export function ModeEntities({ experience, state, reducedMotion }: {
  experience: LevelExperience;
  state: GameplaySessionSnapshot;
  reducedMotion: boolean;
}) {
  return (
    <group>
      {experience.collectibles.map((fragment) =>
        state.collectedFragmentIds.has(fragment.id)
          ? null
          : <Fragment key={fragment.id} fragment={fragment} reducedMotion={reducedMotion} />,
      )}
      <Portal experience={experience} active={state.portalActive} reducedMotion={reducedMotion} />
      {experience.mode.kind === "explore"
        ? experience.mode.destinations.map((destination) => (
            <group key={destination.id} position={destination.position as unknown as [number, number, number]}>
              <mesh visible={!state.destinationsReached.has(destination.id)}>
                <cylinderGeometry args={[0.18, 0.28, 0.08, 20]} />
                <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={1.1} />
              </mesh>
            </group>
          ))
        : null}
    </group>
  );
}
