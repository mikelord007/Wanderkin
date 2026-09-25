/**
 * The materials every biome prop shares: vertex colours, a wind sway driven
 * by the shared wind uniforms, and a dithered fade for props that come
 * between the chase camera and the player (the camera's occlusion test is
 * physics-only, so non-colliding decor never pulls it in).
 *
 * Two shadings exist: `faceted` (flat, for rock, wood and stone) and
 * `smooth` (vertex normals, for foliage, trunks and cacti).
 *
 * Geometry carries `aPivot` = (member base xyz, member height) in the space
 * of the mesh, and `aSway` (0 at the root). Baked prop buckets are already in
 * world space (identity model matrix); the windsock supplies its own local
 * pivot and never sways.
 */
import * as THREE from "three";
import type { AssetShading } from "../assets/types.js";
import type { WindUniforms } from "./wind.js";

export function createPropMaterial(wind: WindUniforms, shading: AssetShading = "faceted"): THREE.MeshStandardMaterial {
  const smooth = shading === "smooth";
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: !smooth,
    roughness: smooth ? 0.9 : 0.88,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind);
    shader.vertexShader = `${PROP_VERTEX_DECLARATIONS}\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      ${PROP_VERTEX_INJECTION}`,
    );
    shader.fragmentShader = `${PROP_FRAGMENT_DECLARATIONS}\n${shader.fragmentShader}`.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      ${PROP_FRAGMENT_INJECTION}`,
    );
  };
  material.customProgramCacheKey = () => `objectquest-biome-prop-v2:${shading}`;
  return material;
}

const PROP_VERTEX_DECLARATIONS = /* glsl */ `
  attribute float aSway;
  attribute vec4 aPivot;
  uniform float uWindTime;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform float uWindMotion;
  varying vec3 oqPropWorld;
  varying float oqPropHeight;
`;

/*
 * Sway bends along the downwind direction in mesh space, scaled by the
 * member's own height, so a tuft and a palm bend in proportion. The phase
 * comes from the member's base, so neighbours do not move in lockstep. A
 * small static lean keeps the wind readable with motion off.
 */
const PROP_VERTEX_INJECTION = /* glsl */ `
  vec3 oqOrigin = (modelMatrix * vec4(aPivot.xyz, 1.0)).xyz;
  float oqPhase = fract(sin(dot(oqOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float oqGust = 0.7 + 0.3 * sin(uWindTime * 0.63 + oqPhase * 1.7);
  float oqWave = sin(uWindTime * (1.5 + uWindStrength) + oqPhase);
  float oqBend = aSway * uWindStrength * (0.045 + uWindMotion * (0.03 * oqWave) * oqGust);
  transformed.xz += vec2(uWindDir.x, uWindDir.y) * oqBend * aPivot.w;
  transformed.y -= oqBend * oqBend * 0.5 * aPivot.w;
  oqPropWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  oqPropHeight = aPivot.w * length(modelMatrix[1].xyz);
`;

const PROP_FRAGMENT_DECLARATIONS = /* glsl */ `
  varying vec3 oqPropWorld;
  varying float oqPropHeight;
`;

const PROP_FRAGMENT_INJECTION = /* glsl */ `
  {
    float oqCamDist = distance(oqPropWorld, cameraPosition);
    float oqKeep = smoothstep(oqPropHeight * 0.45, oqPropHeight * 1.25, oqCamDist);
    float oqDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (oqKeep < 0.999 && oqKeep <= oqDither) discard;
  }
`;
