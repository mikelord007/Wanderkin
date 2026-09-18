/**
 * Exercises the runtime against the real bundled GLBs rather than only
 * against synthetic boxes.
 *
 * The brief asks for problems to be attributed honestly to the mesh or to
 * the controller. Running the actual Rodin and Tripo output through the
 * same decode -> collision -> physics path the browser uses is what makes
 * that attribution possible: if the character sinks through this geometry
 * but not through a synthetic floor, the difference is the mesh.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// three's loaders probe `self` when deciding how to decode images. The
// game only ever runs in a browser, where it exists; this shim is purely
// so the decode path can be exercised under Node for these tests.
vi.hoisted(() => {
  const globals = globalThis as Record<string, unknown>;
  globals["self"] ??= globalThis;
});

import {
  DEFAULT_ASSUMED_EXTENT_METERS,
  DEFAULT_MOVEMENT_CONFIG,
  type GeneratedMeshEntity,
  type SceneManifest,
} from "@shared/index.js";
import { parseSceneAsset, type ParsedSceneAsset } from "./loadSceneAsset.js";
import { GameSimulation, NEUTRAL_INPUT } from "../core/simulation.js";
import { initRapier } from "../core/physicsWorld.js";
import { buildSceneCollision } from "../core/sceneCollision.js";
import { soupBounds } from "../core/soup.js";
import { boxEntity, floorEntity, makeManifest, standingSpawn } from "../core/fixtures.js";

const SAMPLES = path.resolve(__dirname, "../../../public/samples");
const CONFIG = DEFAULT_MOVEMENT_CONFIG;
const HALF_CAPSULE = CONFIG.characterHalfHeight + CONFIG.characterRadius;

function readSample(name: string): ArrayBuffer {
  const file = readFileSync(path.join(SAMPLES, name));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

const decoded = new Map<string, ParsedSceneAsset>();

beforeAll(async () => {
  await initRapier();
  for (const name of ["rodin.glb", "tripo.glb"]) {
    decoded.set(name, await parseSceneAsset(readSample(name), `/samples/${name}`));
  }
}, 60_000);

/**
 * Normalises an asset the way scene preparation is specified to: scale the
 * longest horizontal dimension to the documented game extent and drop the
 * asset onto y = 0. Recomputed here from the decoded geometry so the test
 * does not depend on a hand-written transform.
 */
function normalisedEntity(asset: ParsedSceneAsset): GeneratedMeshEntity {
  const bounds = soupBounds(asset.collision)!;
  const width = bounds.max.x - bounds.min.x;
  const depth = bounds.max.z - bounds.min.z;
  const scale = DEFAULT_ASSUMED_EXTENT_METERS / Math.max(width, depth);

  return {
    id: "furniture",
    kind: "generated-mesh",
    assetId: "asset-1",
    transform: {
      position: [
        -((bounds.min.x + bounds.max.x) / 2) * scale,
        -bounds.min.y * scale,
        -((bounds.min.z + bounds.max.z) / 2) * scale,
      ],
      rotation: [0, 0, 0, 1],
      scale: [scale, scale, scale],
    },
    collider: { kind: "triangle-mesh" },
  };
}

interface SampleLevel {
  manifest: SceneManifest;
  /** World bounds of the normalised furniture. */
  furniture: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  /** Spawn X, on the open floor just outside the furniture footprint. */
  spawnX: number;
}

function levelFor(asset: ParsedSceneAsset): SampleLevel {
  const entity = normalisedEntity(asset);
  const collision = buildSceneCollision(
    { ...makeManifest({ entities: [], spawn: standingSpawn(0) }), entities: [entity] },
    new Map([["asset-1", asset.collision]]),
  );
  const shape = collision.entities[0]!.shape;
  if (shape.kind !== "trimesh") throw new Error("expected a trimesh collider");
  const furniture = soupBounds(shape.soup)!;

  // Stand the character on open floor clear of the furniture, facing it.
  const spawnX = furniture.min.x - 1;
  const manifest = makeManifest({
    entities: [floorEntity("game-floor", 40, 0)],
    spawn: standingSpawn(0, spawnX, 0, Math.PI / 2),
  });
  manifest.entities = [...manifest.entities, entity];

  return { manifest, furniture, spawnX };
}

