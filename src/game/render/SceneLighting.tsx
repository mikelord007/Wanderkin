/** Style-driven lighting, fog, and backdrop fitted to the real level bounds. */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { StyleDefinition } from "@shared/index.js";
import type { Bounds } from "../core/soup.js";

export interface SceneLightingProps {
  bounds: Bounds;
  style: StyleDefinition;
}

function GradientBackdrop({ radius, style }: { radius: number; style: StyleDefinition }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(style.sceneColors.background) },
          horizon: { value: new THREE.Color(style.sceneColors.fog) },
          paper: { value: style.render.paperTextureOpacity },
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
          uniform float paper;
          varying float vHeight;
          float hash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          void main() {
            float t = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
            vec3 color = mix(horizon, zenith, smoothstep(0.22, 0.92, t));
            color += (hash(gl_FragCoord.xy * 0.35) - 0.5) * paper * 0.045;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [style],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[radius, 24, 16]} />
    </mesh>
  );
}

export function SceneLighting({ bounds, style }: SceneLightingProps) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const previousExposure = gl.toneMappingExposure;
    const previousToneMapping = gl.toneMapping;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = style.render.toneMappingExposure;
    return () => {
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
    };
  }, [gl, style]);

  const size = useMemo(() => {
    const x = bounds.max.x - bounds.min.x;
    const y = bounds.max.y - bounds.min.y;
    const z = bounds.max.z - bounds.min.z;
    return { radius: Math.max(Math.hypot(x, y, z) / 2, 1) };
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
  const key = style.lighting.keyPosition;

  return (
    <>
      <GradientBackdrop radius={Math.max(size.radius * 8, 60)} style={style} />
      <fog attach="fog" args={[style.sceneColors.fog, size.radius * 1.7, size.radius * 7.2]} />
      <ambientLight intensity={style.lighting.ambientIntensity} color={style.sceneColors.ambientLight} />
      <hemisphereLight
        args={[
          style.sceneColors.fillLight,
          style.sceneColors.surfaces[3] ?? style.sceneColors.fog,
          style.lighting.fillIntensity,
        ]}
      />
      <directionalLight
        position={[
          centre.x + key[0] * sunDistance * 0.12,
          centre.y + key[1] * sunDistance * 0.12,
          centre.z + key[2] * sunDistance * 0.12,
        ]}
        intensity={style.lighting.keyIntensity}
        color={style.sceneColors.keyLight}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={sunDistance * 3}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0008}
        shadow-normalBias={0.012}
        shadow-radius={Math.max(1, style.lighting.shadowSoftness * 4)}
      />
      <directionalLight
        position={[centre.x - sunDistance * 0.7, centre.y + sunDistance * 0.4, centre.z - sunDistance * 0.6]}
        intensity={style.lighting.fillIntensity}
        color={style.sceneColors.fillLight}
      />
    </>
  );
}
