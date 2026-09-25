/**
 * Glowing checkpoint markers.
 *
 * Because checkpoints must be collected in order, the markers are drawn in
 * three distinct states: the active objective is bright, pulsing and lit so
 * it can be picked out from across a furniture scene; later ones are dim
 * and still, so the player is never misled about where to go next; and
 * collected ones fade to a calm green.
 *
 * Everything is sized and seated for the body actually running
 * (`markerLayout.ts`): a toy-sized gem hovering just over the character's
 * head on the surface the checkpoint stands on, and a flat ring at the radius
 * a grounded character is really collected at. The trigger itself — stored
 * position and `triggerRadius` — is gameplay data and is not touched here.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Checkpoint, MovementConfig, SceneManifest, StyleDefinition } from "@shared/index.js";
import { checkpointMarkerLayout } from "./markerLayout.js";

export interface CheckpointMarkersProps {
  manifest: SceneManifest;
  /** Id of the next checkpoint, or null once the course is complete. */
  activeId: string | null;
  collectedIds: ReadonlySet<string>;
  style: StyleDefinition;
  reducedMotion: boolean;
  /** Config the manifest positions were authored against. */
  authoredConfig: MovementConfig;
  /** Config the simulation is actually running, i.e. the real body size. */
  runtimeConfig: MovementConfig;
}

/** Footprint ring width as a fraction of its radius. */
const RING_WIDTH_FRACTION = 0.1;
/** Lift off the surface, in body heights, so the ring never z-fights it. */
const RING_LIFT_IN_HEIGHTS = 0.03;
/** Height of the guide column above the gem; a world-scale navigation cue. */
const BEAM_HEIGHT = 2.4;

function CheckpointMarker({
  checkpoint,
  state,
  style,
  reducedMotion,
  authoredConfig,
  runtimeConfig,
}: {
  checkpoint: Checkpoint;
  state: "active" | "pending" | "collected";
  style: StyleDefinition;
  reducedMotion: boolean;
  authoredConfig: MovementConfig;
  runtimeConfig: MovementConfig;
}) {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);

  const layout = useMemo(
    () => checkpointMarkerLayout(checkpoint.position, checkpoint.triggerRadius, authoredConfig, runtimeConfig),
    [checkpoint.position, checkpoint.triggerRadius, authoredConfig, runtimeConfig],
  );

  useFrame((_, delta) => {
    const time = performance.now() / 1000;
    if (core.current) {
      if (!reducedMotion) {
        core.current.rotation.y += delta * (state === "active" ? 1.1 : 0.2);
        core.current.rotation.x += delta * 0.35;
      }
      const bob = !reducedMotion && state === "active" ? Math.sin(time * 2.2) * layout.bobAmplitude : 0;
      core.current.position.y = layout.coreLift + bob;
      const pulse = !reducedMotion && state === "active" ? 1 + Math.sin(time * 3.4) * 0.08 : 1;
      core.current.scale.setScalar(pulse * (state === "collected" ? 0.75 : 1));
    }
    if (ring.current) {
      // Collected rings go away: the gem alone marks a respawn point, and a
      // ring round the character's feet would only add clutter where it is.
      ring.current.visible = state !== "collected";
      const material = ring.current.material as THREE.MeshBasicMaterial;
      material.opacity =
        state === "active" ? (reducedMotion ? 0.5 : 0.42 + Math.sin(time * 2.6) * 0.12) : 0.2;
    }
    if (beam.current) {
      beam.current.visible = state === "active";
      const material = beam.current.material as THREE.MeshBasicMaterial;
      material.opacity = reducedMotion ? 0.12 : 0.12 + Math.sin(time * 2.6) * 0.04;
    }
  });

  const colour = new THREE.Color(
    state === "collected"
      ? style.sceneColors.colorFragments[1]
      : state === "active"
        ? style.sceneColors.colorFragments[0]
        : style.uiAccents.secondary,
  );
  const beamColour = style.sceneColors.finishPortal;
  const ringLift = RING_LIFT_IN_HEIGHTS * layout.bodyHeight;

  return (
    <group position={layout.surface}>
      <mesh ref={core} position={[0, layout.coreLift, 0]}>
        <icosahedronGeometry args={[layout.coreRadius, 0]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={state === "active" ? 2.4 : state === "collected" ? 0.6 : 0.35}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>

      {/* Where a grounded character is really collected, flat on the surface. */}
      {layout.footprintRadius > 0 ? (
        <mesh ref={ring} position={[0, ringLift, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <ringGeometry
            args={[layout.footprintRadius * (1 - RING_WIDTH_FRACTION), layout.footprintRadius, 48]}
          />
          <meshBasicMaterial
            color={colour}
            transparent
            opacity={0.3}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}

      {/* A soft column so the active objective can be found from a distance
          even when the marker itself is behind furniture. */}
      <mesh ref={beam} position={[0, layout.coreLift + BEAM_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[layout.beamRadiusTop, layout.beamRadiusBottom, BEAM_HEIGHT, 12, 1, true]} />
        <meshBasicMaterial
          color={beamColour}
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {state === "active" ? (
        <pointLight
          position={[0, layout.coreLift, 0]}
          color={beamColour}
          intensity={1.1}
          distance={2.6}
          decay={2}
        />
      ) : null}
    </group>
  );
}

export function CheckpointMarkers({
  manifest,
  activeId,
  collectedIds,
  style,
  reducedMotion,
  authoredConfig,
  runtimeConfig,
}: CheckpointMarkersProps) {
  return (
    <group>
      {manifest.checkpoints.map((checkpoint) => (
        <CheckpointMarker
          key={checkpoint.id}
          checkpoint={checkpoint}
          style={style}
          reducedMotion={reducedMotion}
          authoredConfig={authoredConfig}
          runtimeConfig={runtimeConfig}
          state={
            collectedIds.has(checkpoint.id)
              ? "collected"
              : checkpoint.id === activeId
                ? "active"
                : "pending"
          }
        />
      ))}
    </group>
  );
}
