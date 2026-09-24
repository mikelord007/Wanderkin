/** Decorative, non-colliding scenery selected by style and optional atmosphere. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StyleDefinition } from "@shared/index.js";
import { resolveEnvironmentDressing } from "../../scene/style.js";
import type { Bounds } from "../core/soup.js";

export interface SceneEnvironmentProps {
  bounds: Bounds;
  style: StyleDefinition;
  atmosphere: string | undefined;
  reducedMotion: boolean;
}

function DecorativeProp({
  motif,
  position,
  scale,
  colors,
  animate,
}: {
  motif: "cloud" | "tree" | "rock" | "reed";
  position: [number, number, number];
  scale: number;
  colors: readonly string[];
  animate: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.abs(position[0] * 0.71 + position[2] * 0.37), [position]);
  const color0 = colors[0] ?? "#ffffff";
  const color1 = colors[1] ?? color0;
  const color2 = colors[2] ?? color1;
  useFrame(({ clock }) => {
    if (!group.current || !animate || motif !== "cloud") return;
    group.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.22 + phase) * 0.035;
  });

  return (
    <group ref={group} position={position} scale={scale}>
      {motif === "cloud" ? (
        <>
          <mesh><sphereGeometry args={[0.52, 10, 8]} /><meshStandardMaterial color={color0} roughness={1} /></mesh>
          <mesh position={[0.48, -0.06, 0.06]}><sphereGeometry args={[0.38, 10, 8]} /><meshStandardMaterial color={color0} roughness={1} /></mesh>
          <mesh position={[-0.42, -0.08, 0]}><sphereGeometry args={[0.34, 10, 8]} /><meshStandardMaterial color={color0} roughness={1} /></mesh>
        </>
      ) : motif === "tree" ? (
        <>
          <mesh position={[0, 0.38, 0]}><cylinderGeometry args={[0.09, 0.13, 0.76, 7]} /><meshStandardMaterial color={color1} roughness={0.95} /></mesh>
          <mesh position={[0, 1.02, 0]} castShadow><coneGeometry args={[0.5, 1.15, 7]} /><meshStandardMaterial color={color2} roughness={0.95} /></mesh>
        </>
      ) : motif === "reed" ? (
        <>
          {[-0.18, 0, 0.18].map((x, index) => (
            <mesh key={x} position={[x, 0.36 + index * 0.07, 0]} rotation={[0, 0, x * -0.9]}>
              <capsuleGeometry args={[0.025, 0.66 + index * 0.12, 3, 6]} />
              <meshStandardMaterial color={index % 3 === 0 ? color0 : index % 3 === 1 ? color1 : color2} roughness={0.9} />
            </mesh>
          ))}
        </>
      ) : (
        <mesh position={[0, 0.28, 0]} rotation={[0.1, phase, -0.08]} castShadow>
          <dodecahedronGeometry args={[0.52, 0]} />
          <meshStandardMaterial color={color1} roughness={0.92} flatShading />
        </mesh>
      )}
    </group>
  );
}

export function SceneEnvironment({ bounds, style, atmosphere, reducedMotion }: SceneEnvironmentProps) {
  const dressing = useMemo(() => resolveEnvironmentDressing(style, atmosphere), [style, atmosphere]);
  const layout = useMemo(() => {
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    const extent = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 4);
    const count = dressing.definition.density === "sparse" ? 5 : 8;
    return Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 + 0.31;
      const radius = extent * (0.72 + (index % 3) * 0.08);
      const cloudY = bounds.max.y + extent * (0.24 + (index % 2) * 0.1);
      return {
        position: [
          centerX + Math.cos(angle) * radius,
          dressing.motif === "cloud" ? cloudY : Math.max(0, bounds.min.y),
          centerZ + Math.sin(angle) * radius,
        ] as [number, number, number],
        scale: extent * (dressing.motif === "cloud" ? 0.12 : 0.1) * (0.85 + (index % 3) * 0.12),
      };
    });
  }, [bounds, dressing]);

  const colors = style.sceneColors.surfaces.length >= 3
    ? style.sceneColors.surfaces
    : [style.sceneColors.fog, style.sceneColors.background, style.sceneColors.fillLight];
  const animate = !reducedMotion && style.render.ambientMotion === "subtle";

  return (
    <group name={`environment:${dressing.motif}`}>
      {layout.map((item, index) => (
        <DecorativeProp
          key={index}
          motif={dressing.motif}
          position={item.position}
          scale={item.scale}
          colors={colors}
          animate={animate}
        />
      ))}
    </group>
  );
}
