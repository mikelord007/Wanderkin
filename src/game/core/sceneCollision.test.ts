/**
 * Collision must match the geometry the player can see. These cover the
 * two ways that could break: a mesh entity's transform not being applied
 * to its collider, and a helper's declared collider drifting away from its
 * rendered dimensions.
 */

import { describe, expect, it } from "vitest";
import type { GeneratedMeshEntity, SceneManifest } from "@shared/index.js";
import { buildSceneCollision, helperLocalSoup } from "./sceneCollision.js";
import { boxSoup, rampSoup, soupBounds, transformSoup, triangleCount } from "./soup.js";
import { boxEntity, floorEntity, makeManifest, rampEntity, standingSpawn } from "./fixtures.js";

/** A unit cube, asset-local, as a stand-in for decoded GLB triangles. */
const UNIT_CUBE = boxSoup([1, 1, 1]);

function meshEntity(overrides: Partial<GeneratedMeshEntity> = {}): GeneratedMeshEntity {
  return {
    id: "mesh",
    kind: "generated-mesh",
    assetId: "asset-1",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    collider: { kind: "triangle-mesh" },
    ...overrides,
  };
}

function manifestWith(entity: GeneratedMeshEntity): SceneManifest {
  const manifest = makeManifest({ entities: [], spawn: standingSpawn(0) });
  manifest.entities = [entity];
  return manifest;
}

describe("generated mesh colliders", () => {
  it("bakes position, rotation and scale into the collision triangles", () => {
    const entity = meshEntity({
      transform: {
        position: [5, 2, -3],
        // 90 degrees about Y.
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
        scale: [2, 4, 6],
      },
    });
    const collision = buildSceneCollision(manifestWith(entity), new Map([["asset-1", UNIT_CUBE]]));

    expect(collision.entities).toHaveLength(1);
    const shape = collision.entities[0]!.shape;
    expect(shape.kind).toBe("trimesh");
    if (shape.kind !== "trimesh") throw new Error("unreachable");

    const bounds = soupBounds(shape.soup)!;
    // The Y rotation swaps the X and Z extents: half-extents become
    // (6/2, 4/2, 2/2) around the entity position.
    expect(bounds.min.x).toBeCloseTo(5 - 3, 5);
    expect(bounds.max.x).toBeCloseTo(5 + 3, 5);
    expect(bounds.min.y).toBeCloseTo(2 - 2, 5);
    expect(bounds.max.y).toBeCloseTo(2 + 2, 5);
    expect(bounds.min.z).toBeCloseTo(-3 - 1, 5);
    expect(bounds.max.z).toBeCloseTo(-3 + 1, 5);
  });

  it("scales a declared box collider by the entity scale", () => {
    const entity = meshEntity({
      collider: { kind: "box", halfExtents: [1, 2, 3] },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 2, 2] },
    });
    const collision = buildSceneCollision(manifestWith(entity), new Map());
    const shape = collision.entities[0]!.shape;

    expect(shape.kind).toBe("cuboid");
    if (shape.kind !== "cuboid") throw new Error("unreachable");
    expect(shape.halfExtents).toEqual({ x: 2, y: 4, z: 6 });
  });

  it("warns and skips an entity whose asset geometry is missing rather than silently dropping collision", () => {
    const collision = buildSceneCollision(manifestWith(meshEntity()), new Map());

    expect(collision.entities).toHaveLength(0);
    expect(collision.warnings.some((w) => w.includes("no decoded geometry"))).toBe(true);
  });

  it("counts collision triangles for diagnostics", () => {
    const collision = buildSceneCollision(manifestWith(meshEntity()), new Map([["asset-1", UNIT_CUBE]]));
    expect(collision.triangleCount).toBe(triangleCount(UNIT_CUBE));
    expect(collision.triangleCount).toBe(12);
  });
});

describe("helper geometry", () => {
  it("renders and collides with the same triangles for a ramp", () => {
    const entity = rampEntity("ramp", [2, 0.4, 1.2], [0, 0, 0]);
    const rendered = helperLocalSoup(entity);
    const collision = buildSceneCollision(
      makeManifest({ entities: [entity], spawn: standingSpawn(0) }),
      new Map(),
    );
    const shape = collision.entities[0]!.shape;

    expect(shape.kind).toBe("trimesh");
    if (shape.kind !== "trimesh") throw new Error("unreachable");
    expect(Array.from(shape.soup.vertices)).toEqual(Array.from(rendered.vertices));
    expect(Array.from(shape.soup.indices)).toEqual(Array.from(rampSoup([2, 0.4, 1.2]).indices));
  });

  it("prefers rendered dimensions when a declared box collider disagrees", () => {
    const entity = boxEntity("platform", [2, 0.5, 2], [0, 1, 0]);
    // Collider claims to be much bigger than the box the player can see.
    entity.collider = { kind: "box", halfExtents: [5, 5, 5] };

    const collision = buildSceneCollision(
      makeManifest({ entities: [entity], spawn: standingSpawn(0) }),
      new Map(),
    );
    const shape = collision.entities[0]!.shape;

    expect(shape.kind).toBe("cuboid");
    if (shape.kind !== "cuboid") throw new Error("unreachable");
    expect(shape.halfExtents).toEqual({ x: 1, y: 0.25, z: 1 });
    expect(collision.warnings.some((w) => w.includes("disagree"))).toBe(true);
  });

  it("uses wedge collision for a ramp even if the manifest declares a box", () => {
    const entity = rampEntity("ramp", [2, 0.4, 1.2], [0, 0, 0]);
    entity.collider = { kind: "box", halfExtents: [1, 0.2, 0.6] };

    const collision = buildSceneCollision(
      makeManifest({ entities: [entity], spawn: standingSpawn(0) }),
      new Map(),
    );

    expect(collision.entities[0]!.shape.kind).toBe("trimesh");
    expect(collision.warnings.some((w) => w.includes("slope is walkable"))).toBe(true);
  });

  it("warns when a manifest produces no collidable geometry at all", () => {
    const collision = buildSceneCollision(makeManifest({ entities: [], spawn: standingSpawn(0) }), new Map());
    expect(collision.warnings.some((w) => w.includes("no ground"))).toBe(true);
  });
});

describe("scene bounds", () => {
  it("covers every collidable entity", () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 10, 0), boxEntity("tower", [1, 4, 1], [3, 2, 0])],
      spawn: standingSpawn(0),
    });
    const collision = buildSceneCollision(manifest, new Map());

    expect(collision.bounds).not.toBeNull();
    expect(collision.bounds!.min.x).toBeCloseTo(-5, 5);
    expect(collision.bounds!.max.x).toBeCloseTo(5, 5);
    expect(collision.bounds!.min.y).toBeCloseTo(-1, 5);
    expect(collision.bounds!.max.y).toBeCloseTo(4, 5);
  });
});

describe("soup transforms", () => {
  it("leaves geometry untouched under an identity transform", () => {
    const out = transformSoup(UNIT_CUBE, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
    for (let i = 0; i < UNIT_CUBE.vertices.length; i += 1) {
      expect(out.vertices[i]).toBeCloseTo(UNIT_CUBE.vertices[i]!, 6);
    }
  });

  it("does not alias the source geometry, so one entity cannot corrupt another", () => {
    const out = transformSoup(UNIT_CUBE, {
      position: [1, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
    expect(out.vertices).not.toBe(UNIT_CUBE.vertices);
    expect(out.indices).not.toBe(UNIT_CUBE.indices);
    expect(UNIT_CUBE.vertices[0]).toBeCloseTo(-0.5, 6);
  });
});
