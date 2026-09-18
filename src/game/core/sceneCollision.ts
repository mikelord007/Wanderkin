/**
 * Turns a `SceneManifest` into concrete collision shapes.
 *
 * Two rules hold throughout, because the brief requires that what the
 * player sees is exactly what they collide with:
 *
 * 1. Generated-mesh collision comes from the *same* decoded GLB triangles
 *    the renderer draws, with the *same* entity transform applied.
 * 2. Helper (added game geometry) collision is derived from the entity's
 *    `dimensions`, which is also what the renderer draws. If a manifest's
 *    `collider.halfExtents` disagrees with `dimensions`, the render
 *    geometry wins and a warning is recorded rather than silently letting
 *    the collider drift away from the visible ramp/platform.
 */

import type {
  HelperEntity,
  SceneEntity,
  SceneManifest,
  Vec3,
} from "@shared/index.js";
import {
  boxSoup,
  mergeBounds,
  rampSoup,
  soupBounds,
  transformSoup,
  triangleCount,
  type Bounds,
  type TriangleSoup,
} from "./soup.js";
import { quatFromTuple, type QuatLike, type Vec3Like } from "./vec.js";

/** Decoded, asset-local collision triangles for one `AssetReference`. */
export type AssetGeometryMap = ReadonlyMap<string, TriangleSoup>;

export type EntityCollisionShape =
  /** World-space triangles; the entity transform is already baked in. */
  | { kind: "trimesh"; soup: TriangleSoup }
  | {
      kind: "cuboid";
      halfExtents: Vec3Like;
      position: Vec3Like;
      rotation: QuatLike;
    }
  | {
      kind: "capsule";
      radius: number;
      halfHeight: number;
      position: Vec3Like;
      rotation: QuatLike;
    };

export interface EntityCollision {
  entityId: string;
  shape: EntityCollisionShape;
}

export interface SceneCollision {
  entities: EntityCollision[];
  /** Combined bounds of every collidable surface; `null` for an empty scene. */
  bounds: Bounds | null;
  triangleCount: number;
  /** Non-fatal data problems worth surfacing during QA. */
  warnings: string[];
}

const HALF_EXTENT_TOLERANCE = 1e-4;

/**
 * Local-space geometry for added game geometry. The renderer and the
 * collision builder both call this, which is what guarantees a ramp you
 * can see is a ramp you can walk up.
 */
export function helperLocalSoup(entity: HelperEntity): TriangleSoup {
  return entity.kind === "ramp" ? rampSoup(entity.dimensions) : boxSoup(entity.dimensions);
}

function scaledHalfExtents(dimensions: Vec3, scale: Vec3): Vec3Like {
  return {
    x: Math.abs((dimensions[0] / 2) * scale[0]),
    y: Math.abs((dimensions[1] / 2) * scale[1]),
    z: Math.abs((dimensions[2] / 2) * scale[2]),
  };
}

function uniformScaleFactor(scale: Vec3): number {
  return Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]));
}

function positionOf(entity: SceneEntity): Vec3Like {
  const [x, y, z] = entity.transform.position;
  return { x, y, z };
}

function boundsOfCuboid(halfExtents: Vec3Like, position: Vec3Like, rotation: QuatLike): Bounds | null {
  // Reuse the soup path so a rotated cuboid's bounds are computed the same
  // way as everything else rather than by a second, divergent formula.
  const soup = boxSoup([halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2]);
  return soupBounds(
    transformSoup(soup, {
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
      scale: [1, 1, 1],
    }),
  );
}

function boundsOfShape(shape: EntityCollisionShape): Bounds | null {
  switch (shape.kind) {
    case "trimesh":
      return soupBounds(shape.soup);
    case "cuboid":
      return boundsOfCuboid(shape.halfExtents, shape.position, shape.rotation);
    case "capsule": {
      const r = shape.radius;
      const h = shape.halfHeight + shape.radius;
      return boundsOfCuboid({ x: r, y: h, z: r }, shape.position, shape.rotation);
    }
  }
}

