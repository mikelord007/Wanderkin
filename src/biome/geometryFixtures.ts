/**
 * Lightweight stand-ins for real reconstructions, used by the placement and
 * adventure tests. Each is a single "generated mesh" soup prepared the way
 * `prepareAsset` prepares a scan: a game floor added under it and a course
 * planned by the existing planner. Nothing in the shipped game imports this.
 *
 *  - desk: several heights (chair seat, desk top, books, monitor), none of
 *    them reachable from the floor without help.
 *  - countertop: a mostly flat slab with a couple of small objects.
 *  - bed: an irregular, noisy soft surface with pillows and steep sides.
 *  - poor: a sparse, noisy, partly inverted reconstruction with floaters.
 */
import * as THREE from "three";
import {
  COORDINATE_CONVENTION,
  DEFAULT_ASSUMED_EXTENT_METERS,
  DEFAULT_MOVEMENT_CONFIG,
  IDENTITY_QUAT,
  SCENE_MANIFEST_SCHEMA_VERSION,
  type SceneManifest,
  type Vec3,
} from "@shared/index.js";
import { seededRandom, planCourse } from "../scene/course.js";
import { createGameFloor, helperEntityTriangles, helperLocalTriangles } from "../scene/helpers.js";
import type { LoadedSceneAsset } from "../scene/runtime.js";
import { computeBounds, mergeTriangleSoups, toIndexedMesh, transformTriangleSoup } from "../scene/transform.js";
import type { TriangleSoup } from "../scene/types.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractGlbTriangles } from "../scene/glb.js";
import { SAMPLE_LEVELS } from "../scene/samples.js";

export interface GeometryFixture {
  name: string;
  manifest: SceneManifest;
  assets: Map<string, LoadedSceneAsset>;
  /** World-space mesh soup (identity transform), for assertions. */
  mesh: TriangleSoup;
}

export function boxSoup(center: Vec3, size: Vec3): TriangleSoup {
  return transformTriangleSoup(helperLocalTriangles("box", size), {
    position: center,
    rotation: IDENTITY_QUAT,
    scale: [1, 1, 1],
  });
}

/** Box resting on y = 0 (or on `baseY`). */
function standing(x: number, z: number, size: Vec3, baseY = 0): TriangleSoup {
  return boxSoup([x, baseY + size[1] / 2, z], size);
}

/** Heightfield grid as triangles; `height(x, z)` returns null for a hole. */
function heightfield(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  cells: number,
  height: (x: number, z: number) => number | null,
  flip: (i: number, j: number) => boolean = () => false,
): TriangleSoup {
  const triangles: number[] = [];
  const stepX = (maxX - minX) / cells;
  const stepZ = (maxZ - minZ) / cells;
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const x0 = minX + i * stepX;
      const z0 = minZ + j * stepZ;
      const corners = [
        [x0, z0],
        [x0 + stepX, z0],
        [x0 + stepX, z0 + stepZ],
        [x0, z0 + stepZ],
      ].map(([x, z]) => [x!, height(x!, z!), z!] as const);
      if (corners.some((corner) => corner[1] === null)) continue;
      const [a, b, c, d] = corners as unknown as [number, number, number][];
      // Counter-clockwise seen from above → normals point up.
      const quads = flip(i, j) ? [[a, b, c], [a, c, d]] : [[a, c, b], [a, d, c]];
      for (const tri of quads) for (const vertex of tri) triangles.push(...vertex!);
    }
  }
  return { positions: new Float32Array(triangles), triangleCount: triangles.length / 9 };
}

