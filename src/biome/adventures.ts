/**
 * Geometry-driven adventure generation: "Restore the Portal" and "Reach the
 * Beacon" on an arbitrary reconstruction.
 *
 * Pipeline (all synchronous, all seeded, all bounded):
 *
 *  1. Analyse the source collision at the AUTHORED body size with the same
 *     surface sampler and directed walk/jump/mantle graph the course planner
 *     and the publish gate use (`src/scene/surfaces.ts`, `route.ts`).
 *  2. Keep the source spawn when it stands on a real surface; otherwise pick a
 *     roomy spot on the lowest tier.
 *  3. If no elevated surface is reachable, add a few explicit-collider
 *     structures (stairs against a ledge, a bridge across a gap, or a modest
 *     stepped route on open floor for flat scenes). Every proposal is accepted
 *     only after the whole scene is re-sampled with it included and the
 *     target is proven reachable by a clearance-swept route.
 *  4. Choose objectives from the verified reachable set and validate the whole
 *     ORDERED chain (spawn → objectives → exit) with `validateRoute`, which
 *     honours one-way drops. Retry with other picks a bounded number of times.
 *  5. Fall back to a compact floor-level arrangement near the spawn, then to a
 *     simplified game floor, before giving up with an error (the caller keeps
 *     the current world).
 *  6. Re-check the finished manifest with the publish gate
 *     (`validateExperiencePlacements`) and the manifest schema.
 *
 * One `WorkDeadline` (2 s by default) spans the whole request and is checked
 * between stages. Running out refuses the request with the source untouched.
 *
 * Recognised objects are never consulted: every decision is geometry.
 */
import {
  ADVENTURE_GENERATOR_VERSION,
  IDENTITY_QUAT,
  LEVEL_EXPERIENCE_SCHEMA_VERSION,
  QUEST_TEXT_SCHEMA_VERSION,
  STYLE_DEFINITION_SCHEMA_VERSION,
  migrateSceneManifest,
  type Checkpoint,
  type ColorFragmentEntity,
  type FinishPortalEntity,
  type GameModeData,
  type HelperEntity,
  type LevelExperience,
  type SceneManifest,
  type Vec3,
} from "@shared/index.js";
import { validateExperiencePlacements } from "../game/placementValidation.js";
import { buildCollisionTriangles, type AssetGeometryMap } from "../scene/collision.js";
import { headingTo, planCourse, seededRandom } from "../scene/course.js";
import { createGameFloor, helperEntityTriangles } from "../scene/helpers.js";
import {
  buildTransitionGraph,
  findRoute,
  validateRoute,
  type RouteValidationReport,
  type Transition,
  type TransitionGraph,
} from "../scene/route.js";
import { cellKey, type SurfacePatch } from "../scene/surfaces.js";
import { computeBounds, mergeTriangleSoups } from "../scene/transform.js";
import type { TriangleSoup } from "../scene/types.js";
import {
  BiomeGeometryError,
  analyzeScene,
  assetGeometryFromLoaded,
  authoredCentreFromSurface,
  hash32,
  helperEntitiesOf,
  surfaceFromAuthoredCentre,
  type SceneAnalysis,
} from "./geometry.js";
import type {
  AdventureOutcome,
  AdventurePreparationResult,
  AdventureRequest,
  AdventureTemplateId,
  BiomeDefinition,
} from "./types.js";
import { WorkDeadline } from "./workBudget.js";

/** Prefix of every helper this module adds, so regeneration can replace its
 * own structures instead of stacking new ones on old ones. */
export const ADVENTURE_HELPER_PREFIX = "adventure-";

/** Height above the spawn tier that counts as "up on the furniture". */
const ELEVATED_THRESHOLD = 0.5;
/** Largest step rise a generated structure uses. The real controller is
 * proven on 0.43 m rises (`authoredCourse.test.ts`); this stays under it. */
const MAX_STEP_RISE = 0.42;
/** Mantle needs at least this rise to be offered; steps aim at or above it. */
const PREFERRED_MIN_STEP_RISE = 0.3;
/** Sunk below the surface a structure stands on, so no seam shows. */
const STRUCTURE_SINK = 0.1;
/** Pulls box faces off the sampling grid lines (same as `samples.ts`). */
const STEP_INSET = 0.05;

export const FRAGMENT_TRIGGER_RADIUS = 0.45;
export const PORTAL_TRIGGER_RADIUS = 0.75;
export const CHECKPOINT_TRIGGER_RADIUS = 0.45;

export interface AdventureBudget {
  /** Full re-analyses spent testing structure proposals. */
  maxStructureTrials: number;
  /** Structures kept (each may be several boxes). */
  maxStructures: number;
  /** Objective layouts tried per geometry before falling back. */
  maxObjectiveAttempts: number;
}

/**
 * Largest collision soup an adventure is generated for: 4× the 50k face limit
 * requested from the scan provider. The `WorkDeadline` can only stop between
 * stages, so this bounds the longest stage it cannot interrupt (measured on the
 * Rodin scan densified to 200k: course planner ~0.5 s, versus ~1 s at the
 * 400k analysis cap).
 */
export const ADVENTURE_MAX_ANALYSED_TRIANGLES = 200_000;

export const DEFAULT_ADVENTURE_BUDGET: AdventureBudget = {
  maxStructureTrials: 14,
  maxStructures: 3,
  maxObjectiveAttempts: 6,
};

/** Extra detail for tests and diagnostics; the public API returns the
 * contract's `AdventurePreparationResult`. */
export interface AdventureGenerationDetail extends AdventurePreparationResult {
  report: RouteValidationReport;
  structures: readonly { kind: StructureKind; entityIds: readonly string[] }[];
  /** Surface points of the ordered objective chain, spawn first. */
  chain: readonly Vec3[];
  fallbackStage: "none" | "floor-compact" | "game-floor";
}

type StructureKind = "planner" | "staircase" | "bridge" | "platform-route";

interface StructureProposal {
  kind: StructureKind;
  entities: HelperEntity[];
  /** A surface point that must become reachable for the proposal to count. */
  target: Vec3;
}

interface WorldState {
  analysis: SceneAnalysis;
  graph: TransitionGraph;
  spawnIndex: number;
  reachable: Set<number>;
  added: HelperEntity[];
  structures: { kind: StructureKind; entityIds: string[]; target: Vec3 }[];
}

/** Neutral copy used when no theme is supplied. */
const NEUTRAL_MISSION: BiomeDefinition["mission"] = {
  portalTitle: "Open the portal",
  beaconTitle: "Reach the beacon",
  fragmentName: "energy fragment",
  collectibleColor: "#9b5de5",
};
const NEUTRAL_ACCENT = "#9b5de5";

