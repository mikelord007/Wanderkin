import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_DEFINITIONS } from "@shared/index.js";
import { cloneStyledObject } from "../../scene/styleMaterial.js";
import { getBiomeDefinition } from "../presets.js";
import type { BiomeLayout } from "../types.js";
import {
  applyBiomeSurface,
  applyBiomeSurfaceToMaterial,
  biomeSurfaceTreatment,
  hasBiomeSurfaceBlend,
  installBiomeSurfaceBlend,
  installBiomeSurfaceBlendOnObject,
  readBiomeSurface,
} from "./surfaceBlend.js";
import { MAX_SURFACE_PATCHES } from "./selection.js";

function layout(biomeId: BiomeLayout["biomeId"], patches = 10): BiomeLayout {
  return {
    biomeId,
    seed: "s",
    props: [],
    patches: Array.from({ length: patches }, (_, i) => ({ position: [i * 0.1, 0.5, 0] as const, normal: [0, 1, 0] as const, radius: 0.2 })),
    exclusions: [],
    bounds: { min: [0, 0, 0], max: [2, 1, 2] },
    water: null,
    diagnostics: [],
  };
}

function fakeShader() {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "void main() {\n#include <begin_vertex>\n}",
    fragmentShader: "void main() {\n#include <map_fragment>\n#include <dithering_fragment>\n}",
  };
}

function sourceScene(): THREE.Object3D {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "#808080" })));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshStandardMaterial()]));
  return root;
}

function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) out.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  });
  return out;
}

