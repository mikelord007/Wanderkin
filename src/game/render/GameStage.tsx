/**
 * The in-canvas frame loop.
 *
 * One `useFrame` drives everything: advance the fixed-step simulation by
 * the real elapsed time, place the camera, pose the avatar, and publish
 * HUD signals and diagnostics. Per-frame values that would otherwise cause
 * sixty React renders a second (the objective pointer, diagnostics) are
 * written straight to a DOM node or a ref instead of to state.
 */

import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MovementConfig, SceneManifest, StyleDefinition } from "@shared/index.js";
import type { LoadedSceneAsset } from "../assets/loadSceneAsset.js";
import type { RapierModule } from "../core/physicsWorld.js";
import type { GameSimulation, SimulationEvent } from "../core/simulation.js";
import type { InputController } from "../input/inputController.js";
import type { GameDiagnostics } from "../diagnostics.js";
import { headingForward, headingRight } from "../core/vec.js";
import { CameraRig } from "./cameraRig.js";
import { PlayerAvatar, type PlayerAvatarHandle } from "./PlayerAvatar.js";
import { SceneEntities } from "./SceneEntities.js";
import { SceneLighting } from "./SceneLighting.js";
import { CheckpointMarkers } from "./Checkpoints.js";
import { SceneEnvironment } from "./SceneEnvironment.js";
import { ModeEntities } from "./ModeEntities.js";
import type { GameplaySessionSnapshot } from "../modes/session.js";
import type { Vec3Like } from "../core/vec.js";

/** Frame-by-frame values the HUD cares about. Compared shallowly upstream. */
export interface HudSignals {
  checkpointsCollected: number;
  checkpointsTotal: number;
  nextCheckpointId: string | null;
  mantlePromptVisible: boolean;
}

export interface GameStageProps {
  simulation: GameSimulation;
  config: MovementConfig;
  manifest: SceneManifest;
  assets: ReadonlyMap<string, LoadedSceneAsset>;
  input: InputController;
  rapier: RapierModule;
  /** False while paused, completed, or before the player has started. */
  runningRef: MutableRefObject<boolean>;
  collectedIds: ReadonlySet<string>;
  activeCheckpointId: string | null;
  onFirstFrame: () => void;
  onEvent: (event: SimulationEvent) => void;
  onHudSignals: (signals: HudSignals) => void;
  objectiveArrowRef: RefObject<HTMLDivElement>;
  objectiveDistanceRef: RefObject<HTMLSpanElement>;
  diagnosticsRef: MutableRefObject<GameDiagnostics | null>;
  style: StyleDefinition;
  atmosphere: string | undefined;
  colorRestoration: number;
  reducedMotion: boolean;
  modeState: GameplaySessionSnapshot | null;
  objectivePosition: Vec3Like | null;
  onGameplayFrame: (position: Vec3Like) => void;
}