function fixture(name: string, mesh: TriangleSoup, withFloor = true): GeometryFixture {
  const assetId = `${name}-asset`;
  const bounds = computeBounds(mesh);
  const floor = createGameFloor({
    id: "helper-floor",
    bounds,
    margin: Math.min(4, Math.max(2, bounds.max[1])),
  });
  const collision = withFloor ? mergeTriangleSoups([mesh, helperEntityTriangles(floor)]) : mesh;
  const plan = planCourse(collision, { movement: DEFAULT_MOVEMENT_CONFIG, seed: `${name}-course`, checkpointCount: 5 });
  const now = "2026-09-25T00:00:00.000Z";
  const manifest: SceneManifest = {
    schemaVersion: SCENE_MANIFEST_SCHEMA_VERSION,
    levelId: `fixture-${name}`,
    name: `Fixture ${name}`,
    createdAt: now,
    updatedAt: now,
    coordinateConvention: COORDINATE_CONVENTION,
    calibration: { assumedExtentMeters: DEFAULT_ASSUMED_EXTENT_METERS },
    assets: [{ id: assetId, url: `/fixtures/${name}.glb`, sha256: "0".repeat(64), sizeBytes: 1 }],
    photos: [],
    entities: [
      {
        id: `${name}-mesh`,
        kind: "generated-mesh",
        assetId,
        transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT, scale: [1, 1, 1] },
        collider: { kind: "triangle-mesh" },
      },
      ...(withFloor ? [floor] : []),
      ...plan.helpers,
    ],
    spawn: plan.spawn,
    checkpoints: plan.checkpoints,
    seed: `${name}-course`,
    movementConfigId: DEFAULT_MOVEMENT_CONFIG.id,
    courseValidation: plan.validation,
  };
  return { name, manifest, assets: loadedAssets(assetId, mesh), mesh };
}

export function loadedAssets(assetId: string, mesh: TriangleSoup): Map<string, LoadedSceneAsset> {
  return new Map([[assetId, { scene: new THREE.Group(), collision: toIndexedMesh(mesh), sha256: null }]]);
}

/** Desk corner with several heights, in normalized game metres. */
export function deskFixture(): GeometryFixture {
  const deskTop = 2.0;
  const parts = [
    standing(0, 0, [5, 0.12, 2.2], deskTop - 0.12), // desk top
    standing(-2.4, -1.0, [0.15, deskTop - 0.12, 0.15]), // legs
    standing(-2.4, 1.0, [0.15, deskTop - 0.12, 0.15]),
    standing(1.9, 0, [1.2, deskTop - 0.12, 2.0]), // drawer cabinet
    standing(-0.8, -0.7, [1.6, 0.9, 0.4], deskTop), // monitor block → 2.9
    standing(1.3, -0.4, [0.8, 0.4, 0.6], deskTop), // books → 2.4
    standing(-0.8, 2.2, [1.0, 1.0, 1.0]), // chair seat → 1.0
    standing(-0.8, 2.65, [1.0, 1.2, 0.1], 1.0), // chair back
  ];
  return fixture("desk", mergeTriangleSoups(parts));
}

/** A mostly flat countertop scan with two small objects. */
export function countertopFixture(): GeometryFixture {
  const parts = [
    standing(0, 0, [8, 0.15, 3.5]),
    standing(-2.5, 0.6, [0.3, 0.35, 0.3], 0.15),
    standing(2.0, -0.9, [0.5, 0.25, 0.4], 0.15),
  ];
  return fixture("countertop", mergeTriangleSoups(parts));
}

/** Soft, lumpy bed: noisy mattress top, pillows, steep rounded sides. */
export function bedFixture(): GeometryFixture {
  const random = seededRandom("bed-noise");
  const noise = new Map<string, number>();
  const jitter = (x: number, z: number) => {
    const key = `${x.toFixed(3)}:${z.toFixed(3)}`;
    if (!noise.has(key)) noise.set(key, (random() - 0.5) * 0.08);
    return noise.get(key)!;
  };
  const halfW = 3;
  const halfD = 2;
  const top = heightfield(-halfW, halfW, -halfD, halfD, 30, (x, z) => {
    const edge = Math.min(halfW - Math.abs(x), halfD - Math.abs(z));
    // Rounded sides: drop steeply over the last 0.3 m.
    const shoulder = edge < 0.3 ? Math.sqrt(Math.max(0, edge / 0.3)) : 1;
    const pillow = (cx: number) =>
      0.3 * Math.exp(-(((x - cx) / 0.7) ** 2) - (((z + 1.35) / 0.35) ** 2));
    return 0.02 + shoulder * (1.0 + jitter(x, z) + pillow(-1.3) + pillow(1.3));
  });
  const headboard = standing(0, -halfD - 0.1, [6, 2.2, 0.2]);
  return fixture("bed", mergeTriangleSoups([top, headboard]));
}

