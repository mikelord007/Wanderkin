/** Style-driven lighting, fog, and backdrop fitted to the real level bounds. */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { StyleDefinition } from "@shared/index.js";
import type { Bounds } from "../core/soup.js";
import { usePrefersReducedMotion } from "./useReducedMotion.js";

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

  /**
   * The authored `keyPosition` is a steep, near-overhead sun angle (e.g. the
   * Cartoon style's [5, 8, 4] sits ~50° above the horizon). That reads fine
   * for an outdoor course, but for these room-corner furniture sets a lower,
   * more raking angle sells "small object in a room lit through a window"
   * much better: shadows fall further and stay legible under furniture,
   * which is exactly the depth cue tilt-shift/miniature photography relies
   * on. Only the *elevation* is lowered here, in this scene-local light
   * placement — the per-style horizontal direction, all colours, and every
   * `StyleLighting` intensity/softness number are still read unchanged from
   * `shared/style.ts`, so the three styles keep their own lighting mood.
   */
  const keyHorizontal = useMemo(() => Math.hypot(key[0], key[2]) || 1, [key]);
  const keyDirX = key[0] / keyHorizontal;
  const keyDirZ = key[2] / keyHorizontal;
  const WINDOW_KEY_ELEVATION = 0.85;
  const keyPosition: [number, number, number] = [
    centre.x + keyDirX * sunDistance * 0.9,
    centre.y + WINDOW_KEY_ELEVATION * sunDistance * 0.48,
    centre.z + keyDirZ * sunDistance * 0.9,
  ];

  /** A soft warm bounce mixed into the cool fill light, standing in for the
   * warm light a real window key would bounce back off nearby surfaces.
   * There is no environment map/IBL in this renderer, so the existing
   * hemisphere light remains the sky/ground fill term; this only nudges the
   * secondary directional fill's colour, not its intensity or direction. */
  const fillColor = useMemo(
    () => new THREE.Color(style.sceneColors.fillLight).lerp(new THREE.Color(style.sceneColors.keyLight), 0.22),
    [style],
  );

  /**
   * `style.sceneColors.surfaces[3]` is an outdoor terrain swatch (grass green
   * in every current style) reused here as the hemisphere light's "ground"
   * term. That is fine for the floor itself, but once generated furniture
   * actually responds to lighting (see `styleMaterial.ts`'s baked-material
   * relight), every downward-facing surface — a desk's underside, a sofa's
   * frame — picks up that same raw grass tint as its only upward bounce
   * light, which reads as a muddy, thematically-wrong green instead of a
   * plausible room bounce. Blending it toward the warm fill colour keeps the
   * floor's own lit-from-above look unchanged (this only affects surfaces
   * facing away from the sky) while keeping undersides legible with a
   * neutral bounce instead of an outdoor-grass one.
   */
  const hemisphereGroundColor = useMemo(
    () =>
      new THREE.Color(style.sceneColors.surfaces[3] ?? style.sceneColors.fog).lerp(
        new THREE.Color(style.sceneColors.fillLight),
        0.55,
      ),
    [style],
  );

  /**
   * Doubled from the previous 1024. Accurate cost accounting: doubling each
   * dimension is 4x the shadow-map texel area (and matching GPU memory/depth
   * fill-rate for that one pass), not a free change — it is still only a
   * single shadow-casting light (the fill light below never casts, and this
   * project renders one shadow-casting light total), so there is no second
   * shadow pass and no global post-effect, but the 4x cost is real and paid
   * every frame this light re-renders its shadow map.
   *
   * Reasonable fallback: readers who have asked the OS/browser for reduced
   * motion are treated as a proxy for "reduce visual load" here too (the
   * same signal `SceneEnvironment` already uses to drop ambient motion), and
   * get the previous 1024 back rather than the extra 4x cost.
   */
  const reducedMotion = usePrefersReducedMotion();
  const keyShadowMapSize = reducedMotion ? 1024 : 2048;

  return (
    <>
      <GradientBackdrop radius={Math.max(size.radius * 8, 60)} style={style} />
      <fog attach="fog" args={[style.sceneColors.fog, size.radius * 1.7, size.radius * 7.2]} />
      <ambientLight intensity={style.lighting.ambientIntensity} color={style.sceneColors.ambientLight} />
      <hemisphereLight
        args={[style.sceneColors.fillLight, hemisphereGroundColor, style.lighting.fillIntensity]}
      />
      <directionalLight
        position={keyPosition}
        intensity={style.lighting.keyIntensity}
        color={style.sceneColors.keyLight}
        castShadow
        shadow-mapSize-width={keyShadowMapSize}
        shadow-mapSize-height={keyShadowMapSize}
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
        color={fillColor}
      />
    </>
  );
}
