import {
  DEFAULT_MOVEMENT_CONFIG,
  type CourseValidation,
  type LevelExperience,
  type MovementConfig,
  type SceneManifest,
  type Vec3,
} from "@shared/index.js";
import { validateManifestCourse } from "../scene/course.js";
import type { AssetGeometryMap } from "../scene/collision.js";

export type PlacementKind = "checkpoint" | "color-fragment" | "finish-portal" | "destination";

export interface PlacementRepairIssue {
  entityId: string;
  kind: PlacementKind;
  code: "missing-reference" | "invalid-trigger" | "count-mismatch" | "unreachable" | "geometry-unavailable";
  message: string;
  detail?: string;
}

export type PlacementValidationResult =
  | { ok: true; validation: CourseValidation; issues: readonly [] }
  | { ok: false; validation: CourseValidation; issues: readonly PlacementRepairIssue[] };

interface Target {
  id: string;
  kind: PlacementKind;
  position: Vec3;
}

function repairMessage(kind: PlacementKind): string {
  switch (kind) {
    case "checkpoint": return "Move this checkpoint closer to the previous platform.";
    case "color-fragment": return "Move this color fragment onto a reachable platform.";
    case "finish-portal": return "Move the finish portal closer to the final reachable platform.";
    case "destination": return "Move this destination closer to the previous platform.";
  }
}

function triggerApproach(position: Vec3, triggerRadius: number): Vec3 {
  return [position[0], position[1] - Math.min(0.35, triggerRadius * 0.75), position[2]];
}

function collectTargets(manifest: SceneManifest, experience: LevelExperience): Target[] {
  if (experience.mode.kind === "race") {
    const byId = new Map(manifest.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
    const targets = experience.mode.orderedCheckpointIds.flatMap((id): Target[] => {
      const checkpoint = byId.get(id);
      return checkpoint ? [{ id, kind: "checkpoint", position: checkpoint.position }] : [];
    });
    if (experience.finishPortal) {
      targets.push({
        id: experience.finishPortal.id,
        kind: "finish-portal",
        position: triggerApproach(experience.finishPortal.transform.position, experience.finishPortal.triggerRadius),
      });
    }
    return targets;
  }
  if (experience.mode.kind === "collect") {
    const required = new Set(experience.mode.requiredCollectibleIds);
    const targets = experience.collectibles
      .filter((fragment) => required.has(fragment.id))
      .sort((a, b) => a.order - b.order)
      .map((fragment): Target => ({
        id: fragment.id,
        kind: "color-fragment",
        position: triggerApproach(fragment.transform.position, fragment.triggerRadius),
      }));
    if (experience.finishPortal) {
      targets.push({
        id: experience.finishPortal.id,
        kind: "finish-portal",
        position: triggerApproach(experience.finishPortal.transform.position, experience.finishPortal.triggerRadius),
      });
    }
    return targets;
  }
  return experience.mode.destinations.map((destination) => ({
    id: destination.id,
    kind: "destination" as const,
    position: destination.position,
  }));
}

function structuralIssues(manifest: SceneManifest, experience: LevelExperience): PlacementRepairIssue[] {
  const issues: PlacementRepairIssue[] = [];
  const collectibleIds = new Set(experience.collectibles.map((fragment) => fragment.id));
  for (const fragment of experience.collectibles) {
    if (fragment.triggerRadius <= 0) {
      issues.push({ entityId: fragment.id, kind: "color-fragment", code: "invalid-trigger", message: "Give this color fragment a larger pickup area." });
    }
  }
  if (experience.finishPortal && experience.finishPortal.triggerRadius <= 0) {
    issues.push({ entityId: experience.finishPortal.id, kind: "finish-portal", code: "invalid-trigger", message: "Give the finish portal a larger entry area." });
  }
  if (experience.mode.kind === "collect") {
    for (const id of experience.mode.requiredCollectibleIds) {
      if (!collectibleIds.has(id)) issues.push({ entityId: id, kind: "color-fragment", code: "missing-reference", message: "Add the missing required color fragment before publishing." });
    }
    if (experience.mode.requiredCount !== new Set(experience.mode.requiredCollectibleIds).size) {
      issues.push({ entityId: experience.mode.finishPortalId, kind: "finish-portal", code: "count-mismatch", message: "Make the required color count match the unique required fragments." });
    }
  }
  if (experience.mode.kind === "race") {
    const checkpointIds = new Set(manifest.checkpoints.map((checkpoint) => checkpoint.id));
    for (const id of experience.mode.orderedCheckpointIds) {
      if (!checkpointIds.has(id)) issues.push({ entityId: id, kind: "checkpoint", code: "missing-reference", message: "Add the missing race checkpoint before publishing." });
    }
  }
  return issues;
}

/**
 * Reuses the scene planner's conservative walk/jump/mantle validator against
 * gameplay entities. A failed result is display-ready and must block publish.
 */
export function validateExperiencePlacements(
  manifest: SceneManifest,
  assetGeometry: AssetGeometryMap,
  /**
   * Deliberately the *authored* config rather than the miniature scale the
   * level is actually played at (`core/characterScale.ts`). This is a publish
   * gate, so it should err towards refusing a placement, and the authored
   * capsule is the stricter of the two: it demands more clearance while every
   * crossing distance stays identical. The cost is a conservative false
   * negative — an author can be told a placement is out of reach when the
   * smaller character could in fact get there — which is the right direction
   * for a gate to be wrong in.
   */
  movement: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
): PlacementValidationResult {
  const experience = manifest.experience;
  const targets: Target[] = experience
    ? collectTargets(manifest, experience)
    : [...manifest.checkpoints]
        .sort((a, b) => a.order - b.order)
        .map((checkpoint) => ({ id: checkpoint.id, kind: "checkpoint", position: checkpoint.position }));
  const issues = experience ? structuralIssues(manifest, experience) : [];
  const projected: SceneManifest = {
    ...manifest,
    checkpoints: targets.map((target, order) => ({
      id: target.id,
      order,
      position: target.position,
      triggerRadius: 0.4,
      safeRespawn: { position: target.position, headingRadians: 0 },
    })),
  };

  try {
    const check = validateManifestCourse(projected, assetGeometry, movement);
    check.report.segments.forEach((segment, index) => {
      if (segment.reachable) return;
      const target = targets[index];
      if (!target) return;
      issues.push({
        entityId: target.id,
        kind: target.kind,
        code: "unreachable",
        message: repairMessage(target.kind),
        ...(segment.failureReason ? { detail: segment.failureReason } : {}),
      });
    });
    return issues.length === 0
      ? { ok: true, validation: check.validation, issues: [] }
      : { ok: false, validation: { ...check.validation, status: "failed" }, issues };
  } catch (error) {
    return {
      ok: false,
      validation: {
        status: "failed",
        method: "conservative-kinematic-v1",
        checkedAt: new Date().toISOString(),
        evidence: error instanceof Error ? error.message : "Geometry could not be checked.",
      },
      issues: [...issues, {
        entityId: manifest.levelId,
        kind: "checkpoint",
        code: "geometry-unavailable",
        message: "Reload the world geometry before checking or publishing this course.",
      }],
    };
  }
}

export class PlacementValidationError extends Error {
  constructor(readonly result: Extract<PlacementValidationResult, { ok: false }>) {
    super(result.issues[0]?.message ?? "This course needs repair before publishing.");
    this.name = "PlacementValidationError";
  }
}

export function assertPlayableExperience(result: PlacementValidationResult): void {
  if (!result.ok) throw new PlacementValidationError(result);
}
