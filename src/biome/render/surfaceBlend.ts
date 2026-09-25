/**
 * Subtle, localized biome tint on the scan's CLONED materials.
 *
 * Installed once per cloned material (never on the cached source materials),
 * chained after ObjectQuest's style shader. Every value is a uniform, so
 * switching biome or returning to Original changes numbers only: no
 * re-clone and no shader recompile. With strength 0 (Original) the whole
 * block is skipped, so Original renders exactly as before.
 *
 * Only upward-facing texels inside an approved support patch are tinted, at
 * most `strength`, and the tint keeps the texel's own luminance so grain,
 * print and edges from the photo stay readable through the sand/grass.
 *
 * Exception: the scan's own flat ground at floor level (a scanned floor or
 * rug a few cm above the game floor) takes the helper floor's tint, so it
 * cannot show its photo colour through as a stain next to re-skinned floor.
 */
import * as THREE from "three";
import { getBiomeArt } from "../assets/biomes/index.js";
import type { WallStyle } from "../assets/types.js";
import type { BiomeDefinition, BiomeLayout, BiomeSurfacePatch, EffectsQuality } from "../types.js";
import { layoutMatchesDefinition, MAX_SURFACE_PATCHES, selectSurfacePatches } from "./selection.js";

export interface BiomeSurfaceTreatment {
  /** sRGB hex tint colour. */
  color: string;
  /** Strongest blend any texel receives, 0..1. */
  strength: number;
  /** Minimum world normal.y (camera-facing geometric normal) to be tinted. */
  upwardNormalMin: number;
  patches: readonly BiomeSurfacePatch[];
  /**
   * Whole-surface tint for ObjectQuest's own helper geometry (floor, steps,
   * ramps, generated bridges) - never the scan. Helpers are flat authored
   * colours, so re-skinning them to sand/wood does not cost recognizability,
   * and it gives traversal structures a biome-specific look. Edges drawn by
   * `SceneEntities` stay, so structures remain readable.
   */
  helper: {
    floorColor: string;
    structureColor: string;
    floorStrength: number;
    structureStrength: number;
    grainFrequency: number;
    /** World y of the game floor's top (the lowest standable surface). */
    floorLevel: number;
    /** Upward scan texels up to this far above `floorLevel` are tinted like the floor. */
    floorBand: number;
  };
  /**
   * The biome's wall style: box helpers (steps, bridges, stepped routes) are
   * drawn as a sculpted visual shell instead of a plain box (see
   * `structureShell.ts`). Colliders never change. Null keeps the box.
   */
  structureShell: WallStyle | null;
}

/** Which surface a material belongs to; only helpers receive the whole-surface tint. */
export type BiomeSurfaceRole = "scan" | "floor" | "structure";

interface BiomeSurfaceUniforms {
  oqBiomeGlobal: { value: number };
  oqBiomeGlobalColor: { value: THREE.Color };
  oqBiomeGrain: { value: number };
  oqBiomeStrength: { value: number };
  oqBiomeColor: { value: THREE.Color };
  oqBiomeUpMin: { value: number };
  oqBiomePatchCount: { value: number };
  oqBiomePatches: { value: THREE.Vector4[] };
  oqBiomeFloorTint: { value: number };
  oqBiomeFloorLevel: { value: number };
  oqBiomeFloorBand: { value: number };
}

/**
 * Scan ground within this height of the floor top reads as floor. Real scans
 * put their floor-level ground 0–3 cm above the game floor; the next flat
 * surfaces (seats, desk tops) sit tens of cm higher.
 */
export const SCAN_FLOOR_BAND = 0.045;

const USER_DATA_KEY = "objectQuestBiomeSurface";

/** Returns null for Original or a mismatched/missing layout. Callers should
 * memoize on (definition, layout, quality). */
export function biomeSurfaceTreatment(
  definition: BiomeDefinition,
  layout: BiomeLayout | null,
  quality: EffectsQuality,
): BiomeSurfaceTreatment | null {
  if (!layoutMatchesDefinition(definition, layout)) return null;
  const patches = selectSurfacePatches(definition, layout, quality);
  const strength = Math.min(0.6, Math.max(0, definition.surface.blend));
  const { min, max } = layout.bounds;
  const extent = Math.max(max[0] - min[0], max[2] - min[2]);
  return {
    color: definition.surface.color,
    strength: patches.length === 0 ? 0 : quality === "reduced" ? strength * 0.9 : strength,
    upwardNormalMin: Math.min(0.98, Math.max(0.3, definition.surface.upwardNormalMin)),
    patches,
    helper: {
      floorColor: definition.palette.sand,
      structureColor: `#${new THREE.Color(definition.palette.wood).offsetHSL(0, 0, 0.1).getHexString()}`,
      floorStrength: 0.92,
      structureStrength: 0.85,
      grainFrequency: Number.isFinite(extent) && extent > 0 ? 40 / extent : 10,
      floorLevel: Number.isFinite(min[1]) ? min[1] : 0,
      floorBand: SCAN_FLOOR_BAND,
    },
    structureShell: getBiomeArt(definition.id)?.wall ?? null,
  };
}

