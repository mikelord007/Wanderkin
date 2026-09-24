import { z } from "zod";
import { COORDINATE_CONVENTION } from "./geometry.js";
import type { LevelExperience } from "./experience.js";
import type { SceneManifest } from "./manifest.js";
import {
  LEVEL_EXPERIENCE_SCHEMA_VERSION,
  QUEST_TEXT_SCHEMA_VERSION,
  SCENE_MANIFEST_SCHEMA_VERSION,
  STYLE_DEFINITION_SCHEMA_VERSION,
} from "./schema-version.js";

const finite = z.number().finite();
const positive = finite.positive();
const vec3 = z.tuple([finite, finite, finite]);
const quat = z.tuple([finite, finite, finite, finite]);
const transform = z.object({ position: vec3, rotation: quat, scale: vec3 });
const spawn = z.object({ position: vec3, headingRadians: finite });
const checkpoint = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  position: vec3,
  triggerRadius: positive,
  safeRespawn: spawn,
});

const collider = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("triangle-mesh") }),
  z.object({ kind: z.literal("box"), halfExtents: vec3 }),
  z.object({ kind: z.literal("capsule"), radius: positive, halfHeight: positive }),
]);

const entity = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("generated-mesh"),
    assetId: z.string().min(1),
    transform,
    collider,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.enum(["floor", "box", "ramp"]),
    transform,
    dimensions: vec3,
    collider,
    addedBy: z.literal("game"),
  }),
]);

const generationTimings = z.object({
  requestedAt: z.string().min(1),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  queueMilliseconds: finite.nonnegative().optional(),
  executionMilliseconds: finite.nonnegative().optional(),
  totalMilliseconds: finite.nonnegative().optional(),
});

const generationProvenance = z.object({
  providerId: z.string().min(1),
  requestedCapability: z.string().min(1),
  servedCapability: z.string().min(1).nullable(),
  servedModel: z.string().min(1).nullable(),
  applicationJobId: z.string().min(1),
  providerJobId: z.string().min(1).nullable(),
  timings: generationTimings,
  reportedCost: z
    .object({ amount: finite.nonnegative(), currency: z.string().min(1), unit: z.string().min(1).optional() })
    .nullable(),
});

const legacyAssetProvenance = z.object({
  providerId: z.string().min(1),
  capabilityUsed: z.string().min(1),
  fallbackFired: z.string().nullable(),
  providerJobId: z.string().min(1),
  registeredModel: z.string().min(1),
  sourcePhotoOrder: z.array(z.number().int().positive()),
  generatedAt: z.string().min(1),
});

const asset = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
  provenance: legacyAssetProvenance.optional(),
  generation: generationProvenance.optional(),
});

const photo = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  order: z.number().int().positive(),
  label: z.string().optional(),
});

const fragment = z.object({
  id: z.string().min(1),
  kind: z.literal("color-fragment"),
  transform,
  triggerRadius: positive,
  color: z.string().min(1),
  order: z.number().int().nonnegative(),
  restorationAmount: finite.gt(0).lte(1),
});

const portal = z.object({
  id: z.string().min(1),
  kind: z.literal("finish-portal"),
  transform,
  triggerRadius: positive,
  activation: z.enum(["always", "all-required-collectibles", "all-race-checkpoints"]),
  inactiveColor: z.string().min(1),
  activeColor: z.string().min(1),
});

const mode = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("explore"),
    destinations: z.array(z.object({ id: z.string().min(1), position: vec3, label: z.string().min(1) })),
    optionalCollectibleIds: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal("collect"),
    requiredCollectibleIds: z.array(z.string().min(1)),
    requiredCount: z.number().int().nonnegative(),
    finishPortalId: z.string().min(1),
    restorationSteps: z.array(finite.gte(0).lte(1)),
  }),
  z.object({
    kind: z.literal("race"),
    countdownSeconds: finite.nonnegative(),
    orderedCheckpointIds: z.array(z.string().min(1)),
    finishPortalId: z.string().min(1).optional(),
    restartPolicy: z.literal("full-reset"),
    personalBestMilliseconds: finite.positive().optional(),
  }),
]);

