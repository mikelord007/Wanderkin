import { describe, expect, it } from "vitest";
import { createEmptyManifest, identityTransform } from "@shared/index.js";
import type { SceneManifest } from "@shared/index.js";
import {
  addCheckpoint,
  addHelperEntity,
  markManuallyAdjusted,
  removeCheckpoint,
  removeHelperEntity,
  reorderCheckpoint,
  setSpawn,
  updateCalibration,
  updateCheckpoint,
  updateEntityTransform,
  updateHelperDimensions,
} from "./manifestEdits.js";

function baseManifest(): SceneManifest {
  return createEmptyManifest({
    levelId: "level-1",
    name: "Test level",
    seed: "seed-1",
    movementConfigId: "default-v1",
  });
}

describe("markManuallyAdjusted", () => {
  it("always flips course validation to manually-adjusted with an honest note", () => {
    const manifest = { ...baseManifest(), courseValidation: { status: "validated" as const } };
    const result = markManuallyAdjusted(manifest);
    expect(result.courseValidation.status).toBe("manually-adjusted");
    expect(result.courseValidation.uncertaintyNotes).toMatch(/not re-validated/i);
    expect(result.courseValidation.checkedAt).toBeTruthy();
  });
});

describe("spawn and checkpoints", () => {
  it("sets the spawn point and marks manually-adjusted", () => {
    const result = setSpawn(baseManifest(), { position: [1, 2, 3], headingRadians: 0.5 });
    expect(result.spawn).toEqual({ position: [1, 2, 3], headingRadians: 0.5 });
    expect(result.courseValidation.status).toBe("manually-adjusted");
  });

  it("adds a checkpoint with an ascending order and a default safe respawn", () => {
    const withOne = addCheckpoint(baseManifest(), { position: [0, 1, 0], triggerRadius: 0.5 });
    expect(withOne.checkpoints).toHaveLength(1);
    expect(withOne.checkpoints[0]).toMatchObject({ order: 0, triggerRadius: 0.5 });
    expect(withOne.checkpoints[0]!.safeRespawn.position).toEqual([0, 1, 0]);

    const withTwo = addCheckpoint(withOne, { position: [2, 1, 0], triggerRadius: 0.4 });
    expect(withTwo.checkpoints).toHaveLength(2);
    expect(withTwo.checkpoints[1]!.order).toBe(1);
  });

  it("removes a checkpoint and renumbers the rest to stay 0..n-1 ascending", () => {
    let manifest = addCheckpoint(baseManifest(), { position: [0, 0, 0], triggerRadius: 0.5 });
    manifest = addCheckpoint(manifest, { position: [1, 0, 0], triggerRadius: 0.5 });
    manifest = addCheckpoint(manifest, { position: [2, 0, 0], triggerRadius: 0.5 });
    const middleId = manifest.checkpoints[1]!.id;

    const result = removeCheckpoint(manifest, middleId);
    expect(result.checkpoints).toHaveLength(2);
    expect(result.checkpoints.map((c) => c.order)).toEqual([0, 1]);
    expect(result.checkpoints.find((c) => c.id === middleId)).toBeUndefined();
  });

  it("updates a checkpoint's fields without touching its id/order", () => {
    const manifest = addCheckpoint(baseManifest(), { position: [0, 0, 0], triggerRadius: 0.5 });
    const id = manifest.checkpoints[0]!.id;
    const result = updateCheckpoint(manifest, id, { triggerRadius: 1.2 });
    expect(result.checkpoints[0]).toMatchObject({ id, order: 0, triggerRadius: 1.2 });
  });

  it("reorders a checkpoint by swapping order with its neighbor", () => {
    let manifest = addCheckpoint(baseManifest(), { position: [0, 0, 0], triggerRadius: 0.5 });
    manifest = addCheckpoint(manifest, { position: [1, 0, 0], triggerRadius: 0.5 });
    const firstId = manifest.checkpoints[0]!.id;
    const secondId = manifest.checkpoints[1]!.id;

    const result = reorderCheckpoint(manifest, secondId, "up");
    expect(result.checkpoints.find((c) => c.id === secondId)!.order).toBe(0);
    expect(result.checkpoints.find((c) => c.id === firstId)!.order).toBe(1);
  });

  it("leaves the manifest untouched when reordering past either end", () => {
    const manifest = addCheckpoint(baseManifest(), { position: [0, 0, 0], triggerRadius: 0.5 });
    const id = manifest.checkpoints[0]!.id;
    expect(reorderCheckpoint(manifest, id, "up")).toBe(manifest);
    expect(reorderCheckpoint(manifest, id, "down")).toBe(manifest);
  });
});