/**
 * Contract entry point. Never throws for an unplayable scene: it returns
 * `ok: false` with the source manifest untouched, and the caller keeps the
 * current world.
 */
export function prepareAdventure(input: AdventureRequest, deadline: WorkDeadline = new WorkDeadline()): AdventureOutcome {
  try {
    const detail = generateAdventure(input, DEFAULT_ADVENTURE_BUDGET, deadline);
    return { ok: true, manifest: detail.manifest, diagnostics: detail.diagnostics, fallbackUsed: detail.fallbackUsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: error instanceof BiomeGeometryError ? "no-playable-layout" : "geometry-unavailable",
      manifest: input.manifest,
      diagnostics: [message],
      fallbackUsed: false,
    };
  }
}

export function generateAdventure(
  input: AdventureRequest,
  budget: AdventureBudget = DEFAULT_ADVENTURE_BUDGET,
  /** One deadline for the whole request, across both geometry attempts. */
  deadline: WorkDeadline = new WorkDeadline(),
): AdventureGenerationDetail {
  const geometry = assetGeometryFromLoaded(input.assets);
  const diagnostics: string[] = [];
  const source = input.manifest;

  // Replace, never stack, a previous adventure's structures — and only on a
  // world this generator produced, so an unrelated entity that merely shares
  // the id prefix is never removed.
  const baseEntities = source.entities.filter((entity) => !isOwnGeneratedHelper(source, entity));
  const base: SceneManifest = { ...source, entities: baseEntities };

  const first = attemptOnGeometry(base, geometry, input, budget, deadline, diagnostics, false);
  if (first) return first;

  // Unreliable reconstruction with no usable floor: add the same simplified
  // game floor scene preparation adds, and try once more.
  if (!baseEntities.some((entity) => entity.kind === "floor")) {
    deadline.check("the game-floor attempt");
    const collision = buildCollisionTriangles(base, geometry);
    const bounds = computeBounds(collision);
    const floor = createGameFloor({
      id: `${ADVENTURE_HELPER_PREFIX}floor`,
      bounds,
      surfaceY: bounds.min[1],
      margin: Math.min(4, Math.max(2, bounds.max[1] - bounds.min[1])),
    });
    diagnostics.push("No usable floor was found; added a simplified game floor under the scene.");
    const floored: SceneManifest = { ...base, entities: [...baseEntities, floor] };
    const second = attemptOnGeometry(floored, geometry, input, budget, deadline, diagnostics, true);
    if (second) return second;
  }

  throw new BiomeGeometryError(
    `No playable ${input.template} layout could be proven on this scene. ${diagnostics.join(" ")}`.trim(),
  );
}

function attemptOnGeometry(
  base: SceneManifest,
  geometry: AssetGeometryMap,
  input: AdventureRequest,
  budget: AdventureBudget,
  deadline: WorkDeadline,
  diagnostics: string[],
  addedFloor: boolean,
): AdventureGenerationDetail | null {
  const collision = buildCollisionTriangles(base, geometry);
  if (collision.triangleCount > ADVENTURE_MAX_ANALYSED_TRIANGLES) {
    throw new BiomeGeometryError(
      `Scene has ${collision.triangleCount} collision triangles; adventures are generated for at most ${ADVENTURE_MAX_ANALYSED_TRIANGLES} so preparation stays responsive.`,
    );
  }
  deadline.check("the scene analysis");
  const analysis = analyzeScene(collision, helperEntitiesOf(base), input.movement);
  const spawnIndex = chooseSpawn(analysis, base, input.seed, diagnostics, !addedFloor);
  if (spawnIndex < 0) {
    diagnostics.push("No standable surface exists for a spawn.");
    return null;
  }

  deadline.check("the movement graph");
  let state = worldState(analysis, spawnIndex, [], []);
  state = addStructures(state, input.seed, budget, deadline, diagnostics);

  const random = seededRandom(`${input.seed}:${input.template}:objectives`);
  const blocked = new Set<number>();
  for (let attempt = 0; attempt < budget.maxObjectiveAttempts; attempt += 1) {
    deadline.check("an objective layout");
    const picked = pickObjectives(state, input.template, random, blocked, false);
    if (!picked) break;
    const result = finalize(base, geometry, input, state, picked, deadline, diagnostics, addedFloor ? "game-floor" : "none");
    if (result) return result;
    // Rule out the patch that broke the chain and pick again.
    if (picked.failedIndex !== null) blocked.add(picked.failedIndex);
    else picked.objectives.forEach((index) => blocked.add(index));
  }

  diagnostics.push("Elevated layouts did not validate; using a compact floor-level arrangement near the start.");
  const compactRandom = seededRandom(`${input.seed}:${input.template}:compact`);
  for (let attempt = 0; attempt < budget.maxObjectiveAttempts; attempt += 1) {
    deadline.check("a compact objective layout");
    const picked = pickObjectives(state, input.template, compactRandom, blocked, true);
    if (!picked) break;
    const result = finalize(base, geometry, input, state, picked, deadline, diagnostics, addedFloor ? "game-floor" : "floor-compact");
    if (result) return result;
    if (picked.failedIndex !== null) blocked.add(picked.failedIndex);
    else picked.objectives.forEach((index) => blocked.add(index));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Spawn and reachability

function worldState(
  analysis: SceneAnalysis,
  spawnIndex: number,
  added: HelperEntity[],
  structures: { kind: StructureKind; entityIds: string[]; target: Vec3 }[],
): WorldState {
  const graph = buildTransitionGraph(analysis.surfaces, analysis.limits);
  return { analysis, graph, spawnIndex, reachable: reachableFrom(graph, spawnIndex), added, structures };
}

/** Patches reachable through the movement envelope (clearance is verified
 * later, per chosen route). */
function reachableFrom(graph: TransitionGraph, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const edge of graph.edges[current]!) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      stack.push(edge.to);
    }
  }
  return seen;
}

