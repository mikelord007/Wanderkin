import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Object3D } from "three";
import { Box3, Matrix3 } from "three";
import type { SceneManifest, SceneEntity, Checkpoint, SpawnPoint, Vec3 } from "@shared/index.js";
import {
  createHelperGeometry,
  loadAsset,
  MAX_WALKABLE_SLOPE_RADIANS,
  type LoadedAsset,
} from "../scene/index.js";
import { isWalkableSurfaceNormalY } from "./geometry.js";

/** What a click in the preview is currently placing, if anything. */
export type PlacementMode = "spawn" | { checkpointId: string } | null;

/** World-space AABB of a loaded generated-mesh, reported once its object
 * finishes mounting/updating — used by LevelEditor's floor-align and
 * calibrate actions, which need the mesh's real extents rather than an
 * invented number. */
export interface EntityBounds {
  minY: number;
  sizeX: number;
  sizeZ: number;
}

interface Preview3DProps {
  manifest: SceneManifest;
  selectedEntityId: string | null;
  placementMode: PlacementMode;
  onSurfaceClick: (point: Vec3, walkable: boolean) => void;
  onLoadError: (entityId: string) => void;
  onBoundsReport: (entityId: string, bounds: EntityBounds) => void;
}

/**
 * Renders the manifest's entities plus spawn/checkpoint markers. Every
 * clickable surface reports its world-space hit point via onSurfaceClick,
 * used by LevelEditor's click-to-place tools (capsule-center conversion
 * happens in the caller, not here — this component only knows about raw
 * geometry).
 */
export function Preview3D({
  manifest,
  selectedEntityId,
  placementMode,
  onSurfaceClick,
  onLoadError,
  onBoundsReport,
}: Preview3DProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [5, 4, 5], fov: 45 }}
      className={placementMode ? "oq-editor-canvas oq-editor-canvas--placing" : "oq-editor-canvas"}
    >
      <color attach="background" args={["#14101f"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 9, 4]} intensity={1.1} castShadow />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
      <gridHelper args={[20, 20, "#544a78", "#241f38"]} />

      {manifest.entities.map((entity) =>
        entity.kind === "generated-mesh" ? (
          <GeneratedMeshNode
            key={entity.id}
            entity={entity}
            manifest={manifest}
            selected={entity.id === selectedEntityId}
            onSurfaceClick={onSurfaceClick}
            onLoadError={onLoadError}
            onBoundsReport={onBoundsReport}
          />
        ) : (
          <HelperNode key={entity.id} entity={entity} selected={entity.id === selectedEntityId} onSurfaceClick={onSurfaceClick} />
        ),
      )}

      <SpawnMarker spawn={manifest.spawn} active={placementMode === "spawn"} />
      {manifest.checkpoints.map((checkpoint) => (
        <CheckpointMarker
          key={checkpoint.id}
          checkpoint={checkpoint}
          active={typeof placementMode === "object" && placementMode !== null && placementMode.checkpointId === checkpoint.id}
        />
      ))}

    </Canvas>
  );
}

function GeneratedMeshNode({
  entity,
  manifest,
  selected,
  onSurfaceClick,
  onLoadError,
  onBoundsReport,
}: {
  entity: Extract<SceneEntity, { kind: "generated-mesh" }>;
  manifest: SceneManifest;
  selected: boolean;
  onSurfaceClick: (point: Vec3, walkable: boolean) => void;
  onLoadError: (entityId: string) => void;
  onBoundsReport: (entityId: string, bounds: EntityBounds) => void;
}) {
  const asset = manifest.assets.find((a) => a.id === entity.assetId);
  return (
    <group position={entity.transform.position} quaternion={[...entity.transform.rotation]} scale={entity.transform.scale}>
      {asset ? (
        <SharedAssetNode
          url={asset.url}
          entityId={entity.id}
          selected={selected}
          onSurfaceClick={onSurfaceClick}
          onLoadError={onLoadError}
          onBoundsReport={onBoundsReport}
        />
      ) : (
        <PlaceholderBox selected={selected} label="no asset" />
      )}
    </group>
  );
}

function SharedAssetNode({
  url,
  entityId,
  selected,
  onSurfaceClick,
  onLoadError,
  onBoundsReport,
}: {
  url: string;
  entityId: string;
  selected: boolean;
  onSurfaceClick: (point: Vec3, walkable: boolean) => void;
  onLoadError: (entityId: string) => void;
  onBoundsReport: (entityId: string, bounds: EntityBounds) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedAsset | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(null);
    setFailed(false);
    void loadAsset(url).then(
      (asset) => {
        if (active) setLoaded(asset);
      },
      () => {
        if (!active) return;
        setFailed(true);
        onLoadError(entityId);
      },
    );
    return () => {
      active = false;
    };
  }, [entityId, url]);

  // The scene loader cache owns the decoded source graph. Every manifest
  // entity gets its own object tree so transforms/selection in one entity can
  // never mutate another entity (geometry/material buffers remain shared).
  const object = useMemo(() => loaded?.scene.clone(true) ?? null, [loaded]);
  if (!object) return <PlaceholderBox selected={selected} label={failed ? "preview unavailable" : "loading…"} />;
  return (
    <LoadedAssetObject
      object={object}
      entityId={entityId}
      onSurfaceClick={onSurfaceClick}
      onBoundsReport={onBoundsReport}
    />
  );
}

