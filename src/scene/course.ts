import type { Vec3 } from "../../shared/geometry.js";
import type {
  Checkpoint,
  CourseValidation,
  HelperEntity,
  SceneManifest,
  SpawnPoint,
} from "../../shared/manifest.js";
import type { MovementConfig } from "../../shared/movement.js";
import { DEFAULT_MOVEMENT_CONFIG } from "../../shared/movement.js";
import {
  buildCollisionTriangles,
  type AssetGeometryMap,
} from "./collision.js";
import {
  MAX_WALKABLE_SLOPE_RADIANS,
  createRamp,
  helperContainsPoint,
  helperEntityTriangles,
} from "./helpers.js";
import {
  buildTransitionGraph,
  deriveMovementLimits,
  transitionIsClear,
  validateRoute,
  type MovementLimits,
  type RouteValidationReport,
  type TransitionGraph,
} from "./route.js";
import { mergeTriangleSoups } from "./transform.js";
import {
  cellKey,
  defaultSurfaceOptions,
  sampleSurfaces,
  standingCenter,
  surfaceFromCenter,
  type SurfaceMap,
  type SurfaceOptions,
  type SurfacePatch,
} from "./surfaces.js";
import type { TriangleSoup } from "./types.js";

/**
 * Generic course preparation: given nothing but collision triangles and the
 * movement config, find somewhere to start, a spread of reachable checkpoints
 * including at least one elevated surface, and — when an elevated surface is
 * otherwise unreachable — a visible helper ramp that makes it reachable.
 *
 * No step knows anything about desks or sofas. The output is manifest data,
 * so a new generated mesh needs no new gameplay code.
 */

export interface CoursePlanOptions {
  movement: MovementConfig;
  /** Reload must reproduce the same course; all tie-breaking is seeded. */
  seed: string;
  checkpointCount?: number;
  surfaceOptions?: Partial<SurfaceOptions>;
  /** Add ramps when an elevated surface is otherwise out of reach. */
  allowHelpers?: boolean;
  /** Minimum height above the lowest tier for a checkpoint to count as
   * "elevated furniture", in metres. */
  elevatedThreshold?: number;
  /** Helper ramp slope. Below `MAX_WALKABLE_SLOPE_RADIANS` on purpose so the
   * ramp surface itself samples as comfortably standable. */
  rampSlopeRadians?: number;
  rampWidth?: number;
}

export interface CoursePlan {
  spawn: SpawnPoint;
  checkpoints: Checkpoint[];
  /** Helper geometry the planner added. Merge into the manifest entities. */
  helpers: HelperEntity[];
  validation: CourseValidation;
  surfaces: SurfaceMap;
  /** Collision including any helpers the planner added. */
  collision: TriangleSoup;
  diagnostics: CourseDiagnostics;
}

export interface CourseDiagnostics {
  standablePatches: number;
  reachablePatches: number;
  tiers: { height: number; patches: number; reachable: number }[];
  elevatedCheckpointHeight: number | null;
  helpersAdded: string[];
  notes: string[];
}

/** Predicate for {@link SurfaceOptions.insideSolid} covering a set of helpers.
 * The small margin keeps a patch sitting exactly on a helper's top face from
 * being mistaken for one buried inside it. */
export function insideAnyHelper(
  entities: readonly HelperEntity[],
): (point: Vec3) => boolean {
  if (entities.length === 0) return () => false;
  return (point: Vec3) =>
    entities.some((entity) => helperContainsPoint(entity, point, 1e-3));
}

