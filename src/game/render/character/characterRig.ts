/**
 * Builds the bone hierarchy for the authored character.
 *
 * `characterDesign.ts` lists bones by their rest position in character space
 * because that is how the design is actually reasoned about ("the knee sits
 * here"); this module converts that to the parent-local offsets Three needs,
 * and keeps every bone's rest rotation at identity so an animation channel
 * means the same thing on every bone:
 *
 *   `rotation.x` swings a limb fore/aft, `rotation.z` swings it in/out,
 *   `rotation.y` twists it.
 *
 * Bone order is the order in `BONES`, which is also the order the skin indices
 * in `characterGeometry.ts` refer to.
 */

import * as THREE from "three";
import { BONES } from "./characterDesign.js";

export interface CharacterRig {
  readonly root: THREE.Bone;
  readonly skeleton: THREE.Skeleton;
  readonly bones: readonly THREE.Bone[];
  readonly boneNames: readonly string[];
  /** Bone lookup by design name, e.g. `rig.byName.get("shoulder.L")`. */
  readonly byName: ReadonlyMap<string, THREE.Bone>;
}

export const BONE_NAMES: readonly string[] = BONES.map((bone) => bone.name);

export function boneIndexOf(name: string): number {
  const index = BONE_NAMES.indexOf(name);
  if (index < 0) throw new Error(`Unknown character bone "${name}".`);
  return index;
}

/** Parent-local offsets derived from the authored rest positions. */
export function localOffsets(): Map<string, [number, number, number]> {
  const rest = new Map(BONES.map((bone) => [bone.name, bone.rest]));
  const offsets = new Map<string, [number, number, number]>();
  for (const bone of BONES) {
    if (!bone.parent) {
      offsets.set(bone.name, [bone.rest[0], bone.rest[1], bone.rest[2]]);
      continue;
    }
    const parent = rest.get(bone.parent);
    if (!parent) {
      throw new Error(`Bone "${bone.name}" references unknown parent "${bone.parent}".`);
    }
    offsets.set(bone.name, [
      bone.rest[0] - parent[0],
      bone.rest[1] - parent[1],
      bone.rest[2] - parent[2],
    ]);
  }
  return offsets;
}

export function createCharacterRig(): CharacterRig {
  const offsets = localOffsets();
  const byName = new Map<string, THREE.Bone>();
  const bones: THREE.Bone[] = [];

  for (const definition of BONES) {
    const bone = new THREE.Bone();
    bone.name = definition.name;
    const offset = offsets.get(definition.name)!;
    bone.position.set(offset[0], offset[1], offset[2]);
    byName.set(definition.name, bone);
    bones.push(bone);
  }

  for (const definition of BONES) {
    if (!definition.parent) continue;
    byName.get(definition.parent)!.add(byName.get(definition.name)!);
  }

  const root = byName.get(BONES[0]!.name)!;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  return { root, skeleton, bones, boneNames: BONE_NAMES, byName };
}
