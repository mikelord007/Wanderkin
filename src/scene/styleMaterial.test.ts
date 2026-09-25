import * as THREE from "three";
import { STYLE_DEFINITIONS } from "../../shared/style.js";
import { describe, expect, it } from "vitest";
import {
  cloneStyledObject,
  createStyledHelperMaterial,
  disposeStyledObject,
  isBakedEmissiveOnlyMaterial,
  setObjectColorRestoration,
} from "./styleMaterial.js";

/** Matches the exact material shape GLTFLoader produces for every shipped
 * Rodin/Tripo/storage-asset `.glb` (see `materialRegions.ts`): all colour in
 * `emissiveTexture`, black `baseColorFactor`, zero metalness. */
function bakedEmissiveMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: new THREE.Texture(),
    metalness: 0,
  });
}

const RODIN_SHA256 = "c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8";

describe("scene style materials", () => {
  it("clones rather than mutating cached glTF materials", () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: "#ff0000" });
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial));

    const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 0);
    const cloneMaterial = (clone.children[0] as THREE.Mesh).material as THREE.Material;
    expect(cloneMaterial).not.toBe(sourceMaterial);
    expect(sourceMaterial.userData.objectQuestStyleUniforms).toBeUndefined();
    expect(cloneMaterial.customProgramCacheKey()).toContain("cartoon");
    disposeStyledObject(clone);
    sourceMaterial.dispose();
  });

  it("updates restoration uniforms without replacing materials", () => {
    const material = createStyledHelperMaterial("#abcdef", STYLE_DEFINITIONS.watercolor, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const state = material.userData.objectQuestStyleUniforms as {
      colorRestoration: { value: number };
    };
    expect(state.colorRestoration.value).toBe(0);
    setObjectColorRestoration(mesh, 1.4);
    expect(state.colorRestoration.value).toBe(1);
    material.dispose();
    mesh.geometry.dispose();
  });

  describe("isBakedEmissiveOnlyMaterial", () => {
    it("matches the exact baked/emissive-only shape every shipped .glb uses", () => {
      expect(isBakedEmissiveOnlyMaterial(bakedEmissiveMaterial())).toBe(true);
    });

    it("leaves a material with a real base-colour map untouched", () => {
      const material = bakedEmissiveMaterial();
      material.map = new THREE.Texture();
      expect(isBakedEmissiveOnlyMaterial(material)).toBe(false);
    });

    it("leaves a non-black base colour (a deliberately emissive object) untouched", () => {
      const material = bakedEmissiveMaterial();
      material.color.setRGB(0.4, 0.1, 0.1);
      expect(isBakedEmissiveOnlyMaterial(material)).toBe(false);
    });

    it("leaves an actually metallic material untouched", () => {
      const material = bakedEmissiveMaterial();
      material.metalness = 0.8;
      expect(isBakedEmissiveOnlyMaterial(material)).toBe(false);
    });

    it("leaves a material with no emissive texture untouched", () => {
      const material = bakedEmissiveMaterial();
      material.emissiveMap = null;
      expect(isBakedEmissiveOnlyMaterial(material)).toBe(false);
    });

    it("leaves a material carrying a real normal/metalness/roughness map untouched", () => {
      const withNormalMap = bakedEmissiveMaterial();
      withNormalMap.normalMap = new THREE.Texture();
      expect(isBakedEmissiveOnlyMaterial(withNormalMap)).toBe(false);

      const withMetalnessMap = bakedEmissiveMaterial();
      withMetalnessMap.metalnessMap = new THREE.Texture();
      expect(isBakedEmissiveOnlyMaterial(withMetalnessMap)).toBe(false);

      const withRoughnessMap = bakedEmissiveMaterial();
      withRoughnessMap.roughnessMap = new THREE.Texture();
      expect(isBakedEmissiveOnlyMaterial(withRoughnessMap)).toBe(false);
    });
  });

  describe("genuine PBR material preservation", () => {
    /** Stands in for a real metallic/roughness-mapped import (e.g. a metal
     * object with an actual PBR texture set) — the shape this pipeline's
     * baked photogrammetry assets never have, and the shape the relight and
     * region logic must never touch. */
    function genuinePbrMetalMaterial(): {
      material: THREE.MeshStandardMaterial;
      albedo: THREE.Texture;
      normalMap: THREE.Texture;
      metalnessMap: THREE.Texture;
      roughnessMap: THREE.Texture;
    } {
      const albedo = new THREE.Texture();
      const normalMap = new THREE.Texture();
      const metalnessMap = new THREE.Texture();
      const roughnessMap = new THREE.Texture();
      const material = new THREE.MeshStandardMaterial({
        color: 0xb0b0b0,
        map: albedo,
        normalMap,
        metalnessMap,
        roughnessMap,
        metalness: 0.92,
        roughness: 0.28,
      });
      return { material, albedo, normalMap, metalnessMap, roughnessMap };
    }

    it("is never detected as a baked-emissive bake", () => {
      const { material } = genuinePbrMetalMaterial();
      expect(isBakedEmissiveOnlyMaterial(material)).toBe(false);
    });

    it("passes through cloneStyledObject with every PBR map and value intact", () => {
      const { material, albedo, normalMap, metalnessMap, roughnessMap } = genuinePbrMetalMaterial();
      const source = new THREE.Group();
      source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

      // Not the known Rodin hash, and not undefined either — a real asset
      // with its own (different) content hash, same as any other generated
      // or imported mesh that isn't the one known sample.
      const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 1, "some-other-assets-real-hash");
      const preserved = (clone.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

      expect(preserved.map).toBe(albedo);
      expect(preserved.normalMap).toBe(normalMap);
      expect(preserved.metalnessMap).toBe(metalnessMap);
      expect(preserved.roughnessMap).toBe(roughnessMap);
      expect(preserved.metalness).toBe(0.92);
      expect(preserved.roughness).toBe(0.28);
      // No region-specific shader code should be present for a material with
      // no known region profile.
      const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>" };
      preserved.onBeforeCompile(shader as never, {} as never);
      expect(shader.fragmentShader).not.toContain("oqPerturbNormal");

      disposeStyledObject(clone);
      material.dispose();
    });
  });

  describe("baked-material relight", () => {
    it("moves the baked texture into the base-colour map and clears the emissive override", () => {
      const bakedTexture = new THREE.Texture();
      const source = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: bakedTexture,
        metalness: 0,
      });
      source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

      const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 1);
      const relit = (clone.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

      expect(relit.map).toBe(bakedTexture);
      expect(relit.emissiveMap).toBeNull();
      expect(relit.color.r).toBe(1);
      expect(relit.color.g).toBe(1);
      expect(relit.color.b).toBe(1);
      expect(relit.emissive.r).toBe(0);
      expect(relit.emissive.g).toBe(0);
      expect(relit.emissive.b).toBe(0);

      disposeStyledObject(clone);
      material.dispose();
    });

    it("never relights a material that already has a real base-colour map", () => {
      const albedo = new THREE.Texture();
      const emissive = new THREE.Texture();
      const source = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: 0x000000,
        map: albedo,
        emissive: 0xffffff,
        emissiveMap: emissive,
        metalness: 0,
      });
      source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

      const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 1);
      const untouched = (clone.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

      expect(untouched.map).toBe(albedo);
      expect(untouched.emissiveMap).toBe(emissive);

      disposeStyledObject(clone);
      material.dispose();
    });
  });

  describe("known-sample material regions", () => {
    function meshWithBakedMaterial(): { source: THREE.Group; material: THREE.MeshStandardMaterial } {
      const material = bakedEmissiveMaterial();
      const source = new THREE.Group();
      source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
      return { source, material };
    }

    it("tags the compiled shader program differently for a known asset hash", () => {
      const plain = meshWithBakedMaterial();
      const known = meshWithBakedMaterial();

      const plainClone = cloneStyledObject(plain.source, STYLE_DEFINITIONS.cartoon, 1, "not-a-known-hash");
      const knownClone = cloneStyledObject(known.source, STYLE_DEFINITIONS.cartoon, 1, RODIN_SHA256);

      const plainMaterial = (plainClone.children[0] as THREE.Mesh).material as THREE.Material;
      const knownMaterial = (knownClone.children[0] as THREE.Mesh).material as THREE.Material;

      expect(plainMaterial.customProgramCacheKey()).toContain("none");
      expect(knownMaterial.customProgramCacheKey()).toContain("region-");
      expect(knownMaterial.customProgramCacheKey()).not.toBe(plainMaterial.customProgramCacheKey());

      disposeStyledObject(plainClone);
      disposeStyledObject(knownClone);
      plain.material.dispose();
      known.material.dispose();
    });

    it("only injects the region shader code for a recognised asset hash", () => {
      const plain = meshWithBakedMaterial();
      const known = meshWithBakedMaterial();
      const plainClone = cloneStyledObject(plain.source, STYLE_DEFINITIONS.cartoon, 1, undefined);
      const knownClone = cloneStyledObject(known.source, STYLE_DEFINITIONS.cartoon, 1, RODIN_SHA256);

      const plainMaterial = (plainClone.children[0] as THREE.Mesh).material as THREE.Material;
      const knownMaterial = (knownClone.children[0] as THREE.Mesh).material as THREE.Material;

      const plainShader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>" };
      const knownShader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>" };

      plainMaterial.onBeforeCompile(plainShader as never, {} as never);
      knownMaterial.onBeforeCompile(knownShader as never, {} as never);

      expect(plainShader.fragmentShader).not.toContain("oqPerturbNormal");
      expect(plainShader.vertexShader).not.toContain("oqWorldPos");
      expect(knownShader.fragmentShader).toContain("oqPerturbNormal");
      expect(knownShader.fragmentShader).toContain("oqWoodHeight");
      expect(knownShader.fragmentShader).toContain("oqFabricHeight");
      expect(knownShader.vertexShader).toContain("oqWorldPos");

      disposeStyledObject(plainClone);
      disposeStyledObject(knownClone);
      plain.material.dispose();
      known.material.dispose();
    });
  });
});