/** Deterministic 32-bit hash → seeded PRNG, so the same seed always yields the
 * same course. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planCourse(
  baseCollision: TriangleSoup,
  options: CoursePlanOptions,
): CoursePlan {
  const checkpointCount = options.checkpointCount ?? 5;
  const elevatedThreshold = options.elevatedThreshold ?? 0.5;
  const rampSlope = options.rampSlopeRadians ?? MAX_WALKABLE_SLOPE_RADIANS * 0.8;
  const rampWidth = options.rampWidth ?? 1.4;
  const surfaceOptions: SurfaceOptions = {
    ...defaultSurfaceOptions(options.movement),
    ...options.surfaceOptions,
  };
  const notes: string[] = [];
  const helpers: HelperEntity[] = [];

  let collision = baseCollision;
  let surfaces = sampleSurfaces(collision, surfaceOptions);
  let limits = deriveMovementLimits(options.movement, surfaceOptions);
  let graph = buildTransitionGraph(surfaces, limits);
  let spawnIndex = chooseSpawnIndex(surfaces, graph, options.seed);
  if (spawnIndex < 0) {
    return emptyPlan(surfaces, collision, options, [
      "No standable surface was found at all; the mesh has no usable floor.",
    ]);
  }
  let reachable = reachableSet(graph, spawnIndex);

  // Elevated surfaces are the point of the game. If none is reachable, add a
  // ramp and re-analyze — the added geometry changes the surface map, so
  // everything downstream must be recomputed from it rather than patched.
  if (options.allowHelpers !== false) {
    const floorHeight = surfaces.standable[spawnIndex]!.point[1]!;
    if (!hasReachableElevated(surfaces, reachable, floorHeight, elevatedThreshold)) {
      // Ramps first — walking up a slope beats a climbing puzzle — then
      // stepped platforms, which fit against furniture too bulky for a ramp.
      const candidates: HelperProposal[] = [
        ...rampCandidates(
          surfaces,
          reachable,
          limits,
          floorHeight,
          elevatedThreshold,
          rampSlope,
          rampWidth,
          6,
        ),
        ...staircaseCandidates(
          surfaces,
          reachable,
          limits,
          floorHeight,
          elevatedThreshold,
          rampWidth,
          24,
        ),
      ];
      let accepted = false;
      for (const candidate of candidates) {
        // Helpers are only worth keeping if they actually open up the elevated
        // tier, and that can only be answered by re-running the analysis on
        // the geometry including them.
        const trialCollision = mergeTriangleSoups([
          collision,
          ...candidate.entities.map((entity) => helperEntityTriangles(entity)),
        ]);
        const trialSurfaces = sampleSurfaces(trialCollision, {
          ...surfaceOptions,
          insideSolid: insideAnyHelper([...helpers, ...candidate.entities]),
        });
        const trialGraph = buildTransitionGraph(trialSurfaces, limits);
        const trialSpawn = chooseSpawnIndex(trialSurfaces, trialGraph, options.seed);
        if (trialSpawn < 0) continue;
        const trialReachable = reachableSet(trialGraph, trialSpawn);
        // Specifically the ledge this helper was built for — the helper's own
        // steps are elevated surfaces too, and counting those would let a
        // staircase to nowhere pass.
        if (!reachesTarget(trialSurfaces, trialReachable, candidate.target)) {
          continue;
        }
        collision = trialCollision;
        surfaces = trialSurfaces;
        graph = trialGraph;
        spawnIndex = trialSpawn;
        reachable = trialReachable;
        helpers.push(...candidate.entities);
        notes.push(
          `Added visible helper geometry (${candidate.entities
            .map((entity) => `${entity.id}: ${entity.kind} ${entity.dimensions.map((n) => n.toFixed(2)).join("×")} m`)
            .join(", ")}) to reach the surface at ${candidate.target.map((n) => n.toFixed(2)).join(", ")}, which was not reachable by walking, jumping, or mantling. This is added game geometry, not reconstructed furniture.`,
        );
        accepted = true;
        break;
      }
      if (!accepted) {
        notes.push(
          `No elevated surface is reachable and none of the ${candidates.length} helper approach(es) tried opened one up; the course stays on the lowest tier and needs manual helper placement in the editor.`,
        );
      }
    }
  }

  const selected = selectCheckpointPatches(
    surfaces,
    graph,
    spawnIndex,
    reachable,
    checkpointCount,
    elevatedThreshold,
    options.seed,
  );

  const spawnPatch = surfaces.standable[spawnIndex]!;
  const waypointPatches = [spawnPatch, ...selected];
  const report = validateRoute(
    surfaces,
    limits,
    waypointPatches.map((patch) => patch.point),
  );

  const checkpoints = buildCheckpoints(selected, options.movement, spawnPatch);
  const spawn: SpawnPoint = {
    position: standingCenter(spawnPatch, options.movement),
    headingRadians: headingTo(
      spawnPatch.point,
      selected[0]!?.point ?? spawnPatch.point,
    ),
  };

  const floorHeight = spawnPatch.point[1]!;
  const elevatedCheckpoint = selected.find(
    (patch) => patch.point[1]! - floorHeight >= elevatedThreshold,
  );
  if (!elevatedCheckpoint) {
    notes.push(
      "No checkpoint sits on an elevated surface; the course is flat and should be reviewed in the editor.",
    );
  }

  return {
    spawn,
    checkpoints,
    helpers,
    validation: toCourseValidation(report, selected.length, checkpointCount),
    surfaces,
    collision,
    diagnostics: {
      standablePatches: surfaces.standable.length,
      reachablePatches: reachable.size,
      tiers: summarizeTiers(surfaces, reachable),
      elevatedCheckpointHeight: elevatedCheckpoint
        ? elevatedCheckpoint.point[1]!
        : null,
      helpersAdded: helpers.map((helper) => helper.id),
      notes,
    },
  };
}

export interface ManifestCourseCheck {
  validation: CourseValidation;
  report: RouteValidationReport;
  surfaces: SurfaceMap;
}

/**
 * Re-checks an existing manifest's course against its own geometry.
 *
 * This is how authored levels earn their `courseValidation` and how the editor
 * answers "is this still completable after I moved that checkpoint" — the same
 * conservative validator the planner uses, applied to manifest data rather
 * than to a freshly generated plan.
 */
