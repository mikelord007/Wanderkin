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
import {
  applyBiomeSurface,
  applyBiomeSurfaceToMaterial,
  installBiomeSurfaceBlend,
  installBiomeSurfaceBlendOnObject,
  type BiomeSurfaceTreatment,
} from "../../biome/render/surfaceBlend.js";
import { createStructureShell } from "../../biome/render/structureShell.js";

export interface SceneEntitiesProps {
  manifest: SceneManifest;
  assets: ReadonlyMap<string, LoadedSceneAsset>;
  style: StyleDefinition;
  colorRestoration: number;
  /**
   * Optional localized biome tint on the CLONED scan and helper materials
   * (see `biomeSurfaceTreatment`). It is uniform-only: changing it never
   * re-clones or recompiles, and `null`/`undefined` renders exactly as
   * Original. Memoize it; a new object each render re-uploads uniforms.
   */
  biomeSurface?: BiomeSurfaceTreatment | null;
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
  biomeSurface,
}: {
  entity: HelperEntity;
  style: StyleDefinition;
  colorRestoration: number;
  biomeSurface: BiomeSurfaceTreatment | null;
}) {
  const geometry = useMemo(() => soupGeometry(helperLocalSoup(entity)), [entity]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 24), [geometry]);
  const isFloor = entity.kind === "floor";
  const baseColor = isFloor
    ? (style.sceneColors.surfaces[3] ?? style.sceneColors.background)
    : (style.sceneColors.surfaces[0] ?? style.uiAccents.primary);
  const material = useMemo(() => {
    const created = createStyledHelperMaterial(baseColor, style, colorRestoration, { floor: isFloor });
    installBiomeSurfaceBlend(created);
    return created;
  }, [baseColor, style, isFloor]);

  useEffect(() => {
    const holder = new THREE.Mesh(geometry, material);
    setObjectColorRestoration(holder, colorRestoration);
  }, [geometry, material, colorRestoration]);
  useEffect(() => {
    applyBiomeSurfaceToMaterial(material, biomeSurface, isFloor ? "floor" : "structure");
  }, [material, biomeSurface, isFloor]);
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
      material.dispose();
    },
    [geometry, edges, material],
  );

  // Themed looks only: a box structure is drawn as the biome's sculpted
  // shell (visual only; the collider, transform and dimensions are
  // untouched). Without a wall style this is null and the box renders as before.
  const wallStyle = biomeSurface?.structureShell ?? null;
  const shell = useMemo(
    () => (wallStyle && entity.kind === "box"
      ? createStructureShell({ dimensions: entity.dimensions, scale: entity.transform.scale, style: wallStyle, seed: entity.id })
      : null),
    [wallStyle, entity],
  );
  useEffect(() => () => shell?.dispose(), [shell]);

  const edgeColor = style.render.outline.enabled
    ? style.render.outline.color
    : style.uiAccents.focusRing;

  return (
    <group
      position={entity.transform.position as unknown as [number, number, number]}
      quaternion={entity.transform.rotation as unknown as [number, number, number, number]}
      scale={entity.transform.scale as unknown as [number, number, number]}
    >
      {shell ? (
        <primitive object={shell.mesh} dispose={null} />
      ) : (
        <>
          <mesh geometry={geometry} material={material} receiveShadow castShadow={!isFloor} />
          <lineSegments geometry={edges} renderOrder={2}>
            <lineBasicMaterial color={edgeColor} transparent opacity={isFloor ? 0.58 : 0.9} />
          </lineSegments>
        </>
      )}
    </group>
  );
}

export function SceneEntities({
  manifest,
  assets,
  style,
  colorRestoration,
  biomeSurface = null,
}: SceneEntitiesProps) {
  const clones = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    for (const [assetId, asset] of assets) {
      // `asset.sha256` is the loader's own hash of the bytes it actually
      // downloaded and decoded (see `LoadedSceneAsset.sha256`) — never the
      // manifest's declared `AssetReference.sha256`, which a manifest is
      // free to get wrong or lie about. Known-sample material regions must
      // only ever key off what was actually fetched.
      const clone = cloneStyledObject(asset.scene, style, colorRestoration, asset.sha256);
      // Clone-owned materials only; the cached source scene is never touched.
      installBiomeSurfaceBlendOnObject(clone);
      map.set(assetId, clone);
    }
    return map;
  }, [assets, style]);

  useEffect(() => {
    for (const object of clones.values()) setObjectColorRestoration(object, colorRestoration);
  }, [clones, colorRestoration]);
  useEffect(() => {
    for (const object of clones.values()) applyBiomeSurface(object, biomeSurface);
  }, [clones, biomeSurface]);
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
            biomeSurface={biomeSurface}
          />
        );
      })}
    </group>
  );
}