function patchIndexNear(analysis: SceneAnalysis, surface: Vec3, maxHorizontal = 0.6, maxVertical = 0.3): number {
  let best = -1;
  let bestDistance = Infinity;
  analysis.surfaces.standable.forEach((patch, index) => {
    if (Math.abs(patch.point[1] - surface[1]) > maxVertical) return;
    const distance = Math.hypot(patch.point[0] - surface[0], patch.point[2] - surface[2]);
    if (distance <= maxHorizontal && distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function chooseSpawn(
  analysis: SceneAnalysis,
  manifest: SceneManifest,
  seed: string,
  diagnostics: string[],
  /** False once the scan proved unreliable and a game floor was added: the
   * start then moves onto the simplified floor. */
  keepSource: boolean,
): number {
  const standable = analysis.surfaces.standable;
  if (standable.length === 0) return -1;
  const authoredSurface = surfaceFromAuthoredCentre(manifest.spawn.position, analysis.authored);
  const kept = keepSource ? patchIndexNear(analysis, authoredSurface) : -1;
  if (kept >= 0 && standable[kept]!.supportNeighbors >= 6) return kept;
  if (keepSource) diagnostics.push("The original start point is not on a solid surface; picked a roomy start on the lowest level.");

  const random = seededRandom(`${seed}:spawn`);
  const lowest = Math.min(...standable.map((patch) => patch.point[1]));
  const bounds = analysis.surfaces.bounds;
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const radius = Math.hypot(bounds.max[0] - centerX, bounds.max[2] - centerZ);
  let best = -1;
  let bestScore = -Infinity;
  standable.forEach((patch, index) => {
    if (patch.point[1] - lowest > 0.2 || patch.supportNeighbors < 8) return;
    const distance = Math.hypot(patch.point[0] - centerX, patch.point[2] - centerZ);
    const edgePenalty = Math.max(0, distance - radius * 0.65);
    const score = distance - edgePenalty * 3 + random() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  if (best >= 0) return best;
  return standable.reduce(
    (winner, patch, index) => (patch.supportNeighbors > standable[winner]!.supportNeighbors ? index : winner),
    0,
  );
}

function spawnTier(state: WorldState): number {
  return state.analysis.surfaces.standable[state.spawnIndex]!.point[1];
}

function reachableElevated(state: WorldState): number[] {
  const floor = spawnTier(state);
  return [...state.reachable].filter(
    (index) => state.analysis.surfaces.standable[index]!.point[1] - floor >= ELEVATED_THRESHOLD,
  );
}

// ---------------------------------------------------------------------------
// Structures

function addStructures(
  initial: WorldState,
  seed: string,
  budget: AdventureBudget,
  deadline: WorkDeadline,
  diagnostics: string[],
): WorldState {
  let state = initial;
  let trials = 0;
  const hasElevatedSource = state.analysis.surfaces.standable.some(
    (patch) => patch.point[1] - spawnTier(state) >= ELEVATED_THRESHOLD,
  );

  const tryAccept = (proposal: StructureProposal): boolean => {
    if (trials >= budget.maxStructureTrials) return false;
    deadline.check("a structure trial");
    trials += 1;
    const next = applyProposal(state, proposal);
    if (!next) return false;
    state = next;
    diagnostics.push(describeStructure(proposal));
    return true;
  };

  // 1) The existing course planner's own ramp/staircase search, unchanged.
  if (reachableElevated(state).length === 0 && hasElevatedSource) {
    deadline.check("the course planner");
    const plan = planCourse(state.analysis.collision, {
      movement: state.analysis.authored,
      seed: `${seed}:planner`,
      checkpointCount: 3,
    });
    if (plan.helpers.length > 0 && trials < budget.maxStructureTrials) {
      const entities = plan.helpers.map((helper, index) => ({
        ...helper,
        id: `${ADVENTURE_HELPER_PREFIX}planner-${index + 1}`,
      }));
      const tallest = Math.max(...entities.map((entity) => entity.transform.position[1] + entity.dimensions[1] / 2));
      const target = state.analysis.surfaces.standable.find(
        (patch) => patch.point[1] >= tallest - 0.05 && !state.reachable.has(state.analysis.surfaces.standable.indexOf(patch)),
      );
      if (target) tryAccept({ kind: "planner", entities, target: target.point });
    }
  }

  // 2) Stairs and bridges up to still-unreachable tiers.
  while (state.structures.length < budget.maxStructures && trials < budget.maxStructureTrials) {
    const unreached = unreachableElevatedTargets(state);
    if (unreached.length === 0) break;
    const proposals = [
      ...bridgeProposals(state, unreached, state.structures.length),
      ...staircaseProposals(state, unreached, state.structures.length),
    ];
    let accepted = false;
    for (const proposal of proposals) {
      if (trials >= budget.maxStructureTrials) break;
      if (tryAccept(proposal)) {
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
    // One climb is enough for a short adventure once something is elevated.
    if (reachableElevated(state).length > 0 && state.structures.length >= 2) break;
  }

  // 3) Flat or unclimbable scene: a modest stepped route on open floor.
  if (reachableElevated(state).length === 0) {
    for (const proposal of platformRouteProposals(state, seed)) {
      if (trials >= budget.maxStructureTrials) break;
      if (tryAccept(proposal)) break;
    }
  }

  if (reachableElevated(state).length === 0) {
    diagnostics.push("No elevated surface could be made reachable; the adventure stays on one level.");
  }
  return state;
}

function describeStructure(proposal: StructureProposal): string {
  const label: Record<StructureKind, string> = {
    planner: "helper ramp or steps from the course planner",
    staircase: "short stair of stepping blocks",
    bridge: "bridge across a gap",
    "platform-route": "raised stepping route on open floor",
  };
  return `Added a ${label[proposal.kind]} (${proposal.entities.map((entity) => entity.id).join(", ")}) reaching ${proposal.target
    .map((n) => n.toFixed(2))
    .join(", ")}.`;
}

/** Re-analyses the scene with the proposal included and keeps it only if the
 * target became reachable along a clearance-verified route and the spawn is
 * still standing free. */
function applyProposal(state: WorldState, proposal: StructureProposal): WorldState | null {
  const spawnPoint = state.analysis.surfaces.standable[state.spawnIndex]!.point;
  for (const entity of proposal.entities) {
    if (footprintDistance(entity, spawnPoint) < 0.6) return null;
  }
  const collision = mergeTriangleSoups([
    state.analysis.collision,
    ...proposal.entities.map((entity) => helperEntityTriangles(entity)),
  ]);
  const analysis = analyzeScene(
    collision,
    [...state.analysis.helpers, ...proposal.entities],
    state.analysis.runtime,
  );
  // The sampling grid is anchored to the collision bounds' min corner; a
  // structure that moved it would shift every cell under the existing
  // analysis. Structures must stay inside the current footprint.
  const before = state.analysis.surfaces.bounds.min;
  const after = analysis.surfaces.bounds.min;
  if (Math.abs(before[0] - after[0]) > 1e-6 || Math.abs(before[2] - after[2]) > 1e-6) return null;
  const spawnIndex = patchIndexNear(analysis, spawnPoint, 0.2, 0.05);
  if (spawnIndex < 0) return null;
  const next = worldState(
    analysis,
    spawnIndex,
    [...state.added, ...proposal.entities],
    [...state.structures, { kind: proposal.kind, entityIds: proposal.entities.map((entity) => entity.id), target: proposal.target }],
  );
  const targetIndex = patchIndexNear(analysis, proposal.target, analysis.surfaceOptions.cellSize * 1.01, analysis.surfaceOptions.stepTolerance);
  if (targetIndex < 0 || !next.reachable.has(targetIndex)) return null;
  const route = findRoute(next.graph, analysis.grid, spawnIndex, targetIndex, {
    clearanceChecks: 0,
    blockedEdges: 0,
    replans: 0,
  });
  if (!route) return null;
  return next;
}

function footprintDistance(entity: HelperEntity, point: Vec3): number {
  const [cx, , cz] = entity.transform.position;
  // Generated structures are axis-aligned boxes; ramps from the planner are
  // bounded by their longest horizontal half-extent.
  const aligned = entity.transform.rotation.every((value, index) => value === IDENTITY_QUAT[index]);
  const hx = aligned ? entity.dimensions[0] / 2 : Math.max(entity.dimensions[0], entity.dimensions[2]) / 2;
  const hz = aligned ? entity.dimensions[2] / 2 : hx;
  const dx = Math.max(0, Math.abs(point[0] - cx) - hx);
  const dz = Math.max(0, Math.abs(point[2] - cz) - hz);
  return Math.hypot(dx, dz);
}

interface TargetPatch {
  index: number;
  patch: SurfacePatch;
}

function unreachableElevatedTargets(state: WorldState): TargetPatch[] {
  const floor = spawnTier(state);
  return state.analysis.surfaces.standable
    .map((patch, index) => ({ patch, index }))
    .filter(
      ({ patch, index }) =>
        !state.reachable.has(index) &&
        patch.point[1] - floor >= ELEVATED_THRESHOLD &&
        patch.supportNeighbors >= 4,
    )
    // Lowest first: the cheapest climb usually opens the higher tiers too.
    .sort((a, b) => a.patch.point[1] - b.patch.point[1] || b.patch.area - a.patch.area)
    .slice(0, 240);
}

const AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Same-height neighbour test used to find a tier's outer edge. */
function hasSameTierPatch(state: WorldState, cellX: number, cellZ: number, height: number, tolerance: number): boolean {
  const list = state.analysis.surfaces.byCell.get(cellKey(cellX, cellZ));
  return !!list && list.some((other) => Math.abs(other.point[1] - height) <= tolerance);
}

function reachablePatchAt(state: WorldState, cellX: number, cellZ: number): SurfacePatch | null {
  const list = state.analysis.surfaces.byCell.get(cellKey(cellX, cellZ));
  if (!list) return null;
  const standable = state.analysis.surfaces.standable;
  let best: SurfacePatch | null = null;
  for (const patch of list) {
    if (!patch.standable) continue;
    const index = standable.indexOf(patch);
    if (index >= 0 && state.reachable.has(index) && (!best || patch.point[1] > best.point[1])) best = patch;
  }
  return best;
}

/** World-space min corner of a sampling cell. */
function cellOrigin(state: WorldState, cellX: number, cellZ: number): [number, number] {
  const { bounds, options } = state.analysis.surfaces;
  return [bounds.min[0] + cellX * options.cellSize, bounds.min[2] + cellZ * options.cellSize];
}

/** Box helper covering an inclusive rectangle of sampling cells. */
function cellBox(
  state: WorldState,
  id: string,
  cellX0: number,
  cellX1: number,
  cellZ0: number,
  cellZ1: number,
  top: number,
  bottom: number,
): HelperEntity {
  const cell = state.analysis.surfaces.options.cellSize;
  const [ox, oz] = cellOrigin(state, Math.min(cellX0, cellX1), Math.min(cellZ0, cellZ1));
  const minX = ox + STEP_INSET;
  const minZ = oz + STEP_INSET;
  const maxX = ox + (Math.abs(cellX1 - cellX0) + 1) * cell - STEP_INSET;
  const maxZ = oz + (Math.abs(cellZ1 - cellZ0) + 1) * cell - STEP_INSET;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const height = top - bottom;
  return {
    id,
    kind: "box",
    transform: {
      position: [(minX + maxX) / 2, (top + bottom) / 2, (minZ + maxZ) / 2],
      rotation: IDENTITY_QUAT,
      scale: [1, 1, 1],
    },
    dimensions: [width, height, depth],
    collider: { kind: "box", halfExtents: [width / 2, height / 2, depth / 2] },
    addedBy: "game",
  };
}

/** True when the space the character needs above a box's top is empty. */
function topIsClear(state: WorldState, box: HelperEntity): boolean {
  const [cx, cy, cz] = box.transform.position;
  const [w, h, d] = box.dimensions;
  const top = cy + h / 2;
  const { surfaceSkin, characterHeight } = state.analysis.surfaceOptions;
  return !state.analysis.grid.intersectsBox(
    [cx - w / 2, top + surfaceSkin, cz - d / 2],
    [cx + w / 2, top + characterHeight + 0.05, cz + d / 2],
  );
}

/** True when the box's volume above `from` is empty (bridges and free-standing
 * platforms must not overlap the scan at all; the surface they stand on is
 * excluded by starting just above it). */
function volumeIsClear(state: WorldState, box: HelperEntity, from: number, shrink = 0): boolean {
  const [cx, cy, cz] = box.transform.position;
  const [w, h, d] = box.dimensions;
  return !state.analysis.grid.intersectsBox(
    [cx - w / 2 + shrink, Math.max(from, cy - h / 2) + state.analysis.surfaceOptions.surfaceSkin, cz - d / 2 + shrink],
    [cx + w / 2 - shrink, cy + h / 2, cz + d / 2 - shrink],
  );
}

function staircaseProposals(state: WorldState, targets: TargetPatch[], serial: number): StructureProposal[] {
  const proposals: StructureProposal[] = [];
  const tolerance = state.analysis.surfaceOptions.stepTolerance;
  const seen = new Set<string>();

  for (const { patch } of targets) {
    for (const [dx, dz] of AXES) {
      if (hasSameTierPatch(state, patch.cellX + dx, patch.cellZ + dz, patch.point[1], tolerance)) continue;
      // Real ledges overhang and bulge; try the stair flush against the edge
      // cell first, then one and two cells further out.
      for (const gap of [1, 2, 3]) {
        for (const halfWidth of [2, 1]) {
          const proposal = staircaseAt(state, patch, dx, dz, gap, halfWidth, serial, proposals.length);
          if (!proposal) continue;
          const key = proposal.entities.map((entity) => entity.transform.position.map((n) => n.toFixed(2)).join()).join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          proposals.push(proposal);
          break;
        }
        if (proposals.length >= 24) return proposals;
      }
    }
  }
  return proposals;
}

function staircaseAt(
  state: WorldState,
  ledge: SurfacePatch,
  dx: number,
  dz: number,
  gap: number,
  halfWidth: number,
  serial: number,
  variant: number,
): StructureProposal | null {
  const stepDepth = 2;
  // Find the base: the reachable surface the lowest step will stand on. It is
  // searched outward from the ledge, so the stair ends where there is floor.
  for (let steps = 1; steps <= 6; steps += 1) {
    const outer = gap + steps * stepDepth; // first cell beyond the last step
    const approach = reachablePatchAt(state, ledge.cellX + dx * outer, ledge.cellZ + dz * outer);
    if (!approach) continue;
    const baseY = approach.point[1];
    const rise = ledge.point[1] - baseY;
    if (rise < ELEVATED_THRESHOLD * 0.6) return null;
    // `count` equal rises: `count - 1` boxes, then the last rise onto the
    // ledge itself. Each rise stays under the proven step height.
    const count = Math.ceil(rise / MAX_STEP_RISE);
    if (count - 1 !== steps) continue;
    if (rise / count < PREFERRED_MIN_STEP_RISE * 0.5) return null;

    const boxes: HelperEntity[] = [];
    for (let k = 1; k <= steps; k += 1) {
      // k = 1 is nearest the ledge (highest).
      const top = baseY + (rise * (count - k)) / count;
      const near = gap + (k - 1) * stepDepth;
      const far = near + stepDepth - 1;
      const along0 = dx !== 0 ? ledge.cellX + dx * near : ledge.cellZ + dz * near;
      const along1 = dx !== 0 ? ledge.cellX + dx * far : ledge.cellZ + dz * far;
      const across = dx !== 0 ? ledge.cellZ : ledge.cellX;
      const box =
        dx !== 0
          ? cellBox(state, `${ADVENTURE_HELPER_PREFIX}step-${serial + 1}-${variant + 1}-${k}`, along0, along1, across - halfWidth, across + halfWidth, top, baseY - STRUCTURE_SINK)
          : cellBox(state, `${ADVENTURE_HELPER_PREFIX}step-${serial + 1}-${variant + 1}-${k}`, across - halfWidth, across + halfWidth, along0, along1, top, baseY - STRUCTURE_SINK);
      if (!topIsClear(state, box)) return null;
      boxes.push(box);
    }
    return { kind: "staircase", entities: boxes, target: ledge.point };
  }
  return null;
}

function bridgeProposals(state: WorldState, targets: TargetPatch[], serial: number): StructureProposal[] {
  const floor = spawnTier(state);
  const tolerance = state.analysis.surfaceOptions.stepTolerance;
  const proposals: StructureProposal[] = [];
  const reachedElevated = reachableElevated(state).map((index) => state.analysis.surfaces.standable[index]!);
  if (reachedElevated.length === 0) return proposals;
  const byCell = new Map<string, SurfacePatch>();
  for (const patch of reachedElevated) byCell.set(cellKey(patch.cellX, patch.cellZ), patch);

  for (const { patch: target } of targets) {
    if (target.point[1] - floor < ELEVATED_THRESHOLD) continue;
    for (const [dx, dz] of AXES) {
      if (hasSameTierPatch(state, target.cellX + dx, target.cellZ + dz, target.point[1], tolerance)) continue;
      for (let span = 2; span <= 8; span += 1) {
        const from = byCell.get(cellKey(target.cellX + dx * span, target.cellZ + dz * span));
        if (!from) continue;
        if (Math.abs(from.point[1] - target.point[1]) > tolerance) break;
        const top = Math.max(from.point[1], target.point[1]);
        const along0 = dx !== 0 ? target.cellX + dx : target.cellZ + dz;
        const along1 = dx !== 0 ? target.cellX + dx * (span - 1) : target.cellZ + dz * (span - 1);
        const across = dx !== 0 ? target.cellZ : target.cellX;
        const id = `${ADVENTURE_HELPER_PREFIX}bridge-${serial + 1}-${proposals.length + 1}`;
        const deck =
          dx !== 0
            ? cellBox(state, id, along0, along1, across - 1, across + 1, top, top - 0.12)
            : cellBox(state, id, across - 1, across + 1, along0, along1, top, top - 0.12);
        if (!topIsClear(state, deck) || !volumeIsClear(state, deck, top - 0.12 - state.analysis.surfaceOptions.surfaceSkin)) break;
        proposals.push({ kind: "bridge", entities: [deck], target: target.point });
        break;
      }
      if (proposals.length >= 8) return proposals;
    }
  }
  return proposals;
}

/**
 * A modest elevated route for flat scenes: two steps up to a landing, a short
 * jump across to a second landing. Built on open, reachable floor away from
 * the spawn, entirely clear of the scan.
 */
function platformRouteProposals(state: WorldState, seed: string): StructureProposal[] {
  const proposals: StructureProposal[] = [];
  const surfaces = state.analysis.surfaces;
  const spawn = surfaces.standable[state.spawnIndex]!;
  const random = seededRandom(`${seed}:platform-route`);
  const rise = 0.36;
  // Any open reachable tier will do (a countertop slab as much as the game
  // floor), as long as the landing ends up elevated above the start.
  const lowestBase = spawn.point[1] + ELEVATED_THRESHOLD - rise * 3;
  const openCell = (cellX: number, cellZ: number, base: number): boolean => {
    const patch = reachablePatchAt(state, cellX, cellZ);
    return !!patch && Math.abs(patch.point[1] - base) <= 0.03;
  };

  const candidates = [...state.reachable]
    .map((index) => surfaces.standable[index]!)
    .filter((patch) => patch.point[1] >= lowestBase && patch.supportNeighbors === 8)
    .map((patch) => ({
      patch,
      distance: Math.hypot(patch.point[0] - spawn.point[0], patch.point[2] - spawn.point[2]),
      jitter: random(),
    }))
    .filter((entry) => entry.distance >= 1.4 && entry.distance <= 7)
    .sort((a, b) => Math.abs(a.distance - 3) + a.jitter * 0.8 - (Math.abs(b.distance - 3) + b.jitter * 0.8))
    .slice(0, 60);

  for (const { patch } of candidates) {
    const floor = patch.point[1];
    for (const [dx, dz] of AXES) {
      // Layout along the axis, starting at `patch` (the approach cell):
      // step1 (2 cells) at 1×rise, step2 (2 cells) at 2×rise, launch landing
      // (3 cells) at 3×rise, a one-cell gap, far landing (3 cells) at the same
      // height — reachable only by the jump across.
      const segments: { from: number; to: number; top: number; name: string }[] = [
        { from: 1, to: 2, top: floor + rise, name: "step-1" },
        { from: 3, to: 4, top: floor + rise * 2, name: "step-2" },
        { from: 5, to: 7, top: floor + rise * 3, name: "launch" },
        { from: 9, to: 11, top: floor + rise * 3, name: "landing" },
      ];
      // Every covered cell (plus a margin row) must be open floor.
      let open = true;
      for (let along = 0; along <= 12 && open; along += 1) {
        for (let across = -2; across <= 2; across += 1) {
          const cx = patch.cellX + (dx !== 0 ? dx * along : across);
          const cz = patch.cellZ + (dz !== 0 ? dz * along : across);
          if (!openCell(cx, cz, floor)) {
            open = false;
            break;
          }
        }
      }
      if (!open) continue;
      const boxes = segments.map((segment) => {
        const along0 = dx !== 0 ? patch.cellX + dx * segment.from : patch.cellZ + dz * segment.from;
        const along1 = dx !== 0 ? patch.cellX + dx * segment.to : patch.cellZ + dz * segment.to;
        const across = dx !== 0 ? patch.cellZ : patch.cellX;
        const id = `${ADVENTURE_HELPER_PREFIX}route-${segment.name}`;
        return dx !== 0
          ? cellBox(state, id, along0, along1, across - 1, across + 1, segment.top, floor - STRUCTURE_SINK)
          : cellBox(state, id, across - 1, across + 1, along0, along1, segment.top, floor - STRUCTURE_SINK);
      });
      if (!boxes.every((box) => topIsClear(state, box) && volumeIsClear(state, box, floor, 0.01))) continue;
      const top = (box: HelperEntity): Vec3 => [box.transform.position[0], floor + rise * 3, box.transform.position[2]];
      proposals.push({ kind: "platform-route", entities: boxes, target: top(boxes[3]!) });
      // Same route without the jump, in case the gap does not validate.
      proposals.push({ kind: "platform-route", entities: boxes.slice(0, 3), target: top(boxes[2]!) });
      if (proposals.length >= 8) return proposals;
    }
  }
  return proposals;
}

// ---------------------------------------------------------------------------
// Objectives

interface PickedObjectives {
  /** Standable patch indices in play order, spawn excluded, exit last. */
  objectives: number[];
  /** Standable patch index whose leg failed validation, so the next attempt
   * can avoid it; null when the whole pick should be ruled out. */
  failedIndex: number | null;
  template: AdventureTemplateId;
  /** reach-beacon only: which objectives are route checkpoints. */
  routeCheckpoints: number[];
}

function candidatePool(state: WorldState, blocked: ReadonlySet<number>, compact: boolean): number[] {
  const surfaces = state.analysis.surfaces;
  const spawn = surfaces.standable[state.spawnIndex]!.point;
  const floor = spawn[1];
  const tolerance = state.analysis.surfaceOptions.stepTolerance;
  return [...state.reachable].filter((index) => {
    if (index === state.spawnIndex || blocked.has(index)) return false;
    const patch = surfaces.standable[index]!;
    if (patch.supportNeighbors < 6) return false;
    const distance = Math.hypot(patch.point[0] - spawn[0], patch.point[2] - spawn[2]);
    if (distance < 1.2) return false;
    if (compact) return Math.abs(patch.point[1] - floor) <= tolerance && distance <= 6;
    return true;
  });
}

function pickObjectives(
  state: WorldState,
  template: AdventureTemplateId,
  random: () => number,
  blocked: ReadonlySet<number>,
  compact: boolean,
): (PickedObjectives & { chainOk?: boolean }) | null {
  const pool = candidatePool(state, blocked, compact);
  const surfaces = state.analysis.surfaces;
  if (pool.length === 0) return null;
  const point = (index: number): Vec3 => surfaces.standable[index]!.point;
  const spawn = point(state.spawnIndex);
  const floor = spawn[1];
  const separation = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]) + Math.abs(a[1] - b[1]) * 2;

  // The landmark: the highest reachable surface, the climax of the route.
  // Among equally high spots, the one a generated structure was built to
  // reach (e.g. the far landing after a jump) wins, then the roomiest.
  const highest = Math.max(...pool.map((index) => point(index)[1]));
  const structureTarget = state.structures.at(-1)?.target ?? null;
  const landmark = pool
    .filter((index) => point(index)[1] >= highest - 0.05)
    .reduce((best, index) => {
      if (structureTarget) {
        const da = Math.hypot(point(index)[0] - structureTarget[0], point(index)[2] - structureTarget[2]);
        const db = Math.hypot(point(best)[0] - structureTarget[0], point(best)[2] - structureTarget[2]);
        if (Math.abs(da - db) > 1e-6) return da < db ? index : best;
      }
      return surfaces.standable[index]!.area > surfaces.standable[best]!.area ? index : best;
    });
  const landmarkElevated = point(landmark)[1] - floor >= ELEVATED_THRESHOLD;

  if (template === "reach-beacon") {
    const beacon = landmarkElevated ? landmark : farthest(pool, [spawn], point, random, separation);
    if (beacon === null) return null;
    const route = findRoute(state.graph, state.analysis.grid, state.spawnIndex, beacon, {
      clearanceChecks: 0,
      blockedEdges: 0,
      replans: 0,
    });
    if (!route) return { objectives: [beacon], failedIndex: beacon, template, routeCheckpoints: [] };
    const checkpoints = routeCheckpointsAlong(state, route, beacon);
    return { objectives: [...checkpoints, beacon], failedIndex: null, template, routeCheckpoints: checkpoints };
  }

  // restore-portal: two spread fragments, the landmark last, then the exit.
  const chosen: number[] = [];
  const last = landmarkElevated ? landmark : null;
  const avoid: Vec3[] = [spawn, ...(last !== null ? [point(last)] : [])];
  for (let i = 0; chosen.length < (last !== null ? 2 : 3) && i < 3; i += 1) {
    const next = farthest(
      pool.filter((index) => index !== last && !chosen.includes(index)),
      avoid,
      point,
      random,
      separation,
    );
    if (next === null) break;
    chosen.push(next);
    avoid.push(point(next));
  }
  if (last !== null) chosen.push(last);
  if (chosen.length < 3) return null;
  // Nearest-neighbour order from the spawn for the non-landmark fragments.
  const head = chosen.slice(0, last !== null ? 2 : 3);
  const ordered: number[] = [];
  let cursor = spawn;
  while (head.length > 0) {
    head.sort((a, b) => separation(cursor, point(a)) - separation(cursor, point(b)));
    const next = head.shift()!;
    ordered.push(next);
    cursor = point(next);
  }
  if (last !== null) ordered.push(last);

  const portal = portalSpot(state, pool, ordered, point, random);
  if (portal === null) return null;
  return { objectives: [...ordered, portal], failedIndex: null, template, routeCheckpoints: [] };
}

function farthest(
  pool: readonly number[],
  avoid: readonly Vec3[],
  point: (index: number) => Vec3,
  random: () => number,
  separation: (a: Vec3, b: Vec3) => number,
): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const index of pool) {
    const p = point(index);
    const nearest = Math.min(...avoid.map((other) => separation(p, other)));
    if (nearest < 1.2) continue;
    // Capped so a far corner does not always win; the jitter makes seeds
    // produce genuinely different layouts.
    const score = Math.min(nearest, 6) + random() * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** A roomy spot for the exit: fully supported, a few metres from the start,
 * clear of the fragments. */
function portalSpot(
  state: WorldState,
  pool: readonly number[],
  fragments: readonly number[],
  point: (index: number) => Vec3,
  random: () => number,
): number | null {
  const spawn = point(state.spawnIndex);
  let best: number | null = null;
  let bestScore = Infinity;
  for (const index of pool) {
    if (fragments.includes(index)) continue;
    const patch = state.analysis.surfaces.standable[index]!;
    if (patch.supportNeighbors < 8) continue;
    const p = point(index);
    const fromFragments = Math.min(...fragments.map((f) => Math.hypot(p[0] - point(f)[0], p[2] - point(f)[2])));
    if (fromFragments < 1.5) continue;
    const fromSpawn = Math.hypot(p[0] - spawn[0], p[2] - spawn[2]);
    if (fromSpawn < 2) continue;
    const score = Math.abs(fromSpawn - 3.5) + Math.abs(p[1] - spawn[1]) * 0.5 + random() * 0.6;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** Up to three respawn-worthy points along a verified route: the takeoff of
 * each climb or jump, spaced out, never on top of the start or the beacon. */
function routeCheckpointsAlong(state: WorldState, route: readonly Transition[], beacon: number): number[] {
  const standable = state.analysis.surfaces.standable;
  const indexById = new Map(standable.map((patch, index) => [patch.id, index]));
  const spawn = standable[state.spawnIndex]!.point;
  const goal = standable[beacon]!.point;
  const picks: number[] = [];
  const far = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[2] - q[2]) + Math.abs(p[1] - q[1]);
  const consider = (patchId: string) => {
    const index = indexById.get(patchId);
    if (index === undefined || picks.includes(index)) return;
    const p = standable[index]!;
    if (p.supportNeighbors < 6) return;
    if (far(p.point, spawn) < 1.5 || far(p.point, goal) < 1.2) return;
    if (picks.some((other) => far(standable[other]!.point, p.point) < 1.5)) return;
    picks.push(index);
  };
  for (const transition of route) {
    if (transition.kind !== "walk") consider(transition.fromPatchId);
    if (picks.length >= 3) break;
  }
  if (picks.length < 2) {
    // Flat route: fall back to evenly spaced route points.
    for (const fraction of [1 / 3, 2 / 3]) {
      const transition = route[Math.floor(route.length * fraction)];
      if (transition) consider(transition.toPatchId);
    }
  }
  // Keep play order.
  const order = new Map(route.map((transition, i) => [indexById.get(transition.toPatchId) ?? -1, i]));
  route.forEach((transition, i) => {
    const from = indexById.get(transition.fromPatchId);
    if (from !== undefined && !order.has(from)) order.set(from, i - 0.5);
  });
  return picks.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

// ---------------------------------------------------------------------------
// Manifest assembly and final gates

function finalize(
  base: SceneManifest,
  geometry: AssetGeometryMap,
  input: AdventureRequest,
  state: WorldState,
  picked: PickedObjectives,
  deadline: WorkDeadline,
  diagnostics: string[],
  fallbackStage: AdventureGenerationDetail["fallbackStage"],
): AdventureGenerationDetail | null {
  const { analysis } = state;
  const standable = analysis.surfaces.standable;
  const spawnPatch = standable[state.spawnIndex]!;
  const chain = [spawnPatch.point, ...picked.objectives.map((index) => standable[index]!.point)];
  deadline.check("the route check");
  const report = validateRoute(analysis.surfaces, analysis.limits, chain);
  if (!report.allReachable) {
    const failed = report.segments.findIndex((segment) => !segment.reachable);
    picked.failedIndex = picked.objectives[failed] ?? null;
    return null;
  }

  deadline.check("the publish check");
  const manifest = assembleManifest(base, input, state, picked, report, diagnostics, fallbackStage);

  // The publish gate and schema reader must accept the draft as-is.
  const gate = validateExperiencePlacements(manifest, geometry, analysis.authored);
  if (!gate.ok) {
    diagnostics.push(`Discarded a layout the publish check refused: ${gate.issues.map((issue) => issue.detail ?? issue.message).join(" ")}`);
    picked.failedIndex = null;
    return null;
  }
  migrateSceneManifest(manifest);

  return {
    manifest,
    diagnostics: [...diagnostics],
    fallbackUsed: fallbackStage !== "none",
    report,
    structures: state.structures,
    chain,
    fallbackStage,
  };
}

function assembleManifest(
  base: SceneManifest,
  input: AdventureRequest,
  state: WorldState,
  picked: PickedObjectives,
  report: RouteValidationReport,
  diagnostics: readonly string[],
  fallbackStage: AdventureGenerationDetail["fallbackStage"],
): SceneManifest {
  const { authored } = state.analysis;
  const standable = state.analysis.surfaces.standable;
  const surfaceOf = (index: number) => standable[index]!.point;
  const centreOf = (index: number) => authoredCentreFromSurface(surfaceOf(index), authored);
  const spawnSurface = surfaceOf(state.spawnIndex);
  const firstTarget = picked.objectives[0] !== undefined ? surfaceOf(picked.objectives[0]) : spawnSurface;
  const now = new Date().toISOString();
  const mission = input.definition?.mission ?? NEUTRAL_MISSION;

  const sourceSpawnSurface = surfaceFromAuthoredCentre(base.spawn.position, authored);
  const keptSpawn =
    Math.hypot(sourceSpawnSurface[0] - spawnSurface[0], sourceSpawnSurface[2] - spawnSurface[2]) <= 0.6 &&
    Math.abs(sourceSpawnSurface[1] - spawnSurface[1]) <= 0.12;
  const spawn = {
    position: keptSpawn ? base.spawn.position : authoredCentreFromSurface(spawnSurface, authored),
    headingRadians: headingTo(spawnSurface, firstTarget),
  };

  const checkpointAt = (index: number, order: number, next: Vec3 | null): Checkpoint => {
    const position = centreOf(index);
    return {
      id: `adventure-checkpoint-${order + 1}`,
      order,
      position,
      triggerRadius: CHECKPOINT_TRIGGER_RADIUS,
      safeRespawn: {
        position,
        // Face onward along the route; the last one faces away from the start.
        headingRadians: next ? headingTo(surfaceOf(index), next) : headingTo(spawnSurface, surfaceOf(index)),
      },
    };
  };

  let mode: GameModeData;
  let collectibles: ColorFragmentEntity[] = [];
  let finishPortal: FinishPortalEntity | null = null;
  let checkpoints: Checkpoint[];
  let quest: LevelExperience["quest"];

  if (picked.template === "restore-portal") {
    const fragments = picked.objectives.slice(0, 3);
    const exit = picked.objectives[3]!;
    collectibles = fragments.map((index, order) => ({
      id: `adventure-fragment-${order + 1}`,
      kind: "color-fragment",
      transform: { position: centreOf(index), rotation: IDENTITY_QUAT, scale: [1, 1, 1] },
      triggerRadius: FRAGMENT_TRIGGER_RADIUS,
      color: mission.collectibleColor,
      order,
      restorationAmount: 1 / 3,
    }));
    finishPortal = {
      id: "adventure-portal",
      kind: "finish-portal",
      transform: { position: centreOf(exit), rotation: IDENTITY_QUAT, scale: [1, 1, 1] },
      triggerRadius: PORTAL_TRIGGER_RADIUS,
      activation: "all-required-collectibles",
      inactiveColor: "#8a8f98",
      activeColor: input.definition?.palette.accent ?? NEUTRAL_ACCENT,
    };
    mode = {
      kind: "collect",
      requiredCollectibleIds: collectibles.map((fragment) => fragment.id),
      requiredCount: collectibles.length,
      finishPortalId: finishPortal.id,
      restorationSteps: [1, 1, 1],
    };
    checkpoints = fragments.map((index, order) => checkpointAt(index, order, surfaceOf(picked.objectives[order + 1]!)));
    const objective = `Collect ${collectibles.length} ${mission.fragmentName}s, then ${lowerFirst(mission.portalTitle)}.`;
    quest = {
      schemaVersion: QUEST_TEXT_SCHEMA_VERSION,
      title: mission.portalTitle,
      intro: `${collectibles.length} ${mission.fragmentName}s are scattered around this place.`,
      objective,
      narrationScript: objective,
    };
  } else {
    const beacon = picked.objectives[picked.objectives.length - 1]!;
    const routeCheckpoints = picked.routeCheckpoints;
    const beaconPosition = centreOf(beacon);
    mode = {
      kind: "explore",
      destinations: [{ id: "adventure-beacon", position: beaconPosition, label: mission.beaconTitle }],
      optionalCollectibleIds: [],
    };
    const waypoints = [...routeCheckpoints, beacon];
    checkpoints = waypoints.map((index, order) =>
      checkpointAt(index, order, waypoints[order + 1] !== undefined ? surfaceOf(waypoints[order + 1]!) : null),
    );
    const objective = `Follow the route and ${lowerFirst(mission.beaconTitle)}.`;
    quest = {
      schemaVersion: QUEST_TEXT_SCHEMA_VERSION,
      title: mission.beaconTitle,
      intro: "A beacon is waiting at the end of the route.",
      objective,
      narrationScript: objective,
    };
  }

  const experience: LevelExperience = {
    schemaVersion: LEVEL_EXPERIENCE_SCHEMA_VERSION,
    style: base.experience?.style ?? { id: "cartoon", definitionVersion: STYLE_DEFINITION_SCHEMA_VERSION },
    mode,
    quest,
    collectibles,
    finishPortal,
    initialColorRestoration: 1,
  };

  const structureNotes = state.structures.length
    ? ` Added game structures: ${state.structures.map((structure) => `${structure.kind} (${structure.entityIds.join(", ")})`).join("; ")}.`
    : "";
  return {
    ...base,
    levelId: `${base.levelId}-adventure-${hash32(`${input.template}|${input.seed}`)}`,
    updatedAt: now,
    entities: [...base.entities, ...withUniqueIds(state.added, base.entities)],
    spawn,
    checkpoints,
    seed: input.seed,
    experience,
    adventure: { template: picked.template, seed: input.seed, generator: ADVENTURE_GENERATOR_VERSION },
    courseValidation: {
      status: "validated",
      method: report.method,
      checkedAt: now,
      evidence: `${report.evidence} Ordered chain: start, ${picked.objectives.length} objective(s) including the exit.${structureNotes}${
        fallbackStage === "none" ? "" : ` Fallback: ${fallbackStage}.`
      }`,
      uncertaintyNotes: `${report.uncertaintyNotes}${diagnostics.length ? ` ${diagnostics.join(" ")}` : ""}`,
    },
  };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * True only for structures this generator added: the world carries the
 * generator's `adventure` marker, and the entity is a game-added box or floor
 * with this module's id prefix. Anything else — original helpers, the source
 * mesh, or a user entity that happens to share the prefix on a world the
 * generator never touched — is preserved.
 */
export function isOwnGeneratedHelper(manifest: SceneManifest, entity: SceneManifest["entities"][number]): boolean {
  return (
    manifest.adventure !== undefined &&
    entity.kind !== "generated-mesh" &&
    // Stairs, bridges and routes are boxes, the fallback is a floor, and the
    // course planner's helpers (renamed `adventure-planner-N`) may be ramps.
    (entity.kind === "box" || entity.kind === "floor" || entity.kind === "ramp") &&
    entity.addedBy === "game" &&
    entity.id.startsWith(ADVENTURE_HELPER_PREFIX)
  );
}

/** Structures this module added to a manifest. */
export function adventureStructures(manifest: SceneManifest): HelperEntity[] {
  return helperEntitiesOf(manifest).filter((entity) => isOwnGeneratedHelper(manifest, entity));
}

/** Generated ids never collide with an entity preserved from the source. */
function withUniqueIds(added: readonly HelperEntity[], kept: SceneManifest["entities"]): HelperEntity[] {
  const taken = new Set(kept.map((entity) => entity.id));
  return added.map((entity) => {
    let id = entity.id;
    for (let n = 2; taken.has(id); n += 1) id = `${entity.id}-${n}`;
    taken.add(id);
    return id === entity.id ? entity : { ...entity, id };
  });
}
