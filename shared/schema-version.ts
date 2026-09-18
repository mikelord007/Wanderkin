/**
 * Central schema version counters. Bump the relevant constant whenever a
 * shape in this directory changes incompatibly, and add a migration note
 * to docs/IMPLEMENTATION_PLAN.md. Consumers should reject payloads whose
 * version they do not recognize rather than guessing at compatibility.
 */
export const SCENE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const MOVEMENT_CONFIG_SCHEMA_VERSION = 1 as const;
export const JOB_SCHEMA_VERSION = 1 as const;