describe("helper geometry", () => {
  it("adds a helper entity always marked addedBy: game", () => {
    const result = addHelperEntity(baseManifest(), {
      kind: "ramp",
      transform: identityTransform(),
      dimensions: [1, 0.5, 2],
      collider: { kind: "triangle-mesh" },
    });
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ kind: "ramp", addedBy: "game" });
  });

  it("removes a helper entity by id", () => {
    const manifest = addHelperEntity(baseManifest(), {
      kind: "floor",
      transform: identityTransform(),
      dimensions: [10, 0.1, 10],
      collider: { kind: "box", halfExtents: [5, 0.05, 5] },
    });
    const id = manifest.entities[0]!.id;
    const result = removeHelperEntity(manifest, id);
    expect(result.entities).toHaveLength(0);
  });

  it("updates a helper's dimensions but never touches a generated-mesh entity", () => {
    const manifest: SceneManifest = {
      ...baseManifest(),
      entities: [
        {
          id: "mesh-1",
          kind: "generated-mesh",
          assetId: "asset-1",
          transform: identityTransform(),
          collider: { kind: "triangle-mesh" },
        },
      ],
    };
    const withHelper = addHelperEntity(manifest, {
      kind: "box",
      transform: identityTransform(),
      dimensions: [1, 1, 1],
      collider: { kind: "box", halfExtents: [0.5, 0.5, 0.5] },
    });
    const helperId = withHelper.entities.find((e) => e.kind === "box")!.id;

    const result = updateHelperDimensions(withHelper, helperId, [2, 2, 2]);
    const updatedHelper = result.entities.find((e) => e.id === helperId);
    expect(updatedHelper).toMatchObject({
      dimensions: [2, 2, 2],
      collider: { kind: "box", halfExtents: [1, 1, 1] },
    });

    const untouchedMesh = result.entities.find((e) => e.id === "mesh-1");
    expect(untouchedMesh).toMatchObject({ kind: "generated-mesh" });

    // Attempting to target the generated-mesh entity's id is a no-op.
    const noOp = updateHelperDimensions(result, "mesh-1", [9, 9, 9]);
    expect(noOp.entities.find((e) => e.id === "mesh-1")).toMatchObject({ kind: "generated-mesh" });
  });

  it("keeps a resized ramp on the same triangle-mesh collider used by its wedge preview", () => {
    const manifest = addHelperEntity(baseManifest(), {
      kind: "ramp",
      transform: identityTransform(),
      dimensions: [1, 0.5, 2],
      collider: { kind: "triangle-mesh" },
    });
    const id = manifest.entities[0]!.id;
    const result = updateHelperDimensions(manifest, id, [2, 1, 4]);
    expect(result.entities[0]).toMatchObject({
      dimensions: [2, 1, 4],
      collider: { kind: "triangle-mesh" },
    });
  });
});

describe("entity transform and calibration", () => {
  it("patches only the given transform fields, leaving others intact", () => {
    const manifest: SceneManifest = {
      ...baseManifest(),
      entities: [
        {
          id: "mesh-1",
          kind: "generated-mesh",
          assetId: "asset-1",
          transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          collider: { kind: "triangle-mesh" },
        },
      ],
    };
    const result = updateEntityTransform(manifest, "mesh-1", { scale: [2, 2, 2] });
    expect(result.entities[0]!.transform).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [2, 2, 2],
    });
  });

  it("updates calibration metadata", () => {
    const result = updateCalibration(baseManifest(), {
      assumedExtentMeters: 8,
      measuredDimension: { description: "desk width", meters: 1.4 },
    });
    expect(result.calibration.measuredDimension).toEqual({ description: "desk width", meters: 1.4 });
  });
});