function createUniforms(): BiomeSurfaceUniforms {
  return {
    oqBiomeGlobal: { value: 0 },
    oqBiomeGlobalColor: { value: new THREE.Color(1, 1, 1) },
    oqBiomeGrain: { value: 10 },
    oqBiomeStrength: { value: 0 },
    oqBiomeColor: { value: new THREE.Color(1, 1, 1) },
    oqBiomeUpMin: { value: 0.8 },
    oqBiomePatchCount: { value: 0 },
    oqBiomePatches: { value: Array.from({ length: MAX_SURFACE_PATCHES }, () => new THREE.Vector4(0, 0, 0, 1)) },
    oqBiomeFloorTint: { value: 0 },
    oqBiomeFloorLevel: { value: 0 },
    oqBiomeFloorBand: { value: SCAN_FLOOR_BAND },
  };
}

export function hasBiomeSurfaceBlend(material: THREE.Material): boolean {
  return material.userData[USER_DATA_KEY] !== undefined;
}

/** Idempotent. Must only be called on a material this caller owns (a clone). */
export function installBiomeSurfaceBlend(material: THREE.Material): void {
  if (hasBiomeSurfaceBlend(material)) return;
  const uniforms = createUniforms();
  material.userData[USER_DATA_KEY] = uniforms;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 oqBiomeWorldPos;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      oqBiomeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = `${BIOME_SURFACE_DECLARATIONS}\n${shader.fragmentShader}`.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      ${BIOME_SURFACE_INJECTION}`,
    );
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}:oq-biome-surface-v3`;
  material.needsUpdate = true;
}

export function applyBiomeSurfaceToMaterial(
  material: THREE.Material,
  treatment: BiomeSurfaceTreatment | null,
  role: BiomeSurfaceRole = "scan",
): void {
  const uniforms = material.userData[USER_DATA_KEY] as BiomeSurfaceUniforms | undefined;
  if (!uniforms) return;
  if (!treatment) {
    uniforms.oqBiomeGlobal.value = 0;
    uniforms.oqBiomeStrength.value = 0;
    uniforms.oqBiomePatchCount.value = 0;
    uniforms.oqBiomeFloorTint.value = 0;
    return;
  }
  const { helper } = treatment;
  uniforms.oqBiomeGlobal.value = role === "floor" ? helper.floorStrength : role === "structure" ? helper.structureStrength : 0;
  uniforms.oqBiomeGlobalColor.value.set(role === "structure" ? helper.structureColor : helper.floorColor);
  uniforms.oqBiomeGrain.value = helper.grainFrequency;
  // Scan ground at floor level takes the floor's whole-surface tint.
  uniforms.oqBiomeFloorTint.value = role === "scan" ? helper.floorStrength : 0;
  uniforms.oqBiomeFloorLevel.value = helper.floorLevel;
  uniforms.oqBiomeFloorBand.value = helper.floorBand;
  const count = Math.min(treatment.patches.length, MAX_SURFACE_PATCHES);
  // Helpers are already re-skinned wholesale; a second, patch-shaped tint on
  // top of that only draws rims around the translucent decals.
  const patchStrength = role === "scan" ? treatment.strength : 0;
  uniforms.oqBiomeStrength.value = count > 0 ? Math.min(1, Math.max(0, patchStrength)) : 0;
  uniforms.oqBiomeColor.value.set(treatment.color);
  uniforms.oqBiomeUpMin.value = treatment.upwardNormalMin;
  uniforms.oqBiomePatchCount.value = count;
  for (let i = 0; i < MAX_SURFACE_PATCHES; i += 1) {
    const patch = treatment.patches[i];
    const slot = uniforms.oqBiomePatches.value[i]!;
    if (i < count && patch) slot.set(patch.position[0], patch.position[1], patch.position[2], patch.radius);
    else slot.set(0, 0, 0, 1);
  }
}

function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const list: THREE.Material[] = [];
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) list.push(material);
  });
  return list;
}

export function installBiomeSurfaceBlendOnObject(object: THREE.Object3D): void {
  for (const material of materialsOf(object)) installBiomeSurfaceBlend(material);
}

export function applyBiomeSurface(object: THREE.Object3D, treatment: BiomeSurfaceTreatment | null): void {
  for (const material of materialsOf(object)) applyBiomeSurfaceToMaterial(material, treatment);
}

/** Current uniform values, for tests and diagnostics. */
export function readBiomeSurface(material: THREE.Material): { strength: number; patchCount: number; global: number; floorTint: number; floorLevel: number } | null {
  const uniforms = material.userData[USER_DATA_KEY] as BiomeSurfaceUniforms | undefined;
  return uniforms
    ? {
        strength: uniforms.oqBiomeStrength.value,
        patchCount: uniforms.oqBiomePatchCount.value,
        global: uniforms.oqBiomeGlobal.value,
        floorTint: uniforms.oqBiomeFloorTint.value,
        floorLevel: uniforms.oqBiomeFloorLevel.value,
      }
    : null;
}

