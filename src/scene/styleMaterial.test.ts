import * as THREE from "three";
import { STYLE_DEFINITIONS } from "../../shared/style.js";
import { describe, expect, it } from "vitest";
import {
  cloneStyledObject,
  createStyledHelperMaterial,
  disposeStyledObject,
  setObjectColorRestoration,
} from "./styleMaterial.js";

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
});