export function validateManifestCourse(
  manifest: SceneManifest,
  assetGeometry: AssetGeometryMap,
  movement: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
  surfaceOverrides?: Partial<SurfaceOptions>,
): ManifestCourseCheck {
  const collision = buildCollisionTriangles(manifest, assetGeometry);
  const helperEntities = manifest.entities.filter(
    (entity): entity is HelperEntity => entity.kind !== "generated-mesh",
  );
  const surfaceOptions: SurfaceOptions = {
    ...defaultSurfaceOptions(movement),
    insideSolid: insideAnyHelper(helperEntities),
    ...surfaceOverrides,
  };
  const surfaces = sampleSurfaces(collision, surfaceOptions);
  const limits = deriveMovementLimits(movement, surfaceOptions);

  const ordered = [...manifest.checkpoints].sort((a, b) => a.order - b.order);
  const waypoints = [
    surfaceFromCenter(manifest.spawn.position, movement),
    ...ordered.map((checkpoint) =>
      surfaceFromCenter(checkpoint.position, movement),
    ),
  ];
  const report = validateRoute(surfaces, limits, waypoints);

  return {
    validation: {
      status: report.allReachable ? "validated" : "failed",
      method: report.method,
      checkedAt: new Date().toISOString(),
      evidence: report.allReachable
        ? report.evidence
        : `${report.evidence} ${report.segments
            .filter((segment) => !segment.reachable)
            .map((segment) => segment.failureReason)
            .join(" ")}`.trim(),
      uncertaintyNotes: report.uncertaintyNotes,
    },
    report,
    surfaces,
  };
}

function emptyPlan(
  surfaces: SurfaceMap,
  collision: TriangleSoup,
  options: CoursePlanOptions,
  notes: string[],
): CoursePlan {
  return {
    spawn: { position: [0, 1, 0], headingRadians: 0 },
    checkpoints: [],
    helpers: [],
    validation: {
      status: "failed",
      method: "conservative-kinematic-v1",
      checkedAt: new Date().toISOString(),
      evidence: notes.join(" "),
      uncertaintyNotes:
        "Course preparation could not produce any checkpoints; the level is not playable as generated.",
    },
    surfaces,
    collision,
    diagnostics: {
      standablePatches: surfaces.standable.length,
      reachablePatches: 0,
      tiers: [],
      elevatedCheckpointHeight: null,
      helpersAdded: [],
      notes,
    },
  };
}

