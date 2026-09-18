import type { Vec3 } from "../../shared/geometry.js";
import type { MovementConfig } from "../../shared/movement.js";
import type { TriangleGrid } from "./spatial.js";
import {
  cellKey,
  nearestStandablePatch,
  type SurfaceMap,
  type SurfacePatch,
} from "./surfaces.js";

/**
 * Conservative reachability checking.
 *
 * This is NOT the character controller. It is a kinematic model of the same
 * tuning numbers (`shared/movement.ts`) with a safety factor applied, plus a
 * swept bounding-box clearance test along every proposed transition. It can
 * refuse something the live controller manages; it must never approve
 * something the controller cannot do. Euclidean proximity is never treated as
 * proof of reachability — every edge is a walk, a ballistic jump, or a mantle
 * with its own limits and its own clearance sweep.
 */

export type TransitionKind = "walk" | "jump" | "mantle";

export interface MovementLimits {
  /** Height change still treated as a step rather than a jump. */
  stepHeight: number;
  /** Furthest a walk edge may span before it counts as a jump. */
  walkMaxSpan: number;
  jumpHeight: number;
  /** Horizontal reach of a flat jump at walk speed, before safety factor. */
  flatJumpRange: number;
  gravity: number;
  walkSpeed: number;
  mantle: MovementConfig["mantle"];
  /** Fraction of the theoretical envelope accepted, so a validated route has
   * margin instead of sitting exactly on the physical limit. */
  safetyFactor: number;
  characterRadius: number;
  characterHeight: number;
  surfaceSkin: number;
}

export function deriveMovementLimits(
  movement: MovementConfig,
  surface: { cellSize: number; stepTolerance: number; surfaceSkin: number },
  safetyFactor = 0.7,
): MovementLimits {
  const characterHeight =
    2 * (movement.characterHalfHeight + movement.characterRadius);
  const launchSpeed = Math.sqrt(2 * movement.gravity * movement.jumpHeight);
  const flatAirTime = (2 * launchSpeed) / movement.gravity;
  return {
    stepHeight: surface.stepTolerance,
    walkMaxSpan: surface.cellSize * 1.75,
    jumpHeight: movement.jumpHeight,
    flatJumpRange: movement.walkSpeed * flatAirTime,
    gravity: movement.gravity,
    walkSpeed: movement.walkSpeed,
    mantle: movement.mantle,
    safetyFactor,
    characterRadius: movement.characterRadius,
    characterHeight,
    surfaceSkin: surface.surfaceSkin,
  };
}

/**
 * Horizontal distance still reachable by a jump that must gain `heightGain`
 * metres, from the ballistic model `y = v0·t − ½gt²` at constant walk speed.
 * Negative gains (dropping down) are allowed a bounded bonus rather than an
 * unbounded fall, so validation never relies on a huge uncontrolled drop.
 */
export function jumpRangeForHeightGain(
  limits: MovementLimits,
  heightGain: number,
): number {
  const usableHeight = limits.jumpHeight * limits.safetyFactor;
  if (heightGain > usableHeight) return 0;
  const launchSpeed = Math.sqrt(2 * limits.gravity * limits.jumpHeight);
  const discriminant = launchSpeed * launchSpeed - 2 * limits.gravity * heightGain;
  if (discriminant < 0) return 0;
  const airTime = (launchSpeed + Math.sqrt(discriminant)) / limits.gravity;
  const cappedAirTime = Math.min(airTime, (3 * launchSpeed) / limits.gravity);
  return limits.walkSpeed * cappedAirTime * limits.safetyFactor;
}

export interface Transition {
  readonly kind: TransitionKind;
  readonly fromPatchId: string;
  readonly toPatchId: string;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly horizontalDistance: number;
  readonly heightChange: number;
}

interface CandidateEdge {
  to: number;
  kind: TransitionKind;
  cost: number;
  horizontalDistance: number;
  heightChange: number;
}

export interface TransitionGraph {
  readonly patches: readonly SurfacePatch[];
  readonly edges: readonly (readonly CandidateEdge[])[];
  readonly limits: MovementLimits;
}

const KIND_PENALTY: Record<TransitionKind, number> = {
  walk: 0,
  jump: 0.6,
  mantle: 0.9,
};

/**
 * Candidate transitions between standable patches, filtered by the movement
 * envelope only. Clearance is deliberately NOT evaluated here — sweeping every
 * candidate edge on a 50k-triangle mesh is wasted work when a search visits a
 * small fraction of them. `findRoute` verifies clearance lazily and re-plans
 * around whatever it finds blocked.
 */
