/**
 * The in-canvas frame loop.
 *
 * One `useFrame` drives everything: advance the fixed-step simulation by
 * the real elapsed time, place the camera, pose the avatar, and publish
 * HUD signals and diagnostics. Per-frame values that would otherwise cause
 * sixty React renders a second (the objective pointer, diagnostics) are
 * written straight to a DOM node or a ref instead of to state.
 */

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import type { MovementConfig, SceneManifest, StyleDefinition } from "@shared/index.js";
import type { LoadedSceneAsset } from "../assets/loadSceneAsset.js";
import type { RapierModule } from "../core/physicsWorld.js";
import type { PropCollider } from "../core/propColliders.js";
import type { GameSimulation, SimulationEvent } from "../core/simulation.js";
import type { InputController } from "../input/inputController.js";
import type { GameDiagnostics } from "../diagnostics.js";
import { GAMEPLAY_CAMERA_FOV_DEGREES } from "../core/constants.js";
import { approach, headingForward, headingRight } from "../core/vec.js";
import type { GrappleAim } from "../core/grapple.js";
import { CameraRig } from "./cameraRig.js";
import { PlayerAvatar, characterHeight, type PlayerAvatarHandle } from "./PlayerAvatar.js";
import { GrappleRig, type GrappleRigHandle } from "./GrappleRig.js";
import { reelCameraEffect, reticleState } from "./grappleVisuals.js";
import { SceneEntities } from "./SceneEntities.js";
import { SceneLighting } from "./SceneLighting.js";
import { CheckpointMarkers } from "./Checkpoints.js";
import { SceneEnvironment } from "./SceneEnvironment.js";
import { ModeEntities } from "./ModeEntities.js";
import type { GameplaySessionSnapshot } from "../modes/session.js";
import type { Vec3Like } from "../core/vec.js";
import type { BiomeDefinition, BiomeLayout, EffectsQuality } from "../../biome/types.js";
import { BiomeLayer } from "../../biome/render/BiomeLayer.js";
import { biomeSurfaceTreatment } from "../../biome/render/surfaceBlend.js";

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
  /** The grappling hook's reticle; its `data-state` is written every frame. */
  grappleReticleRef?: RefObject<HTMLDivElement>;
  diagnosticsRef: MutableRefObject<GameDiagnostics | null>;
  style: StyleDefinition;
  atmosphere: string | undefined;
  colorRestoration: number;
  reducedMotion: boolean;
  modeState: GameplaySessionSnapshot | null;
  objectivePosition: Vec3Like | null;
  onGameplayFrame: (position: Vec3Like) => void;
  biomeDefinition: BiomeDefinition;
  biomeLayout: BiomeLayout | null;
  effectsQuality: EffectsQuality;
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
  grappleReticleRef,
  diagnosticsRef,
  style,
  atmosphere,
  colorRestoration,
  reducedMotion,
  modeState,
  objectivePosition,
  onGameplayFrame,
  biomeDefinition,
  biomeLayout,
  effectsQuality,
}: GameStageProps) {
  const camera = useThree((state) => state.camera);
  const renderer = useThree((state) => state.gl);
  const themed = biomeDefinition.id !== "original" && biomeLayout !== null;
  // Uniform-only tint on cloned scan materials; null restores Original.
  const biomeSurface = useMemo(
    () => (themed ? biomeSurfaceTreatment(biomeDefinition, biomeLayout, effectsQuality) : null),
    [themed, biomeDefinition, biomeLayout, effectsQuality],
  );
  // Generated adventures take the look's collectible colour. Authored worlds
  // keep theirs: Lost Colors fragments ARE their colours.
  const displayedExperience = useMemo(() => {
    if (!themed || !manifest.experience || !manifest.adventure) return manifest.experience;
    const color = biomeDefinition.mission.collectibleColor;
    return { ...manifest.experience,
      collectibles: manifest.experience.collectibles.map((item) => ({ ...item, color })),
      ...(manifest.experience.finishPortal ? { finishPortal: {
        ...manifest.experience.finishPortal, activeColor: color,
      } } : {}),
    };
  }, [themed, manifest.experience, manifest.adventure, biomeDefinition]);
  const avatar = useRef<PlayerAvatarHandle>(null);
  const grapple = useRef<GrappleRigHandle>(null);
  // The camera ray through the reticle as last drawn: the shot the next
  // press fires is exactly the one the reticle previewed.
  const aimRef = useRef<GrappleAim | null>(null);
  const grappleFx = useRef({ phase: "idle", sinceBite: 0, fov: GAMEPLAY_CAMERA_FOV_DEGREES, lastRelease: null as string | null });
  const hand = useMemo(() => new Vector3(), []);
  const frames = useRef(0);
  const announcedFirstFrame = useRef(false);

  // The scale the physics is actually running at, which is the authored
  // `config` prop after `characterScale.ts`. Framing the camera and sizing the
  // avatar from the raw prop instead would let the visible character drift
  // away from its own collider — exactly the fake-scale failure this is meant
  // to avoid — so the prop is deliberately not read here.
  const config = simulation.config;

  const rig = useMemo(() => new CameraRig(rapier, config), [rapier, config]);

  // The solid props of the drawn look (`BiomeLayer` hands over `[]` when it
  // stops drawing them). A world being replaced may already be freed.
  const setPropColliders = useCallback((colliders: readonly PropCollider[]) => {
    if (!simulation.isDisposed) simulation.setPropColliders(colliders);
  }, [simulation]);

  // Widen the field of view for gameplay, so more of the room is visible
  // around the now much-smaller character instead of the character simply
  // filling the same fraction of frame it always has. This is a pure
  // projection change: it does not touch `CameraRig`'s boom, occlusion or
  // minimum-distance math (`cameraRig.ts`), so collision avoidance and
  // near-clip behaviour are unaffected.
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    if (camera.fov === GAMEPLAY_CAMERA_FOV_DEGREES) return;
    camera.fov = GAMEPLAY_CAMERA_FOV_DEGREES;
    camera.updateProjectionMatrix();
  }, [camera]);

  // Respawning re-aims the camera to the checkpoint's heading, so the
  // player is looking the right way instead of at wherever they fell from.
  useEffect(() => {
    rig.reset();
  }, [rig]);

  useFrame((_, delta) => {
    // A world being replaced is freed in a React effect cleanup, but the Canvas
    // can still deliver frames until it unmounts. Every call below queries the
    // Rapier world, which must never happen once it is freed.
    if (simulation.isDisposed) return;
    frames.current += 1;

    if (runningRef.current) {
      const raceAllowsMovement =
        modeState?.mode !== "race" || modeState.race.phase === "running";
      if (raceAllowsMovement) simulation.advance({ ...input.consume(), aim: aimRef.current }, delta);
      else input.clear();
      for (const event of simulation.drainEvents()) {
        if (event.type === "respawn") {
          input.setYaw(event.headingRadians);
          rig.reset();
        }
        if (event.type === "grapple-release") grappleFx.current.lastRelease = event.reason;
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
    const hook = simulation.grappleView;
    const fx = grappleFx.current;
    fx.sinceBite = hook.phase === "reeling" && fx.phase !== "reeling" ? 0 : fx.sinceBite + delta;
    fx.phase = hook.phase;
    const effect = reelCameraEffect(hook.phase, hook.tension, fx.sinceBite, characterHeight(config), reducedMotion);
    // The shake is a brief positional wobble; the aim below uses the steady pose.
    const wobble = effect.shake * Math.sin(fx.sinceBite * 90);
    camera.position.set(pose.position.x + wobble, pose.position.y + wobble * 0.6, pose.position.z - wobble * 0.4);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    if (camera instanceof PerspectiveCamera) {
      fx.fov = approach(fx.fov, GAMEPLAY_CAMERA_FOV_DEGREES + effect.fovKick, 8, delta);
      if (Math.abs(camera.fov - fx.fov) > 0.01) {
        camera.fov = fx.fov;
        camera.updateProjectionMatrix();
      }
    }
    aimRef.current = {
      origin: { ...pose.position },
      direction: {
        x: pose.target.x - pose.position.x,
        y: pose.target.y - pose.position.y,
        z: pose.target.z - pose.position.z,
      },
    };

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

    if (avatar.current) {
      grapple.current?.update({ view: hook, hand: avatar.current.handPosition(hand), deltaSeconds: delta, reducedMotion });
    }
    const aimShot = runningRef.current && hook.ready ? simulation.previewGrapple(aimRef.current) : null;
    const reticle = grappleReticleRef?.current;
    if (reticle) {
      const state = reticleState(runningRef.current, hook.ready, aimShot?.anchor != null);
      if (reticle.dataset.state !== state) reticle.dataset.state = state;
    }

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
      grapple: {
        phase: hook.phase,
        ready: hook.ready,
        range: simulation.grappleRange,
        aimAnchor: aimShot?.anchor ? aimShot.anchor.kind : null,
        aimRejection: aimShot?.rejection ?? null,
        aimPoint: aimShot?.aimPoint ? [aimShot.aimPoint.x, aimShot.aimPoint.y, aimShot.aimPoint.z] : null,
        target: hook.target ? [hook.target.x, hook.target.y, hook.target.z] : null,
        tension: hook.tension,
        fov: fx.fov,
        lastRelease: fx.lastRelease,
      },
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
      biome: { id: themed ? biomeDefinition.id : "original", seed: biomeLayout?.seed ?? manifest.seed,
        props: biomeLayout?.props.length ?? 0, patches: biomeLayout?.patches.length ?? 0,
        drawCalls: renderer.info.render.calls, geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        propColliders: simulation.propColliderStats.installed,
        propCollidersDeferred: simulation.propColliderStats.deferred,
        fragments: modeState?.requiredFragmentsCollected ?? 0,
        destinations: modeState?.destinationsReached.size ?? 0 },
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
      <SceneLighting bounds={simulation.bounds} style={style} biome={themed ? biomeDefinition : null} />
      {!themed ? <SceneEnvironment
        bounds={simulation.bounds}
        style={style}
        atmosphere={atmosphere}
        reducedMotion={reducedMotion}
      /> : null}
      {themed && biomeLayout ? <BiomeLayer definition={biomeDefinition} layout={biomeLayout}
        quality={effectsQuality} reducedMotion={reducedMotion} onColliders={setPropColliders} /> : null}
      <SceneEntities
        manifest={manifest}
        assets={assets}
        biomeSurface={biomeSurface}
        style={style}
        colorRestoration={colorRestoration}
      />
      <CheckpointMarkers
        manifest={manifest}
        activeId={activeCheckpointId}
        collectedIds={collectedIds}
        style={style}
        reducedMotion={reducedMotion}
        authoredConfig={simulation.authoredConfig}
        runtimeConfig={config}
      />
      {displayedExperience && modeState ? (
        <ModeEntities
          experience={displayedExperience}
          state={modeState}
          reducedMotion={reducedMotion}
          authoredConfig={simulation.authoredConfig}
          runtimeConfig={config}
        />
      ) : null}
      <PlayerAvatar ref={avatar} config={config} reducedMotion={reducedMotion} />
      <GrappleRig ref={grapple} bodyHeight={characterHeight(config)} />
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
