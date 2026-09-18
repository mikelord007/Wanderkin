import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Transform } from "../../shared/geometry.js";
import { applyTransformToObject3D, extractTrianglesFromObject3D } from "./loader.js";
import { createHelperGeometry } from "./runtime.js";
import { helperLocalTriangles } from "./helpers.js";
import { quatFromYaw, transformTriangleSoup } from "./transform.js";

function expectPositionsClose(actual: Float32Array, expected: Float32Array): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 5);
  }
}

describe("scene runtime geometry", () => {
  it("applies the identical entity transform to rendered and collision triangles", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(0.5, 0.25, -0.75);
    mesh.rotation.y = Math.PI / 6;
    mesh.scale.set(1.5, 0.75, 2);
    const assetScene = new THREE.Group();
    assetScene.add(mesh);

    const assetLocalCollision = extractTrianglesFromObject3D(assetScene);
    const entityTransform: Transform = {
      position: [3, 2, -4],
      rotation: quatFromYaw(Math.PI / 2),
      scale: [2, 2, 2],
    };
    const expectedCollision = transformTriangleSoup(
      assetLocalCollision,
      entityTransform,
    );

    applyTransformToObject3D(assetScene, entityTransform);
    const renderedWorldTriangles = extractTrianglesFromObject3D(assetScene);

    expectPositionsClose(
      renderedWorldTriangles.positions,
      expectedCollision.positions,
    );
  });

  it("builds ramp rendering from the exact wedge triangles used by collision", () => {
    const dimensions: [number, number, number] = [1.2, 0.5, 2.4];
    const geometry = createHelperGeometry("ramp", dimensions);
    const mesh = new THREE.Mesh(geometry);
    const rendered = extractTrianglesFromObject3D(mesh);
    const collision = helperLocalTriangles("ramp", dimensions);

    expect(rendered.triangleCount).toBe(8);
    expectPositionsClose(rendered.positions, collision.positions);
  });
});