export const levelExperienceSchema = z
  .object({
    schemaVersion: z.literal(LEVEL_EXPERIENCE_SCHEMA_VERSION),
    style: z.object({
      id: z.enum(["cartoon", "hand-painted", "watercolor"]),
      definitionVersion: z.literal(STYLE_DEFINITION_SCHEMA_VERSION),
      atmosphere: z.string().max(500).optional(),
      approvedPreviewAssetId: z.string().min(1).optional(),
    }),
    mode,
    quest: z.object({
      schemaVersion: z.literal(QUEST_TEXT_SCHEMA_VERSION),
      title: z.string().min(1).max(200),
      intro: z.string().min(1).max(1000),
      objective: z.string().min(1).max(300),
      narrationScript: z.string().min(1).max(2000),
    }),
    collectibles: z.array(fragment),
    finishPortal: portal.nullable(),
    initialColorRestoration: finite.gte(0).lte(1),
  })
  .superRefine((experience, context) => {
    const collectibleIds = new Set(experience.collectibles.map((item) => item.id));
    if (collectibleIds.size !== experience.collectibles.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["collectibles"], message: "ids must be unique" });
    }
    if (experience.mode.kind === "collect") {
      for (const id of experience.mode.requiredCollectibleIds) {
        if (!collectibleIds.has(id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["mode", "requiredCollectibleIds"],
            message: `unknown collectible id \"${id}\"`,
          });
        }
      }
      if (experience.mode.requiredCount !== experience.mode.requiredCollectibleIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mode", "requiredCount"],
          message: "must match requiredCollectibleIds length",
        });
      }
      if (experience.mode.restorationSteps.length !== experience.mode.requiredCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mode", "restorationSteps"],
          message: "must contain one step per required collectible",
        });
      }
      if (!experience.finishPortal || experience.finishPortal.id !== experience.mode.finishPortalId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mode", "finishPortalId"],
          message: "must reference finishPortal",
        });
      }
    }
  });

const audioAsset = z.object({
  schemaVersion: z.literal(1),
  mediaType: z.literal("audio"),
  kind: z.enum(["music", "ambience", "sfx", "narration"]),
  id: z.string().min(1),
  url: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
  durationSeconds: positive,
  provenance: generationProvenance,
  loop: z.boolean(),
  defaultGain: finite.gte(0),
  transcript: z.string().optional(),
});

const videoAsset = z.object({
  schemaVersion: z.literal(1),
  mediaType: z.literal("video"),
  kind: z.enum(["animated-postcard", "gameplay-highlight"]),
  id: z.string().min(1),
  url: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
  durationSeconds: positive,
  provenance: generationProvenance,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  source: z.enum(["generated-animation", "gameplay-capture"]),
  posterUrl: z.string().min(1).optional(),
});

/** Compatible reader for legacy manifests plus additive v2 blocks. */
export const sceneManifestReaderSchema = z
  .object({
    schemaVersion: z.literal(SCENE_MANIFEST_SCHEMA_VERSION),
    levelId: z.string(),
    name: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    coordinateConvention: z.literal(COORDINATE_CONVENTION),
    calibration: z.object({
      assumedExtentMeters: positive,
      measuredDimension: z.object({ description: z.string().min(1), meters: positive }).optional(),
    }),
    assets: z.array(asset),
    photos: z.array(photo),
    entities: z.array(entity),
    spawn,
    checkpoints: z.array(checkpoint),
    seed: z.string().min(1),
    movementConfigId: z.string().min(1),
    courseValidation: z.object({
      status: z.enum(["unvalidated", "validated", "failed", "manually-adjusted"]),
      method: z.string().optional(),
      checkedAt: z.string().optional(),
      evidence: z.string().optional(),
      uncertaintyNotes: z.string().optional(),
    }),
    experience: levelExperienceSchema.optional(),
    media: z.object({ audio: z.array(audioAsset), video: z.array(videoAsset) }).optional(),
  })
  .superRefine((manifest, context) => {
    const orders = manifest.checkpoints.map((item) => item.order).sort((a, b) => a - b);
    if (!orders.every((order, index) => order === index)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpoints"],
        message: "orders must be unique and ascending from zero",
      });
    }
    const assetIds = new Set(manifest.assets.map((item) => item.id));
    manifest.entities.forEach((item, index) => {
      if (item.kind === "generated-mesh" && !assetIds.has(item.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "assetId"],
          message: `unknown asset id \"${item.assetId}\"`,
        });
      }
    });
  });

export type HydratedSceneManifest = SceneManifest & { experience: LevelExperience };

function legacyExperience(manifest: SceneManifest): LevelExperience {
  const objective =
    manifest.checkpoints.length > 0
      ? `Reach all ${manifest.checkpoints.length} checkpoints.`
      : "Explore the world at your own pace.";
  return {
    schemaVersion: LEVEL_EXPERIENCE_SCHEMA_VERSION,
    style: { id: "cartoon", definitionVersion: STYLE_DEFINITION_SCHEMA_VERSION },
    mode: {
      kind: "explore",
      destinations: manifest.checkpoints.map((item) => ({
        id: item.id,
        position: item.position,
        label: `Checkpoint ${item.order + 1}`,
      })),
      optionalCollectibleIds: [],
    },
    quest: {
      schemaVersion: QUEST_TEXT_SCHEMA_VERSION,
      title: manifest.name,
      intro: `Explore ${manifest.name}.`,
      objective,
      narrationScript: `Welcome to ${manifest.name}. ${objective}`,
    },
    collectibles: [],
    finishPortal: null,
    initialColorRestoration: 1,
  };
}

/**
 * Parses both the exact legacy envelope and v2-extended manifests, then
 * hydrates deterministic v2 defaults without mutating the caller's object.
 */
export function migrateSceneManifest(input: unknown): HydratedSceneManifest {
  const parsed = sceneManifestReaderSchema.parse(input) as SceneManifest;
  return {
    ...parsed,
    experience: parsed.experience ?? legacyExperience(parsed),
  };
}