/**
 * Spawn on the lowest tier, in the largest reachable area, biased away from
 * the level's centre so the player starts looking at the furniture rather than
 * inside it. Ties are broken by the seeded RNG.
 */
function chooseSpawnIndex(
  surfaces: SurfaceMap,
  graph: TransitionGraph,
  seed: string,
): number {
  if (surfaces.standable.length === 0) return -1;
  const random = seededRandom(`${seed}:spawn`);
  const lowest = Math.min(
    ...surfaces.standable.map((patch) => patch.point[1]!),
  );
  const candidates = surfaces.standable
    .map((patch, index) => ({ patch, index }))
    .filter(
      ({ patch }) =>
        patch.point[1]! - lowest <= 0.2 && patch.supportNeighbors === 8,
    );
  if (candidates.length === 0) {
    return surfaces.standable.reduce(
      (best, patch, index) =>
        patch.supportNeighbors > surfaces.standable[best]!.supportNeighbors
          ? index
          : best,
      0,
    );
  }

  const centerX = (surfaces.bounds.min[0]! + surfaces.bounds.max[0]!) / 2;
  const centerZ = (surfaces.bounds.min[2]! + surfaces.bounds.max[2]!) / 2;
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(
      candidate.patch.point[0]! - centerX,
      candidate.patch.point[2]! - centerZ,
    );
    // Prefer roomy floor a little way out, not the very edge of the map.
    const edgePenalty = Math.max(
      0,
      distance - (Math.hypot(
        surfaces.bounds.max[0]! - centerX,
        surfaces.bounds.max[2]! - centerZ,
      ) * 0.65),
    );
    const score =
      distance -
      edgePenalty * 3 +
      graph.edges[candidate.index]!.length * 0.01 +
      random() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best.index;
}

/** Patches reachable from `start` through the movement envelope, ignoring
 * clearance. A superset of what is truly reachable — used for candidate
 * selection only; the final route is clearance-verified. */
function reachableSet(graph: TransitionGraph, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop() as number;
    for (const edge of graph.edges[current]!) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }
  return seen;
}

/**
 * True when `patch` is on the outward edge of its tier in direction (dx, dz) —
 * i.e. stepping one cell that way leaves the elevated surface.
 *
 * Helper geometry has to meet a ledge at its edge. Aiming at an interior cell
 * puts the steps inside the furniture, which is why the clearance sweeps
 * reject almost every interior candidate; testing edge-ness first skips those
 * instead of discovering it the expensive way.
 */
function isLedgeEdge(
  surfaces: SurfaceMap,
  patch: SurfacePatch,
  dx: number,
  dz: number,
): boolean {
  const neighbors = surfaces.byCell.get(
    cellKey(patch.cellX + Math.round(dx), patch.cellZ + Math.round(dz)),
  );
  if (!neighbors) return true;
  return !neighbors.some(
    (other) =>
      other.standable &&
      Math.abs(other.point[1]! - patch.point[1]!) <= surfaces.options.stepTolerance,
  );
}

function hasReachableElevated(
  surfaces: SurfaceMap,
  reachable: ReadonlySet<number>,
  floorHeight: number,
  threshold: number,
): boolean {
  for (const index of reachable) {
    if (surfaces.standable[index]!.point[1]! - floorHeight >= threshold) {
      return true;
    }
  }
  return false;
}

/** True when a reachable standable patch now sits at the ledge a helper was
 * built for (same height, within a cell horizontally). */
function reachesTarget(
  surfaces: SurfaceMap,
  reachable: ReadonlySet<number>,
  target: Vec3,
): boolean {
  const tolerance = surfaces.options.cellSize;
  for (const index of reachable) {
    const patch = surfaces.standable[index]!;
    if (Math.abs(patch.point[1]! - target[1]!) > surfaces.options.stepTolerance) {
      continue;
    }
    if (
      Math.hypot(patch.point[0]! - target[0]!, patch.point[2]! - target[2]!) <=
      tolerance
    ) {
      return true;
    }
  }
  return false;
}

