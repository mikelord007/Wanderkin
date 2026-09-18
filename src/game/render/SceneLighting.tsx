/**
 * Lighting and backdrop.
 *
 * Deliberately neutral: the generated assets contain furniture only — no
 * walls, floor, door or curtain were reconstructed — so the backdrop must
 * not imply room architecture that is not there. A graded void plus fog
 * reads as "a stage for these objects" rather than as a room.
 *
 * The shadow camera is fitted to the actual level bounds so a toy-scale
 * character still casts a crisp contact shadow instead of the mush a
 * default-sized shadow frustum would give at this scale.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { Bounds } from "../core/soup.js";

const HORIZON = "#243040";
const ZENITH = "#0d1119";

export interface SceneLightingProps {
  bounds: Bounds;
}

function GradientBackdrop({ radius }: { radius: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(ZENITH) },
          horizon: { value: new THREE.Color(HORIZON) },
        },
        vertexShader: /* glsl */ `
          varying float vHeight;
          void main() {
            vHeight = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith;
          uniform vec3 horizon;
          varying float vHeight;
          void main() {
            float t = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
            gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.35, 0.95, t)), 1.0);
          }
        `,
      }),
    [],
  );

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[radius, 24, 16]} />
    </mesh>
  );
}

export function SceneLighting({ bounds }: SceneLightingProps) {
  const size = useMemo(() => {
    const x = bounds.max.x - bounds.min.x;
    const y = bounds.max.y - bounds.min.y;
    const z = bounds.max.z - bounds.min.z;
    return { x, y, z, radius: Math.max(Math.hypot(x, y, z) / 2, 1) };
  }, [bounds]);

  const centre = useMemo(
    () => ({
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    }),
    [bounds],
  );

  const shadowExtent = size.radius * 1.1;
  const sunDistance = size.radius * 2.4;

  return (
    <>
      <GradientBackdrop radius={Math.max(size.radius * 8, 60)} />
      <fog attach="fog" args={[HORIZON, size.radius * 1.6, size.radius * 7]} />

      <ambientLight intensity={0.55} color="#c9d7ea" />
      <hemisphereLight args={["#dce8ff", "#2a2118", 0.85]} />

      <directionalLight
        position={[centre.x + sunDistance * 0.55, centre.y + sunDistance, centre.z + sunDistance * 0.35]}
        intensity={2.1}
        color="#fff4e2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={sunDistance * 3}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0008}
        shadow-normalBias={0.012}
      />

      {/* Cool fill from the opposite side so unlit faces of the furniture
          keep some shape instead of going flat black. */}
      <directionalLight
        position={[centre.x - sunDistance * 0.7, centre.y + sunDistance * 0.4, centre.z - sunDistance * 0.6]}
        intensity={0.5}
        color="#9fc0ff"
      />
    </>
  );
}
