import * as THREE from "three";
import { STYLE_DEFINITIONS } from "../../shared/style.js";
import { describe, expect, it } from "vitest";
import { getKnownMaterialProfile, MATERIAL_REGION_KIND_CODE } from "./materialRegions.js";
import {
  cartoonAssetBandColor,
  cloneStyledObject,
  createStyledHelperMaterial,
  disposeStyledObject,
  isBakedEmissiveOnlyMaterial,
  setHelperLumaBands,
  setObjectColorRestoration,
} from "./styleMaterial.js";

/** Matches the baked material shape GLTFLoader produces for the Rodin sample
 * and storage-asset `.glb`s: all colour in `emissiveTexture`, black
 * `baseColorFactor`, zero metalness. (The Tripo sample is real PBR instead.) */
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

  describe("relit-material minimum-brightness floor", () => {
    /** Found by pixel-measured A/B comparison: a region of the Rodin mesh
     * that read as a clearly-visible dark olive/brown, RGB(51,51,0), in the
     * original unlit render was crushed to a barely-visible near-black,
     * RGB(6,4,2), once real lighting and Cartoon quantization ran on top of
     * it. This suite checks the shader plumbing that fixes it is present
     * for relit materials and absent everywhere else — the actual on-screen
     * brightness floor can only be verified by rendering (see the
     * before/after evidence in
     * nimbalyst-local/playtest-checkpoints/material-lighting-refinement.md). */
    function shaderStub() {
      return {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: "#include <begin_vertex>",
        fragmentShader:
          "#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>",
      };
    }

    it("adds the baked-albedo capture and brightness floor for a relit material", () => {
      const source = new THREE.Group();
      const material = bakedEmissiveMaterial();
      source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

      const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 1);
      const relit = (clone.children[0] as THREE.Mesh).material as THREE.Material;

      const shader = shaderStub();
      relit.onBeforeCompile(shader as never, {} as never);

      expect(shader.uniforms.oqRelitFloor).toBeDefined();
      expect(shader.uniforms.oqRelitFloor?.value).toBeGreaterThan(0);
      expect(shader.fragmentShader).toContain("oqBakedAlbedo = diffuseColor.rgb");
      expect(shader.fragmentShader).toContain("oqRelitFloor");

      disposeStyledObject(clone);
      material.dispose();
    });

    it("never adds the brightness floor to a material that was not relit", () => {
      const albedo = new THREE.Texture();
      const source = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x808080, map: albedo, metalness: 0.9, roughness: 0.3 });
      source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

      const clone = cloneStyledObject(source, STYLE_DEFINITIONS.cartoon, 1);
      const untouched = (clone.children[0] as THREE.Mesh).material as THREE.Material;

      const shader = shaderStub();
      untouched.onBeforeCompile(shader as never, {} as never);

      expect(shader.uniforms.oqRelitFloor).toBeUndefined();
      expect(shader.fragmentShader).not.toContain("oqBakedAlbedo");

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

    it("passes the known profile's measured boxes to the shader as uniforms", () => {
      const known = meshWithBakedMaterial();
      const clone = cloneStyledObject(known.source, STYLE_DEFINITIONS.watercolor, 1, RODIN_SHA256);
      const material = (clone.children[0] as THREE.Mesh).material as THREE.Material;
      const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>" };
      material.onBeforeCompile(shader as never, {} as never);

      const profile = getKnownMaterialProfile(RODIN_SHA256)!;
      const mins = shader.uniforms.oqRegionMin?.value as THREE.Vector3[];
      const kinds = shader.uniforms.oqRegionKind?.value as number[];
      expect(mins.map((v) => v.toArray())).toEqual(profile.boxes.map((box) => [...box.min]));
      expect(kinds).toEqual(profile.boxes.map((box) => MATERIAL_REGION_KIND_CODE[box.kind]));
      expect(shader.fragmentShader).toContain(`#define OQ_REGION_BOXES ${profile.boxes.length}`);

      disposeStyledObject(clone);
      known.material.dispose();
    });

    it("fades surface detail by cycles per pixel, not radians", () => {
      const known = meshWithBakedMaterial();
      const clone = cloneStyledObject(known.source, STYLE_DEFINITIONS.cartoon, 1, RODIN_SHA256);
      const material = (clone.children[0] as THREE.Mesh).material as THREE.Material;
      const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>" };
      material.onBeforeCompile(shader as never, {} as never);

      expect(shader.fragmentShader).toContain("radiansPerMetre * 0.15915494");

      disposeStyledObject(clone);
      known.material.dispose();
    });
  });

  describe("cartoon banding on imported assets", () => {
    const stub = () => ({
      uniforms: {},
      vertexShader: "#include <begin_vertex>",
      fragmentShader: "#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <dithering_fragment>",
    });

    it("bands imported asset materials by luminance, in cartoon only", () => {
      for (const [name, material] of [
        ["baked", bakedEmissiveMaterial()],
        ["pbr", new THREE.MeshStandardMaterial({ map: new THREE.Texture(), metalness: 0.5 })],
      ] as const) {
        const source = new THREE.Group();
        source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
        for (const style of [STYLE_DEFINITIONS.cartoon, STYLE_DEFINITIONS["hand-painted"], STYLE_DEFINITIONS.watercolor]) {
          const clone = cloneStyledObject(source, style, 1);
          const shader = stub();
          ((clone.children[0] as THREE.Mesh).material as THREE.Material).onBeforeCompile(shader as never, {} as never);
          expect(shader.fragmentShader.includes("oqBandLuma"), `${name}/${style.id}`).toBe(style.id === "cartoon");
          expect(shader.fragmentShader).not.toContain("oqColor = floor(oqColor * oqColorSteps");
          disposeStyledObject(clone);
        }
        material.dispose();
      }
    });

    it("keeps authored helper, floor and marker colours on per-channel banding", () => {
      for (const floor of [true, false]) {
        const material = createStyledHelperMaterial("#6BCB77", STYLE_DEFINITIONS.cartoon, 1, { floor });
        const shader = stub();
        material.onBeforeCompile(shader as never, {} as never);
        expect(shader.fragmentShader).toContain("oqColor = floor(oqColor * oqColorSteps + 0.5) / oqColorSteps;");
        expect(shader.fragmentShader).not.toContain("oqBandLuma");
        expect(material.customProgramCacheKey()).toContain(":helper");
        material.dispose();
      }
    });

    it("keeps a gloss gradient on one texture colour to one hue, where per-channel rounding broke it into false hues", () => {
      // A warm brown seat with a specular sheen ramping across it.
      const base = [0.36, 0.26, 0.18] as const;
      const hue = (c: readonly number[]) => {
        const [r, g, b] = c as [number, number, number];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 1e-6) return null;
        const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
        return (h * 60 + 360) % 360;
      };
      const perChannel = (c: readonly number[]) => c.map((v) => Math.floor(v * 5 + 0.5) / 5);
      const sourceHue = hue(base)!;
      let worstLumaDrift = 0;
      let worstChannelDrift = 0;
      for (let sheen = 0; sheen <= 0.5; sheen += 0.01) {
        const lit = base.map((v) => Math.min(1, v + sheen)) as [number, number, number];
        const banded = hue(cartoonAssetBandColor(lit));
        worstLumaDrift = Math.max(worstLumaDrift, banded === null ? 180 : Math.abs(banded - sourceHue));
        const channel = hue(perChannel(lit));
        worstChannelDrift = Math.max(worstChannelDrift, channel === null ? 180 : Math.abs(channel - sourceHue));
      }
      // Per-channel rounding flips the brown to red, yellow and grey bands.
      expect(worstChannelDrift).toBeGreaterThan(25);
      // Luminance banding only brightens it (sheen desaturates the lit
      // colour itself, so allow a little drift), never inventing a hue.
      expect(worstLumaDrift).toBeLessThan(12);
    });

    it("themed looks switch a helper to luminance banding in its own program; Original keeps the old one", () => {
      for (const floor of [true, false]) {
        const material = createStyledHelperMaterial("#94704e", STYLE_DEFINITIONS.cartoon, 1, { floor });
        const originalKey = material.customProgramCacheKey();
        // The helper stub needs color_fragment: themed helpers band their base colour there.
        const compile = () => {
          const shader = {
            ...stub(),
            fragmentShader: [
              "#include <map_fragment>",
              "#include <color_fragment>",
              "#include <roughnessmap_fragment>",
              "#include <normal_fragment_maps>",
              "#include <dithering_fragment>",
            ].join("\n"),
          };
          material.onBeforeCompile(shader as never, {} as never);
          return shader.fragmentShader;
        };
        const originalSource = compile();
        setHelperLumaBands(material, true);
        expect(material.customProgramCacheKey()).toBe(`${originalKey}-luma`);
        const themed = compile();
        expect(themed).toContain("oqBandLuma");
        expect(themed).not.toContain("oqColor = floor(oqColor * oqColorSteps + 0.5) / oqColorSteps;");
        // Banded BEFORE lighting (base colour), never after: smooth light
        // falloff on a flat floor must not turn into concentric rings.
        const lit = themed.slice(themed.indexOf("#include <dithering_fragment>"));
        const base = themed.slice(themed.indexOf("#include <color_fragment>"), themed.indexOf("#include <roughnessmap_fragment>"));
        expect(base).toContain("oqBandLuma");
        expect(lit).not.toContain("oqBandLuma");
        // Back to Original: exactly the previous program, source and key.
        setHelperLumaBands(material, false);
        expect(material.customProgramCacheKey()).toBe(originalKey);
        expect(compile()).toBe(originalSource);
        material.dispose();
      }
      // Hand-painted and Watercolor never posterise: nothing changes.
      for (const style of [STYLE_DEFINITIONS["hand-painted"], STYLE_DEFINITIONS.watercolor]) {
        const material = createStyledHelperMaterial("#94704e", style, 1, { floor: true });
        const key = material.customProgramCacheKey();
        const shader = stub();
        material.onBeforeCompile(shader as never, {} as never);
        setHelperLumaBands(material, true);
        const after = stub();
        material.onBeforeCompile(after as never, {} as never);
        expect(material.customProgramCacheKey()).toBe(key);
        expect(after.fragmentShader).toBe(shader.fragmentShader);
        material.dispose();
      }
    });

    it("keeps a shaded warm floor on its hue: no olive mustard, no pink sand", () => {
      const hue = (c: readonly number[]) => {
        const [r, g, b] = c as [number, number, number];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
        return (h * 60 + 360) % 360;
      };
      const perChannel = (c: readonly number[]) => c.map((v) => Math.floor(v * 5 + 0.5) / 5);
      // Autumn mustard floor at half light (review finding: #666600 olive).
      const mustard = [0.4, 0.3, 0.08] as const;
      expect(hue(perChannel(mustard))).toBeCloseTo(60, 0);
      expect(Math.abs(hue(cartoonAssetBandColor(mustard)) - hue(mustard))).toBeLessThan(1);
      // Tropical sand in blue-tinted shade (wave 1 L1: pink band).
      const sand = [0.8, 0.6, 0.5] as const;
      expect(perChannel(sand)[2]).toBe(perChannel(sand)[1]); // blue jumps up to green's step: pink cast
      expect(Math.abs(hue(cartoonAssetBandColor(sand)) - hue(sand))).toBeLessThan(1);
    });

    it("never crushes a dark, non-black texture colour to black", () => {
      for (const dark of [[0.08, 0.05, 0.03], [0.04, 0.03, 0.02], [0.02, 0.012, 0.008]] as const) {
        const banded = cartoonAssetBandColor(dark);
        const luma = 0.2126 * banded[0] + 0.7152 * banded[1] + 0.0722 * banded[2];
        expect(luma).toBeGreaterThan(0.09);
        expect(Math.floor(dark[0] * 5 + 0.5) / 5).toBe(0);
      }
    });
  });
});