export function GameStage({
  simulation,
  manifest,
  assets,
  input,
  rapier,
  runningRef,
  collectedIds,
  activeCheckpointId,
  onFirstFrame,
  onEvent,
  onHudSignals,
  objectiveArrowRef,
  objectiveDistanceRef,
  diagnosticsRef,
  style,
  atmosphere,
  colorRestoration,
  reducedMotion,
  modeState,
  objectivePosition,
  onGameplayFrame,
}: GameStageProps) {
  const camera = useThree((state) => state.camera);
  const avatar = useRef<PlayerAvatarHandle>(null);
  const frames = useRef(0);
  const announcedFirstFrame = useRef(false);

  // The scale the physics is actually running at, which is the authored
  // `config` prop after `characterScale.ts`. Framing the camera and sizing the
  // avatar from the raw prop instead would let the visible character drift
  // away from its own collider — exactly the fake-scale failure this is meant
  // to avoid — so the prop is deliberately not read here.
  const config = simulation.config;

  const rig = useMemo(() => new CameraRig(rapier, config), [rapier, config]);

  // Respawning re-aims the camera to the checkpoint's heading, so the
  // player is looking the right way instead of at wherever they fell from.
  useEffect(() => {
    rig.reset();
  }, [rig]);

  useFrame((_, delta) => {
    frames.current += 1;

    if (runningRef.current) {
      const raceAllowsMovement =
        modeState?.mode !== "race" || modeState.race.phase === "running";
      if (raceAllowsMovement) simulation.advance(input.consume(), delta);
      else input.clear();
      for (const event of simulation.drainEvents()) {
        if (event.type === "respawn") {
          input.setYaw(event.headingRadians);
          rig.reset();
        }
        onEvent(event);
      }
    } else {
      input.clear();
    }

    const position = simulation.interpolatedPosition();
    const yaw = simulation.interpolatedYaw();
    if (runningRef.current) onGameplayFrame(simulation.playerPosition);

    const pose = rig.update(
      simulation.scene.world,
      simulation.scene.playerCollider,
      position,
      input.yaw,
      input.pitch,
      delta,
    );
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);

    const groundY = simulation.groundHeightBelow();
    avatar.current?.update({
      position,
      yaw,
      speed: simulation.measuredHorizontalSpeed,
      grounded: simulation.isGrounded,
      mantling: simulation.isMantling,
      verticalVelocity: simulation.playerVelocity.y,
      groundY,
      deltaSeconds: delta,
    });

    onHudSignals({
      checkpointsCollected: simulation.checkpointsCollected,
      checkpointsTotal: simulation.checkpointsTotal,
      nextCheckpointId: simulation.nextCheckpointId,
      mantlePromptVisible: simulation.mantleTarget !== null,
    });

    updateObjectivePointer(
      simulation,
      objectivePosition,
      input.yaw,
      position,
      objectiveArrowRef.current,
      objectiveDistanceRef.current,
    );

    diagnosticsRef.current = {
      playerPosition: [position.x, position.y, position.z],
      playerVelocity: [
        simulation.playerVelocity.x,
        simulation.playerVelocity.y,
        simulation.playerVelocity.z,
      ],
      measuredSpeed: simulation.measuredHorizontalSpeed,
      grounded: simulation.isGrounded,
      mantling: simulation.isMantling,
      mantleAvailable: simulation.mantleTarget !== null,
      mantleRejection: simulation.mantleRejection,
      mantleTargetPosition: simulation.mantleTarget
        ? [
            simulation.mantleTarget.destination.x,
            simulation.mantleTarget.destination.y,
            simulation.mantleTarget.destination.z,
          ]
        : null,
      checkpointsCollected: simulation.checkpointsCollected,
      checkpointsTotal: simulation.checkpointsTotal,
      nextCheckpointId: simulation.nextCheckpointId,
      nextCheckpointPosition: simulation.nextCheckpointPosition
        ? [
            simulation.nextCheckpointPosition.x,
            simulation.nextCheckpointPosition.y,
            simulation.nextCheckpointPosition.z,
          ]
        : null,
      completed: simulation.completed,
      groundHeightBelow: groundY,
      cameraYaw: input.yaw,
      cameraPitch: input.pitch,
      cameraDistance: pose.distance,
      cameraOccluded: pose.occluded,
      fixedStepsRun: simulation.fixedStepsRun,
      simulatedSeconds: simulation.simulatedSeconds,
      renderedFrames: frames.current,
      lastFrameSeconds: delta,
      sceneBounds: {
        min: [simulation.bounds.min.x, simulation.bounds.min.y, simulation.bounds.min.z],
        max: [simulation.bounds.max.x, simulation.bounds.max.y, simulation.bounds.max.z],
      },
      collisionTriangles: simulation.triangleCount,
      warnings: simulation.warnings,
    };

    // Only claim readiness once a frame has actually been drawn: the first
    // useFrame callback runs *before* the first render completes.
    if (!announcedFirstFrame.current && frames.current >= 2) {
      announcedFirstFrame.current = true;
      onFirstFrame();
    }
  });

  return (
    <>
      <SceneLighting bounds={simulation.bounds} style={style} />
      <SceneEnvironment
        bounds={simulation.bounds}
        style={style}
        atmosphere={atmosphere}
        reducedMotion={reducedMotion}
      />
      <SceneEntities
        manifest={manifest}
        assets={assets}
        style={style}
        colorRestoration={colorRestoration}
      />
      <CheckpointMarkers
        manifest={manifest}
        activeId={activeCheckpointId}
        collectedIds={collectedIds}
        style={style}
        reducedMotion={reducedMotion}
      />
      {manifest.experience && modeState ? (
        <ModeEntities experience={manifest.experience} state={modeState} reducedMotion={reducedMotion} />
      ) : null}
      <PlayerAvatar ref={avatar} config={config} reducedMotion={reducedMotion} />
    </>
  );
}

function updateObjectivePointer(
  simulation: GameSimulation,
  objectivePosition: Vec3Like | null,
  cameraYaw: number,
  playerPosition: { x: number; y: number; z: number },
  arrow: HTMLDivElement | null,
  distanceLabel: HTMLSpanElement | null,
): void {
  if (!arrow) return;

  const target = objectivePosition ?? simulation.nextCheckpointPosition;
  if (!target) {
    arrow.style.opacity = "0";
    return;
  }

  const dx = target.x - playerPosition.x;
  const dz = target.z - playerPosition.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-4) {
    arrow.style.opacity = "0";
    return;
  }

  const forward = headingForward(cameraYaw);
  const right = headingRight(cameraYaw);
  const ux = dx / horizontal;
  const uz = dz / horizontal;
  const angle = Math.atan2(ux * right.x + uz * right.z, ux * forward.x + uz * forward.z);

  arrow.style.opacity = "1";
  arrow.style.transform = `rotate(${angle}rad)`;

  if (distanceLabel) {
    const distance = Math.hypot(dx, target.y - playerPosition.y, dz);
    distanceLabel.textContent = `${distance.toFixed(1)} m`;
  }
}
