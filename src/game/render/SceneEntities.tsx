/** Style-aware scene rendering over the exact manifest/collision transforms. */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { HelperEntity, SceneManifest, StyleDefinition } from "@shared/index.js";
import type { LoadedSceneAsset } from "../assets/loadSceneAsset.js";
import { helperLocalSoup } from "../core/sceneCollision.js";
import type { TriangleSoup } from "../core/soup.js";
import {
  cloneStyledObject,
  createStyledHelperMaterial,
  disposeStyledObject,
  setObjectColorRestoration,
} from "../../scene/styleMaterial.js";

export interface SceneEntitiesProps {
  manifest: SceneManifest;
  assets: ReadonlyMap<string, LoadedSceneAsset>;
  style: StyleDefinition;
  colorRestoration: number;
}

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

function HelperMesh({
  entity,
  style,
  colorRestoration,
}: {
  entity: HelperEntity;
  style: StyleDefinition;
  colorRestoration: number;
}) {
  const geometry = useMemo(() => soupGeometry(helperLocalSoup(entity)), [entity]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 24), [geometry]);
  const isFloor = entity.kind === "floor";
  const baseColor = isFloor
    ? (style.sceneColors.surfaces[3] ?? style.sceneColors.background)
    : (style.sceneColors.surfaces[0] ?? style.uiAccents.primary);
  const material = useMemo(
    () => createStyledHelperMaterial(baseColor, style, colorRestoration, { floor: isFloor }),
    [baseColor, style, isFloor],
  );

  useEffect(() => {
    const holder = new THREE.Mesh(geometry, material);
    setObjectColorRestoration(holder, colorRestoration);
  }, [geometry, material, colorRestoration]);
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
      material.dispose();
    },
    [geometry, edges, material],
  );

  const edgeColor = style.render.outline.enabled
    ? style.render.outline.color
    : style.uiAccents.focusRing;

  return (
    <group
      position={entity.transform.position as unknown as [number, number, number]}
      quaternion={entity.transform.rotation as unknown as [number, number, number, number]}
      scale={entity.transform.scale as unknown as [number, number, number]}
    >
      <mesh geometry={geometry} material={material} receiveShadow castShadow={!isFloor} />
      <lineSegments geometry={edges} renderOrder={2}>
        <lineBasicMaterial color={edgeColor} transparent opacity={isFloor ? 0.58 : 0.9} />
      </lineSegments>
    </group>
  );
}

export function SceneEntities({
  manifest,
  assets,
  style,
  colorRestoration,
}: SceneEntitiesProps) {
  const clones = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    for (const [assetId, asset] of assets) {
      map.set(assetId, cloneStyledObject(asset.scene, style, colorRestoration));
    }
    return map;
  }, [assets, style]);

  useEffect(() => {
    for (const object of clones.values()) setObjectColorRestoration(object, colorRestoration);
  }, [clones, colorRestoration]);
  useEffect(
    () => () => {
      for (const object of clones.values()) disposeStyledObject(object);
    },
    [clones],
  );

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
              <primitive object={object} />
            </group>
          );
        }
        return (
          <HelperMesh
            key={entity.id}
            entity={entity}
            style={style}
            colorRestoration={colorRestoration}
          />
        );
      })}
    </group>
  );
}
