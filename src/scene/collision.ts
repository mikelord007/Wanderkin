import type {
  ColliderDefinition,
  SceneEntity,
  SceneManifest,
} from "../../shared/manifest.js";
import { helperEntityTriangles } from "./helpers.js";
import { mergeTriangleSoups, transformTriangleSoup } from "./transform.js";
import type { TriangleSoup } from "./types.js";

/**
 * Collision geometry for one manifest entity, in world space.
 *
 * The triangles here are the *same* numbers the renderer draws: generated
 * meshes are the loaded GLB soup with the entity transform baked in, helpers
 * are the wedge/box the helper renderer builds. There is deliberately no
 * separate collider transform anywhere in the pipeline — the classic source of
 * "the sofa is not where it looks like it is".
 */
export interface EntityCollision {
  readonly entityId: string;
  readonly kind: SceneEntity["kind"];
  readonly collider: ColliderDefinition;
  readonly triangles: TriangleSoup;
  /** True for helper geometry the game added, false for generated mesh. */
  readonly addedByGame: boolean;
}

export class MissingAssetGeometryError extends Error {
  readonly assetId: string;
  constructor(assetId: string) {
    super(
      `No loaded geometry supplied for asset "${assetId}". Load every manifest asset before building collision.`,
    );
    this.name = "MissingAssetGeometryError";
    this.assetId = assetId;
  }
}

/** Asset-local triangles keyed by `AssetReference.id`. */
export type AssetGeometryMap = ReadonlyMap<string, TriangleSoup>;

export function buildEntityCollision(
  entity: SceneEntity,
  assetGeometry: AssetGeometryMap,
): EntityCollision {
  if (entity.kind === "generated-mesh") {
    const soup = assetGeometry.get(entity.assetId);
    if (!soup) throw new MissingAssetGeometryError(entity.assetId);
    return {
      entityId: entity.id,
      kind: entity.kind,
      collider: entity.collider,
      triangles: transformTriangleSoup(soup, entity.transform),
      addedByGame: false,
    };
  }
  return {
    entityId: entity.id,
    kind: entity.kind,
    collider: entity.collider,
    triangles: helperEntityTriangles(entity),
    addedByGame: true,
  };
}

/** Per-entity world-space collision for a whole level. */
export function buildCollisionSet(
  manifest: SceneManifest,
  assetGeometry: AssetGeometryMap,
): EntityCollision[] {
  return manifest.entities.map((entity) =>
    buildEntityCollision(entity, assetGeometry),
  );
}

/**
 * Every collidable triangle in the level merged into one world-space soup.
 *
 * Convenient for a single static trimesh collider and for the surface/route
 * analysis in `surfaces.ts` — which must see helper ramps and the game floor,
 * not just the generated furniture.
 */
export function buildCollisionTriangles(
  manifest: SceneManifest,
  assetGeometry: AssetGeometryMap,
): TriangleSoup {
  return mergeTriangleSoups(
    buildCollisionSet(manifest, assetGeometry).map((entry) => entry.triangles),
  );
}