/** Helper geometry plus the ledge it was proposed for, so acceptance can be
 * judged against that ledge rather than against the helper's own surfaces. */
export interface HelperProposal {
  entities: HelperEntity[];
  target: Vec3;
}

/**
 * Finds a ramp from reachable ground to the most attractive unreachable
 * elevated cluster.
 *
 * Tries the tallest worthwhile target first and, for each, eight approach
 * directions; a candidate is accepted only when the ramp's own walking
 * corridor sweeps clear, so the planner never adds a ramp that ends in a wall.
 */
function rampCandidates(
  surfaces: SurfaceMap,
  reachable: ReadonlySet<number>,
  limits: MovementLimits,
  floorHeight: number,
  threshold: number,
  slopeRadians: number,
  width: number,
  maxCandidates = 12,
): HelperProposal[] {
  const targets = surfaces.standable
    .map((patch, index) => ({ patch, index }))
    .filter(
      ({ patch, index }) =>
        !reachable.has(index) &&
        patch.point[1]! - floorHeight >= threshold &&
        patch.supportNeighbors >= 6,
    )
    .sort((a, b) => b.patch.area - a.patch.area || b.patch.point[1]! - a.patch.point[1]!)
    .slice(0, 80);
  if (targets.length === 0) return [];

  const groundPatches = surfaces.standable.filter(
    (patch, index) =>
      reachable.has(index) && Math.abs(patch.point[1]! - floorHeight) <= 0.2,
  );
  if (groundPatches.length === 0) return [];

  const tangent = Math.tan(slopeRadians);
  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2],
    [-Math.SQRT1_2, -Math.SQRT1_2],
  ];

  // The ramp's top edge stops OUTSIDE the ledge. Ending it on top of the
  // elevated surface would drive the wedge through the furniture front, so a
  // short hop or step from the ramp head onto the ledge is the last move.
  const overhangs = [1, 1.5, 2].map((factor) => surfaces.options.cellSize * factor);
  const candidates: HelperProposal[] = [];
  let index = 0;

  for (const target of targets) {
    const rise = target.patch.point[1]! - floorHeight;
    const run = rise / tangent;
    for (const [dx, dz] of directions) {
      if (!isLedgeEdge(surfaces, target.patch, dx, dz)) continue;
      for (const overhang of overhangs) {
        const end: Vec3 = [
          target.patch.point[0]! + dx * overhang,
          target.patch.point[1]!,
          target.patch.point[2]! + dz * overhang,
        ];
        const start: Vec3 = [end[0]! + dx * run, floorHeight, end[2]! + dz * run];

        const nearGround = groundPatches.some(
          (patch) =>
            Math.hypot(patch.point[0]! - start[0]!, patch.point[2]! - start[2]!) <=
            surfaces.options.cellSize * 1.5,
        );
        if (!nearGround) continue;
        if (
          !rampCorridorIsClear(surfaces, limits, start, end, width, floorHeight)
        ) {
          continue;
        }

        index += 1;
        const ramp = createRamp({ id: `helper-ramp-${index}`, start, end, width });
        if (ramp.slopeRadians > MAX_WALKABLE_SLOPE_RADIANS + 1e-6) continue;
        candidates.push({ entities: [ramp.entity], target: target.patch.point });
        if (candidates.length >= maxCandidates) return candidates;
      }
    }
  }
  return candidates;
}

/**
 * Stepped helper platforms: a short flight of solid boxes against the outside
 * of an elevated surface, each a mantle apart.
 *
 * Generated furniture is usually a solid block much wider at the base than its
 * usable top, so a ramp long enough to climb it would have to pass through it.
 * A staircase needs only a couple of steps' depth of clear floor, so it fits
 * where a ramp cannot. Restricted to the four axis directions, which keeps the
 * boxes axis-aligned and their clearance tests exact.
 */
