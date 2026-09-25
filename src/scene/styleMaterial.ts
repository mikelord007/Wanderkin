import * as THREE from "three";
import type { StyleDefinition } from "../../shared/style.js";
import { clampColorRestoration } from "./style.js";
import { getKnownMaterialProfile, type MaterialRegionProfile } from "./materialRegions.js";

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
 *
 * `assetSha256` is the loaded asset's verified content hash (not its manifest
 * id or filename). When it matches a known bundled sample in
 * `materialRegions.ts`, submeshes get that sample's authored wood/fabric
 * region treatment; otherwise every mesh gets the conservative, uniformly-lit
 * treatment only (see `installStyleShader`).
 */
export function cloneStyledObject(
  source: THREE.Object3D,
  style: StyleDefinition,
  colorRestoration: number,
  assetSha256?: string | null,
): THREE.Object3D {
  const regionProfile = getKnownMaterialProfile(assetSha256);
  const clone = source.clone(true);
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) =>
          cloneStyledMaterial(material, style, colorRestoration, regionProfile),
        )
      : cloneStyledMaterial(mesh.material, style, colorRestoration, regionProfile);
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
  installStyleShader(material, style, colorRestoration, null);
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

/**
 * Detects the exact material shape our image-to-3D providers (Rodin, Tripo,
 * and the storage-asset regeneration pipeline) bake: every one of them puts
 * all visible colour in a single `emissiveTexture`, leaves `baseColorFactor`
 * black, and reports zero metalness (verified against every `.glb` shipped
 * in `public/samples/` and `storage/assets/`; see
 * `nimbalyst-local/playtest-checkpoints/material-lighting-refinement.md`).
 *
 * This is a structural check on the material's own already-decoded
 * properties, not a guess about what the mesh depicts. A material that
 * already has a real base-colour map, or a deliberately emissive decorative
 * object (non-black base colour), never matches this shape and is left
 * completely untouched.
 */
export function isBakedEmissiveOnlyMaterial(
  material: THREE.Material,
): material is THREE.MeshStandardMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  if (material.map) return false;
  if (!material.emissiveMap) return false;
  const { r, g, b } = material.color;
  const isBlackBase = r < 0.02 && g < 0.02 && b < 0.02;
  return isBlackBase && material.metalness < 0.05;
}

/**
 * Rewires a baked/emissive-only material so it responds to real scene
 * lighting instead of rendering at a flat, direction-independent brightness
 * regardless of the key/fill lights around it.
 *
 * The baked texture becomes the actual base colour (`map`); the emissive
 * override that previously made it self-lit is cleared. Standard PBR shading
 * (ambient + hemisphere fill + directional N·L) now modulates that same
 * texture, using the exact `StyleLighting` intensities already tuned for
 * every other lit surface in the scene (floor, steps, ramps) — so this does
 * not add a new exposure multiplier or otherwise double up brightness, it
 * only makes the existing lighting visible on this surface for the first
 * time. Roughness is left at the glTF default (fully rough), which keeps the
 * reused baked photo texture from also picking up a hard specular hotspot on
 * top of shading that is often already partly baked into the source photos.
 *
 * Known, honestly-stated limitation: the source texture's own baked
 * lighting/shadowing from the original photos cannot be removed by this (or
 * any texture-preserving) transform — a photographed object lit from the
 * left will still look faintly lit from the left even once the scene's own
 * lights come from elsewhere. This makes the object responsive to direction
 * and distance again without claiming to reconstruct a true, lighting-free
 * albedo from a single baked photo capture.
 */
function relightBakedEmissiveMaterial(material: THREE.MeshStandardMaterial): void {
  material.map = material.emissiveMap;
  material.emissiveMap = null;
  material.color.setRGB(1, 1, 1);
  material.emissive.setRGB(0, 0, 0);
  material.needsUpdate = true;
}

function cloneStyledMaterial(
  source: THREE.Material,
  style: StyleDefinition,
  colorRestoration: number,
  regionProfile: MaterialRegionProfile | null,
): THREE.Material {
  const material = source.clone();
  if (isBakedEmissiveOnlyMaterial(material)) relightBakedEmissiveMaterial(material);
  installStyleShader(material, style, colorRestoration, regionProfile);
  return material;
}

