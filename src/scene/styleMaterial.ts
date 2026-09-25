import * as THREE from "three";
import type { StyleDefinition } from "../../shared/style.js";
import { clampColorRestoration } from "./style.js";
import {
  getKnownMaterialProfile,
  MATERIAL_REGION_KIND_CODE,
  MAX_MATERIAL_REGION_BOXES,
  type MaterialRegionProfile,
} from "./materialRegions.js";

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
 * `materialRegions.ts`, the surfaces inside that sample's measured boxes get
 * the authored wood/fabric treatment; otherwise every mesh gets the
 * conservative, uniformly-lit treatment only (see `installStyleShader`).
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
  installStyleShader(material, style, colorRestoration, null, false, false);
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
 * Detects the baked, unlit material shape Rodin-style image-to-3D output uses:
 * all visible colour in a single `emissiveTexture`, a black
 * `baseColorFactor`, and zero metalness (`public/samples/rodin.glb` and the
 * storage-asset regenerations). Not every generated asset looks like this:
 * `public/samples/tripo.glb` ships a real PBR material (base colour,
 * metallic-roughness and normal textures), which this check rejects, so it
 * is rendered exactly as imported.
 *
 * This is a structural check on the material's own already-decoded
 * properties, not a guess about what the mesh depicts. Deliberately
 * conservative: it requires the *absence* of `map`, `normalMap`,
 * `metalnessMap`, and `roughnessMap`, plus a black base colour and near-zero
 * metalness. A material carrying any real PBR map — including a genuinely
 * imported metallic/roughness-mapped asset, should one ever exist in this
 * pipeline — never matches this shape and is left completely untouched:
 * its metalness, roughness, and every map it ships with pass through
 * `cloneStyledObject` unmodified (see the "genuine PBR material" test in
 * `styleMaterial.test.ts`). A deliberately emissive decorative object
 * (non-black base colour) is equally excluded.
 */
export function isBakedEmissiveOnlyMaterial(
  material: THREE.Material,
): material is THREE.MeshStandardMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  if (material.map) return false;
  if (!material.emissiveMap) return false;
  if (material.normalMap || material.metalnessMap || material.roughnessMap) return false;
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
  const wasRelit = isBakedEmissiveOnlyMaterial(material);
  if (wasRelit) relightBakedEmissiveMaterial(material);
  installStyleShader(material, style, colorRestoration, regionProfile, wasRelit, true);
  return material;
}

/**
 * Fraction of a relit material's own original baked brightness that its
 * final on-screen colour is never allowed to fall below.
 *
 * Found by controlled, pixel-measured A/B comparison at the identical camera
 * position (same frame, only this file's relight logic reverted vs not —
 * see nimbalyst-local/playtest-checkpoints/material-lighting-refinement.md,
 * "Follow-up: honest limitation found by controlled comparison"): a region
 * of the Rodin mesh that reads as a clearly visible dark olive/brown,
 * RGB(51,51,0), in the original unlit render was crushed to a barely
 * perceptible near-black, RGB(6,4,2), once real multiplicative lighting and
 * Cartoon's posterization ran on top of it — roughly an 8x reduction, not
 * just "moodier" shading. That is a real regression this relight introduced
 * for already-dark baked pixels: the original unlit render preserved a hint
 * of colour and gradient there; the relit one did not.
 *
 * Floors the *final* graded colour at a fraction of what the material's own
 * baked texture would show *displayed directly* (its sRGB-encoded form, not
 * its raw linear working-space value — `diffuseColor` is captured in linear
 * space right after `map_fragment`, before lighting/tonemapping, while the
 * floor is applied after tonemapping + colour-space conversion, so it must
 * be re-encoded with the same ~2.2 gamma approximation to compare like with
 * like; the first version of this fix compared the two directly and the
 * floor came out far darker than intended for exactly this reason). ACES
 * tonemapping is deliberately not replicated for the floor value — it is
 * near-identity for shadow-range values, and this only needs to be a
 * reasonable perceptual floor, not an exact reproduction of the unlit path.
 */
const RELIT_MINIMUM_BRIGHTNESS_FRACTION = 0.45;