describe("biome surface blend on cloned scan materials", () => {
  it("has no treatment for Original, a missing or a mismatched layout", () => {
    expect(biomeSurfaceTreatment(getBiomeDefinition("original"), layout("original"), "standard")).toBeNull();
    expect(biomeSurfaceTreatment(getBiomeDefinition("desert"), null, "standard")).toBeNull();
    expect(biomeSurfaceTreatment(getBiomeDefinition("desert"), layout("tropical"), "standard")).toBeNull();
    // No approved patches: helpers are still themed, the scan is not tinted.
    const bare = biomeSurfaceTreatment(getBiomeDefinition("desert"), layout("desert", 0), "standard")!;
    expect(bare.strength).toBe(0);
    expect(bare.helper.floorStrength).toBeGreaterThan(0);
  });

  it("hands box structures the look's wall style for their shells; Original keeps plain boxes", () => {
    for (const id of ["tropical", "desert", "alpine", "autumn", "ember"] as const) {
      const treatment = biomeSurfaceTreatment(getBiomeDefinition(id), layout(id), "standard")!;
      expect(treatment.structureShell).not.toBeNull();
      expect(treatment.structureShell!.strata[0]).toBeGreaterThanOrEqual(1);
    }
    // Original has no treatment at all, so HelperMesh renders its box and edges.
    expect(biomeSurfaceTreatment(getBiomeDefinition("original"), layout("original"), "standard")).toBeNull();
  });

  it("tints helper floors/structures wholesale but never the scan wholesale", () => {
    const treatment = biomeSurfaceTreatment(getBiomeDefinition("desert"), layout("desert"), "standard")!;
    const scan = new THREE.MeshStandardMaterial();
    const floor = new THREE.MeshStandardMaterial();
    const step = new THREE.MeshStandardMaterial();
    for (const m of [scan, floor, step]) installBiomeSurfaceBlend(m);
    applyBiomeSurfaceToMaterial(scan, treatment);
    applyBiomeSurfaceToMaterial(floor, treatment, "floor");
    applyBiomeSurfaceToMaterial(step, treatment, "structure");
    expect(readBiomeSurface(scan)!.global).toBe(0);
    expect(readBiomeSurface(scan)!.strength).toBeGreaterThan(0);
    // Helpers get the wholesale tint only, never the patch tint on top.
    expect(readBiomeSurface(floor)!.strength).toBe(0);
    expect(readBiomeSurface(step)!.strength).toBe(0);
    expect(readBiomeSurface(floor)!.global).toBeGreaterThan(0.5);
    expect(readBiomeSurface(step)!.global).toBeGreaterThan(0.3);
    applyBiomeSurfaceToMaterial(floor, null, "floor");
    expect(readBiomeSurface(floor)).toEqual({ strength: 0, patchCount: 0, global: 0 });
  });

  it("is subtle, localized and bounded", () => {
    const treatment = biomeSurfaceTreatment(getBiomeDefinition("desert"), layout("desert", 60), "standard")!;
    expect(treatment.strength).toBeGreaterThan(0);
    expect(treatment.strength).toBeLessThanOrEqual(0.6);
    expect(treatment.patches.length).toBeGreaterThan(0);
    expect(treatment.patches.length).toBeLessThanOrEqual(MAX_SURFACE_PATCHES);
    // Coverage never uses every approved patch.
    expect(treatment.patches.length).toBeLessThan(60);
  });

  it("never touches the cached source materials", () => {
    const source = sourceScene();
    const before = materialsOf(source).map((m) => ({ m, compile: m.onBeforeCompile, key: m.customProgramCacheKey, data: JSON.stringify(m.userData) }));
    const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 1, null);
    installBiomeSurfaceBlendOnObject(clone);
    applyBiomeSurface(clone, biomeSurfaceTreatment(getBiomeDefinition("tropical"), layout("tropical"), "standard"));
    for (const { m, compile, key, data } of before) {
      expect(hasBiomeSurfaceBlend(m)).toBe(false);
      expect(m.onBeforeCompile).toBe(compile);
      expect(m.customProgramCacheKey).toBe(key);
      expect(JSON.stringify(m.userData)).toBe(data);
    }
    for (const m of materialsOf(clone)) expect(hasBiomeSurfaceBlend(m)).toBe(true);
  });

  it("switching biome or back to Original only changes uniforms (same program key)", () => {
    const clone = cloneStyledObject(sourceScene(), STYLE_DEFINITIONS.cartoon, 1, null);
    installBiomeSurfaceBlendOnObject(clone);
    installBiomeSurfaceBlendOnObject(clone); // idempotent
    const keys = () => materialsOf(clone).map((m) => m.customProgramCacheKey());
    const original = keys();
    for (const k of original) expect(k.match(/oq-biome-surface-v2/g)).toHaveLength(1);

    applyBiomeSurface(clone, biomeSurfaceTreatment(getBiomeDefinition("tropical"), layout("tropical"), "standard"));
    expect(keys()).toEqual(original);
    for (const m of materialsOf(clone)) expect(readBiomeSurface(m)!.strength).toBeGreaterThan(0);

    applyBiomeSurface(clone, null);
    expect(keys()).toEqual(original);
    for (const m of materialsOf(clone)) expect(readBiomeSurface(m)).toEqual({ strength: 0, patchCount: 0, global: 0 });
  });

  it("chains after the style shader and gates every change behind a non-zero uniform", () => {
    const material = new THREE.MeshStandardMaterial();
    let styleRan = false;
    material.onBeforeCompile = () => {
      styleRan = true;
    };
    installBiomeSurfaceBlend(material);
    const shader = fakeShader();
    material.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    expect(styleRan).toBe(true);
    expect(shader.vertexShader).toContain("oqBiomeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    const injected = shader.fragmentShader.slice(shader.fragmentShader.indexOf("#include <map_fragment>"));
    // Every write to diffuseColor sits inside a gate that is false for Original.
    const writes = [...injected.matchAll(/diffuseColor\.rgb =/g)].map((m) => m.index!);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toBeGreaterThan(injected.indexOf("if (oqBiomeGlobal > 0.0)"));
    expect(writes[1]).toBeGreaterThan(injected.indexOf("if (oqBiomeStrength > 0.0)"));
    expect(injected.indexOf("if (oqBiomeGlobal > 0.0)")).toBeGreaterThan(-1);
    expect(shader.uniforms).toHaveProperty("oqBiomeStrength");
    expect(shader.uniforms).toHaveProperty("oqBiomePatches");
  });
});