function installStyleShader(
  material: THREE.Material,
  style: StyleDefinition,
  colorRestoration: number,
  regionProfile: MaterialRegionProfile | null,
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

    if (regionProfile) {
      Object.assign(shader.uniforms, {
        oqRegionDividerX: { value: regionProfile.dividerWorldX },
        oqRegionBlendWidth: { value: regionProfile.blendWidth },
      });
      shader.vertexShader = `
        varying vec3 oqWorldPos;
      ${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        oqWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    }

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
    ${regionProfile ? REGION_SHADER_DECLARATIONS : ""}
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

    if (regionProfile) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
        ${REGION_ROUGHNESS_INJECTION}`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
        ${REGION_NORMAL_INJECTION}`,
        );
    }
  };
  material.customProgramCacheKey = () =>
    `objectquest-style-v1:${style.id}:${style.render.outline.enabled ? 1 : 0}:${
      regionProfile ? `region-${regionProfile.dividerWorldX}-${regionProfile.blendWidth}` : "none"
    }`;
  material.needsUpdate = true;
}

/**
 * Fragment-shader helpers for the two-region (wood/fabric) surface detail on
 * a known sample. `oqWorldPos` is a plain affine transform of the mesh's own
 * vertex positions (see the vertex-shader injection above), so the region
 * boundary and both noise fields stay anchored to the object and do not swim
 * as the camera moves.
 *
 * Bump strength is applied via the surface-gradient method (Mikkelsen), which
 * derives a tangent-consistent perturbation directly from screen-space
 * derivatives of the actual view-space position and a scalar height field —
 * it works on curved/irregular surfaces facing any direction (the sofa's
 * cushions and legs), unlike a naive "bump along the vertical axis" hack that
 * only makes sense on a flat, upward-facing surface like a desktop.
 *
 * Frequencies are chosen for legibility at normal gameplay camera distance on
 * this style-quantized renderer, not for literal real-world thread/grain
 * pitch — the same restrained-scale trade-off already made by the renderer's
 * existing paper-grain and hand-painted stroke textures.
 */
const REGION_SHADER_DECLARATIONS = /* glsl */ `
  varying vec3 oqWorldPos;
  uniform float oqRegionDividerX;
  uniform float oqRegionBlendWidth;

  float oqValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = oqHash(i);
    float b = oqHash(i + vec2(1.0, 0.0));
    float c = oqHash(i + vec2(0.0, 1.0));
    float d = oqHash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float oqWoodHeight(vec3 p) {
    float rings = sin(p.z * 28.0);
    float fiber = oqValueNoise(p.xz * 8.0) - 0.5;
    return rings * 0.5 + fiber * 0.5;
  }

  float oqFabricHeight(vec3 p) {
    float weave = sin(p.x * 130.0) * sin(p.y * 130.0 + 1.5708) * 0.4
      + sin(p.z * 130.0) * 0.2;
    float soft = oqValueNoise(p.xz * 14.0 + p.y * 6.0) - 0.5;
    return weave * 0.5 + soft * 0.7;
  }

  float oqWoodRegionFactor(vec3 worldPos) {
    return smoothstep(
      oqRegionDividerX - oqRegionBlendWidth,
      oqRegionDividerX + oqRegionBlendWidth,
      worldPos.x
    );
  }

  /**
   * The weave/grain height fields are fixed-frequency analytic functions with
   * no mip chain, so as a surface recedes into the distance (or is viewed at
   * a grazing angle) each screen pixel starts covering many noise cycles at
   * once. Left alone, that under-sampling doesn't fade gracefully — the
   * per-pixel derivative the bump math relies on grows with it, so distant
   * or raking parts of a surface would show harsh, exaggerated banding
   * instead of just quietly aliasing. Compare the noise frequency against
   * how much world space one pixel actually spans (fwidth) and fade the
   * detail out before that happens: once a pixel spans close to a full
   * cycle, the pattern is unresolvable anyway, so removing it is strictly
   * more correct than amplifying it.
   */
  float oqDetailFade(vec3 worldPos, float frequency) {
    float worldPerPixel = length(fwidth(worldPos));
    float cyclesPerPixel = frequency * worldPerPixel;
    return 1.0 - smoothstep(0.35, 1.2, cyclesPerPixel);
  }

  /**
   * Surface-gradient bump (Mikkelsen, "Bump Mapping Unparametrized Surfaces
   * on the GPU"). Deliberately never divides by \`det\`: an earlier version
   * of this function normalized by \`1/abs(det)\` before renormalizing, which
   * is only equivalent to the correct formula when \`det\` stays comfortably
   * away from zero and consistently signed. On this mesh — a single combined
   * AI reconstruction with no guarantee of uniform triangle winding — \`det\`
   * does cross zero and flip sign from one fragment to the next, and
   * dividing by it there spiked the perturbation towards +/-infinity,
   * producing hard alternating bright/dark bands instead of a subtle bump.
   * Scaling the normal by \`abs(det)\` and the gradient by \`sign(det)\`
   * instead keeps every term bounded, which is what removed the banding.
   */
  vec3 oqPerturbNormal(vec3 surfaceNormal, vec3 viewPos, float height) {
    vec3 dPosX = dFdx(viewPos);
    vec3 dPosY = dFdy(viewPos);
    vec3 r1 = cross(dPosY, surfaceNormal);
    vec3 r2 = cross(surfaceNormal, dPosX);
    float det = dot(dPosX, r1);
    float dHeightX = dFdx(height);
    float dHeightY = dFdy(height);
    vec3 surfaceGradient = sign(det) * (r1 * dHeightX + r2 * dHeightY);
    return normalize(abs(det) * surfaceNormal - surfaceGradient);
  }
`;

const REGION_ROUGHNESS_INJECTION = /* glsl */ `
  float oqWoodFactor = oqWoodRegionFactor(oqWorldPos);
  float oqDetailVisibility = oqDetailFade(oqWorldPos, 130.0);
  float oqRoughNoise = (oqValueNoise(oqWorldPos.xz * 40.0 + oqWorldPos.y * 17.0) - 0.5) * oqDetailVisibility;
  float oqFabricRoughness = clamp(0.82 + oqRoughNoise * 0.10, 0.55, 0.97);
  float oqWoodRoughness = clamp(0.42 + oqRoughNoise * 0.12, 0.22, 0.62);
  roughnessFactor = mix(oqFabricRoughness, oqWoodRoughness, oqWoodFactor);
`;

const REGION_NORMAL_INJECTION = /* glsl */ `
  {
    float oqHeight = mix(oqFabricHeight(oqWorldPos), oqWoodHeight(oqWorldPos), oqWoodFactor)
      * 0.0035 * oqDetailVisibility;
    normal = oqPerturbNormal(normal, -vViewPosition, oqHeight);
  }
`;

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