function staircaseCandidates(
  surfaces: SurfaceMap,
  reachable: ReadonlySet<number>,
  limits: MovementLimits,
  floorHeight: number,
  threshold: number,
  width: number,
  maxCandidates = 12,
): HelperProposal[] {
  const cell = surfaces.options.cellSize;
  const stepDepth = cell * 2;
  // One step must be a comfortable mantle, not a maximum-effort one.
  const maxStepRise = limits.mantle.maxLedgeHeight * 0.7;

  const targets = surfaces.standable
    .map((patch, index) => ({ patch, index }))
    .filter(
      ({ patch, index }) =>
        !reachable.has(index) &&
        patch.point[1]! - floorHeight >= threshold &&
        patch.supportNeighbors >= 6,
    )
    // Lowest tier first: the shortest climb is the cheapest way to open the
    // level up, and higher tiers are usually reachable from it afterwards.
    .sort(
      (a, b) => a.patch.point[1]! - b.patch.point[1]! || b.patch.area - a.patch.area,
    )
    .slice(0, 250);

  const groundPatches = surfaces.standable.filter(
    (patch, index) =>
      reachable.has(index) && Math.abs(patch.point[1]! - floorHeight) <= 0.2,
  );
  if (groundPatches.length === 0) return [];

  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const groups: HelperProposal[] = [];
  let groupIndex = 0;

  for (const target of targets) {
    const rise = target.patch.point[1]! - floorHeight;
    const stepCount = Math.max(1, Math.ceil(rise / maxStepRise));
    if (stepCount < 2) continue; // already a single mantle; no helper needed
    for (const [dx, dz] of directions) {
      if (!isLedgeEdge(surfaces, target.patch, dx, dz)) continue;
      const boxes: HelperEntity[] = [];
      let blocked = false;
      groupIndex += 1;

      for (let k = stepCount - 1; k >= 1; k -= 1) {
        const top = floorHeight + (rise * k) / stepCount;
        // Step k sits (stepCount - k) steps out from the ledge.
        // Half a cell in from the ledge patch centre puts every step edge on a
        // sampling-grid line, so the top of each step gets a patch a single
        // cell (0.36 m) from the next one — inside mantle reach. Aligning to
        // the ledge centre instead lands edges mid-cell and leaves gaps too
        // wide to climb.
        const innerOffset = cell * 0.5 + (stepCount - 1 - k) * stepDepth;
        const centerDistance = innerOffset + stepDepth / 2;
        const centerX = target.patch.point[0]! + dx * centerDistance;
        const centerZ = target.patch.point[2]! + dz * centerDistance;
        const halfAlongX = dx !== 0 ? stepDepth / 2 : width / 2;
        const halfAlongZ = dz !== 0 ? stepDepth / 2 : width / 2;

        // Only the top of a step has to be clear. Generated furniture is
        // usually far wider at the base than at its usable top, so a step
        // whose lower half overlaps that base is fine — it reads as a block
        // pushed up against the furniture, and the manifest marks it as added
        // game geometry. What matters is that the player can stand on it.
        const base = floorHeight - 0.1;
        if (
          surfaces.grid.intersectsBox(
            [centerX - halfAlongX, top + limits.surfaceSkin, centerZ - halfAlongZ],
            [centerX + halfAlongX, top + limits.characterHeight, centerZ + halfAlongZ],
          )
        ) {
          blocked = true;
          break;
        }

        boxes.push({
          id: `helper-step-${groupIndex}-${stepCount - k}`,
          kind: "box",
          transform: {
            position: [centerX, (base + top) / 2, centerZ],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
          dimensions: [halfAlongX * 2, top - base, halfAlongZ * 2],
          collider: {
            kind: "box",
            halfExtents: [halfAlongX, (top - base) / 2, halfAlongZ],
          },
          addedBy: "game",
        });
      }
      if (blocked || boxes.length === 0) continue;

      // The lowest step must be walkable-to from reachable floor.
      const lowest = boxes[boxes.length - 1]!;
      const approach = [
        lowest.transform.position[0]! + dx * (stepDepth / 2 + cell * 0.75),
        floorHeight,
        lowest.transform.position[2]! + dz * (stepDepth / 2 + cell * 0.75),
      ];
      const nearGround = groundPatches.some(
        (patch) =>
          Math.hypot(patch.point[0]! - approach[0]!, patch.point[2]! - approach[2]!) <=
          cell * 1.2,
      );
      if (!nearGround) continue;

      groups.push({ entities: boxes, target: target.patch.point });
      if (groups.length >= maxCandidates) return groups;
    }
  }
  return groups;
}

/**
 * A ramp is only useful if a player can walk up it and only honest if the
 * wedge does not bury itself in the furniture. Two sweeps: headroom above the
 * slope for the character, and emptiness inside the wedge volume itself.
 */
function rampCorridorIsClear(
  surfaces: SurfaceMap,
  limits: MovementLimits,
  start: Vec3,
  end: Vec3,
  width: number,
  floorHeight: number,
): boolean {
  const run = Math.hypot(end[0]! - start[0]!, end[2]! - start[2]!);
  const rise = end[1]! - start[1]!;
  const steps = Math.max(16, Math.ceil(run / (limits.characterRadius * 0.9)));
  const halfWidth = width / 2;
  const skin = limits.surfaceSkin;

  // The wedge is a long thin solid, not a square column. Test the AABB of its
  // oriented slice — a square footprint would reach far past the ramp head and
  // reject every approach that ends near a ledge.
  const dirX = run > 1e-6 ? (end[0]! - start[0]!) / run : 0;
  const dirZ = run > 1e-6 ? (end[2]! - start[2]!) / run : 1;
  const sliceHalf = run / steps / 2;
  const volumeHalfX = halfWidth * Math.abs(dirZ) + sliceHalf * Math.abs(dirX);
  const volumeHalfZ = halfWidth * Math.abs(dirX) + sliceHalf * Math.abs(dirZ);

  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const x = start[0]! + (end[0]! - start[0]!) * s;
    const z = start[2]! + (end[2]! - start[2]!) * s;
    const surfaceY = start[1]! + rise * s;

    if (
      surfaces.grid.intersectsBox(
        [x - limits.characterRadius, surfaceY + skin, z - limits.characterRadius],
        [
          x + limits.characterRadius,
          surfaceY + limits.characterHeight,
          z + limits.characterRadius,
        ],
      )
    ) {
      return false;
    }

    const volumeBottom = floorHeight + skin;
    if (
      surfaceY - volumeBottom > skin &&
      surfaces.grid.intersectsBox(
        [x - volumeHalfX, volumeBottom, z - volumeHalfZ],
        [x + volumeHalfX, surfaceY - 1e-3, z + volumeHalfZ],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Farthest-point selection over graph distance, with one slot reserved for the
 * highest reachable surface so a course always includes a climb. Graph
 * distance (not Euclidean) keeps checkpoints spread along actual routes.
 */
function selectCheckpointPatches(
  surfaces: SurfaceMap,
  graph: TransitionGraph,
  spawnIndex: number,
  reachable: ReadonlySet<number>,
  count: number,
  elevatedThreshold: number,
  seed: string,
): SurfacePatch[] {
  const random = seededRandom(`${seed}:checkpoints`);
  const candidates = [...reachable].filter((index) => {
    const patch = surfaces.standable[index]!;
    return index !== spawnIndex && patch.supportNeighbors >= 6;
  });
  if (candidates.length === 0) return [];

  const floorHeight = surfaces.standable[spawnIndex]!.point[1]!;
  const chosen: number[] = [];

  const highest = candidates.reduce((best, index) => {
    const patch = surfaces.standable[index]!;
    const bestPatch = surfaces.standable[best]!;
    return patch.point[1]! > bestPatch.point[1]! ||
      (patch.point[1]! === bestPatch.point[1]! && patch.area > bestPatch.area)
      ? index
      : best;
  }, candidates[0]!);
  if (surfaces.standable[highest]!.point[1]! - floorHeight >= elevatedThreshold) {
    chosen.push(highest);
  }

  const distanceTo = (a: number, b: number): number => {
    const pa = surfaces.standable[a]!.point;
    const pb = surfaces.standable[b]!.point;
    // Height differences count for more than horizontal distance: two points
    // on different tiers are more interesting than two across a floor.
    return Math.hypot(pa[0]! - pb[0]!, pa[2]! - pb[2]!) + Math.abs(pa[1]! - pb[1]!) * 2;
  };

  while (chosen.length < count && chosen.length < candidates.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (const index of candidates) {
      if (chosen.includes(index)) continue;
      const patch = surfaces.standable[index]!;
      let nearest = distanceTo(index, spawnIndex);
      for (const other of chosen) {
        nearest = Math.min(nearest, distanceTo(index, other));
      }
      const score = nearest + patch.area * 0.5 + random() * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
    if (best < 0) break;
    chosen.push(best);
  }

  // Order the course as a nearest-neighbour walk from the spawn, so the
  // sequence reads as a route rather than as a scatter of points.
  const ordered: number[] = [];
  const remaining = new Set(chosen);
  let cursor = spawnIndex;
  while (remaining.size > 0) {
    let next = -1;
    let nextDistance = Infinity;
    for (const index of remaining) {
      const distance = distanceTo(cursor, index);
      if (distance < nextDistance) {
        nextDistance = distance;
        next = index;
      }
    }
    if (next < 0) break;
    remaining.delete(next);
    ordered.push(next);
    cursor = next;
  }
  void graph;
  return ordered.map((index) => surfaces.standable[index]!);
}

function buildCheckpoints(
  patches: readonly SurfacePatch[],
  movement: MovementConfig,
  spawnPatch: SurfacePatch,
): Checkpoint[] {
  return patches.map((patch, order) => {
    const position = standingCenter(patch, movement);
    const previous = order === 0 ? spawnPatch.point : patches[order - 1]!.point;
    return {
      id: `checkpoint-${order + 1}`,
      order,
      position,
      triggerRadius: Math.max(0.35, movement.characterRadius * 2.2),
      safeRespawn: {
        position,
        // Face back the way the player came, so a respawn never looks into a wall.
        headingRadians: headingTo(patch.point, previous),
      },
    };
  });
}

/** Heading in radians about +Y measured from +Z, matching `SpawnPoint`. */
export function headingTo(from: Vec3, to: Vec3): number {
  const dx = to[0]! - from[0]!;
  const dz = to[2]! - from[2]!;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(dx, dz);
}

function toCourseValidation(
  report: RouteValidationReport,
  produced: number,
  requested: number,
): CourseValidation {
  const checkedAt = new Date().toISOString();
  if (produced === 0) {
    return {
      status: "failed",
      method: report.method,
      checkedAt,
      evidence: report.evidence,
      uncertaintyNotes:
        "No checkpoint could be placed on a reachable standable surface.",
    };
  }
  if (!report.allReachable) {
    const reasons = report.segments
      .filter((segment) => !segment.reachable)
      .map((segment) => segment.failureReason)
      .join(" ");
    return {
      status: "failed",
      method: report.method,
      checkedAt,
      evidence: `${report.evidence} ${reasons}`.trim(),
      uncertaintyNotes: `${report.uncertaintyNotes} At least one leg of this course has no route under the conservative model — reposition checkpoints or add helper geometry in the editor before playing.`,
    };
  }
  const shortfall =
    produced < requested
      ? ` Only ${produced} of ${requested} requested checkpoints could be placed.`
      : "";
  return {
    status: "validated",
    method: report.method,
    checkedAt,
    evidence: report.evidence + shortfall,
    uncertaintyNotes: report.uncertaintyNotes,
  };
}

function summarizeTiers(
  surfaces: SurfaceMap,
  reachable: ReadonlySet<number>,
): { height: number; patches: number; reachable: number }[] {
  const tiers = new Map<number, { patches: number; reachable: number }>();
  surfaces.standable.forEach((patch, index) => {
    const key = Math.round(patch.point[1]! * 4) / 4;
    const tier = tiers.get(key) ?? { patches: 0, reachable: 0 };
    tier.patches += 1;
    if (reachable.has(index)) tier.reachable += 1;
    tiers.set(key, tier);
  });
  return [...tiers.entries()]
    .map(([height, tier]) => ({ height, ...tier }))
    .sort((a, b) => b.height - a.height);
}
