import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BONES } from "./characterDesign.js";
import { BONE_NAMES, createCharacterRig, localOffsets } from "./characterRig.js";

describe("character rig", () => {
  it("places every bone at the rest position the design asked for", () => {
    const rig = createCharacterRig();
    rig.root.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    for (const definition of BONES) {
      const bone = rig.byName.get(definition.name)!;
      bone.getWorldPosition(world);
      expect(world.x, `${definition.name}.x`).toBeCloseTo(definition.rest[0], 6);
      expect(world.y, `${definition.name}.y`).toBeCloseTo(definition.rest[1], 6);
      expect(world.z, `${definition.name}.z`).toBeCloseTo(definition.rest[2], 6);
    }
  });

  it("gives every bone an identity rest rotation", () => {
    // The animation channels assume this: with no rest rotation, `rotation.x`
    // means "swing fore/aft" on every bone in the body.
    const rig = createCharacterRig();
    for (const bone of rig.bones) {
      expect(bone.rotation.x).toBe(0);
      expect(bone.rotation.y).toBe(0);
      expect(bone.rotation.z).toBe(0);
    }
  });

  it("parents every bone exactly as the design declares", () => {
    const rig = createCharacterRig();
    for (const definition of BONES) {
      const bone = rig.byName.get(definition.name)!;
      expect(bone.parent?.name ?? null).toBe(definition.parent);
    }
    expect(rig.root.name).toBe("root");
  });

  it("keeps bone order aligned with the skin indices", () => {
    const rig = createCharacterRig();
    expect(rig.bones.map((bone) => bone.name)).toEqual([...BONE_NAMES]);
    expect(rig.skeleton.bones).toHaveLength(BONES.length);
  });

  it("is symmetric left to right", () => {
    for (const definition of BONES) {
      if (!definition.name.endsWith(".L")) continue;
      const mirrored = BONES.find(
        (entry) => entry.name === `${definition.name.slice(0, -2)}.R`,
      );
      expect(mirrored, `${definition.name} has no mirror`).toBeDefined();
      expect(mirrored!.rest[0]).toBeCloseTo(-definition.rest[0], 9);
      expect(mirrored!.rest[1]).toBeCloseTo(definition.rest[1], 9);
      expect(mirrored!.rest[2]).toBeCloseTo(definition.rest[2], 9);
    }
  });

  it("derives parent-local offsets that sum back to the rest positions", () => {
    const offsets = localOffsets();
    for (const definition of BONES) {
      let x = 0;
      let y = 0;
      let z = 0;
      let cursor: string | null = definition.name;
      while (cursor) {
        const offset = offsets.get(cursor)!;
        x += offset[0];
        y += offset[1];
        z += offset[2];
        cursor = BONES.find((entry) => entry.name === cursor)!.parent;
      }
      expect(x).toBeCloseTo(definition.rest[0], 9);
      expect(y).toBeCloseTo(definition.rest[1], 9);
      expect(z).toBeCloseTo(definition.rest[2], 9);
    }
  });

  it("rotates a limb fore and aft on its X channel", () => {
    // The clips in `characterAnimator.ts` rely on this sign convention: a
    // positive hip X swings the foot backwards (-Z).
    const rig = createCharacterRig();
    rig.byName.get("hip.L")!.rotation.x = 0.5;
    rig.root.updateMatrixWorld(true);
    const ankle = new THREE.Vector3();
    rig.byName.get("ankle.L")!.getWorldPosition(ankle);
    expect(ankle.z).toBeLessThan(-0.05);
  });

  it("swings the scarf tail back and up on a positive X channel", () => {
    const rig = createCharacterRig();
    const rest = new THREE.Vector3();
    rig.root.updateMatrixWorld(true);
    rig.byName.get("scarf.3")!.getWorldPosition(rest);

    rig.byName.get("scarf.1")!.rotation.x = 0.6;
    rig.root.updateMatrixWorld(true);
    const streamed = new THREE.Vector3();
    rig.byName.get("scarf.3")!.getWorldPosition(streamed);

    expect(streamed.z).toBeLessThan(rest.z);
    expect(streamed.y).toBeGreaterThan(rest.y);
  });
});
