/**
 * The one material every biome prop shares: flat-shaded vertex colours, a
 * wind sway driven by the shared wind uniforms, and a dithered fade for props
 * that come between the chase camera and the player (the camera's occlusion
 * test is physics-only, so non-colliding decor never pulls it in).
 */
import * as THREE from "three";
import type { WindUniforms } from "./wind.js";

export function createPropMaterial(wind: WindUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
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
  material.customProgramCacheKey = () => "objectquest-biome-prop-v1";
  return material;
}

const PROP_VERTEX_DECLARATIONS = /* glsl */ `
  attribute float aSway;
  uniform float uWindTime;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform float uWindMotion;
  varying vec3 oqPropWorld;
  varying float oqPropHeight;
`;

/*
 * Instances are upright (yaw + uniform scale) for swaying kinds, so the
 * world wind converts to instance-local space with the transpose of the
 * instance's 3x3 (scale cancels in the normalize). A small static lean keeps
 * the wind direction readable with motion off.
 */
const PROP_VERTEX_INJECTION = /* glsl */ `
  #ifdef USE_INSTANCING
    mat4 oqInst = instanceMatrix;
  #else
    mat4 oqInst = mat4(1.0);
  #endif
  vec3 oqOrigin = (modelMatrix * oqInst[3]).xyz;
  float oqPhase = fract(sin(dot(oqOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  vec3 oqLocalWind = transpose(mat3(oqInst)) * vec3(uWindDir.x, 0.0, uWindDir.y);
  oqLocalWind /= max(length(oqLocalWind), 1e-5);
  float oqGust = 0.7 + 0.3 * sin(uWindTime * 0.63 + oqPhase * 1.7);
  float oqWave = sin(uWindTime * (1.5 + uWindStrength) + oqPhase);
  float oqBend = aSway * uWindStrength * (0.045 + uWindMotion * (0.03 * oqWave) * oqGust);
  transformed.xz += oqLocalWind.xz * oqBend;
  transformed.y -= oqBend * oqBend * 0.5;
  oqPropWorld = (modelMatrix * oqInst * vec4(transformed, 1.0)).xyz;
  oqPropHeight = length(oqInst[1].xyz) * length(modelMatrix[1].xyz);
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
