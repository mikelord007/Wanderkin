import { COORDINATE_CONVENTION } from "../../shared/geometry.js";
import {
  DEFAULT_ASSUMED_EXTENT_METERS,
  type AssetProvenance,
  type CalibrationMetadata,
  type PhotoReference,
  type SceneManifest,
} from "../../shared/manifest.js";
import {
  DEFAULT_MOVEMENT_CONFIG,
  type MovementConfig,
} from "../../shared/movement.js";
import { SCENE_MANIFEST_SCHEMA_VERSION } from "../../shared/schema-version.js";
import { planCourse } from "./course.js";
import { createGameFloor, helperEntityTriangles } from "./helpers.js";
import { loadAsset, type AssetLoadProgress } from "./loader.js";
import { normalizeAsset } from "./normalize.js";
import { mergeTriangleSoups, transformTriangleSoup } from "./transform.js";
import type { Axis } from "./types.js";

/** Stages `prepareAsset` reports, per docs/CONTRACTS.md. They are genuinely
 * different waits and the loading UI must not merge them. */
export type PrepareStage =
  | "downloading"
  | "decoding"
  | "analyzing"
  | "validating";

export interface PrepareAssetOptions {
  /** Longest horizontal extent in game metres. Defaults to
   * `DEFAULT_ASSUMED_EXTENT_METERS`. */
  assumedExtentMeters?: number;
  /**
   * A real measurement the creator supplied instead of the arbitrary default,
   * interpreted as the asset's longest horizontal dimension. Recorded in the
   * manifest's calibration either way, so a reader can always tell a measured
   * level from an assumed one.
   */
  measuredDimension?: { description: string; meters: number };

  // --- Everything below is optional and additive to the documented contract.

  /** Stable level id. Generated from the asset URL when omitted. */
  levelId?: string;
  name?: string;
  /**
   * Course seed. Supplied by the caller so a re-preparation of the same asset
   * reproduces the same course; a fresh random seed is only used when the
   * caller has none to preserve.
   */
  seed?: string;
  /** Provenance for the generated asset, from the job record. Passed straight
   * through — scene preparation never invents or guesses provenance. */
  provenance?: AssetProvenance;
  sha256?: string;
  photos?: readonly PhotoReference[];
  /** URL to record in the manifest, if it differs from the URL fetched (for
   * example when the caller cache-busts a retry). Defaults to `assetUrl`. */
  manifestAssetUrl?: string;
  movement?: MovementConfig;
  /** Creator orientation controls, applied during normalization. */
  upAxisOverride?: Axis;
  extraYawRadians?: number;
  /** How many alternative seeded courses to prepare alongside the main one. */
  courseCandidateCount?: number;
  checkpointCount?: number;
}

export interface PrepareAssetResult {
  manifest: SceneManifest;
  /** Alternative courses over the same prepared geometry, differing only in
   * seed. The creator picks one; the chosen manifest is what gets saved. */
  courseCandidates: SceneManifest[];
}

/**
 * Turns a generated GLB into a playable level manifest.
 *
 * Download → decode → inspect and normalize geometry → add a game floor →
 * sample standable surfaces → place a course and any helper geometry it needs
 * → validate every leg conservatively. The result is manifest data only: the
 * game runtime reads it without knowing anything about this pipeline.
 */
export async function prepareAsset(
  assetUrl: string,
  options: PrepareAssetOptions = {},
  onProgress?: (stage: PrepareStage, detail?: AssetLoadProgress) => void,
): Promise<PrepareAssetResult> {
  const movement = options.movement ?? DEFAULT_MOVEMENT_CONFIG;
  const assumedExtentMeters =
    options.assumedExtentMeters ?? DEFAULT_ASSUMED_EXTENT_METERS;
  // A creator-supplied measurement wins over the arbitrary game-scale default.
  const targetExtentMeters =
    options.measuredDimension?.meters ?? assumedExtentMeters;

  const loaded = await loadAsset(assetUrl, (progress) => {
    onProgress?.(progress.stage, progress);
  });

  onProgress?.("analyzing");
  const normalization = normalizeAsset(loaded.triangles, loaded.inspection, {
    targetExtentMeters,
    ...(options.upAxisOverride
      ? { upAxisOverride: options.upAxisOverride }
      : {}),
    ...(options.extraYawRadians !== undefined
      ? { extraYawRadians: options.extraYawRadians }
      : {}),
  });

  const worldTriangles = transformTriangleSoup(
    loaded.triangles,
    normalization.transform,
  );
  // The samples reconstruct no floor at all, so every prepared level gets one.
  const floor = createGameFloor({
    id: "helper-floor",
    bounds: normalization.normalizedBounds,
    margin: Math.min(4, Math.max(2, normalization.normalizedBounds.max[1]!)),
  });
  const baseCollision = mergeTriangleSoups([
    worldTriangles,
    helperEntityTriangles(floor),
  ]);

  onProgress?.("validating");
  const seed = options.seed ?? defaultSeed(assetUrl);
  const levelId = options.levelId ?? defaultLevelId(assetUrl, seed);
  const assetId = `${levelId}-asset`;
  const calibration: CalibrationMetadata = {
    assumedExtentMeters,
    ...(options.measuredDimension
      ? { measuredDimension: options.measuredDimension }
      : {}),
  };

  const buildManifest = (courseSeed: string, suffix: string): SceneManifest => {
    const plan = planCourse(baseCollision, {
      movement,
      seed: courseSeed,
      checkpointCount: options.checkpointCount ?? 5,
    });
    const now = new Date().toISOString();
    return {
      schemaVersion: SCENE_MANIFEST_SCHEMA_VERSION,
      levelId: suffix ? `${levelId}-${suffix}` : levelId,
      name: options.name ?? "Imported level",
      createdAt: now,
      updatedAt: now,
      coordinateConvention: COORDINATE_CONVENTION,
      calibration,
      assets: [
        {
          id: assetId,
          url: options.manifestAssetUrl ?? assetUrl,
          sha256: options.sha256 ?? loaded.sha256 ?? "",
          sizeBytes: loaded.sizeBytes,
          ...(options.provenance ? { provenance: options.provenance } : {}),
        },
      ],
      photos: [...(options.photos ?? [])],
      entities: [
        {
          id: `${levelId}-mesh`,
          kind: "generated-mesh",
          assetId,
          transform: normalization.transform,
          // Triangle mesh, never a single box: a box collider around a whole
          // room corner would make every surface in it unusable.
          collider: { kind: "triangle-mesh" },
        },
        floor,
        ...plan.helpers,
      ],
      spawn: plan.spawn,
      checkpoints: plan.checkpoints,
      seed: courseSeed,
      movementConfigId: movement.id,
      courseValidation: {
        ...plan.validation,
        evidence: [plan.validation.evidence, ...plan.diagnostics.notes]
          .filter(Boolean)
          .join(" "),
      },
    };
  };

  const manifest = buildManifest(seed, "");
  const candidateCount = options.courseCandidateCount ?? 2;
  const courseCandidates: SceneManifest[] = [];
  for (let i = 1; i <= candidateCount; i += 1) {
    courseCandidates.push(buildManifest(`${seed}#${i}`, `alt${i}`));
  }

  return { manifest, courseCandidates };
}

/** Stable seed derived from the asset URL, so preparing the same asset twice
 * without an explicit seed still produces the same course. */
function defaultSeed(assetUrl: string): string {
  return `asset:${hash32(assetUrl)}`;
}

function defaultLevelId(assetUrl: string, seed: string): string {
  return `level-${hash32(`${assetUrl}|${seed}`)}`;
}

function hash32(value: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
