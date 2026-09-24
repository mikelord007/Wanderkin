/**
 * Central schema version counters. Bump the relevant constant whenever a
 * shape in this directory changes incompatibly, and add a migration note
 * to docs/IMPLEMENTATION_PLAN.md. Consumers should reject payloads whose
 * version they do not recognize rather than guessing at compatibility.
 */
export const SCENE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const MOVEMENT_CONFIG_SCHEMA_VERSION = 1 as const;
export const JOB_SCHEMA_VERSION = 1 as const;

/**
 * V2 product data is an additive extension of SceneManifest v1. Keeping the
 * outer version at 1 lets existing saved levels and bundled manifests load
 * unchanged; independently versioned blocks make future incompatible changes
 * explicit without lying about the legacy envelope.
 */
export const LEVEL_EXPERIENCE_SCHEMA_VERSION = 1 as const;
export const STYLE_DEFINITION_SCHEMA_VERSION = 1 as const;
export const QUEST_TEXT_SCHEMA_VERSION = 1 as const;
export const MEDIA_ASSET_SCHEMA_VERSION = 1 as const;
export const GENERATION_CONTRACT_SCHEMA_VERSION = 1 as const;
export const PUBLISHED_LEVEL_SCHEMA_VERSION = 1 as const;