export function buildTransitionGraph(
  map: SurfaceMap,
  limits: MovementLimits,
): TransitionGraph {
  const patches = map.standable;
  const cellSize = map.options.cellSize;
  const byCell = new Map<string, number[]>();
  patches.forEach((patch, index) => {
    const key = cellKey(patch.cellX, patch.cellZ);
    const list = byCell.get(key);
    if (list) list.push(index);
    else byCell.set(key, [index]);
  });

  const maxHorizontal = Math.max(
    limits.walkMaxSpan,
    limits.flatJumpRange * limits.safetyFactor,
    limits.mantle.maxReachDistance,
  );
  const cellRadius = Math.ceil(maxHorizontal / cellSize);
  const edges: CandidateEdge[][] = patches.map(() => []);

  patches.forEach((patch, index) => {
    for (let dz = -cellRadius; dz <= cellRadius; dz += 1) {
      for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
        const others = byCell.get(cellKey(patch.cellX + dx, patch.cellZ + dz));
        if (!others) continue;
        for (const other of others) {
          if (other === index) continue;
          const target = patches[other]!;
          const horizontal = Math.hypot(
            target.point[0]! - patch.point[0]!,
            target.point[2]! - patch.point[2]!,
          );
          const rise = target.point[1]! - patch.point[1]!;
          const kind = classifyTransition(limits, horizontal, rise, target);
          if (!kind) continue;
          edges[index]!.push({
            to: other,
            kind,
            cost: horizontal + Math.abs(rise) + KIND_PENALTY[kind]!,
            horizontalDistance: horizontal,
            heightChange: rise,
          });
        }
      }
    }
  });

  return { patches, edges, limits };
}

function classifyTransition(
  limits: MovementLimits,
  horizontal: number,
  rise: number,
  target: SurfacePatch,
): TransitionKind | null {
  if (horizontal <= limits.walkMaxSpan && Math.abs(rise) <= limits.stepHeight) {
    return "walk";
  }
  if (
    rise >= limits.mantle.minLedgeHeight &&
    rise <= limits.mantle.maxLedgeHeight &&
    horizontal <= limits.mantle.maxReachDistance &&
    target.clearanceHeight >= limits.mantle.requiredClearanceHeight
  ) {
    return "mantle";
  }
  if (horizontal <= jumpRangeForHeightGain(limits, rise) && horizontal > 0) {
    return "jump";
  }
  return null;
}

/**
 * Swept clearance along a transition.
 *
 * Walks and mantles sweep a straight line; jumps sweep the actual ballistic
 * arc, so a jump is only accepted if the character's bounding box fits along
 * the path it would really travel. A mantle additionally requires the
 * destination's own standing clearance, which is why it can't be approximated
 * as a short jump.
 */
export function transitionIsClear(
  grid: TriangleGrid,
  limits: MovementLimits,
  from: Vec3,
  to: Vec3,
  kind: TransitionKind,
  samples = 10,
): boolean {
  const radius = limits.characterRadius;
  const height = limits.characterHeight;
  const skin = limits.surfaceSkin;
  const horizontal = Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!);
  const rise = to[1]! - from[1]!;

  /**
   * Position of the character's feet at normalized progress `s`.
   *
   * A mantle is two phases, exactly as the controller performs it: rise in
   * place beside the ledge until the feet clear its top, then step forward.
   * Modelling it as a diagonal slide would put the capsule inside the ledge
   * face for the whole climb and reject every mantle that exists.
   */
  const pathAt = (s: number): { x: number; z: number; feet: number } => {
    if (kind === "mantle") {
      if (s <= 0.5) {
        return { x: from[0]!, z: from[2]!, feet: from[1]! + rise * (s * 2) };
      }
      const t = (s - 0.5) * 2;
      return {
        x: from[0]! + (to[0]! - from[0]!) * t,
        z: from[2]! + (to[2]! - from[2]!) * t,
        feet: to[1]!,
      };
    }
    const x = from[0]! + (to[0]! - from[0]!) * s;
    const z = from[2]! + (to[2]! - from[2]!) * s;
    if (kind === "jump") {
      const launchSpeed = Math.sqrt(2 * limits.gravity * limits.jumpHeight);
      const discriminant =
        launchSpeed * launchSpeed - 2 * limits.gravity * Math.max(rise, 0);
      const airTime =
        discriminant >= 0
          ? (launchSpeed + Math.sqrt(discriminant)) / limits.gravity
          : (2 * launchSpeed) / limits.gravity;
      const t = s * airTime;
      const arc = launchSpeed * t - 0.5 * limits.gravity * t * t;
      // Never dip below the straight-line interpolation: the arc is the
      // higher of the two, and the sweep must cover the real path.
      return { x, z, feet: from[1]! + Math.max(arc, rise * s) };
    }
    return { x, z, feet: from[1]! + rise * s };
  };

  const steps = Math.max(samples, Math.ceil(horizontal / (radius * 1.5)) + 2);
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const { x, z, feet } = pathAt(s);
    const bottom = feet + (i === 0 || i === steps ? skin : skin * 0.5);
    const top = feet + height;
    if (top <= bottom) continue;
    if (
      grid.intersectsBox([x - radius, bottom, z - radius], [x + radius, top, z + radius])
    ) {
      return false;
    }
  }
  return true;
}

