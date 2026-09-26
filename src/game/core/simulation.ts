/**
 * The headless game simulation: capsule locomotion, jump, mantle,
 * checkpoints and respawn, driven on a fixed timestep.
 *
 * Nothing here imports React or Three.js. The renderer calls `advance()`
 * once per animation frame and reads interpolated transforms; the test
 * suite calls `stepFixed()` directly and gets bit-identical behaviour.
 * That is deliberate — the physics invariants in `*.test.ts` exercise the
 * same code path that runs in the browser, not a parallel model of it.
 */

import type { MovementConfig, SceneManifest } from "@shared/index.js";
import {
  AVATAR_TURN_RATE,
  COYOTE_TIME_SECONDS,
  GROUND_STICK_SPEED,
  JUMP_BUFFER_SECONDS,
  MANTLE_DURATION_SECONDS,
  MANTLE_LANDING_SKIN,
  MANTLE_PROBE_INTERVAL_STEPS,
  MANTLE_VERTICAL_FRACTION,
  MAX_FRAME_DELTA_SECONDS,
  AUTOSTEP_MAX_HEIGHT_RATIO,
  AUTOSTEP_MIN_WIDTH_RATIO,
  CONTROLLER_OFFSET_RATIO,
  MAX_SLOPE_CLIMB_RADIANS,
  MIN_SLOPE_SLIDE_RADIANS,
  MIN_STANDABLE_NORMAL_Y,
  SNAP_TO_GROUND_RATIO,
} from "./constants.js";
import {
  collectedCount,
  createCheckpointState,
  nextCheckpoint,
  resetCheckpointState,
  respawnPose,
  updateCheckpoints,
  type CheckpointState,
} from "./checkpoints.js";
import { probeMantle, type MantleProbeResult, type MantleTarget } from "./mantle.js";
import {
  GRAPPLE_COOLDOWN_SECONDS,
  HOOK_RETRACT_SECONDS,
  REEL_ARRIVE_DISTANCE,
  REEL_END_HOP_SPEED,
  REEL_END_NUDGE_SECONDS,
  REEL_END_NUDGE_SPEED,
  REEL_STUCK_SECONDS,
  REEL_TIMEOUT_SECONDS,
  ROPE_TENSION_SECONDS,
  grappleRange,
  hookFlightSeconds,
  mainObjectHeight,
  nextReelSpeed,
  pullOverApex,
  reelSteerPoint,
  segmentHitsProp,
  selectGrappleAnchor,
  type GrappleAim,
  type GrappleAimResult,
  type GrappleAnchor,
} from "./grapple.js";
import { soupBounds } from "./soup.js";
import { capsuleHeight, reseatCapsuleCentre, toMiniatureScale } from "./characterScale.js";
import {
  HEAD_ON_PROP_DEGREES,
  LEDGE_PROP_GROUPS,
  PROP_ACTIVATION_INTERVAL_STEPS,
  PROP_COLLIDER_BUDGET,
  WALL_PROP_GROUPS,
  classifyPropCollider,
  isPropGroups,
  isValidPropCollider,
  propActivationRadius,
  type PropCollider,
} from "./propColliders.js";
import {
  createPhysicsScene,
  initRapier,
  isOutOfPlayArea,
  type PhysicsScene,
  type RapierModule,
} from "./physicsWorld.js";
import { buildSceneCollision, type AssetGeometryMap } from "./sceneCollision.js";
import type { Bounds } from "./soup.js";
import {
  angleDelta,
  approach,
  clamp,
  copy,
  distance,
  dot,
  fromTuple,
  headingForward,
  headingRight,
  length as vecLength,
  normalize,
  sub,
  vec3,
  yawOf,
  type Vec3Like,
} from "./vec.js";