describe.each(["rodin.glb", "tripo.glb"])("%s", (name) => {
  it("decodes to real triangle geometry", () => {
    const asset = decoded.get(name)!;
    expect(asset.meshCount).toBeGreaterThan(0);
    expect(asset.collision.indices.length % 3).toBe(0);
    // Both samples are documented at roughly 45k-50k triangles.
    const triangles = asset.collision.indices.length / 3;
    expect(triangles).toBeGreaterThan(10_000);
    expect(triangles).toBeLessThan(200_000);
  });

  it("produces a collider with the same triangle count as the rendered mesh", () => {
    const asset = decoded.get(name)!;
    const { manifest } = levelFor(asset);
    const collision = buildSceneCollision(manifest, new Map([["asset-1", asset.collision]]));

    const meshShape = collision.entities.find((entity) => entity.entityId === "furniture")!.shape;
    expect(meshShape.kind).toBe("trimesh");
    if (meshShape.kind !== "trimesh") throw new Error("unreachable");
    expect(meshShape.soup.indices.length).toBe(asset.collision.indices.length);
    expect(collision.warnings).toEqual([]);
  });

  it("normalises to the documented game scale and sits on the floor", () => {
    const asset = decoded.get(name)!;
    const { furniture } = levelFor(asset);

    const longestHorizontal = Math.max(furniture.max.x - furniture.min.x, furniture.max.z - furniture.min.z);
    expect(longestHorizontal).toBeCloseTo(DEFAULT_ASSUMED_EXTENT_METERS, 3);
    // Lowest point of the furniture rests on the added game floor.
    expect(furniture.min.y).toBeCloseTo(0, 3);
  });

  it("supports a character standing on the added floor beside it without jitter", async () => {
    const asset = decoded.get(name)!;
    const { manifest } = levelFor(asset);
    const simulation = await GameSimulation.create({
      manifest,
      config: CONFIG,
      assetGeometry: new Map([["asset-1", asset.collision]]),
    });

    try {
      for (let i = 0; i < 120; i += 1) simulation.stepFixed(NEUTRAL_INPUT);
      expect(simulation.isGrounded).toBe(true);

      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 180; i += 1) {
        simulation.stepFixed(NEUTRAL_INPUT);
        min = Math.min(min, simulation.playerPosition.y);
        max = Math.max(max, simulation.playerPosition.y);
      }
      expect(max - min).toBeLessThan(1e-3);
    } finally {
      simulation.dispose();
    }
  });

  it("lands on the generated furniture when dropped onto it, without falling through", async () => {
    const asset = decoded.get(name)!;
    const { manifest, furniture: bounds } = levelFor(asset);

    // Drop onto the middle of the furniture's footprint from above it.
    const dropX = (bounds.min.x + bounds.max.x) / 2;
    const dropZ = (bounds.min.z + bounds.max.z) / 2;
    manifest.spawn = { position: [dropX, bounds.max.y + 1.5, dropZ], headingRadians: 0 };

    const simulation = await GameSimulation.create({
      manifest,
      config: CONFIG,
      assetGeometry: new Map([["asset-1", asset.collision]]),
    });

    try {
      let landed = false;
      for (let i = 0; i < 900 && !landed; i += 1) {
        simulation.stepFixed(NEUTRAL_INPUT);
        landed = simulation.isGrounded;
      }

      expect(landed).toBe(true);
      // Came to rest on a surface, not below the level's lowest geometry.
      expect(simulation.playerPosition.y).toBeGreaterThan(HALF_CAPSULE - 0.01);
      expect(simulation.playerPosition.y).toBeLessThan(bounds.max.y + 1.5);
      // And no automatic respawn fired, i.e. it never fell out of the level.
      expect(simulation.drainEvents().some((event) => event.type === "respawn")).toBe(false);
    } finally {
      simulation.dispose();
    }
  }, 30_000);
});

describe("both samples run identical game code", () => {
  it("builds a playable world from either asset with only manifest data differing", async () => {
    const results: { name: string; triangles: number; grounded: boolean }[] = [];

    for (const name of ["rodin.glb", "tripo.glb"]) {
      const asset = decoded.get(name)!;
      const { manifest, spawnX } = levelFor(asset);
      // Same authored course shape on both levels: one checkpoint a short
      // walk from the spawn, plus one added helper platform. Only the
      // coordinates differ, and they come from the manifest.
      const checkpointX = spawnX + 0.6;
      manifest.checkpoints = [
        {
          id: "cp-1",
          order: 0,
          position: [checkpointX, HALF_CAPSULE, 0],
          triggerRadius: 0.5,
          safeRespawn: standingSpawn(0, checkpointX, 0),
        },
      ];
      manifest.entities = [
        ...manifest.entities,
        boxEntity("step", [0.6, 0.4, 0.6], [spawnX, 0.2, 1.2]),
      ];

      const simulation = await GameSimulation.create({
        manifest,
        config: CONFIG,
        assetGeometry: new Map([["asset-1", asset.collision]]),
      });
      try {
        for (let i = 0; i < 120; i += 1) simulation.stepFixed(NEUTRAL_INPUT);
        for (let i = 0; i < 200; i += 1) {
          simulation.stepFixed({ ...NEUTRAL_INPUT, forward: 1, cameraYaw: Math.PI / 2 });
        }
        results.push({
          name,
          triangles: simulation.triangleCount,
          grounded: simulation.isGrounded,
        });
        expect(simulation.checkpointsCollected).toBe(1);
      } finally {
        simulation.dispose();
      }
    }

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.grounded).toBe(true);
      expect(result.triangles).toBeGreaterThan(10_000);
    }
  }, 60_000);
});