export interface RouteSegment {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly transitions: readonly Transition[];
  readonly reachable: boolean;
  readonly failureReason?: string;
}

export interface RouteFinderStats {
  /** Edges whose clearance sweep actually ran. */
  clearanceChecks: number;
  /** Edges rejected by the sweep and re-planned around. */
  blockedEdges: number;
  replans: number;
}

/**
 * Lazily-verified shortest path: plan on the movement envelope, sweep only the
 * edges the plan uses, blacklist whatever is blocked, re-plan. Terminates
 * either with a path whose every transition passed its sweep, or with no path.
 */
export function findRoute(
  graph: TransitionGraph,
  grid: TriangleGrid,
  startIndex: number,
  goalIndex: number,
  stats: RouteFinderStats,
  maxReplans = 400,
): Transition[] | null {
  const blocked = new Set<string>();
  const verified = new Map<string, boolean>();

  for (let attempt = 0; attempt <= maxReplans; attempt += 1) {
    const path = dijkstra(graph, startIndex, goalIndex, blocked);
    if (!path) return null;

    let allClear = true;
    for (const step of path) {
      const key = `${step.from}>${step.to}`;
      let clear = verified.get(key);
      if (clear === undefined) {
        stats.clearanceChecks += 1;
        clear = transitionIsClear(
          grid,
          graph.limits,
          graph.patches[step.from]!.point,
          graph.patches[step.to]!.point,
          step.edge.kind,
        );
        verified.set(key, clear);
      }
      if (!clear) {
        blocked.add(key);
        stats.blockedEdges += 1;
        allClear = false;
        break;
      }
    }
    if (!allClear) {
      stats.replans += 1;
      continue;
    }

    return path.map((step) => ({
      kind: step.edge.kind,
      fromPatchId: graph.patches[step.from]!.id,
      toPatchId: graph.patches[step.to]!.id,
      from: graph.patches[step.from]!.point,
      to: graph.patches[step.to]!.point,
      horizontalDistance: step.edge.horizontalDistance,
      heightChange: step.edge.heightChange,
    }));
  }
  return null;
}

function swap(values: number[], a: number, b: number): void {
  const temp = values[a]! as number;
  values[a] = values[b]! as number;
  values[b] = temp;
}

interface PathStep {
  from: number;
  to: number;
  edge: CandidateEdge;
}

function dijkstra(
  graph: TransitionGraph,
  start: number,
  goal: number,
  blocked: ReadonlySet<string>,
): PathStep[] | null {
  const count = graph.patches.length;
  const distance = new Float64Array(count).fill(Infinity);
  const cameFrom = new Int32Array(count).fill(-1);
  const cameEdge: (CandidateEdge | null)[] = new Array(count).fill(null);
  const visited = new Uint8Array(count);
  distance[start] = 0;

  // Binary heap keyed by tentative distance.
  const heap: number[] = [start];
  const heapKey = (index: number) => distance[index]!;
  const push = (value: number): void => {
    heap.push(value);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapKey(heap[parent]!) <= heapKey(heap[i]!)) break;
      swap(heap, parent, i);
      i = parent;
    }
  };
  const pop = (): number | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0]!;
    const last = heap.pop() as number;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heapKey(heap[left]!) < heapKey(heap[smallest]!)) {
          smallest = left;
        }
        if (right < heap.length && heapKey(heap[right]!) < heapKey(heap[smallest]!)) {
          smallest = right;
        }
        if (smallest === i) break;
        swap(heap, smallest, i);
        i = smallest;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const current = pop();
    if (current === undefined) break;
    if (visited[current]!) continue;
    visited[current] = 1;
    if (current === goal) break;

    for (const edge of graph.edges[current]!) {
      if (blocked.has(`${current}>${edge.to}`)) continue;
      const next = distance[current]! + edge.cost;
      if (next < distance[edge.to]!) {
        distance[edge.to] = next;
        cameFrom[edge.to] = current;
        cameEdge[edge.to] = edge;
        push(edge.to);
      }
    }
  }

  if (!Number.isFinite(distance[goal]!)) return null;
  const steps: PathStep[] = [];
  let cursor = goal;
  while (cursor !== start) {
    const previous = cameFrom[cursor]!;
    const edge = cameEdge[cursor]!;
    if (previous < 0 || !edge) return null;
    steps.push({ from: previous, to: cursor, edge });
    cursor = previous;
  }
  steps.reverse();
  return steps;
}

