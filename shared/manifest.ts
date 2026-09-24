import { SCENE_MANIFEST_SCHEMA_VERSION } from "./schema-version.js";
import type { CoordinateConvention, Transform, Vec3 } from "./geometry.js";
import { COORDINATE_CONVENTION } from "./geometry.js";
import type { ProviderCapabilityId } from "./provider.js";
import type { LevelExperience } from "./experience.js";

/**
 * Records where a piece of level geometry came from. `null` on an entity
 * means hand-authored/added game geometry, not a reconstructed asset — the
 * manifest must always let a reader distinguish generated approximations
 * from added gameplay aids.
 */
export interface AssetProvenance {
  providerId: string;
  capabilityUsed: ProviderCapabilityId;
  fallbackFired: ProviderCapabilityId | null;
  providerJobId: string;
  registeredModel: string;
  /** 1-based source photo numbers, in the order submitted to the provider. */
  sourcePhotoOrder: number[];
  generatedAt: string;
}

export interface AssetReference {
  id: string;
  /** Served URL (local storage or configured durable storage), never a raw
   * expiring provider URL once past the `ready` job state. */
  url: string;
  sha256: string;
  sizeBytes: number;
  /** Absent for hand-authored placeholder assets that were never generated. */
  provenance?: AssetProvenance;
}

export interface PhotoReference {
  id: string;
  url: string;
  /** 1-based position in the user's original upload order. */
  order: number;
  label?: string;
}

export type ColliderDefinition =
  /** Uses the owning entity's own transform and geometry — no separate
   * collider transform to drift out of sync with the visible mesh. */
  | { kind: "triangle-mesh" }
  | { kind: "box"; halfExtents: Vec3 }
  | { kind: "capsule"; radius: number; halfHeight: number };

export interface GeneratedMeshEntity {
  id: string;
  kind: "generated-mesh";
  assetId: string;
  transform: Transform;
  collider: ColliderDefinition;
}

/** Floor/box/ramp geometry the game adds to make a level playable. Always
 * marked distinctly from generated furniture in the manifest. */
export interface HelperEntity {
  id: string;
  kind: "floor" | "box" | "ramp";
  transform: Transform;
  dimensions: Vec3;
  collider: ColliderDefinition;
  addedBy: "game";
}

export type SceneEntity = GeneratedMeshEntity | HelperEntity;

export interface SpawnPoint {
  /** Capsule CENTER position, i.e. surfaceY + characterHalfHeight +
   * characterRadius + a small skin margin — not the standing surface. */
  position: Vec3;
  /** Facing angle, radians, measured around +Y from +Z. */
  headingRadians: number;
}

export interface Checkpoint {
  id: string;
  order: number;
  /** Capsule CENTER position (same convention as SpawnPoint.position). */
  position: Vec3;
  triggerRadius: number;
  safeRespawn: SpawnPoint;
}

/** Generated meshes have no guaranteed metric scale. `assumedExtentMeters`
 * documents the arbitrary game-scale assumption used to normalize an
 * asset's longest horizontal dimension; `measuredDimension` records a
 * user-calibrated real measurement when one was provided instead. */
export interface CalibrationMetadata {
  assumedExtentMeters: number;
  measuredDimension?: {
    description: string;
    meters: number;
  };
}

export const DEFAULT_ASSUMED_EXTENT_METERS = 8;

export type CourseValidationStatus =
  | "unvalidated"
  | "validated"
  | "failed"
  | "manually-adjusted";

/** Honest reporting on whether the authored/generated course has actually
 * been proven completable. `unvalidated` must never be presented to the
 * player as a guarantee. */
export interface CourseValidation {
  status: CourseValidationStatus;
  method?: string;
  checkedAt?: string;
  evidence?: string;
  uncertaintyNotes?: string;
}

export interface SceneManifest {
  schemaVersion: typeof SCENE_MANIFEST_SCHEMA_VERSION;
  levelId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  coordinateConvention: CoordinateConvention;
  calibration: CalibrationMetadata;
  assets: AssetReference[];
  photos: PhotoReference[];
  entities: SceneEntity[];
  spawn: SpawnPoint;
  /** Ordered; `order` must be unique and ascending starting at 0. */
  checkpoints: Checkpoint[];
  /** Deterministic course seed — reload must reproduce the same course,
   * never rerandomize on load. */
  seed: string;
  movementConfigId: string;
  courseValidation: CourseValidation;
  /**
   * Additive ObjectQuest v2 data. Legacy schema-v1 manifests omit this block
   * and remain valid; call `migrateSceneManifest` before a v2-only consumer
   * needs deterministic style/mode/quest defaults.
   */
  experience?: LevelExperience;
}

export function createEmptyManifest(params: {
  levelId: string;
  name: string;
  seed: string;
  movementConfigId: string;
}): SceneManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCENE_MANIFEST_SCHEMA_VERSION,
    levelId: params.levelId,
    name: params.name,
    createdAt: now,
    updatedAt: now,
    coordinateConvention: COORDINATE_CONVENTION,
    calibration: { assumedExtentMeters: DEFAULT_ASSUMED_EXTENT_METERS },
    assets: [],
    photos: [],
    entities: [],
    spawn: { position: [0, 0, 0], headingRadians: 0 },
    checkpoints: [],
    seed: params.seed,
    movementConfigId: params.movementConfigId,
    courseValidation: { status: "unvalidated" },
  };
}