const BIOME_SURFACE_DECLARATIONS = /* glsl */ `
  #define OQ_BIOME_MAX_PATCHES ${MAX_SURFACE_PATCHES}
  varying vec3 oqBiomeWorldPos;
  uniform float oqBiomeGlobal;
  uniform vec3 oqBiomeGlobalColor;
  uniform float oqBiomeGrain; // reserved; flat tint (see injection)
  uniform float oqBiomeStrength;
  uniform vec3 oqBiomeColor;
  uniform float oqBiomeUpMin;
  uniform int oqBiomePatchCount;
  uniform vec4 oqBiomePatches[OQ_BIOME_MAX_PATCHES];
  uniform float oqBiomeFloorTint;
  uniform float oqBiomeFloorLevel;
  uniform float oqBiomeFloorBand;
  float oqBiomeHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float oqBiomeNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = oqBiomeHash(i);
    float b = oqBiomeHash(i + vec2(1.0, 0.0));
    float c = oqBiomeHash(i + vec2(0.0, 1.0));
    float d = oqBiomeHash(i + vec2(1.0, 1.0));
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
`;

/*
 * The geometric normal comes from screen-space derivatives of the world
 * position, so it is the camera-facing side of the triangle regardless of the
 * reconstruction's (non-uniform) winding or whether the material has vertex
 * normals at all. Derivatives are taken before any non-uniform branch.
 * Patch distance squashes Y 3x so a desk-top patch does not tint the floor
 * underneath it.
 */
const BIOME_SURFACE_INJECTION = /* glsl */ `
  {
    vec3 oqBiomeDx = dFdx(oqBiomeWorldPos);
    vec3 oqBiomeDy = dFdy(oqBiomeWorldPos);
    if (oqBiomeGlobal > 0.0) {
      // Deliberately flat: any grain here crosses the Cartoon style's
      // per-channel posterization thresholds and turns into hard blotches
      // (seen in the real app). Texture comes from the decals instead.
      diffuseColor.rgb = mix(diffuseColor.rgb, oqBiomeGlobalColor, oqBiomeGlobal);
    }
    if (oqBiomeFloorTint > 0.0) {
      // Scan ground at floor level: the same flat tint as the helper floor,
      // fading out over the top of the band so a low step keeps its photo.
      vec3 oqFloorN = normalize(cross(oqBiomeDx, oqBiomeDy) + vec3(0.0, 1e-7, 0.0));
      float oqFloorUp = smoothstep(oqBiomeUpMin - 0.08, oqBiomeUpMin + 0.06, oqFloorN.y);
      float oqNearFloor = 1.0 - smoothstep(oqBiomeFloorBand * 0.65, oqBiomeFloorBand, oqBiomeWorldPos.y - oqBiomeFloorLevel);
      diffuseColor.rgb = mix(diffuseColor.rgb, oqBiomeGlobalColor, oqBiomeFloorTint * oqFloorUp * oqNearFloor);
    }
    if (oqBiomeStrength > 0.0) {
      vec3 oqBiomeN = normalize(cross(oqBiomeDx, oqBiomeDy) + vec3(0.0, 1e-7, 0.0));
      float oqUp = smoothstep(oqBiomeUpMin - 0.08, oqBiomeUpMin + 0.06, oqBiomeN.y);
      float oqInPatch = 0.0;
      float oqPatchScale = 1.0;
      for (int i = 0; i < OQ_BIOME_MAX_PATCHES; i++) {
        if (i >= oqBiomePatchCount) break;
        vec4 oqP = oqBiomePatches[i];
        vec3 oqD = oqBiomeWorldPos - oqP.xyz;
        float oqR = length(vec3(oqD.x, oqD.y * 3.0, oqD.z)) / max(oqP.w, 1e-4);
        float oqW = 1.0 - smoothstep(0.5, 1.0, oqR);
        if (oqW > oqInPatch) { oqInPatch = oqW; oqPatchScale = oqP.w; }
      }
      float oqGrain = oqBiomeNoise(oqBiomeWorldPos.xz * (5.0 / max(oqPatchScale, 1e-3)));
      float oqSpeck = oqBiomeHash(floor(oqBiomeWorldPos.xz * (60.0 / max(oqPatchScale, 1e-3))));
      float oqEdge = smoothstep(0.15, 0.55, oqInPatch * (0.6 + 0.8 * oqGrain));
      float oqBlend = oqBiomeStrength * oqUp * oqEdge * (0.82 + 0.18 * oqSpeck);
      float oqSrcLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 oqTint = oqBiomeColor * (0.62 + 0.76 * oqSrcLuma);
      diffuseColor.rgb = mix(diffuseColor.rgb, oqTint, clamp(oqBlend, 0.0, 1.0));
    }
  }
`;