export interface RouteValidationReport {
  readonly allReachable: boolean;
  readonly segments: readonly RouteSegment[];
  readonly stats: RouteFinderStats;
  readonly method: string;
  readonly uncertaintyNotes: string;
  readonly evidence: string;
}

/**
 * Validates that each waypoint is reachable from the previous one.
 *
 * `waypoints` are standing-surface points (not capsule centres); each is
 * snapped to its nearest standable patch first, and a waypoint with no
 * standable patch nearby fails immediately rather than being quietly moved
 * somewhere plausible.
 */
export function validateRoute(
  map: SurfaceMap,
  limits: MovementLimits,
  waypoints: readonly Vec3[],
  snapRadius = 0.6,
): RouteValidationReport {
  const graph = buildTransitionGraph(map, limits);
  const stats: RouteFinderStats = {
    clearanceChecks: 0,
    blockedEdges: 0,
    replans: 0,
  };
  const indexOf = new Map<SurfacePatch, number>();
  graph.patches.forEach((patch, index) => indexOf.set(patch, index));

  const resolved: (number | null)[] = waypoints.map((point) => {
    const patch = nearestStandablePatch(map, point, 0.5);
    if (!patch) return null;
    const horizontal = Math.hypot(
      patch.point[0]! - point[0]!,
      patch.point[2]! - point[2]!,
    );
    if (horizontal > snapRadius) return null;
    return indexOf.get(patch) ?? null;
  });

  const segments: RouteSegment[] = [];
  let allReachable = true;
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const fromIndex = resolved[i]!;
    const toIndex = resolved[i + 1]!;
    if (fromIndex === null || toIndex === null) {
      allReachable = false;
      segments.push({
        fromIndex: fromIndex ?? -1,
        toIndex: toIndex ?? -1,
        transitions: [],
        reachable: false,
        failureReason:
          fromIndex === null
            ? `Waypoint ${i} has no standable surface within ${snapRadius} m.`
            : `Waypoint ${i + 1} has no standable surface within ${snapRadius} m.`,
      });
      continue;
    }
    if (fromIndex === toIndex) {
      segments.push({ fromIndex, toIndex, transitions: [], reachable: true });
      continue;
    }
    const route = findRoute(graph, map.grid, fromIndex, toIndex, stats);
    if (!route) {
      allReachable = false;
      segments.push({
        fromIndex,
        toIndex,
        transitions: [],
        reachable: false,
        failureReason: `No walk/jump/mantle route found from waypoint ${i} to waypoint ${i + 1} within the movement envelope.`,
      });
      continue;
    }
    segments.push({ fromIndex, toIndex, transitions: route, reachable: true });
  }

  const kinds = segments.flatMap((segment) =>
    segment.transitions.map((transition) => transition.kind),
  );
  const counts = {
    walk: kinds.filter((kind) => kind === "walk").length,
    jump: kinds.filter((kind) => kind === "jump").length,
    mantle: kinds.filter((kind) => kind === "mantle").length,
  };

  return {
    allReachable,
    segments,
    stats,
    method: `conservative-kinematic-v1 (safety factor ${limits.safetyFactor}, swept ${limits.characterRadius * 2}×${limits.characterHeight.toFixed(2)} m box clearance, ballistic jump model from ${limits.jumpHeight} m jump height at ${limits.walkSpeed} m/s)`,
    evidence: `${segments.length} segment(s): ${counts.walk} walk, ${counts.jump} jump, ${counts.mantle} mantle transitions; ${stats.clearanceChecks} clearance sweeps, ${stats.blockedEdges} transitions rejected by clearance, ${stats.replans} re-plans.`,
    uncertaintyNotes:
      "Checked against a kinematic model of the movement config, not the live Rapier controller. " +
      "It sweeps an axis-aligned box larger than the capsule, so it can refuse a passage the controller could make; " +
      "it does not model air control, sliding, momentum, or contact friction. A pass means 'no violation found under a conservative model', not 'played to completion'.",
  };
}