type RapierWorld = InstanceType<RapierModule["World"]>;
type CharacterController = ReturnType<RapierWorld["createCharacterController"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;
type RapierRigidBody = ReturnType<RapierWorld["createRigidBody"]>;

const HEAD_ON_PROP_COS = Math.cos((HEAD_ON_PROP_DEGREES * Math.PI) / 180);

/** How many prop colliders are installed, how many of those are enabled near
 * the player, and how many wait for the player to move clear. */
export interface PropColliderStats {
  installed: number;
  active: number;
  walls: number;
  deferred: number;
}

export interface SimulationInput {
  /** -1 (back) .. 1 (forward), camera-relative. */
  forward: number;
  /** -1 (left) .. 1 (right), camera-relative. */
  right: number;
  /** Edge: true only on the frame the key went down. */
  jump: boolean;
  mantle: boolean;
  respawn: boolean;
  /** Edge: fire the grappling hook, or let go of it while it is out. */
  grapple?: boolean;
  /** The camera ray through the reticle, which the hook is fired along. */
  aim?: GrappleAim | null;
  /** Camera yaw in radians, measured around +Y from +Z. */
  cameraYaw: number;
}

export const NEUTRAL_INPUT: Readonly<SimulationInput> = Object.freeze({
  forward: 0,
  right: 0,
  jump: false,
  mantle: false,
  respawn: false,
  cameraYaw: 0,
});

export type SimulationEvent =
  | { type: "jump" }
  | { type: "land"; impactSpeed: number }
  | { type: "mantle-start"; target: MantleTarget }
  | { type: "mantle-end" }
  | { type: "checkpoint"; id: string; collected: number; total: number }
  | { type: "complete" }
  | { type: "respawn"; reason: "fell" | "manual"; headingRadians: number }
  | { type: "grapple-fire"; hit: boolean }
  | { type: "grapple-attach"; anchor: GrappleAnchor }
  | { type: "grapple-release"; reason: GrappleReleaseReason };

/** Why a hook let go: the player, arrival, a mantle over the lip, being blocked, or a respawn. */
export type GrappleReleaseReason = "player" | "arrived" | "mantle" | "blocked" | "cancelled";

export type GrapplePhase = "idle" | "flying" | "reeling" | "missed";

/**
 * What the renderer needs to draw the hook, all in simulation time. The hand
 * end of the rope is the avatar's, so it is not part of this.
 */
export interface GrappleView {
  phase: GrapplePhase;
  /** Where the hook is heading or holding: the anchor, or a missed shot's end. */
  target: Vec3Like | null;
  normal: Vec3Like | null;
  /** Where the rope wraps over a lip, while the character is still below it. */
  bend: Vec3Like | null;
  /** 0..1 along the flight (flying), or out-and-back for a miss (1 = fully out). */
  progress: number;
  /** 0 slack .. 1 taut. */
  tension: number;
  /** Seconds until the hook can fire again. */
  cooldown: number;
  /** True when a press now would fire (not mantling, cooling down or finished). */
  ready: boolean;
}

export interface SimulationOptions {
  manifest: SceneManifest;
  /** The authored tuning set, as written. See {@link SimulationOptions.miniature}. */
  config: MovementConfig;
  assetGeometry: AssetGeometryMap;
  /**
   * Shrink the character's body to miniature scale before use (default true).
   * See `characterScale.ts` for what this does and does not change; set false
   * to run a config exactly as given, which analysis tools and the physics
   * regression tests do so their numbers stay comparable to the authored
   * tuning.
   */
  miniature?: boolean;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerpVec(a: Vec3Like, b: Vec3Like, t: number): Vec3Like {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export class GameSimulation {
  readonly manifest: SceneManifest;
  /**
   * The tuning actually driving physics, the camera and the avatar — the
   * authored config after the miniature-scale transform. Renderers must read
   * scale from here rather than from the shared default, or the visible
   * character will drift away from its own collider.
   */
  readonly config: MovementConfig;
  /** The tuning as authored, before scaling. Saved manifests are positioned
   * against this one. */
  readonly authoredConfig: MovementConfig;
  readonly scene: PhysicsScene;
  readonly checkpointState: CheckpointState;
  readonly warnings: string[];

  private readonly RAPIER: RapierModule;
  private readonly controller: CharacterController;

  private position: Vec3Like;
  private previousPosition: Vec3Like;
  private velocity: Vec3Like = vec3();
  private grounded = false;
  private facingYaw: number;
  private previousFacingYaw: number;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  private mantleElapsed: number | null = null;
  private mantleStart: Vec3Like = vec3();
  private mantleActiveTarget: MantleTarget | null = null;
  private lastProbe: MantleProbeResult = { target: null, rejection: null };

  private grapplePhase: GrapplePhase = "idle";
  private grappleAnchor: GrappleAnchor | null = null;
  private grappleMissPoint: Vec3Like | null = null;
  private grappleElapsed = 0;
  private grappleFlight = 0;
  private grappleCooldown = 0;
  private reelSpeed = 0;
  private reelBest = Infinity;
  private reelStuck = 0;
  /** The anchor's waypoint until the reel has passed it. */
  private reelWaypoint: Vec3Like | null = null;
  /** Hook reach for this level, from the main object's height (`grapple.ts`). */
  readonly grappleRange: number;

  private accumulator = 0;
  private alpha = 0;
  private pendingJump = false;
  private pendingMantle = false;
  private pendingRespawn = false;
  private pendingGrapple = false;

  private measuredSpeed = 0;
  private propEntries: { collider: RapierCollider; data: PropCollider; enabled: boolean }[] = [];
  /** One fixed body owns every prop collider, so a set is removed in one call. */
  private propBody: RapierRigidBody | null = null;
  private readonly propActiveRadius: number;
  private propStepsSinceRefresh = 0;
  private propWalls = 0;
  /** Props that would have spawned around the player; installed once clear. */
  private deferredProps: { data: PropCollider; wall: boolean }[] = [];
  private events: SimulationEvent[] = [];
  private stepCount = 0;
  private elapsedSeconds = 0;
  private disposed = false;

  /** True once `dispose()` has freed the physics world; no query may follow. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Builds the physics world for a manifest. `assetGeometry` maps
   * `AssetReference.id` to the asset-local collision triangles decoded from
   * that asset — the same triangles the renderer draws.
   */
  static async create(options: SimulationOptions): Promise<GameSimulation> {
    const RAPIER = await initRapier();
    return new GameSimulation(RAPIER, options);
  }

  constructor(RAPIER: RapierModule, options: SimulationOptions) {
    this.RAPIER = RAPIER;
    this.manifest = options.manifest;
    this.authoredConfig = options.config;
    this.config =
      options.miniature === false ? options.config : toMiniatureScale(options.config);

    const collision = buildSceneCollision(options.manifest, options.assetGeometry);
    this.scene = createPhysicsScene(RAPIER, collision, options.manifest, this.config);
    this.checkpointState = createCheckpointState(options.manifest);
    this.warnings = [...this.scene.warnings, ...this.checkpointState.warnings];

    const radius = this.config.characterRadius;
    this.controller = this.scene.world.createCharacterController(radius * CONTROLLER_OFFSET_RATIO);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB_RADIANS);
    this.controller.setMinSlopeSlideAngle(MIN_SLOPE_SLIDE_RADIANS);
    this.controller.enableAutostep(radius * AUTOSTEP_MAX_HEIGHT_RATIO, radius * AUTOSTEP_MIN_WIDTH_RATIO, false);
    this.controller.enableSnapToGround(radius * SNAP_TO_GROUND_RATIO);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.propActiveRadius = propActivationRadius(this.config);

    const meshBounds = collision.entities.flatMap((entry) => {
      const entity = options.manifest.entities.find((candidate) => candidate.id === entry.entityId);
      const bounds = entity?.kind === "generated-mesh" && entry.shape.kind === "trimesh" ? soupBounds(entry.shape.soup) : null;
      return bounds ? [bounds] : [];
    });
    this.grappleRange = grappleRange(mainObjectHeight(meshBounds, this.scene.bounds));

    this.position = this.seat(fromTuple(options.manifest.spawn.position));
    this.previousPosition = copy(this.position);
    this.facingYaw = options.manifest.spawn.headingRadians;
    this.previousFacingYaw = this.facingYaw;
  }

  // ---- read-only state -------------------------------------------------

  get playerPosition(): Vec3Like {
    return copy(this.position);
  }

  get playerVelocity(): Vec3Like {
    return copy(this.velocity);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isMantling(): boolean {
    return this.mantleElapsed !== null;
  }

  get mantleTarget(): MantleTarget | null {
    return this.lastProbe.target;
  }

  get mantleRejection(): MantleProbeResult["rejection"] {
    return this.lastProbe.rejection;
  }

  get isReeling(): boolean {
    return this.grapplePhase === "reeling";
  }

  /** True when a hook press now would fire. */
  get grappleReady(): boolean {
    return (
      this.grapplePhase === "idle" &&
      this.grappleCooldown <= 0 &&
      this.mantleElapsed === null &&
      !this.checkpointState.completed
    );
  }

  get grappleView(): GrappleView {
    const phase = this.grapplePhase;
    let progress = 0;
    let tension = 0;
    if (phase === "flying") {
      progress = this.grappleFlight > 0 ? clamp(this.grappleElapsed / this.grappleFlight, 0, 1) : 1;
    } else if (phase === "reeling") {
      progress = 1;
      tension = clamp(this.grappleElapsed / ROPE_TENSION_SECONDS, 0, 1);
    } else if (phase === "missed") {
      const out = this.grappleFlight;
      progress = this.grappleElapsed <= out
        ? clamp(this.grappleElapsed / out, 0, 1)
        : clamp(1 - (this.grappleElapsed - out) / HOOK_RETRACT_SECONDS, 0, 1);
    }
    const target = phase === "missed" ? this.grappleMissPoint : phase === "idle" ? null : this.grappleAnchor?.point ?? null;
    const normal = phase === "flying" || phase === "reeling" ? this.grappleAnchor?.normal ?? null : null;
    const bend = phase === "flying" || (phase === "reeling" && this.reelWaypoint !== null)
      ? this.grappleAnchor?.bend ?? null
      : null;
    return {
      phase,
      target: target ? copy(target) : null,
      normal: normal ? copy(normal) : null,
      bend: bend ? copy(bend) : null,
      progress,
      tension,
      cooldown: this.grappleCooldown,
      ready: this.grappleReady,
    };
  }

  /**
   * The shot a hook press would fire along `aim` right now, for the reticle.
   * Read-only: the same query the press itself runs.
   */
  previewGrapple(aim: GrappleAim | null | undefined): GrappleAimResult {
    if (this.disposed) return { anchor: null, rejection: "no-aim", aimPoint: null };
    return selectGrappleAnchor(this.mantleContext(), this.position, aim, this.grappleRange, this.ropeHitsProp);
  }

  /** Every installed prop blocks the rope, including those disabled far away. */
  private readonly ropeHitsProp = (hand: Vec3Like, point: Vec3Like): boolean =>
    this.propEntries.some((entry) => segmentHitsProp(hand, point, entry.data));

  /** Intended control-space horizontal speed. */
  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * Horizontal speed the capsule actually achieved last step. Differs from
   * `horizontalSpeed` when the character is pressed against a wall, which
   * is what the walk animation and QA diagnostics need to know.
   */
  get measuredHorizontalSpeed(): number {
    return this.measuredSpeed;
  }

  get checkpointsCollected(): number {
    return collectedCount(this.checkpointState);
  }

  get checkpointsTotal(): number {
    return this.checkpointState.checkpoints.length;
  }

  get nextCheckpointId(): string | null {
    return nextCheckpoint(this.checkpointState)?.id ?? null;
  }

  get nextCheckpointPosition(): Vec3Like | null {
    const target = nextCheckpoint(this.checkpointState);
    return target ? copy(target.position) : null;
  }

  get completed(): boolean {
    return this.checkpointState.completed;
  }

  get bounds(): Bounds {
    return this.scene.bounds;
  }

  get fixedStepsRun(): number {
    return this.stepCount;
  }

  get simulatedSeconds(): number {
    return this.elapsedSeconds;
  }

  get triangleCount(): number {
    return this.scene.triangleCount;
  }

  get propColliderStats(): PropColliderStats {
    return {
      installed: this.propEntries.length,
      active: this.propEntries.reduce((count, entry) => count + (entry.enabled ? 1 : 0), 0),
      walls: this.propWalls,
      deferred: this.deferredProps.length,
    };
  }

  /**
   * Replaces the solid biome props with `colliders` (an empty list removes
   * them). Called whenever the drawn look changes; the level's own collision
   * is never touched. Props lower than the autostep height are skipped, tall
   * ones become walls the mantle probe will not climb (`propColliders.ts`).
   * A prop that would appear around the player waits until they move clear,
   * so a look switch can never trap the capsule inside a trunk. Only props
   * near the player are enabled (`propActivationRadius`).
   */
  setPropColliders(colliders: readonly PropCollider[]): PropColliderStats {
    if (this.disposed) return { installed: 0, active: 0, walls: 0, deferred: 0 };
    const world = this.scene.world;
    if (this.propBody) world.removeRigidBody(this.propBody);
    this.propBody = null;
    this.propEntries = [];
    this.propWalls = 0;
    this.deferredProps = [];
    this.propStepsSinceRefresh = 0;

    const stepHeight = this.config.characterRadius * AUTOSTEP_MAX_HEIGHT_RATIO;
    const bodyHeight = capsuleHeight(this.config);
    let accepted = 0;
    for (const data of colliders) {
      if (accepted >= PROP_COLLIDER_BUDGET) break;
      if (!isValidPropCollider(data)) continue;
      const kind = classifyPropCollider(data.height, stepHeight, bodyHeight);
      if (kind === "skip") continue;
      accepted += 1;
      const wall = kind === "wall";
      if (this.propOverlapsPlayer(data)) this.deferredProps.push({ data, wall });
      else this.installProp(data, wall);
    }
    world.updateSceneQueries();
    return this.propColliderStats;
  }

  private propShape(data: PropCollider) {
    const { shape } = data;
    return shape.kind === "cuboid"
      ? new this.RAPIER.Cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
      : shape.kind === "capsule"
        ? new this.RAPIER.Capsule(shape.halfHeight, shape.radius)
        : new this.RAPIER.Cylinder(shape.halfHeight, shape.radius);
  }

  private installProp(data: PropCollider, wall: boolean): void {
    const { position, rotation } = data;
    const enabled = this.propNearPlayer(data);
    const desc = new this.RAPIER.ColliderDesc(this.propShape(data));
    desc
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setCollisionGroups(wall ? WALL_PROP_GROUPS : LEDGE_PROP_GROUPS)
      .setEnabled(enabled);
    this.propBody ??= this.scene.world.createRigidBody(this.RAPIER.RigidBodyDesc.fixed());
    this.propEntries.push({ collider: this.scene.world.createCollider(desc, this.propBody), data, enabled });
    if (wall) this.propWalls += 1;
  }

  private propNearPlayer(data: PropCollider): boolean {
    const gap = Math.hypot(this.position.x - data.position.x, this.position.z - data.position.z);
    return gap - data.reach <= this.propActiveRadius;
  }

  /**
   * Enables the props within reach of the character and disables the rest:
   * an enabled static collider costs Rapier about a microsecond every step
   * whether or not anything is near it, a disabled one nothing.
   */
  private refreshPropActivation(): void {
    let changed = false;
    for (const entry of this.propEntries) {
      const near = this.propNearPlayer(entry.data);
      if (near === entry.enabled) continue;
      entry.collider.setEnabled(near);
      entry.enabled = near;
      changed = true;
    }
    if (changed) this.scene.world.updateSceneQueries();
  }

  /** True when the prop's shape touches the capsule, grown by half a radius. */
  private propOverlapsPlayer(data: PropCollider): boolean {
    const { characterRadius, characterHalfHeight } = this.config;
    const margin = characterRadius * 0.5;
    const gap = Math.hypot(this.position.x - data.position.x, this.position.z - data.position.z);
    if (gap > data.reach + characterRadius + margin) return false;
    const capsule = new this.RAPIER.Capsule(characterHalfHeight, characterRadius + margin);
    return this.propShape(data).intersectsShape(data.position, data.rotation, capsule, this.position, { x: 0, y: 0, z: 0, w: 1 });
  }

  private installClearedProps(): void {
    const waiting = this.deferredProps;
    this.deferredProps = [];
    let installed = false;
    for (const entry of waiting) {
      if (this.propOverlapsPlayer(entry.data)) {
        this.deferredProps.push(entry);
      } else {
        this.installProp(entry.data, entry.wall);
        installed = true;
      }
    }
    if (installed) this.scene.world.updateSceneQueries();
  }

  /**
   * World Y of the first surface below the character, or null if there is
   * none within `maxDrop`. Used for the contact shadow and QA diagnostics;
   * it never affects the simulation.
   */
  groundHeightBelow(maxDrop = 4): number | null {
    const feetY = this.position.y - this.config.characterHalfHeight - this.config.characterRadius;
    const hit = this.scene.world.castRay(
      new this.RAPIER.Ray({ x: this.position.x, y: this.position.y, z: this.position.z }, { x: 0, y: -1, z: 0 }),
      this.config.characterHalfHeight + this.config.characterRadius + maxDrop,
      true,
      this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.scene.playerCollider,
    );
    if (!hit) return null;
    const surfaceY = this.position.y - hit.timeOfImpact;
    // Guard against a hit registered above the feet (grazing a step edge).
    return surfaceY > feetY + 1e-3 ? feetY : surfaceY;
  }

  /** Render position, interpolated between the last two fixed steps. */
  interpolatedPosition(): Vec3Like {
    return lerpVec(this.previousPosition, this.position, this.alpha);
  }

  /** Render yaw, interpolated between the last two fixed steps. */
  interpolatedYaw(): number {
    return this.previousFacingYaw + angleDelta(this.previousFacingYaw, this.facingYaw) * this.alpha;
  }

  drainEvents(): SimulationEvent[] {
    if (this.events.length === 0) return [];
    const drained = this.events;
    this.events = [];
    return drained;
  }

  // ---- driving ---------------------------------------------------------

  /**
   * Runs however many fixed steps the elapsed wall-clock time has earned,
   * capped at `MovementConfig.maxSubSteps` so a stalled tab cannot trigger
   * an unbounded catch-up. Returns the number of steps executed.
   */
  advance(input: SimulationInput, frameDeltaSeconds: number): number {
    if (this.disposed) return 0;

    // Latch edge inputs so a key pressed during a frame that runs zero
    // fixed steps is still honoured on the next one.
    if (input.jump) this.pendingJump = true;
    if (input.mantle) this.pendingMantle = true;
    if (input.respawn) this.pendingRespawn = true;
    if (input.grapple) this.pendingGrapple = true;

    const h = this.config.fixedTimestepSeconds;
    this.accumulator += Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA_SECONDS);

    let steps = 0;
    while (this.accumulator >= h && steps < this.config.maxSubSteps) {
      this.stepFixed({
        ...input,
        jump: this.pendingJump,
        mantle: this.pendingMantle,
        respawn: this.pendingRespawn,
        grapple: this.pendingGrapple,
      });
      this.pendingJump = false;
      this.pendingMantle = false;
      this.pendingRespawn = false;
      this.pendingGrapple = false;
      this.accumulator -= h;
      steps += 1;
    }

    // Drop any remaining backlog rather than running in slow motion.
    if (this.accumulator >= h) this.accumulator = 0;
    this.alpha = clamp(this.accumulator / h, 0, 1);
    return steps;
  }

  /** Exactly one fixed timestep. Deterministic; used directly by tests. */
  stepFixed(input: SimulationInput): void {
    if (this.disposed) return;

    const h = this.config.fixedTimestepSeconds;
    this.previousPosition = copy(this.position);
    this.previousFacingYaw = this.facingYaw;

    if (input.respawn) {
      this.respawn("manual");
    } else if (this.mantleElapsed !== null) {
      this.advanceMantle(h);
    } else {
      this.locomotionStep(input, h);
    }

    if (isOutOfPlayArea(this.position, this.scene.limits)) {
      this.respawn("fell");
    }

    if (this.deferredProps.length > 0) this.installClearedProps();
    if (this.propEntries.length > 0 && ++this.propStepsSinceRefresh >= PROP_ACTIVATION_INTERVAL_STEPS) {
      this.propStepsSinceRefresh = 0;
      this.refreshPropActivation();
    }

    const update = updateCheckpoints(this.checkpointState, this.position);
    if (update.collectedId) {
      this.events.push({
        type: "checkpoint",
        id: update.collectedId,
        collected: this.checkpointsCollected,
        total: this.checkpointsTotal,
      });
      if (update.justCompleted) this.events.push({ type: "complete" });
    }

    this.measuredSpeed =
      Math.hypot(this.position.x - this.previousPosition.x, this.position.z - this.previousPosition.z) / h;

    this.stepCount += 1;
    this.elapsedSeconds += h;
  }

  private locomotionStep(input: SimulationInput, h: number): void {
    const config = this.config;

    const hook = this.grappleStep(input, h);
    if (hook === "reeled") return;
    const jumpPressed = input.jump && hook !== "released-by-jump";

    const forwardDir = headingForward(input.cameraYaw);
    const rightDir = headingRight(input.cameraYaw);
    let moveX = forwardDir.x * input.forward + rightDir.x * input.right;
    let moveZ = forwardDir.z * input.forward + rightDir.z * input.right;
    let moveMagnitude = Math.hypot(moveX, moveZ);
    if (moveMagnitude > 1) {
      moveX /= moveMagnitude;
      moveZ /= moveMagnitude;
      moveMagnitude = 1;
    }

    const facingDir =
      moveMagnitude > 0.01 ? { x: moveX, y: 0, z: moveZ } : forwardDir;

    // A fresh probe on the press, so E never acts on a stale cached result.
    if (input.mantle) {
      const probe = probeMantle(this.mantleContext(), this.position, facingDir);
      this.lastProbe = probe;
      if (probe.target) {
        this.beginMantle(probe.target, facingDir);
        return;
      }
    }

    const accelRate = this.grounded ? config.groundFriction : config.groundFriction * config.airControl;
    this.velocity.x = approach(this.velocity.x, moveX * config.walkSpeed, accelRate, h);
    this.velocity.z = approach(this.velocity.z, moveZ * config.walkSpeed, accelRate, h);

    if (jumpPressed) this.jumpBufferTimer = JUMP_BUFFER_SECONDS;

    const canJump = this.grounded || this.coyoteTimer > 0;
    let jumped = false;
    if (this.jumpBufferTimer > 0 && canJump) {
      this.velocity.y = Math.sqrt(2 * config.gravity * config.jumpHeight);
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
      jumped = true;
      this.events.push({ type: "jump" });
    } else {
      this.velocity.y -= config.gravity * h;
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - h);
    }

    // Constant downward bias while grounded; without it the controller
    // oscillates between grounded and airborne and the capsule jitters.
    if (this.grounded && !jumped && this.velocity.y < 0) {
      this.velocity.y = -GROUND_STICK_SPEED;
    }

    const wasGrounded = this.grounded;
    this.controller.computeColliderMovement(
      this.scene.playerCollider,
      { x: this.velocity.x * h, y: this.velocity.y * h, z: this.velocity.z * h },
      this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const movement = this.controller.computedMovement();
    if (moveMagnitude > 0.01 && this.propEntries.length > 0) {
      const contact = this.headOnPropContact(moveX / moveMagnitude, moveZ / moveMagnitude);
      if (contact) {
        // Up to the trunk, and no further round it.
        movement.x = contact.x;
        movement.z = contact.z;
      }
    }
    const nextPosition = {
      x: this.position.x + movement.x,
      y: this.position.y + movement.y,
      z: this.position.z + movement.z,
    };

    // Rapier's own grounded flag drops out for a step here and there: its
    // normal-nudge lifts the capsule a few millimetres past the controller
    // offset while moving, and on a triangle mesh the contact normal also
    // shifts across triangle seams. Treating those frames as airborne would
    // flicker the animation state and switch to air control mid-stride, so
    // grounding is confirmed with an explicit downward probe using the same
    // criterion snap-to-ground uses.
    this.grounded =
      this.controller.computedGrounded() ||
      (this.velocity.y <= 0 && this.standableGroundBelow(nextPosition));

    if (this.velocity.y > 0) {
      // Outward normal of a ceiling points down; stop rising into it
      // instead of grinding against it for the rest of the jump.
      const collisions = this.controller.numComputedCollisions();
      for (let i = 0; i < collisions; i += 1) {
        const collision = this.controller.computedCollision(i);
        if (collision && collision.normal1.y < -0.5) {
          this.velocity.y = 0;
          break;
        }
      }
    }

    if (this.grounded && this.velocity.y <= 0) {
      if (!wasGrounded) this.events.push({ type: "land", impactSpeed: Math.abs(this.velocity.y) });
      this.velocity.y = 0;
    }

    // `velocity` stays the *intended* control-space velocity rather than
    // being overwritten with the solver's corrected movement. Clamping it
    // to what the solver allowed sounds tidier, but it means a capsule
    // touching a kerb re-accelerates from zero every step and can never
    // build the forward push needed to climb it — the character sticks on
    // 4cm lips. Intended velocity is already bounded by `walkSpeed`, so
    // nothing accumulates; measured speed is tracked separately below for
    // animation and diagnostics.
    if (wasGrounded && !this.grounded && !jumped) {
      this.coyoteTimer = COYOTE_TIME_SECONDS;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - h);
    }

    this.applyTranslation(nextPosition);

    if (moveMagnitude > 0.01) {
      const targetYaw = yawOf({ x: moveX, y: 0, z: moveZ });
      this.facingYaw += angleDelta(this.facingYaw, targetYaw) * (1 - Math.exp(-AVATAR_TURN_RATE * h));
    }

    if (this.stepCount % MANTLE_PROBE_INTERVAL_STEPS === 0) {
      this.lastProbe = probeMantle(this.mantleContext(), this.position, facingDir);
    }
  }

  // ---- grappling hook ---------------------------------------------------

  /**
   * The hook's share of a locomotion step: a press fires it (or lets go while
   * it is out), a hook in flight bites once it arrives, and while attached the
   * reel moves the capsule instead of walking. Returns "reeled" when the reel
   * owned this step, and "released-by-jump" when a jump press was spent
   * letting go, so it does not also queue a jump.
   */
  private grappleStep(input: SimulationInput, h: number): "reeled" | "released-by-jump" | "none" {
    if (this.grappleCooldown > 0) this.grappleCooldown = Math.max(0, this.grappleCooldown - h);

    if (input.grapple) {
      if (this.grapplePhase === "flying" || this.grapplePhase === "reeling") {
        this.releaseGrapple("player");
        return "none";
      }
      if (this.grappleReady) this.fireGrapple(input.aim);
    }

    switch (this.grapplePhase) {
      case "flying":
        this.grappleElapsed += h;
        if (this.grappleElapsed >= this.grappleFlight) this.attachGrapple();
        return "none";
      case "missed":
        this.grappleElapsed += h;
        if (this.grappleElapsed >= this.grappleFlight + HOOK_RETRACT_SECONDS) this.clearGrapple();
        return "none";
      case "reeling":
        if (input.jump) {
          this.releaseGrapple("player");
          return "released-by-jump";
        }
        this.grappleElapsed += h;
        this.reelStep(h);
        return "reeled";
      default:
        return "none";
    }
  }

  private fireGrapple(aim: GrappleAim | null | undefined): void {
    const shot = selectGrappleAnchor(this.mantleContext(), this.position, aim, this.grappleRange, this.ropeHitsProp);
    this.grappleElapsed = 0;
    if (shot.anchor) {
      this.grapplePhase = "flying";
      this.grappleAnchor = shot.anchor;
      this.grappleFlight = hookFlightSeconds(shot.anchor.distance);
      this.events.push({ type: "grapple-fire", hit: true });
    } else if (shot.aimPoint) {
      // Nothing to bite: the hook flies out, snaps back, and the cooldown
      // runs from the shot so a miss cannot be spammed.
      this.grapplePhase = "missed";
      this.grappleMissPoint = shot.aimPoint;
      this.grappleFlight = hookFlightSeconds(distance(this.position, shot.aimPoint));
      this.grappleCooldown = GRAPPLE_COOLDOWN_SECONDS;
      this.events.push({ type: "grapple-fire", hit: false });
    }
  }

  private attachGrapple(): void {
    const anchor = this.grappleAnchor;
    if (!anchor) {
      this.clearGrapple();
      return;
    }
    this.grapplePhase = "reeling";
    this.grappleElapsed = 0;
    this.reelWaypoint = anchor.waypoint ? copy(anchor.waypoint) : null;
    const toGoal = sub(this.reelWaypoint ?? anchor.target, this.position);
    const goalDistance = vecLength(toGoal);
    // Whatever speed the character already has toward the anchor carries in.
    this.reelSpeed = goalDistance > 1e-6 ? Math.max(0, dot(this.velocity, toGoal) / goalDistance) : 0;
    this.reelBest = this.reelRemaining();
    this.reelStuck = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.events.push({ type: "grapple-attach", anchor });
  }

  /** Path length left: to the waypoint (while one is pending), then to the target. */
  private reelRemaining(): number {
    const anchor = this.grappleAnchor;
    if (!anchor) return 0;
    return this.reelWaypoint
      ? distance(this.position, this.reelWaypoint) + distance(this.reelWaypoint, anchor.target)
      : distance(this.position, anchor.target);
  }

  /**
   * One reel step through the character controller: steer at a point lofted
   * above the next goal (the waypoint, then the target), accelerate up to the
   * reel speed and brake into the arrival. The controller slides the capsule
   * along whatever it meets and never lets it into geometry; lack of
   * progress ends the reel.
   */
  private reelStep(h: number): void {
    const anchor = this.grappleAnchor;
    if (!anchor) {
      this.clearGrapple();
      return;
    }
    const target = anchor.target;
    const settle = this.config.characterRadius;
    // Round the waypoint's corner a little early at speed, so the turn over
    // the lip is a curve rather than a snap.
    if (this.reelWaypoint && distance(this.position, this.reelWaypoint) <= Math.max(settle * 2, this.reelSpeed * h * 4)) {
      this.reelWaypoint = null;
      this.reelBest = this.reelRemaining();
      this.reelStuck = 0;
    }
    if (!this.reelWaypoint && distance(this.position, target) <= settle) {
      this.finishReel("arrived");
      return;
    }

    // A reel covers ground several times faster than walking, which the
    // periodic prop refresh is sized for; keep the props around it live.
    if (this.propEntries.length > 0) this.refreshPropActivation();

    const goal = this.reelWaypoint ?? target;
    // The first leg is lofted; the leg on from a waypoint is the straight
    // line that was swept when the hook was aimed.
    const steer = this.reelWaypoint || !anchor.waypoint ? reelSteerPoint(this.position, goal) : goal;
    const direction = normalize(sub(steer, this.position));
    this.reelSpeed = nextReelSpeed(this.reelSpeed, this.reelRemaining(), this.config.walkSpeed, h);
    const stepLength = Math.min(this.reelSpeed * h, distance(this.position, goal));

    this.controller.computeColliderMovement(
      this.scene.playerCollider,
      { x: direction.x * stepLength, y: direction.y * stepLength, z: direction.z * stepLength },
      this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const movement = this.controller.computedMovement();
    this.velocity.x = direction.x * this.reelSpeed;
    this.velocity.y = direction.y * this.reelSpeed;
    this.velocity.z = direction.z * this.reelSpeed;
    this.grounded = false;
    this.applyTranslation({
      x: this.position.x + movement.x,
      y: this.position.y + movement.y,
      z: this.position.z + movement.z,
    });

    if (Math.hypot(direction.x, direction.z) > 0.05) {
      const targetYaw = yawOf({ x: direction.x, y: 0, z: direction.z });
      this.facingYaw += angleDelta(this.facingYaw, targetYaw) * (1 - Math.exp(-AVATAR_TURN_RATE * h));
    }

    const now = this.reelRemaining();
    if (now < this.reelBest - 1e-3) {
      this.reelBest = now;
      this.reelStuck = 0;
    } else {
      this.reelStuck += h;
    }

    const nearAnchor = distance(this.position, anchor.point) <= REEL_ARRIVE_DISTANCE;
    if ((!this.reelWaypoint && now <= settle) || (anchor.kind === "wall" && nearAnchor)) {
      this.finishReel("arrived");
    } else if (nearAnchor && this.stepCount % MANTLE_PROBE_INTERVAL_STEPS === 0 && this.tryReelMantle()) {
      // Pulled up beside the lip: the mantle takes it from here.
    } else if (this.reelStuck >= REEL_STUCK_SECONDS || this.grappleElapsed >= REEL_TIMEOUT_SECONDS) {
      this.finishReel("blocked");
    }
  }

  /** Horizontal direction from the character toward the hook, else its facing. */
  private towardAnchor(): Vec3Like {
    const anchor = this.grappleAnchor;
    if (anchor) {
      const dx = anchor.point.x - this.position.x;
      const dz = anchor.point.z - this.position.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-4) return { x: dx / length, y: 0, z: dz / length };
    }
    return headingForward(this.facingYaw);
  }

  /** Ends the reel in a mantle when one is on offer toward the hook. */
  private tryReelMantle(): boolean {
    const toward = this.towardAnchor();
    const probe = probeMantle(this.mantleContext(), this.position, toward);
    if (!probe.target) return false;
    this.clearGrapple();
    this.grappleCooldown = GRAPPLE_COOLDOWN_SECONDS;
    this.events.push({ type: "grapple-release", reason: "mantle" });
    this.beginMantle(probe.target, toward);
    return true;
  }

  /**
   * A reel toward a ledge or surface that stalled at the rim: pull the
   * character over onto its target with the mantle's scripted move, when a
   * sweep proves the way clear (`pullOverApex`).
   */
  private tryPullOver(): boolean {
    const anchor = this.grappleAnchor;
    if (!anchor || anchor.kind === "wall") return false;
    const destination = anchor.target;
    const apex = pullOverApex(this.mantleContext(), this.position, destination);
    if (!apex) return false;
    const halfTotal = this.config.characterHalfHeight + this.config.characterRadius;
    const feetY = this.position.y - halfTotal;
    const ledgeTopY = destination.y - halfTotal - MANTLE_LANDING_SKIN;
    const toward = this.towardAnchor();
    this.clearGrapple();
    this.grappleCooldown = GRAPPLE_COOLDOWN_SECONDS;
    this.events.push({ type: "grapple-release", reason: "mantle" });
    this.beginMantle(
      { destination: copy(destination), apex, ledgeTopY, ledgeHeight: ledgeTopY - feetY, faceDistance: 0 },
      toward,
    );
    return true;
  }

  /**
   * The reel is over. Standing on the target: stop there. Otherwise mantle
   * onto the ledge if one is in reach (or pull over onto the target), or stop
   * and drop with a small hop, nudged toward where the hook was pulling.
   */
  private finishReel(reason: "arrived" | "blocked"): void {
    const anchor = this.grappleAnchor;
    const onTarget = anchor !== null && anchor.kind !== "wall" && distance(this.position, anchor.target) <= this.config.characterRadius * 2;
    if (!onTarget && (this.tryReelMantle() || this.tryPullOver())) return;
    const nudge = anchor && !onTarget ? sub(anchor.target, this.position) : null;
    const nudgeLength = nudge ? Math.hypot(nudge.x, nudge.z) : 0;
    const nudgeSpeed = Math.min(REEL_END_NUDGE_SPEED, nudgeLength / REEL_END_NUDGE_SECONDS);
    this.clearGrapple();
    this.grappleCooldown = GRAPPLE_COOLDOWN_SECONDS;
    this.velocity.x = nudge && nudgeLength > 1e-4 ? (nudge.x / nudgeLength) * nudgeSpeed : 0;
    this.velocity.z = nudge && nudgeLength > 1e-4 ? (nudge.z / nudgeLength) * nudgeSpeed : 0;
    this.velocity.y = onTarget ? 0 : REEL_END_HOP_SPEED;
    this.events.push({ type: "grapple-release", reason });
  }

  /** Lets go. A reel's momentum is kept; gravity takes over from here. */
  private releaseGrapple(reason: GrappleReleaseReason): void {
    this.clearGrapple();
    this.grappleCooldown = GRAPPLE_COOLDOWN_SECONDS;
    this.events.push({ type: "grapple-release", reason });
  }

  /** Drops the hook with no event and no cooldown (respawn, restart). */
  private clearGrapple(): void {
    this.grapplePhase = "idle";
    this.grappleAnchor = null;
    this.grappleMissPoint = null;
    this.grappleElapsed = 0;
    this.grappleFlight = 0;
    this.reelSpeed = 0;
    this.reelBest = Infinity;
    this.reelStuck = 0;
    this.reelWaypoint = null;
  }

  /**
   * When this step's move pressed the capsule nearly head-on into the side of
   * a round prop (`propColliders.ts`), the move made before touching it;
   * otherwise null. Flat prop faces are left to the controller: their
   * contact is stable, so it only ever slides along them as it does walls.
   */
  private headOnPropContact(dirX: number, dirZ: number): Vec3Like | null {
    const { Capsule, Cylinder } = this.RAPIER.ShapeType;
    const collisions = this.controller.numComputedCollisions();
    for (let i = 0; i < collisions; i += 1) {
      const collision = this.controller.computedCollision(i);
      const collider = collision?.collider;
      if (!collision || !collider || !isPropGroups(collider.collisionGroups())) continue;
      const shape = collider.shapeType();
      if (shape !== Capsule && shape !== Cylinder) continue;
      const { x, z } = collision.normal1;
      const side = Math.hypot(x, z);
      // Standing on a prop's top, or brushing its rounded crown, is not a push.
      if (side < 0.7) continue;
      if (-(x * dirX + z * dirZ) / side >= HEAD_ON_PROP_COS) return collision.translationDeltaApplied;
    }
    return null;
  }

  /**
   * True when there is standable ground directly under the capsule within
   * the snap-to-ground distance. Queried from the capsule's lower sphere
   * centre, so the reported distance is measured from the feet.
   */
  private standableGroundBelow(position: Vec3Like): boolean {
    const radius = this.config.characterRadius;
    const reach = radius + radius * SNAP_TO_GROUND_RATIO;
    const hit = this.scene.world.castRayAndGetNormal(
      new this.RAPIER.Ray(
        { x: position.x, y: position.y - this.config.characterHalfHeight, z: position.z },
        { x: 0, y: -1, z: 0 },
      ),
      reach,
      true,
      this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.scene.playerCollider,
    );
    return hit !== null && hit.normal.y >= MIN_STANDABLE_NORMAL_Y;
  }

  private mantleContext() {
    return {
      RAPIER: this.RAPIER,
      world: this.scene.world,
      playerCollider: this.scene.playerCollider,
      config: this.config,
    };
  }

  private beginMantle(target: MantleTarget, facingDir: Vec3Like): void {
    if (this.grapplePhase === "flying" || this.grapplePhase === "reeling") this.releaseGrapple("mantle");
    this.mantleElapsed = 0;
    this.mantleStart = copy(this.position);
    this.mantleActiveTarget = target;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.facingYaw = yawOf(facingDir);
    this.events.push({ type: "mantle-start", target });
  }

  /**
   * Scripted movement along the path `probeMantle` already proved clear:
   * straight up to the apex, then forward onto the ledge.
   */
  private advanceMantle(h: number): void {
    const target = this.mantleActiveTarget;
    if (this.mantleElapsed === null || !target) {
      this.mantleElapsed = null;
      return;
    }

    this.mantleElapsed += h;
    const t = clamp(this.mantleElapsed / MANTLE_DURATION_SECONDS, 0, 1);

    let next: Vec3Like;
    if (t <= MANTLE_VERTICAL_FRACTION) {
      next = lerpVec(this.mantleStart, target.apex, smoothstep(t / MANTLE_VERTICAL_FRACTION));
    } else {
      const k = (t - MANTLE_VERTICAL_FRACTION) / (1 - MANTLE_VERTICAL_FRACTION);
      next = lerpVec(target.apex, target.destination, smoothstep(k));
    }

    this.applyTranslation(next);

    if (t >= 1) {
      this.applyTranslation(target.destination);
      this.mantleElapsed = null;
      this.mantleActiveTarget = null;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = 0;
      this.grounded = false;
      this.lastProbe = { target: null, rejection: null };
      this.events.push({ type: "mantle-end" });
    }
  }

  private applyTranslation(next: Vec3Like): void {
    this.scene.playerBody.setNextKinematicTranslation(next);
    this.scene.world.step();
    const t = this.scene.playerBody.translation();
    this.position = { x: t.x, y: t.y, z: t.z };
  }

  /**
   * A manifest position is the capsule's centre as the author placed it, for
   * the authored capsule height. Re-seat it so the feet land on the surface
   * the author meant rather than dropping in from above.
   */
  private seat(position: Vec3Like): Vec3Like {
    return reseatCapsuleCentre(position, this.authoredConfig, this.config);
  }

  /** Sends the player to the last activated checkpoint (or the spawn). */
  respawn(reason: "fell" | "manual"): void {
    const pose = respawnPose(this.checkpointState, this.manifest);
    this.teleport(this.seat(fromTuple(pose.position)), pose.headingRadians);
    this.events.push({ type: "respawn", reason, headingRadians: pose.headingRadians });
  }

  /** Full restart: back to the level spawn with no checkpoints collected. */
  reset(): void {
    resetCheckpointState(this.checkpointState);
    this.teleport(this.seat(fromTuple(this.manifest.spawn.position)), this.manifest.spawn.headingRadians);
    this.events = [];
    this.accumulator = 0;
    this.alpha = 0;
    this.pendingJump = false;
    this.pendingMantle = false;
    this.pendingRespawn = false;
    this.pendingGrapple = false;
    this.grappleCooldown = 0;
    this.stepCount = 0;
    this.elapsedSeconds = 0;
  }

  private teleport(position: Vec3Like, headingRadians: number): void {
    this.position = copy(position);
    this.previousPosition = copy(position);
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.mantleElapsed = null;
    this.mantleActiveTarget = null;
    this.lastProbe = { target: null, rejection: null };
    // A respawn mid-reel drops the hook; nothing carries over to the new pose.
    if (this.grapplePhase === "flying" || this.grapplePhase === "reeling") {
      this.events.push({ type: "grapple-release", reason: "cancelled" });
    }
    this.clearGrapple();
    this.facingYaw = headingRadians;
    this.previousFacingYaw = headingRadians;

    this.scene.playerBody.setTranslation(position, true);
    this.scene.playerBody.setNextKinematicTranslation(position);
    this.scene.world.propagateModifiedBodyPositionsToColliders();
    this.scene.world.updateSceneQueries();
    // A teleport can land far from the enabled props.
    if (this.propEntries.length > 0) this.refreshPropActivation();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.propEntries = [];
    this.propBody = null;
    this.deferredProps = [];
    this.scene.world.removeCharacterController(this.controller);
    this.scene.dispose();
  }
}
