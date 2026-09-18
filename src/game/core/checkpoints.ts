/**
 * Ordered checkpoint collection.
 *
 * Checkpoints must be collected in manifest `order`: walking through
 * checkpoint 3 before checkpoint 2 does nothing. That keeps "next
 * objective" meaningful and stops a course being trivially shortcut by
 * whichever marker happens to be nearest. Pure state, no physics — the
 * trigger is a sphere of `triggerRadius` around the capsule centre, which
 * is the convention `Checkpoint.position` documents.
 */

import type { SceneManifest, SpawnPoint } from "@shared/index.js";
import { distance, fromTuple, type Vec3Like } from "./vec.js";

export interface CheckpointRuntime {
  id: string;
  order: number;
  position: Vec3Like;
  triggerRadius: number;
  safeRespawn: SpawnPoint;
}

export interface CheckpointState {
  readonly checkpoints: readonly CheckpointRuntime[];
  /** Parallel to `checkpoints`; index N is true once it has been reached. */
  collected: boolean[];
  /** Index of the checkpoint that may be collected next, or -1 when done. */
  nextIndex: number;
  /** Index of the most recent checkpoint reached, or -1 before the first. */
  lastActivatedIndex: number;
  completed: boolean;
  warnings: string[];
}

export interface CheckpointUpdate {
  /** Id collected on this update, or null. At most one per update. */
  collectedId: string | null;
  /** True on the update that collects the final checkpoint. */
  justCompleted: boolean;
}

const NO_CHANGE: CheckpointUpdate = { collectedId: null, justCompleted: false };

export function createCheckpointState(manifest: SceneManifest): CheckpointState {
  const warnings: string[] = [];
  const sorted = [...manifest.checkpoints].sort((a, b) => a.order - b.order);

  const seenOrders = new Set<number>();
  for (const checkpoint of sorted) {
    if (seenOrders.has(checkpoint.order)) {
      warnings.push(
        `Checkpoints "${checkpoint.id}" and another share order ${checkpoint.order}; collection order between them is arbitrary.`,
      );
    }
    seenOrders.add(checkpoint.order);
    if (checkpoint.triggerRadius <= 0) {
      warnings.push(`Checkpoint "${checkpoint.id}" has a non-positive trigger radius and can never be collected.`);
    }
  }

  if (sorted.length === 0) {
    warnings.push("Manifest has no checkpoints; the course can never be completed.");
  }

  const checkpoints: CheckpointRuntime[] = sorted.map((checkpoint) => ({
    id: checkpoint.id,
    order: checkpoint.order,
    position: fromTuple(checkpoint.position),
    triggerRadius: checkpoint.triggerRadius,
    safeRespawn: checkpoint.safeRespawn,
  }));

  return {
    checkpoints,
    collected: checkpoints.map(() => false),
    nextIndex: checkpoints.length > 0 ? 0 : -1,
    lastActivatedIndex: -1,
    completed: false,
    warnings,
  };
}

export function resetCheckpointState(state: CheckpointState): void {
  state.collected.fill(false);
  state.nextIndex = state.checkpoints.length > 0 ? 0 : -1;
  state.lastActivatedIndex = -1;
  state.completed = false;
}

export function nextCheckpoint(state: CheckpointState): CheckpointRuntime | null {
  if (state.nextIndex < 0) return null;
  return state.checkpoints[state.nextIndex] ?? null;
}

export function collectedCount(state: CheckpointState): number {
  let count = 0;
  for (const done of state.collected) if (done) count += 1;
  return count;
}

/**
 * Advances collection if the player is inside the next checkpoint's
 * trigger. Mutates and returns what changed.
 */
export function updateCheckpoints(state: CheckpointState, playerCenter: Vec3Like): CheckpointUpdate {
  if (state.completed) return NO_CHANGE;

  const target = nextCheckpoint(state);
  if (!target) return NO_CHANGE;
  if (target.triggerRadius <= 0) return NO_CHANGE;
  if (distance(playerCenter, target.position) > target.triggerRadius) return NO_CHANGE;

  state.collected[state.nextIndex] = true;
  state.lastActivatedIndex = state.nextIndex;

  const isLast = state.nextIndex >= state.checkpoints.length - 1;
  state.nextIndex = isLast ? -1 : state.nextIndex + 1;
  state.completed = isLast;

  return { collectedId: target.id, justCompleted: isLast };
}

/**
 * Where `R` and an out-of-bounds fall send the player: the most recent
 * checkpoint's safe respawn pose, or the level spawn before the first one.
 */
export function respawnPose(state: CheckpointState, manifest: SceneManifest): SpawnPoint {
  if (state.lastActivatedIndex < 0) return manifest.spawn;
  return state.checkpoints[state.lastActivatedIndex]?.safeRespawn ?? manifest.spawn;
}
