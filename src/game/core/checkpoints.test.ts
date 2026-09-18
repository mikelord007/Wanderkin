import { describe, expect, it } from "vitest";
import {
  collectedCount,
  createCheckpointState,
  nextCheckpoint,
  resetCheckpointState,
  respawnPose,
  updateCheckpoints,
} from "./checkpoints.js";
import { checkpointAt, floorEntity, makeManifest, standingSpawn } from "./fixtures.js";

function course() {
  return makeManifest({
    entities: [floorEntity("floor", 20, 0)],
    spawn: standingSpawn(0, 0, 0, 0.5),
    checkpoints: [
      // Supplied out of order on purpose: `order` decides, not array index.
      checkpointAt("c", 2, [0, 0, 6], 0.5, standingSpawn(0, 0, 6, 2)),
      checkpointAt("a", 0, [0, 0, 2], 0.5, standingSpawn(0, 0, 2, 1)),
      checkpointAt("b", 1, [0, 0, 4], 0.5, standingSpawn(0, 0, 4, 1.5)),
    ],
  });
}

describe("ordering", () => {
  it("sorts by manifest order rather than array position", () => {
    const state = createCheckpointState(course());
    expect(state.checkpoints.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(nextCheckpoint(state)?.id).toBe("a");
  });

  it("ignores a later checkpoint reached out of order", () => {
    const state = createCheckpointState(course());

    // Standing inside "c" first does nothing at all.
    expect(updateCheckpoints(state, { x: 0, y: 0, z: 6 })).toEqual({ collectedId: null, justCompleted: false });
    expect(collectedCount(state)).toBe(0);
    expect(nextCheckpoint(state)?.id).toBe("a");

    // Likewise "b".
    expect(updateCheckpoints(state, { x: 0, y: 0, z: 4 }).collectedId).toBeNull();
    expect(collectedCount(state)).toBe(0);
  });

  it("collects in sequence and completes on the last one", () => {
    const state = createCheckpointState(course());

    expect(updateCheckpoints(state, { x: 0, y: 0, z: 2 })).toEqual({ collectedId: "a", justCompleted: false });
    expect(nextCheckpoint(state)?.id).toBe("b");

    expect(updateCheckpoints(state, { x: 0, y: 0, z: 4 })).toEqual({ collectedId: "b", justCompleted: false });
    expect(state.completed).toBe(false);

    expect(updateCheckpoints(state, { x: 0, y: 0, z: 6 })).toEqual({ collectedId: "c", justCompleted: true });
    expect(state.completed).toBe(true);
    expect(collectedCount(state)).toBe(3);
    expect(nextCheckpoint(state)).toBeNull();
  });

  it("collects at most one checkpoint per update", () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
      checkpoints: [
        checkpointAt("first", 0, [0, 0, 0], 5),
        checkpointAt("second", 1, [0, 0, 0], 5),
      ],
    });
    const state = createCheckpointState(manifest);

    expect(updateCheckpoints(state, { x: 0, y: 0, z: 0 }).collectedId).toBe("first");
    expect(collectedCount(state)).toBe(1);
    expect(updateCheckpoints(state, { x: 0, y: 0, z: 0 }).collectedId).toBe("second");
  });

  it("does nothing once the course is complete", () => {
    const state = createCheckpointState(course());
    updateCheckpoints(state, { x: 0, y: 0, z: 2 });
    updateCheckpoints(state, { x: 0, y: 0, z: 4 });
    updateCheckpoints(state, { x: 0, y: 0, z: 6 });

    expect(updateCheckpoints(state, { x: 0, y: 0, z: 6 })).toEqual({ collectedId: null, justCompleted: false });
  });
});

describe("trigger radius", () => {
  it("requires the player to be inside the sphere, not merely near it", () => {
    const state = createCheckpointState(course());

    expect(updateCheckpoints(state, { x: 0, y: 0, z: 1.49 }).collectedId).toBeNull();
    expect(updateCheckpoints(state, { x: 0.51, y: 0, z: 2 }).collectedId).toBeNull();
    expect(updateCheckpoints(state, { x: 0, y: 0.49, z: 2 }).collectedId).toBe("a");
  });

  it("reports a non-positive trigger radius as uncollectable rather than silently triggering", () => {
    const manifest = makeManifest({
      entities: [floorEntity("floor", 20, 0)],
      spawn: standingSpawn(0),
      checkpoints: [checkpointAt("broken", 0, [0, 0, 0], 0)],
    });
    const state = createCheckpointState(manifest);

    expect(state.warnings.some((w) => w.includes("trigger radius"))).toBe(true);
    expect(updateCheckpoints(state, { x: 0, y: 0, z: 0 }).collectedId).toBeNull();
  });

  it("warns about an empty course instead of reporting it complete", () => {
    const manifest = makeManifest({ entities: [floorEntity("floor", 20, 0)], spawn: standingSpawn(0) });
    const state = createCheckpointState(manifest);

    expect(state.completed).toBe(false);
    expect(state.warnings.some((w) => w.includes("no checkpoints"))).toBe(true);
    expect(nextCheckpoint(state)).toBeNull();
  });
});

describe("respawn pose", () => {
  it("uses the level spawn before any checkpoint is activated", () => {
    const manifest = course();
    const state = createCheckpointState(manifest);
    expect(respawnPose(state, manifest)).toEqual(manifest.spawn);
  });

  it("uses the most recently activated checkpoint's safe pose", () => {
    const manifest = course();
    const state = createCheckpointState(manifest);

    updateCheckpoints(state, { x: 0, y: 0, z: 2 });
    expect(respawnPose(state, manifest).headingRadians).toBe(1);

    updateCheckpoints(state, { x: 0, y: 0, z: 4 });
    expect(respawnPose(state, manifest).headingRadians).toBe(1.5);
  });

  it("returns to the level spawn after a reset", () => {
    const manifest = course();
    const state = createCheckpointState(manifest);
    updateCheckpoints(state, { x: 0, y: 0, z: 2 });

    resetCheckpointState(state);

    expect(collectedCount(state)).toBe(0);
    expect(state.completed).toBe(false);
    expect(nextCheckpoint(state)?.id).toBe("a");
    expect(respawnPose(state, manifest)).toEqual(manifest.spawn);
  });
});
