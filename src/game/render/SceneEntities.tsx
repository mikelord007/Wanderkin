/**
 * Draws the level exactly as the manifest describes it.
 *
 * Generated meshes are drawn from the decoded GLB under the entity's own
 * transform, and helper (added game) geometry is drawn from
 * `helperLocalSoup` — the same function the collision builder uses. So
 * every visible surface is backed by a collider built from identical
 * triangles, and added game geometry is visually distinct from
 * reconstructed furniture rather than pretending to be part of the room.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { HelperEntity, SceneManifest } from "@shared/index.js";
import type { LoadedSceneAsset } from "../assets/loadSceneAsset.js";
import { helperLocalSoup } from "../core/sceneCollision.js";
import type { TriangleSoup } from "../core/soup.js";

export interface SceneEntitiesProps {
  manifest: SceneManifest;
  assets: ReadonlyMap<string, LoadedSceneAsset>;
}

/**
 * Builds a flat-shaded geometry from a triangle soup. Indices are expanded
 * so shared vertices between, say, a ramp's slope and its side do not get
 * smoothed into a rounded blob.
 */
function soupGeometry(soup: TriangleSoup): THREE.BufferGeometry {
  const positions = new Float32Array(soup.indices.length * 3);
  for (let i = 0; i < soup.indices.length; i += 1) {
    const vertex = (soup.indices[i] ?? 0) * 3;
    positions[i * 3] = soup.vertices[vertex] ?? 0;
    positions[i * 3 + 1] = soup.vertices[vertex + 1] ?? 0;
    positions[i * 3 + 2] = soup.vertices[vertex + 2] ?? 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const HELPER_COLOURS: Record<HelperEntity["kind"], string> = {
  floor: "#2f3a4d",
  box: "#4a6a8a",
  ramp: "#4a6a8a",
};

function HelperMesh({ entity }: { entity: HelperEntity }) {
  const geometry = useMemo(() => soupGeometry(helperLocalSoup(entity)), [entity]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const isFloor = entity.kind === "floor";

  return (
    <mesh
      geometry={geometry}
      position={entity.transform.position as unknown as [number, number, number]}
      quaternion={entity.transform.rotation as unknown as [number, number, number, number]}
      scale={entity.transform.scale as unknown as [number, number, number]}
      receiveShadow
      castShadow={!isFloor}
    >
      <meshStandardMaterial
        color={HELPER_COLOURS[entity.kind]}
        roughness={isFloor ? 0.95 : 0.7}
        metalness={0.02}
      />
    </mesh>
  );
}

function GeneratedMesh({ object }: { object: THREE.Object3D }) {
  return <primitive object={object} />;
}

export function SceneEntities({ manifest, assets }: SceneEntitiesProps) {
  // Clone once per mount: the cache hands out one decoded scene per URL and
  // an Object3D can only live in a single scene graph, so replaying a level
  // (or two levels being alive during a transition) must not steal it.
  const clones = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    for (const [assetId, asset] of assets) map.set(assetId, asset.scene.clone(true));
    return map;
  }, [assets]);

  return (
    <group>
      {manifest.entities.map((entity) => {
        if (entity.kind === "generated-mesh") {
          const object = clones.get(entity.assetId);
          if (!object) return null;
          return (
            <group
              key={entity.id}
              position={entity.transform.position as unknown as [number, number, number]}
              quaternion={entity.transform.rotation as unknown as [number, number, number, number]}
              scale={entity.transform.scale as unknown as [number, number, number]}
            >
              <GeneratedMesh object={object} />
            </group>
          );
        }
        return <HelperMesh key={entity.id} entity={entity} />;
      })}
    </group>
  );
}