/** Poor reconstruction: holes, floaters, inverted and tilted fragments. */
export function poorFixture(withFloor = true): GeometryFixture {
  const random = seededRandom("poor-noise");
  const blob = heightfield(
    -2.5,
    2.5,
    -2,
    2,
    20,
    (x, z) => {
      if (random() < 0.12) return null; // holes
      const hump = 1.3 * Math.exp(-((x / 1.6) ** 2) - ((z / 1.2) ** 2));
      return hump + (random() - 0.5) * 0.18;
    },
    (i, j) => (i * 7 + j * 3) % 11 === 0, // some inverted normals
  );
  const floaters = mergeTriangleSoups(
    Array.from({ length: 12 }, (_, i) =>
      boxSoup([-3 + random() * 6, 0.6 + random() * 1.8, -2.5 + random() * 5], [0.08, 0.02, 0.08 + (i % 3) * 0.05]),
    ),
  );
  return fixture(withFloor ? "poor" : "poor-no-floor", mergeTriangleSoups([blob, floaters]), withFloor);
}

export const GEOMETRY_FIXTURES = [deskFixture, countertopFixture, bedFixture, poorFixture] as const;

/**
 * A bundled real reconstruction (Rodin or Tripo GLB from `public/samples`),
 * read from disk. With `authoredSteps: false` its hand-placed helper steps and
 * course are removed, which is exactly how an arbitrary new scan looks to the
 * generator. Node-only (tests).
 */
export function sampleScanFixture(levelId: string, authoredSteps = false): GeometryFixture {
  const sample = SAMPLE_LEVELS.find((level) => level.levelId === levelId);
  if (!sample) throw new Error(`Unknown sample ${levelId}`);
  const assets = new Map<string, LoadedSceneAsset>();
  for (const asset of sample.assets) {
    const bytes = readFileSync(path.join(process.cwd(), "public", asset.url.replace(/^\//, "")));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    assets.set(asset.id, { scene: new THREE.Group(), collision: toIndexedMesh(extractGlbTriangles(buffer)), sha256: null });
  }
  const manifest: SceneManifest = authoredSteps
    ? (sample as SceneManifest)
    : { ...(sample as SceneManifest), entities: sample.entities.filter((entity) => entity.kind === "generated-mesh" || entity.kind === "floor") };
  return { name: authoredSteps ? levelId : `${levelId}-raw`, manifest, assets, mesh: { positions: new Float32Array(0), triangleCount: 0 } };
}

/**
 * Honestly impossible: a game floor that sits entirely under a low ceiling
 * (downward-facing, so nothing stands on top of it) 0.3 m above it. The
 * manifest already has a floor, so no fallback floor is added either.
 */
export function lowCeilingFixture(): GeometryFixture {
  const half = 30;
  const y = 0.3;
  // Clockwise from above: normals point down.
  const ceiling: TriangleSoup = {
    positions: new Float32Array([
      -half, y, -half, half, y, -half, half, y, half,
      -half, y, -half, half, y, half, -half, y, half,
    ]),
    triangleCount: 2,
  };
  const base = fixture("low-ceiling", ceiling, false);
  const floor = createGameFloor({ id: "helper-floor", bounds: { min: [-5, 0, -5], max: [5, 0, 5] }, margin: 0 });
  return { ...base, manifest: { ...base.manifest, entities: [...base.manifest.entities, floor] } };
}
