import * as THREE from "three";
import type { StyleDefinition } from "../../shared/style.js";
import { clampColorRestoration } from "./style.js";

interface StyleUniformState {
  colorRestoration: { value: number };
  saturation: { value: number };
  contrast: { value: number };
  colorSteps: { value: number };
  edgeStrength: { value: number };
  edgeColor: { value: THREE.Color };
  paperTexture: { value: number };
  watercolorWash: { value: number };
}

const USER_DATA_KEY = "objectQuestStyleUniforms";

/**
 * Clone a cached glTF scene and every material before installing ObjectQuest's
 * small fragment-shader treatment. Textures remain shared/read-only; materials
 * and style uniforms do not leak between simultaneous style previews.
 */
export function cloneStyledObject(
  source: THREE.Object3D,
  style: StyleDefinition,
  colorRestoration: number,
): THREE.Object3D {
  const clone = source.clone(true);
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => cloneStyledMaterial(material, style, colorRestoration))
      : cloneStyledMaterial(mesh.material, style, colorRestoration);
  });
  return clone;
}

export function createStyledHelperMaterial(
  color: string,
  style: StyleDefinition,
  colorRestoration: number,
  options: { floor?: boolean } = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.floor ? 0.94 : 0.76,
    metalness: 0.01,
  });
  installStyleShader(material, style, colorRestoration);
  return material;
}

export function setObjectColorRestoration(object: THREE.Object3D, value: number): void {
  const clamped = clampColorRestoration(value);
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialList(mesh.material)) {
      const state = material.userData[USER_DATA_KEY] as StyleUniformState | undefined;
      if (state) state.colorRestoration.value = clamped;
    }
  });
}

/** Dispose cloned materials only. Cached/shared textures are intentionally kept. */
export function disposeStyledObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialList(mesh.material)) material.dispose();
  });
}

function cloneStyledMaterial(
  source: THREE.Material,
  style: StyleDefinition,
  colorRestoration: number,
): THREE.Material {
  const material = source.clone();
  installStyleShader(material, style, colorRestoration);
  return material;
}

function installStyleShader(
  material: THREE.Material,
  style: StyleDefinition,
  colorRestoration: number,
): void {
  const state: StyleUniformState = {
    colorRestoration: { value: clampColorRestoration(colorRestoration) },
    saturation: { value: style.render.saturation },
    contrast: { value: style.render.contrast },
    colorSteps: { value: style.id === "cartoon" ? 5 : 0 },
    edgeStrength: {
      value: style.render.outline.enabled
        ? Math.min(0.72, Math.max(0.12, style.render.outline.thickness * 40))
        : 0,
    },
    edgeColor: { value: new THREE.Color(style.render.outline.color) },
    paperTexture: { value: style.render.paperTextureOpacity },
    watercolorWash: { value: style.render.watercolorWashStrength },
  };
  material.userData[USER_DATA_KEY] = state;

  const previousCompile = material.onBeforeCompile;
  const styleFragment = style.id === "cartoon"
    ? `
      if (oqColorSteps > 1.0) {
        oqColor = floor(oqColor * oqColorSteps + 0.5) / oqColorSteps;
      }`
    : style.id === "hand-painted"
      ? `
      float oqStroke = oqHash(floor(gl_FragCoord.xy * vec2(0.14, 0.045)));
      oqColor += (oqStroke - 0.5) * oqPaperTexture * 0.09;`
      : `
      float oqGrain = oqHash(gl_FragCoord.xy * 0.32) - 0.5;
      oqColor += oqGrain * oqPaperTexture * 0.075;
      oqColor = mix(oqColor, vec3(1.0), oqWatercolorWash * (0.045 + max(0.0, oqGrain) * 0.06));`;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      oqColorRestoration: state.colorRestoration,
      oqSaturation: state.saturation,
      oqContrast: state.contrast,
      oqColorSteps: state.colorSteps,
      oqEdgeStrength: state.edgeStrength,
      oqEdgeColor: state.edgeColor,
      oqPaperTexture: state.paperTexture,
      oqWatercolorWash: state.watercolorWash,
    });
    shader.fragmentShader = `
      uniform float oqColorRestoration;
      uniform float oqSaturation;
      uniform float oqContrast;
      uniform float oqColorSteps;
      uniform float oqEdgeStrength;
      uniform vec3 oqEdgeColor;
      uniform float oqPaperTexture;
      uniform float oqWatercolorWash;
      float oqHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
    ${shader.fragmentShader}`.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      vec3 oqColor = gl_FragColor.rgb;
      float oqLuma = dot(oqColor, vec3(0.2126, 0.7152, 0.0722));
      oqColor = mix(vec3(oqLuma), oqColor, oqSaturation);
      oqColor = clamp((oqColor - 0.5) * oqContrast + 0.5, 0.0, 1.0);
      ${styleFragment}
      float oqStyledLuma = dot(oqColor, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor.rgb = mix(vec3(oqStyledLuma), oqColor, oqColorRestoration);`,
    );
  };
  material.customProgramCacheKey = () =>
    `objectquest-style-v1:${style.id}:${style.render.outline.enabled ? 1 : 0}`;
  material.needsUpdate = true;
}

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
