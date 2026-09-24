/**
 * Assembles the character: one skinned body, one back-face contour, and the
 * lantern that keeps the silhouette findable in the shadow under furniture.
 *
 * Everything is built in normalized character units (total height 1, origin at
 * the capsule centre) and the caller scales the returned group by the capsule's
 * real height, so the whole character follows `MovementConfig` with no
 * per-asset retuning.
 */

import * as THREE from "three";
import {
  BONES,
  LANTERN_COLOUR,
  LANTERN_LENS,
  OUTLINE_COLOUR,
  OUTLINE_THICKNESS,
} from "./characterDesign.js";
import { buildCharacterMeshData, toBufferGeometry, toOutlineGeometry } from "./characterGeometry.js";
import { createCharacterRig, type CharacterRig } from "./characterRig.js";
import { createFaceTexture } from "./faceTexture.js";

export interface CharacterModel {
  /** Add this to the scene. Bones, body and contour all live inside it. */
  readonly group: THREE.Group;
  readonly rig: CharacterRig;
  readonly body: THREE.SkinnedMesh;
  readonly outline: THREE.SkinnedMesh;
  readonly lantern: THREE.Mesh;
  readonly lanternLight: THREE.PointLight;
  readonly lanternMaterial: THREE.MeshStandardMaterial;
  dispose(): void;
}

function restOf(name: string): readonly [number, number, number] {
  const bone = BONES.find((entry) => entry.name === name);
  if (!bone) throw new Error(`Unknown character bone "${name}".`);
  return bone.rest;
}

export function buildCharacter(options: { outline?: boolean } = {}): CharacterModel {
  const rig = createCharacterRig();
  const data = buildCharacterMeshData(rig.boneNames);

  const faceTexture = createFaceTexture();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.02,
    ...(faceTexture ? { map: faceTexture } : {}),
  });

  const body = new THREE.SkinnedMesh(toBufferGeometry(data), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  // A skinned bounding sphere computed from the rest pose under-reports the
  // reach of a fully extended arm; the character is a handful of triangles, so
  // skipping the cull is cheaper than maintaining a correct bound.
  body.frustumCulled = false;

  const group = new THREE.Group();
  group.add(rig.root);
  group.add(body);
  body.bind(rig.skeleton, new THREE.Matrix4());

  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: OUTLINE_COLOUR,
    side: THREE.BackSide,
  });
  const outline = new THREE.SkinnedMesh(
    toOutlineGeometry(data, OUTLINE_THICKNESS),
    outlineMaterial,
  );
  outline.frustumCulled = false;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.visible = options.outline !== false;
  group.add(outline);
  outline.bind(rig.skeleton, new THREE.Matrix4());

  // Lantern lens, carried by the chest bone so it swings with the torso.
  const chest = rig.byName.get(LANTERN_LENS.bone)!;
  const chestRest = restOf(LANTERN_LENS.bone);
  const lanternMaterial = new THREE.MeshStandardMaterial({
    color: LANTERN_COLOUR,
    emissive: new THREE.Color(LANTERN_COLOUR),
    // Bright enough to find in shadow, dim enough not to blow out to a white
    // hole in the character's back under the game's key light.
    emissiveIntensity: 0.95,
    roughness: 0.25,
  });
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(LANTERN_LENS.radius, 14, 10),
    lanternMaterial,
  );
  lantern.position.set(
    LANTERN_LENS.at[0] - chestRest[0],
    LANTERN_LENS.at[1] - chestRest[1],
    LANTERN_LENS.at[2] - chestRest[2],
  );
  chest.add(lantern);

  const lanternLight = new THREE.PointLight(new THREE.Color(LANTERN_COLOUR), 0.32, 4.2, 2);
  lanternLight.position.copy(lantern.position);
  chest.add(lanternLight);

  return {
    group,
    rig,
    body,
    outline,
    lantern,
    lanternLight,
    lanternMaterial,
    dispose() {
      body.geometry.dispose();
      outline.geometry.dispose();
      lantern.geometry.dispose();
      bodyMaterial.dispose();
      outlineMaterial.dispose();
      lanternMaterial.dispose();
      faceTexture?.dispose();
      rig.skeleton.dispose();
    },
  };
}