function installStyleShader(
  material: THREE.Material,
  style: StyleDefinition,
  colorRestoration: number,
  regionProfile: MaterialRegionProfile | null,
  wasRelit: boolean,
  importedAsset: boolean,
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
    ? importedAsset
      ? CARTOON_ASSET_LUMA_BANDS
      : `
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

    if (wasRelit) {
      Object.assign(shader.uniforms, {
        oqRelitFloor: { value: RELIT_MINIMUM_BRIGHTNESS_FRACTION },
      });
    }

    if (regionProfile) {
      Object.assign(shader.uniforms, regionUniforms(regionProfile));
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
      ${wasRelit ? "uniform float oqRelitFloor;\n      vec3 oqBakedAlbedo = vec3(0.0);" : ""}
      float oqHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
    ${regionProfile ? regionShaderDeclarations(regionProfile, style) : ""}
    ${shader.fragmentShader}`.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      vec3 oqColor = gl_FragColor.rgb;
      float oqLuma = dot(oqColor, vec3(0.2126, 0.7152, 0.0722));
      oqColor = mix(vec3(oqLuma), oqColor, oqSaturation);
      oqColor = clamp((oqColor - 0.5) * oqContrast + 0.5, 0.0, 1.0);
      ${styleFragment}
      float oqStyledLuma = dot(oqColor, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor.rgb = mix(vec3(oqStyledLuma), oqColor, oqColorRestoration);
      ${wasRelit
        ? `{
        // oqBakedAlbedo is linear (captured pre-lighting/tonemap); gl_FragColor
        // here is already tonemapped and sRGB-encoded, so approximate the same
        // ~2.2 gamma encoding before comparing, or this floor reads far darker
        // than the unlit render it is meant to match (see RELIT_MINIMUM_BRIGHTNESS_FRACTION).
        vec3 oqBakedDisplay = pow(clamp(oqBakedAlbedo, 0.0, 1.0), vec3(1.0 / 2.2));
        gl_FragColor.rgb = max(gl_FragColor.rgb, oqBakedDisplay * oqRelitFloor);
      }`
        : ""}`,
    );

    if (wasRelit) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        oqBakedAlbedo = diffuseColor.rgb;`,
      );
    }

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
    `objectquest-style-v2:${style.id}:${style.render.outline.enabled ? 1 : 0}:${
      regionProfile ? `region-boxes-${regionProfile.boxes.length}` : "none"
    }:${wasRelit ? "relit" : "unlit-passthrough"}:${importedAsset ? "asset" : "helper"}`;
  material.needsUpdate = true;
}

/**
 * Cartoon banding for imported assets: quantize *luminance* into the style's
 * steps and rescale the colour to it, instead of rounding R, G and B
 * separately.
 *
 * Per-channel rounding is kept for helper, floor and marker materials, whose
 * flat authored colours it was designed for. On an imported photo texture
 * under real lighting it did two visible kinds of damage (same-camera A/B in
 * nimbalyst-local/playtest-checkpoints/opus-visual-review.md, "F2"):
 *  - the three channels round at different thresholds, so any smooth
 *    gradient (a specular sheen, soft shading) became magenta/cyan/lavender
 *    contour bands that are not in the source texture; and
 *  - every channel under 0.1 rounded to zero, which crushed dark furniture
 *    (the Tripo sample's sofa) to flat black.
 * Rescaling the colour keeps the texture's own hue at every band, and the
 * lowest band stays at half a step instead of black. Near-black texels are
 * eased toward neutral grey at that lowest band, so rescaling cannot
 * amplify noise hidden in an almost-black pixel into a saturated colour.
 */
const CARTOON_ASSET_LUMA_BANDS = /* glsl */ `
      if (oqColorSteps > 1.0) {
        float oqBandLuma = dot(oqColor, vec3(0.2126, 0.7152, 0.0722));
        float oqBand = max(floor(oqBandLuma * oqColorSteps + 0.5) / oqColorSteps, 0.5 / oqColorSteps);
        vec3 oqHueKept = clamp(oqColor * (oqBand / max(oqBandLuma, 1e-4)), 0.0, 1.0);
        oqColor = mix(vec3(oqBand), oqHueKept, smoothstep(0.0, 0.04, oqBandLuma));
      }`;

/** CPU mirror of {@link CARTOON_ASSET_LUMA_BANDS}, for tests. Input and output are display-space RGB in [0, 1]. */
export function cartoonAssetBandColor(
  color: readonly [number, number, number],
  steps = 5,
): [number, number, number] {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  const band = Math.max(Math.floor(luma * steps + 0.5) / steps, 0.5 / steps);
  const t = Math.min(1, Math.max(0, luma / 0.04));
  const ease = t * t * (3 - 2 * t);
  return color.map((channel) => {
    const hueKept = clamp01(channel * (band / Math.max(luma, 1e-4)));
    return band + (hueKept - band) * ease;
  }) as [number, number, number];
}