function LoadedAssetObject({
  object,
  entityId,
  onSurfaceClick,
  onBoundsReport,
}: {
  object: Object3D;
  entityId: string;
  onSurfaceClick: (point: Vec3, walkable: boolean) => void;
  onBoundsReport: (entityId: string, bounds: EntityBounds) => void;
}) {
  const ref = useRef<Object3D>(null);

  // Runs after every commit (transform changes re-render the parent
  // <group>, which is enough to justify recomputing) — cheap for an
  // editor's occasional edits, not a per-frame gameplay loop.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.updateMatrixWorld(true);
    const box = new Box3().setFromObject(ref.current);
    onBoundsReport(entityId, {
      minY: box.min.y,
      sizeX: box.max.x - box.min.x,
      sizeZ: box.max.z - box.min.z,
    });
  });

  return (
    <primitive
      ref={ref}
      object={object}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        reportSurfaceClick(event, onSurfaceClick);
      }}
    />
  );
}

/** Shown while loading, or permanently if the GLB fails to load — the
 * editor stays usable for arbitrary imperfect/unreachable assets, it just
 * can't show their real shape. */
function PlaceholderBox({
  selected,
  label,
}: {
  selected: boolean;
  label: string;
}) {
  return (
    <mesh
      position={[0, 1, 0]}
      // No in-canvas text label (would need a font-loading dependency) —
      // stashed on userData for now; the surrounding DOM panel is what
      // actually shows "loading…" / "preview unavailable" / "no asset" to
      // the user.
      userData={{ placeholderReason: label }}
    >
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color={selected ? "#f5a623" : "#4a4266"} wireframe transparent opacity={0.85} />
    </mesh>
  );
}

function HelperNode({
  entity,
  selected,
  onSurfaceClick,
}: {
  entity: Extract<SceneEntity, { kind: "floor" | "box" | "ramp" }>;
  selected: boolean;
  onSurfaceClick: (point: Vec3, walkable: boolean) => void;
}) {
  const color = entity.kind === "floor" ? "#2f6f5e" : entity.kind === "ramp" ? "#a06b2f" : "#3a5a8f";
  const geometry = useMemo(() => createHelperGeometry(entity.kind, entity.dimensions), [entity.kind, entity.dimensions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={entity.transform.position}
      quaternion={[...entity.transform.rotation]}
      scale={entity.transform.scale}
      castShadow
      receiveShadow
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        reportSurfaceClick(event, onSurfaceClick);
      }}
    >
      <meshStandardMaterial color={selected ? "#f5a623" : color} />
    </mesh>
  );
}

function reportSurfaceClick(
  event: ThreeEvent<MouseEvent>,
  onSurfaceClick: (point: Vec3, walkable: boolean) => void,
): void {
  event.object.updateWorldMatrix(true, false);
  const localNormal = event.face?.normal;
  const worldNormal = localNormal
    ? localNormal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(event.object.matrixWorld)).normalize()
    : null;
  const walkable = isWalkableSurfaceNormalY(worldNormal?.y ?? null, MAX_WALKABLE_SLOPE_RADIANS);
  onSurfaceClick([event.point.x, event.point.y, event.point.z], walkable);
}

function SpawnMarker({ spawn, active }: { spawn: SpawnPoint; active: boolean }) {
  return (
    <mesh position={spawn.position}>
      <coneGeometry args={[0.12, 0.28, 12]} />
      <meshStandardMaterial color={active ? "#ff8a3d" : "#3ddbc4"} emissive={active ? "#ff8a3d" : "#000000"} />
    </mesh>
  );
}

function CheckpointMarker({ checkpoint, active }: { checkpoint: Checkpoint; active: boolean }) {
  return (
    <mesh position={checkpoint.position} userData={{ checkpointId: checkpoint.id, order: checkpoint.order }}>
      <sphereGeometry args={[Math.max(0.1, checkpoint.triggerRadius * 0.25), 16, 16]} />
      <meshStandardMaterial
        color={active ? "#ff8a3d" : "#f5a623"}
        emissive={active ? "#ff8a3d" : "#5a3a00"}
        emissiveIntensity={0.6}
      />
      <mesh>
        <sphereGeometry args={[checkpoint.triggerRadius, 12, 12]} />
        <meshBasicMaterial color="#f5a623" wireframe transparent opacity={0.25} />
      </mesh>
    </mesh>
  );
}