export function buildSceneCollision(
  manifest: SceneManifest,
  assetGeometry: AssetGeometryMap,
): SceneCollision {
  const entities: EntityCollision[] = [];
  const warnings: string[] = [];
  let bounds: Bounds | null = null;
  let triangles = 0;

  for (const entity of manifest.entities) {
    const shape = buildEntityShape(entity, assetGeometry, warnings);
    if (!shape) continue;

    if (shape.kind === "trimesh") triangles += triangleCount(shape.soup);
    entities.push({ entityId: entity.id, shape });
    bounds = mergeBounds(bounds, boundsOfShape(shape));
  }

  if (entities.length === 0) {
    warnings.push("Manifest produced no collidable entities; the level has no ground.");
  }

  return { entities, bounds, triangleCount: triangles, warnings };
}

function buildEntityShape(
  entity: SceneEntity,
  assetGeometry: AssetGeometryMap,
  warnings: string[],
): EntityCollisionShape | null {
  const rotation = quatFromTuple(entity.transform.rotation);
  const position = positionOf(entity);
  const scale = entity.transform.scale;

  if (entity.kind === "generated-mesh") {
    switch (entity.collider.kind) {
      case "triangle-mesh": {
        const source = assetGeometry.get(entity.assetId);
        if (!source) {
          warnings.push(
            `Entity "${entity.id}" references asset "${entity.assetId}", which has no decoded geometry; it will not collide.`,
          );
          return null;
        }
        if (source.indices.length === 0) {
          warnings.push(`Asset "${entity.assetId}" decoded to zero triangles; entity "${entity.id}" will not collide.`);
          return null;
        }
        return { kind: "trimesh", soup: transformSoup(source, entity.transform) };
      }
      case "box":
        return {
          kind: "cuboid",
          halfExtents: {
            x: Math.abs(entity.collider.halfExtents[0] * scale[0]),
            y: Math.abs(entity.collider.halfExtents[1] * scale[1]),
            z: Math.abs(entity.collider.halfExtents[2] * scale[2]),
          },
          position,
          rotation,
        };
      case "capsule": {
        const s = uniformScaleFactor(scale);
        return {
          kind: "capsule",
          radius: entity.collider.radius * s,
          halfHeight: entity.collider.halfHeight * s,
          position,
          rotation,
        };
      }
    }
  }

  // Helper (added game) geometry.
  const derived = scaledHalfExtents(entity.dimensions, scale);

  switch (entity.collider.kind) {
    case "box": {
      const declared = {
        x: Math.abs(entity.collider.halfExtents[0] * scale[0]),
        y: Math.abs(entity.collider.halfExtents[1] * scale[1]),
        z: Math.abs(entity.collider.halfExtents[2] * scale[2]),
      };
      if (
        Math.abs(declared.x - derived.x) > HALF_EXTENT_TOLERANCE ||
        Math.abs(declared.y - derived.y) > HALF_EXTENT_TOLERANCE ||
        Math.abs(declared.z - derived.z) > HALF_EXTENT_TOLERANCE
      ) {
        warnings.push(
          `Helper entity "${entity.id}" declares box halfExtents that disagree with its rendered dimensions; using the rendered dimensions so collision matches what the player sees.`,
        );
      }
      if (entity.kind === "ramp") {
        warnings.push(
          `Helper entity "${entity.id}" is a ramp but declares a box collider; using wedge collision so the slope is walkable.`,
        );
        return { kind: "trimesh", soup: transformSoup(helperLocalSoup(entity), entity.transform) };
      }
      return { kind: "cuboid", halfExtents: derived, position, rotation };
    }
    case "capsule": {
      const s = uniformScaleFactor(scale);
      return {
        kind: "capsule",
        radius: entity.collider.radius * s,
        halfHeight: entity.collider.halfHeight * s,
        position,
        rotation,
      };
    }
    case "triangle-mesh":
      return { kind: "trimesh", soup: transformSoup(helperLocalSoup(entity), entity.transform) };
  }
}