function regionUniforms(profile: MaterialRegionProfile): Record<string, { value: unknown }> {
  if (profile.boxes.length === 0 || profile.boxes.length > MAX_MATERIAL_REGION_BOXES) {
    throw new Error(`Material region profiles need 1-${MAX_MATERIAL_REGION_BOXES} boxes`);
  }
  return {
    oqRegionMin: { value: profile.boxes.map((box) => new THREE.Vector3(...box.min)) },
    oqRegionMax: { value: profile.boxes.map((box) => new THREE.Vector3(...box.max)) },
    oqRegionKind: { value: profile.boxes.map((box) => MATERIAL_REGION_KIND_CODE[box.kind]) },
    oqRegionSoftness: { value: profile.edgeSoftness },
  };
}

function regionShaderDeclarations(profile: MaterialRegionProfile, style: StyleDefinition): string {
  return `
  #define OQ_REGION_BOXES ${profile.boxes.length}
  #define OQ_DETAIL_STRENGTH ${surfaceDetailStrength(style).toFixed(2)}
  ${REGION_SHADER_DECLARATIONS}`;
}

/**
 * Cartoon quantizes light into five flat bands, so fine relief cannot show as
 * shading there: it only dithers the band edges into dotted, crawling
 * contours. Keep just a trace of it in Cartoon; the painted styles show the
 * full weave and grain.
 */
export function surfaceDetailStrength(style: StyleDefinition): number {
  return style.id === "cartoon" ? CARTOON_DETAIL_STRENGTH : 1;
}
const CARTOON_DETAIL_STRENGTH = 0.25;

/**
 * Surface detail for the wood and fabric regions of a known sample.
 *
 * `oqWorldPos` is a plain affine transform of the mesh's own vertex
 * positions (see the vertex-shader injection above), so the region boxes and
 * both detail fields stay anchored to the object and do not swim as the
 * camera moves. Outside every box (and inside `neutral` boxes) the surface
 * keeps the plain relit treatment.
 *
 * Scale is chosen for the game's miniature camera, not literal thread or
 * grain pitch: the world is roughly four times real size and the chase camera
 * sits about a metre behind a 0.175 m explorer.
 *  - Fabric: a woven ribbing with a 4.8 cm period (~1.2 cm at real scale,
 *    a coarse upholstery weave).
 *  - Wood: grain lines along the desk's long X axis, about 5 cm apart, that
 *    wander and fade in and out so they read as grain, not ruled stripes.
 * Amplitudes were set by same-camera close-ups and a moving-camera aliasing
 * check in all three styles (opus-visual-review.md, "F6"): strong enough to
 * be felt under the explorer's feet, faded out well before a pixel could
 * alias the pattern.
 */
const FABRIC_WEAVE_RADIANS_PER_METRE = 130;
const FABRIC_BUMP_AMPLITUDE = 0.008;
const WOOD_GRAIN_RADIANS_PER_METRE = 120;
const WOOD_BUMP_AMPLITUDE = 0.003;

