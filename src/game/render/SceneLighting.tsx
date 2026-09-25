/** Style-driven lighting, fog, and backdrop fitted to the real level bounds. */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { StyleDefinition } from "@shared/index.js";
import type { BiomeDefinition } from "../../biome/types.js";
import { getBiomeArt } from "../../biome/assets/biomes/index.js";
import { LIGHTING_DEFAULTS, resolveBiomeLighting, type ResolvedBiomeLighting } from "../../biome/assets/lighting.js";
import type { Bounds } from "../core/soup.js";
import { usePrefersReducedMotion } from "./useReducedMotion.js";

export interface SceneLightingProps {
  bounds: Bounds;
  style: StyleDefinition;
  /**
   * Optional biome sky/sun/haze. `null`, `undefined` or the Original biome
   * leave every value exactly as the style defines it; tone mapping,
   * shadow setup and fill intensity always stay the style's.
   */
  biome?: BiomeDefinition | null;
}

function GradientBackdrop({
  radius,
  zenith,
  horizon,
  paper,
}: {
  radius: number;
  zenith: string;
  horizon: string;
  paper: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(zenith) },
          horizon: { value: new THREE.Color(horizon) },
          paper: { value: paper },
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
    [zenith, horizon, paper],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[radius, 24, 16]} />
    </mesh>
  );
}

/** Biome sun elevation is clamped so shadows stay long enough to read
 * furniture depth; the style path keeps its own lowered window key. */

export function SceneLighting({ bounds, style, biome }: SceneLightingProps) {
  const themed = biome && biome.id !== "original" ? biome : null;
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
  // Per-biome adjustments live in the biome's own art file (BiomeArt.lighting).
  const tuning = useMemo(() => (themed ? resolveBiomeLighting(getBiomeArt(themed.id)?.lighting) : null), [themed]);
  const keyPosition: [number, number, number] = themed
    ? biomeSunPosition(themed.lighting.direction, centre, sunDistance, tuning!.sunElevation)
    : [
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
    () =>
      themed
        ? new THREE.Color(themed.lighting.sky).lerp(new THREE.Color(themed.lighting.sun), 0.22)
        : new THREE.Color(style.sceneColors.fillLight).lerp(new THREE.Color(style.sceneColors.keyLight), 0.22),
    [style, themed],
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
      themed
        ? new THREE.Color(themed.lighting.ground).lerp(new THREE.Color(themed.lighting.sky), 0.35)
        : new THREE.Color(style.sceneColors.surfaces[3] ?? style.sceneColors.fog).lerp(
            new THREE.Color(style.sceneColors.fillLight),
            0.55,
          ),
    [style, themed],
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

  const rig = themed ? biomeLightRig(themed, style.lighting.fillIntensity, tuning!) : null;
  const sky = themed
    ? {
        zenith: themed.sky.zenith,
        horizon: themed.sky.horizon,
        fogNear: themed.sky.fogNear * tuning!.fogScale,
        fogFar: themed.sky.fogFar * tuning!.fogScale,
      }
    : { zenith: style.sceneColors.background, horizon: style.sceneColors.fog, fogNear: 1.7, fogFar: 7.2 };
  const ambientColor = themed
    ? `#${new THREE.Color(themed.lighting.sun).lerp(new THREE.Color(themed.lighting.sky), 0.35).getHexString()}`
    : style.sceneColors.ambientLight;

  return (
    <>
      <GradientBackdrop
        radius={Math.max(size.radius * 8, 60)}
        zenith={sky.zenith}
        horizon={sky.horizon}
        paper={style.render.paperTextureOpacity}
      />
      <fog attach="fog" args={[sky.horizon, size.radius * sky.fogNear, size.radius * sky.fogFar]} />
      <ambientLight
        intensity={rig ? rig.ambient : style.lighting.ambientIntensity}
        color={ambientColor}
      />
      <hemisphereLight
        args={[themed ? themed.lighting.sky : style.sceneColors.fillLight, hemisphereGroundColor, rig ? rig.hemisphere : style.lighting.fillIntensity]}
      />
      <directionalLight
        position={keyPosition}
        intensity={themed ? themed.lighting.intensity : style.lighting.keyIntensity}
        color={themed ? themed.lighting.sun : style.sceneColors.keyLight}
        castShadow
        shadow-mapSize-width={keyShadowMapSize}
        shadow-mapSize-height={keyShadowMapSize}
        shadow-camera-near={0.1}
        shadow-camera-far={sunDistance * 3}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={rig ? rig.shadowBias : -0.0008}
        shadow-normalBias={rig ? rig.shadowNormalBias : 0.012}
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

/**
 * Themed looks only (Original keeps every style value): part of the flat
 * ambient term moves into the sky/ground hemisphere, so props and structures
 * get clearly lit tops and shaded undersides at about the same overall
 * brightness, and the sun's shadow bias is tightened for miniature-scale
 * props (a 1.2 cm normal bias detached the shadows of small stones).
 */
export function biomeLightRig(
  biome: Pick<BiomeDefinition, "lighting">,
  styleFillIntensity: number,
  tuning: Pick<ResolvedBiomeLighting, "ambientKeep" | "hemisphereShare"> = LIGHTING_DEFAULTS,
): { ambient: number; hemisphere: number; shadowBias: number; shadowNormalBias: number } {
  const ambient = Number.isFinite(biome.lighting.ambient) ? Math.max(0, biome.lighting.ambient) : 0;
  return {
    ambient: ambient * tuning.ambientKeep,
    hemisphere: styleFillIntensity + ambient * tuning.hemisphereShare,
    shadowBias: -0.0006,
    shadowNormalBias: 0.006,
  };
}

/** Sun placed along the biome's (scene → sun) direction at the same
 * distance as the style key, with its elevation clamped for legible shadows. */
export function biomeSunPosition(
  direction: readonly [number, number, number],
  centre: { x: number; y: number; z: number },
  sunDistance: number,
  elevationRange: readonly [number, number] = LIGHTING_DEFAULTS.sunElevation,
): [number, number, number] {
  const horizontal = Math.hypot(direction[0], direction[2]);
  const dirX = horizontal > 1e-6 ? direction[0] / horizontal : 1;
  const dirZ = horizontal > 1e-6 ? direction[2] / horizontal : 0;
  const rawElevation = Math.atan2(Number.isFinite(direction[1]) ? direction[1] : 1, horizontal || 1e-6);
  const elevation = Math.min(elevationRange[1], Math.max(elevationRange[0], rawElevation));
  const flat = Math.cos(elevation) * sunDistance;
  return [centre.x + dirX * flat, centre.y + Math.sin(elevation) * sunDistance, centre.z + dirZ * flat];
}