const REGION_SHADER_DECLARATIONS = /* glsl */ `
  #define OQ_FABRIC_FREQ ${FABRIC_WEAVE_RADIANS_PER_METRE.toFixed(1)}
  #define OQ_FABRIC_AMP ${FABRIC_BUMP_AMPLITUDE}
  #define OQ_WOOD_FREQ ${WOOD_GRAIN_RADIANS_PER_METRE.toFixed(1)}
  #define OQ_WOOD_AMP ${WOOD_BUMP_AMPLITUDE}
  varying vec3 oqWorldPos;
  uniform vec3 oqRegionMin[OQ_REGION_BOXES];
  uniform vec3 oqRegionMax[OQ_REGION_BOXES];
  uniform float oqRegionKind[OQ_REGION_BOXES];
  uniform float oqRegionSoftness;

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

  /** (wood, fabric) weights; mirrors classifyMaterialPoint in materialRegions.ts. */
  vec2 oqRegionWeights(vec3 p) {
    float wood = 0.0;
    float fabric = 0.0;
    float neutral = 0.0;
    for (int i = 0; i < OQ_REGION_BOXES; i++) {
      vec3 d = max(oqRegionMin[i] - p, p - oqRegionMax[i]);
      float outside = max(max(d.x, d.y), d.z);
      float w = 1.0 - smoothstep(-oqRegionSoftness, oqRegionSoftness, outside);
      if (oqRegionKind[i] < 0.5) fabric = max(fabric, w);
      else if (oqRegionKind[i] < 1.5) wood = max(wood, w);
      else neutral = max(neutral, w);
    }
    return vec2(wood, fabric) * (1.0 - neutral);
  }

  float oqWoodHeight(vec3 p) {
    // Lines run along X and wander slowly across Z; their strength varies
    // along the board so they fade in and out like real grain.
    float drift = oqValueNoise(vec2(p.x * 0.8, p.z * 2.0)) * 6.0;
    float wander = (oqValueNoise(vec2(p.x * 3.5, p.z * 9.0)) * 2.0 - 1.0) * 4.0;
    float figure = 0.35 + 0.65 * oqValueNoise(vec2(p.x * 4.0, p.z * 14.0) + 7.0);
    return sin(p.z * OQ_WOOD_FREQ + drift + wander) * figure;
  }

  float oqFabricHeight(vec3 p) {
    float weave = sin(p.x * OQ_FABRIC_FREQ) * sin(p.y * OQ_FABRIC_FREQ + 1.5708) * 0.4
      + sin(p.z * OQ_FABRIC_FREQ) * 0.2;
    float soft = oqValueNoise(p.xz * 14.0 + p.y * 6.0) - 0.5;
    return weave * 0.5 + soft * 0.7;
  }

  /**
   * The detail fields are analytic functions with no mip chain, so a surface
   * that recedes (or is seen at a grazing angle) would under-sample them and
   * shimmer. Fade each one out, by its own frequency, before a pixel covers
   * about half a cycle. The frequencies are in radians per metre, so they
   * are converted to cycles before comparing (an earlier version skipped the
   * 1/2π and faded the detail out roughly six times too early to ever see).
   * \`fwidth\` summed over three axes overestimates a pixel's footprint, which
   * errs toward fading early.
   */
  float oqDetailFade(vec3 worldPos, float radiansPerMetre) {
    float worldPerPixel = length(fwidth(worldPos));
    float cyclesPerPixel = radiansPerMetre * 0.15915494 * worldPerPixel;
    return 1.0 - smoothstep(0.2, 0.45, cyclesPerPixel);
  }

  /**
   * Surface-gradient bump (Mikkelsen, "Bump Mapping Unparametrized Surfaces
   * on the GPU"). Deliberately never divides by \`det\`: on this mesh — a
   * single combined AI reconstruction with no guarantee of uniform triangle
   * winding — \`det\` crosses zero and flips sign between fragments, and
   * dividing by it produced hard alternating bands. Scaling the normal by
   * \`abs(det)\` and the gradient by \`sign(det)\` keeps every term bounded.
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
  vec2 oqRegion = oqRegionWeights(oqWorldPos);
  float oqRoughNoise = oqValueNoise(oqWorldPos.xz * 9.0 + oqWorldPos.y * 5.0) - 0.5;
  roughnessFactor = mix(roughnessFactor, clamp(0.92 + oqRoughNoise * 0.08, 0.84, 1.0), oqRegion.y);
  roughnessFactor = mix(roughnessFactor, clamp(0.62 + oqRoughNoise * 0.14, 0.52, 0.72), oqRegion.x);
`;

/* Each field is bumped on its own and the normals are blended by region
 * weight, so a box edge never turns into a height step (and a false ridge). */
const REGION_NORMAL_INJECTION = /* glsl */ `
  {
    vec3 oqFabricNormal = oqPerturbNormal(normal, -vViewPosition,
      oqFabricHeight(oqWorldPos) * OQ_FABRIC_AMP * OQ_DETAIL_STRENGTH * oqDetailFade(oqWorldPos, OQ_FABRIC_FREQ));
    vec3 oqWoodNormal = oqPerturbNormal(normal, -vViewPosition,
      oqWoodHeight(oqWorldPos) * OQ_WOOD_AMP * OQ_DETAIL_STRENGTH * oqDetailFade(oqWorldPos, OQ_WOOD_FREQ));
    normal = normalize(normal + (oqFabricNormal - normal) * oqRegion.y + (oqWoodNormal - normal) * oqRegion.x);
  }
`;

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
