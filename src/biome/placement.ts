/**
 * Geometry-safe biome decoration: where props and surface patches may go.
 *
 * Decoration never changes gameplay. Props are non-colliding and never enter
 * `manifest.entities`; this module only proposes placements the renderer may
 * draw. What it guarantees is that a drawn prop:
 *
 *  - stands on an upward-facing, supported surface. Rays cast down across its
 *    footprint must all land on that surface, so it never floats over an edge
 *    or sinks into a slope;
 *  - fits: nothing in the scan occupies the cylinder it would fill;
 *  - keeps a margin from its tier's edge (no palm trees on tiny ledges);
 *  - stays out of every gameplay exclusion: spawn, checkpoints, objectives and
 *    exit, the verified route between them, including jump takeoffs, landings
 *    and mantle climbs, and generated structures;
 *  - is sized from the runtime character's height, never from assumed metres.
 *
 * When the route cannot be proven the layout goes sparse instead of guessing.
 */
import type { HelperEntity, SceneManifest, Vec3 } from "@shared/index.js";
import { capsuleHeight } from "../game/core/characterScale.js";
import { buildCollisionSet } from "../scene/collision.js";
import { seededRandom } from "../scene/course.js";
import { helperEntityTriangles } from "../scene/helpers.js";
import { validateRoute } from "../scene/route.js";
import { cellKey, type SurfacePatch } from "../scene/surfaces.js";
import { computeBounds, mergeTriangleSoups } from "../scene/transform.js";
import {
  analyzeManifest,
  assetGeometryFromLoaded,
  distanceToSegment,
  helperEntitiesOf,
  raycastDown,
  surfaceFromAuthoredCentre,
  type SceneAnalysis,
} from "./geometry.js";
import { PROP_UNIT_RADIUS } from "./render/propGeometry.js";
import type {
  BiomeDefinition,
  BiomeExclusion,
  BiomeLayout,
  BiomePreparationInput,
  BiomePropKind,
  BiomePropPlacement,
  BiomeSurfacePatch,
} from "./types.js";

/**
 * Horizontal extent of each prop per unit of height: the renderer's own
 * `PROP_UNIT_RADIUS` plus a hair, so the clearance approved here always
 * covers what is drawn, even when the prop models change.
 */
export const PROP_FOOTPRINT_RATIO: Readonly<Record<BiomePropKind, number>> = Object.fromEntries(
  (Object.keys(PROP_UNIT_RADIUS) as BiomePropKind[]).map((kind) => [kind, PROP_UNIT_RADIUS[kind] + 0.02]),
) as Record<BiomePropKind, number>;

/** Which part of the biome's `scaleRange` (character heights) a kind uses. */
const KIND_SCALE_SHARE: Readonly<Record<BiomePropKind, readonly [number, number]>> = {
  palm: [0.65, 1],
  shrub: [0.15, 0.4],
  rock: [0.05, 0.3],
  wood: [0.15, 0.45],
  cactus: [0.4, 0.8],
  "dry-plant": [0.1, 0.35],
  windsock: [0.85, 1],
};

/** Relative frequency when a biome lists the kind. */
const KIND_WEIGHT: Readonly<Record<BiomePropKind, number>> = {
  palm: 0.22,
  shrub: 0.33,
  rock: 0.3,
  wood: 0.12,
  cactus: 0.2,
  "dry-plant": 0.3,
  windsock: 0,
};

/** Tall props need a real tier around them, not a ledge. */
const TALL_KINDS: ReadonlySet<BiomePropKind> = new Set(["palm", "cactus", "windsock"]);

const EXCLUSION_RADIUS = {
  spawn: 1.0,
  checkpoint: 0.8,
  objective: 0.9,
  portal: 1.2,
  walk: 0.45,
  jump: 0.6,
  jumpEnds: 0.75,
  mantle: 0.65,
  structureMargin: 0.3,
  /** Straight corridor used when a leg could not be proven. */
  unproven: 1.2,
} as const;

export interface ExclusionAnalysis {
  exclusions: BiomeExclusion[];
  /** False when a leg of the current mission had no provable route; the
   * layout then goes sparse. */
  certain: boolean;
  /** Surface points of the mission's waypoints (spawn first). */
  waypoints: Vec3[];
  notes: string[];
}

/** Contract entry point (`src/biome/types.ts`). */
export function prepareBiomeLayout(input: BiomePreparationInput): BiomeLayout {
  const { definition, manifest } = input;
  const seed = `${input.seed}:${definition.id}`;
  if (definition.id === "original" || definition.props.density <= 0 && definition.surface.patchCoverage <= 0 && !definition.ambient.water) {
    return emptyLayout(definition, seed, ["Original keeps the scan exactly as reconstructed."]);
  }

  const geometry = assetGeometryFromLoaded(input.assets);
  const analysis = analyzeManifest(manifest, geometry, input.movement);
  const exclusion = computeGameplayExclusions(manifest, analysis);
  const diagnostics = [...exclusion.notes];

  const bodyHeight = capsuleHeight(input.movement);
  const reduced = input.quality === "reduced";
  const propBudget = Math.floor(definition.budget.props * (reduced ? 0.5 : 1) * (exclusion.certain ? 1 : 0.3));
  const patchBudget = Math.floor(definition.budget.patches * (reduced ? 0.6 : 1));

  const helperBoxes = helperEntitiesOf(manifest)
    .filter((entity) => entity.kind !== "floor")
    .map((entity) => computeBounds(helperEntityTriangles(entity)));

  const props = placeProps(analysis, exclusion, definition, {
    seed,
    bodyHeight,
    budget: propBudget,
    helperBoxes,
    allowTall: exclusion.certain,
  });
  const patches = placeSurfacePatches(analysis, definition, seed, patchBudget);
  const water = definition.ambient.water ? waterRing(manifest, analysis, geometry, diagnostics) : null;

  diagnostics.push(
    `${props.length} props (budget ${propBudget}), ${patches.length} surface patches, ${exclusion.exclusions.length} gameplay exclusions${
      exclusion.certain ? "" : " (route unproven: sparse decoration)"
    }.`,
  );

  return {
    biomeId: definition.id,
    seed,
    props,
    patches,
    exclusions: exclusion.exclusions,
    bounds: { min: analysis.surfaces.bounds.min, max: analysis.surfaces.bounds.max },
    water,
    diagnostics,
  };
}

function emptyLayout(definition: BiomeDefinition, seed: string, diagnostics: string[]): BiomeLayout {
  return {
    biomeId: definition.id,
    seed,
    props: [],
    patches: [],
    exclusions: [],
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    water: null,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Gameplay exclusions

interface Waypoint {
  surface: Vec3;
  reason: BiomeExclusion["reason"];
  radius: number;
}

/** Support surface under a trigger that may float above it (fragments and
 * portals are sometimes authored well above the ground). */
function supportUnder(analysis: SceneAnalysis, position: Vec3): Vec3 {
  const centreSurface = surfaceFromAuthoredCentre(position, analysis.authored);
  const hit = raycastDown(analysis.grid, [position[0], position[1] + 0.05, position[2]], 3);
  if (hit && hit.point[1] >= centreSurface[1] - 1.5) return hit.point;
  return centreSurface;
}

function missionWaypoints(manifest: SceneManifest, analysis: SceneAnalysis): { respawn: Waypoint[]; objectives: Waypoint[] } {
  const authored = analysis.authored;
  const spawn: Waypoint = {
    surface: surfaceFromAuthoredCentre(manifest.spawn.position, authored),
    reason: "spawn",
    radius: EXCLUSION_RADIUS.spawn,
  };
  // Waypoints and ids come from this one sorted array so they stay paired.
  const sortedCheckpoints = [...manifest.checkpoints].sort((a, b) => a.order - b.order);
  const checkpoints = sortedCheckpoints
    .map((checkpoint): Waypoint => ({
      surface: surfaceFromAuthoredCentre(checkpoint.position, authored),
      reason: "checkpoint",
      radius: Math.max(EXCLUSION_RADIUS.checkpoint, checkpoint.triggerRadius + 0.3),
    }));

  const objectives: Waypoint[] = [spawn];
  const experience = manifest.experience;
  if (experience) {
    const mode = experience.mode;
    const fragments = [...experience.collectibles].sort((a, b) => a.order - b.order);
    const required = mode.kind === "collect" ? new Set(mode.requiredCollectibleIds) : null;
    for (const fragment of fragments) {
      if (required && !required.has(fragment.id)) continue;
      objectives.push({
        surface: supportUnder(analysis, fragment.transform.position),
        reason: "objective",
        radius: Math.max(EXCLUSION_RADIUS.objective, fragment.triggerRadius + 0.4),
      });
    }
    if (mode.kind === "explore") {
      for (const destination of mode.destinations) {
        objectives.push({
          surface: surfaceFromAuthoredCentre(destination.position, authored),
          reason: "objective",
          radius: EXCLUSION_RADIUS.objective,
        });
      }
    }
    if (mode.kind === "race") {
      const byId = new Map(checkpoints.map((waypoint, index) => [sortedCheckpoints[index]!.id, waypoint]));
      for (const id of mode.orderedCheckpointIds) {
        const waypoint = byId.get(id);
        if (waypoint) objectives.push(waypoint);
      }
    }
    if (experience.finishPortal) {
      objectives.push({
        surface: supportUnder(analysis, experience.finishPortal.transform.position),
        reason: "objective",
        radius: Math.max(EXCLUSION_RADIUS.portal, experience.finishPortal.triggerRadius + 0.45),
      });
    }
    // Optional collectibles are still marked, even though no route needs them.
    for (const fragment of fragments) {
      if (required && required.has(fragment.id)) continue;
      if (required) {
        objectives.push({
          surface: supportUnder(analysis, fragment.transform.position),
          reason: "objective",
          radius: Math.max(EXCLUSION_RADIUS.objective, fragment.triggerRadius + 0.4),
        });
      }
    }
  }
  return { respawn: [spawn, ...checkpoints], objectives };
}

/**
 * Exclusion zones for the manifest's current mission, derived from the same
 * conservative route validator the planner and publish gate use. Every
 * transition becomes a corridor; jumps also reserve their takeoff and
 * landing, and mantles the climb face.
 */
export function computeGameplayExclusions(manifest: SceneManifest, analysis: SceneAnalysis): ExclusionAnalysis {
  const { respawn, objectives } = missionWaypoints(manifest, analysis);
  const exclusions: BiomeExclusion[] = [];
  const notes: string[] = [];
  let certain = true;

  const point = (waypoint: Waypoint) => {
    exclusions.push({ start: waypoint.surface, end: waypoint.surface, radius: waypoint.radius, reason: waypoint.reason });
  };
  const seen = new Set<string>();
  for (const waypoint of [...respawn, ...objectives]) {
    const key = waypoint.surface.map((n) => n.toFixed(3)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    point(waypoint);
  }

  // Unordered optional markers are points only; the chains below are the
  // ordered legs a player actually travels.
  const chains = [respawn, objectives].filter((chain) => chain.length >= 2);
  for (const chain of chains) {
    const report = validateRoute(
      analysis.surfaces,
      analysis.limits,
      chain.map((waypoint) => waypoint.surface),
    );
    report.segments.forEach((segment, index) => {
      if (!segment.reachable) {
        certain = false;
        const a = chain[index]!.surface;
        const b = chain[index + 1]!.surface;
        exclusions.push({ start: a, end: b, radius: EXCLUSION_RADIUS.unproven, reason: "route" });
        return;
      }
      exclusions.push(...transitionExclusions(segment.transitions));
    });
    if (!report.allReachable) {
      notes.push("Part of the current route could not be proven reachable; decoration keeps a wide berth and stays sparse.");
    }
  }

  for (const helper of helperEntitiesOf(manifest)) {
    if (helper.kind === "floor") continue;
    exclusions.push(structureExclusion(helper));
  }

  return {
    exclusions,
    certain,
    waypoints: objectives.map((waypoint) => waypoint.surface),
    notes,
  };
}

function transitionExclusions(
  transitions: readonly { kind: "walk" | "jump" | "mantle"; from: Vec3; to: Vec3 }[],
): BiomeExclusion[] {
  const out: BiomeExclusion[] = [];
  // Merge runs of walking into straight-ish corridors so a long route is a
  // handful of segments rather than one per sampling cell.
  let walkStart: Vec3 | null = null;
  let walkEnd: Vec3 | null = null;
  const flushWalk = () => {
    if (walkStart && walkEnd) out.push({ start: walkStart, end: walkEnd, radius: EXCLUSION_RADIUS.walk, reason: "route" });
    walkStart = null;
    walkEnd = null;
  };
  for (const transition of transitions) {
    if (transition.kind === "walk") {
      if (walkStart && walkEnd) {
        const length = Math.hypot(transition.to[0] - walkStart[0], transition.to[2] - walkStart[2]);
        const deviation = distanceToSegment(walkEnd, walkStart, transition.to);
        if (length > 2.5 || deviation > 0.12 || Math.abs(transition.to[1] - walkStart[1]) > 0.15) {
          flushWalk();
          walkStart = transition.from;
        }
      } else {
        walkStart = transition.from;
      }
      walkEnd = transition.to;
      continue;
    }
    flushWalk();
    if (transition.kind === "jump") {
      // The arc rises above both ends; lift the corridor so tall props under
      // the jump are caught by the axis test.
      const lift = 0.35;
      out.push({
        start: [transition.from[0], transition.from[1] + lift, transition.from[2]],
        end: [transition.to[0], transition.to[1] + lift, transition.to[2]],
        radius: EXCLUSION_RADIUS.jump,
        reason: "route",
      });
      out.push({ start: transition.from, end: transition.from, radius: EXCLUSION_RADIUS.jumpEnds, reason: "route" });
      out.push({ start: transition.to, end: transition.to, radius: EXCLUSION_RADIUS.jumpEnds, reason: "route" });
    } else {
      // Mantle: rise in place, then forward onto the ledge.
      const top: Vec3 = [transition.from[0], transition.to[1], transition.from[2]];
      out.push({ start: transition.from, end: top, radius: EXCLUSION_RADIUS.mantle, reason: "route" });
      out.push({ start: top, end: transition.to, radius: EXCLUSION_RADIUS.mantle, reason: "route" });
    }
  }
  flushWalk();
  return out;
}

function structureExclusion(helper: HelperEntity): BiomeExclusion {
  const bounds = computeBounds(helperEntityTriangles(helper));
  const sizeX = bounds.max[0] - bounds.min[0];
  const sizeZ = bounds.max[2] - bounds.min[2];
  const top = bounds.max[1];
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const alongX = sizeX >= sizeZ;
  const half = (alongX ? sizeX - sizeZ : sizeZ - sizeX) / 2;
  const radius = Math.min(sizeX, sizeZ) / 2 + EXCLUSION_RADIUS.structureMargin;
  return {
    start: alongX ? [cx - half, top, cz] : [cx, top, cz - half],
    end: alongX ? [cx + half, top, cz] : [cx, top, cz + half],
    radius,
    reason: "route",
  };
}

// ---------------------------------------------------------------------------
// Props

interface PlaceOptions {
  seed: string;
  bodyHeight: number;
  budget: number;
  helperBoxes: readonly { min: Vec3; max: Vec3 }[];
  allowTall: boolean;
}

interface Taken {
  position: Vec3;
  radius: number;
  height: number;
}

export interface AnchorRequest {
  kind: BiomePropKind;
  height: number;
  radius: number;
  maxSlopeRadians: number;
  /** Extra same-tier margin beyond the footprint. */
  edgeMargin: number;
}

function placeProps(
  analysis: SceneAnalysis,
  exclusion: ExclusionAnalysis,
  definition: BiomeDefinition,
  options: PlaceOptions,
): BiomePropPlacement[] {
  const kinds = definition.props.kinds;
  if (kinds.length === 0 || options.budget <= 0 || definition.props.density <= 0) return [];
  const random = seededRandom(`${options.seed}:props`);
  const standable = analysis.surfaces.standable;
  const target = Math.min(options.budget, Math.round(standable.length * definition.props.density * 0.25));
  const maxSlope = Math.acos(Math.min(1, Math.max(0, definition.surface.upwardNormalMin)));

  // Deterministic shuffle of candidate surfaces.
  const order = standable.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  const taken: Taken[] = [];
  const placements: BiomePropPlacement[] = [];
  const [scaleLow, scaleHigh] = definition.props.scaleRange;
  const request = (kind: BiomePropKind): AnchorRequest => {
    const [shareLow, shareHigh] = KIND_SCALE_SHARE[kind];
    const share = shareLow + (shareHigh - shareLow) * random();
    const height = options.bodyHeight * (scaleLow + (scaleHigh - scaleLow) * share);
    const radius = height * PROP_FOOTPRINT_RATIO[kind];
    return {
      kind,
      height,
      radius,
      maxSlopeRadians: TALL_KINDS.has(kind) ? Math.min(maxSlope, 0.2) : maxSlope,
      edgeMargin: TALL_KINDS.has(kind) ? radius * 0.6 + 0.1 : radius * 0.15,
    };
  };
  const accept = (kind: BiomePropKind, spec: AnchorRequest, anchor: Anchor) => {
    taken.push({ position: anchor.position, radius: spec.radius, height: spec.height });
    placements.push({
      id: `prop-${kind}-${placements.length + 1}`,
      kind,
      position: anchor.position,
      normal: anchor.normal,
      scale: spec.height,
      yaw: random() * Math.PI * 2,
      radius: spec.radius,
    });
  };

  // The windsock first: exactly one, on open ground the player sees early.
  if (kinds.includes("windsock")) {
    const spec = request("windsock");
    const spawn = exclusion.waypoints[0];
    const near = [...order].sort((a, b) => {
      if (!spawn) return 0;
      const da = Math.abs(horizontal(standable[a]!.point, spawn) - 3);
      const db = Math.abs(horizontal(standable[b]!.point, spawn) - 3);
      return da - db;
    });
    for (const index of near.slice(0, 400)) {
      const anchor = testAnchor(analysis, exclusion, standable[index]!, spec, taken, options, 0.6);
      if (anchor) {
        accept("windsock", spec, anchor);
        break;
      }
    }
  }

  const weighted = kinds.filter((kind) => kind !== "windsock" && (options.allowTall || !TALL_KINDS.has(kind)));
  if (weighted.length === 0) return placements;
  const totalWeight = weighted.reduce((sum, kind) => sum + KIND_WEIGHT[kind], 0);
  // Big props claim space first.
  const plan: BiomePropKind[] = [];
  for (const kind of weighted) {
    const count = Math.round((target * KIND_WEIGHT[kind]) / totalWeight);
    for (let i = 0; i < count; i += 1) plan.push(kind);
  }
  plan.sort((a, b) => KIND_SCALE_SHARE[b][1] - KIND_SCALE_SHARE[a][1]);

  // Cluster-seeded candidate order (own stream, so no other draw shifts).
  const { spacing, reach, openShare } = groveScale(options.bodyHeight, definition.props.density);
  const grove = groveOrder(
    standable.map((patch) => patch.point),
    order,
    seededRandom(`${options.seed}:groves`),
    spacing,
    reach,
  );
  order.splice(0, order.length, ...grove.order);
  const openLimit = Math.ceil(target * openShare);
  let openPlaced = 0;

  let cursor = 0;
  const maxTests = Math.min(order.length * 3, 6000);
  let tests = 0;
  for (const kind of plan) {
    if (placements.length >= options.budget) break;
    const spec = request(kind);
    for (let attempt = 0; attempt < order.length && tests < maxTests; attempt += 1) {
      const candidate = order[cursor % order.length]!;
      const patch = standable[candidate]!;
      cursor += 1;
      tests += 1;
      // Open ground between groves is kept mostly open.
      const open = !grove.inGrove.has(candidate);
      if (open && openPlaced >= openLimit) continue;
      const anchor = testAnchor(analysis, exclusion, patch, spec, taken, options, 0);
      if (anchor) {
        accept(kind, spec, anchor);
        if (open) openPlaced += 1;
        break;
      }
    }
  }
  return placements;
}

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * Composition-aware candidate order (environment upgrade, Phase 5). Grove
 * centres are picked by a seeded greedy Poisson-disc over the candidates, at
 * least `spacing` apart; every candidate within `reach` of a centre is tried
 * first, nearest-to-centre first across all groves (so tall props claim the
 * centres and dressing fills around them), and only then the open ground in
 * `order`. This only changes WHICH safe spots are tried first: every anchor
 * still passes the full `testAnchor` check, so no guarantee changes.
 * Returns a permutation of `order` and which candidates lie in a grove.
 */
export function groveOrder(
  points: readonly Vec3[],
  order: readonly number[],
  random: () => number,
  spacing: number,
  reach: number,
): { order: number[]; inGrove: Set<number> } {
  const centres: Vec3[] = [];
  const shuffled = [...order];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  for (const index of shuffled) {
    const point = points[index]!;
    if (centres.every((centre) => horizontal(centre, point) >= spacing || Math.abs(centre[1] - point[1]) > reach)) centres.push(point);
  }
  const inGrove: { index: number; key: number }[] = [];
  const open: number[] = [];
  for (const index of order) {
    const point = points[index]!;
    let nearest = Infinity;
    for (const centre of centres) {
      if (Math.abs(centre[1] - point[1]) > reach) continue;
      nearest = Math.min(nearest, horizontal(centre, point));
    }
    if (nearest <= reach) inGrove.push({ index, key: nearest + random() * reach * 0.15 });
    else open.push(index);
  }
  inGrove.sort((a, b) => a.key - b.key);
  return { order: [...inGrove.map((entry) => entry.index), ...open], inGrove: new Set(inGrove.map((entry) => entry.index)) };
}

/**
 * Grove spacing and reach in character heights: sparser biomes (lower
 * density) get groves further apart and tighter, so a desert keeps more
 * open sand than an island.
 */
export function groveScale(bodyHeight: number, density: number): { spacing: number; reach: number; openShare: number } {
  const d = Math.min(1, Math.max(0, density));
  return {
    spacing: bodyHeight * (6 + 8 * (1 - d)),
    reach: bodyHeight * (1.5 + 5 * d),
    // Share of the placement target allowed on open ground between groves
    // (lone rocks, a cactus by itself); the rest must join a grove.
    openShare: 0.25,
  };
}

export interface Anchor {
  position: Vec3;
  normal: Vec3;
}

/**
 * The full safety test for one prop on one patch. Returns the exact support
 * point (from a ray, not the sampling grid) or null.
 */
export function testAnchor(
  analysis: SceneAnalysis,
  exclusion: ExclusionAnalysis,
  patch: SurfacePatch,
  spec: AnchorRequest,
  taken: readonly Taken[],
  options: { helperBoxes: readonly { min: Vec3; max: Vec3 }[] },
  extraExclusionMargin: number,
): Anchor | null {
  if (patch.slopeRadians > spec.maxSlopeRadians) return null;
  const cell = analysis.surfaceOptions.cellSize;
  // Jitter inside the cell so props do not line up on the sampling grid.
  const [px, , pz] = patch.point;
  const centreHit = raycastDown(analysis.grid, [px, patch.point[1] + 0.3, pz], 0.6);
  if (!centreHit) return null;
  const y = centreHit.point[1];
  if (Math.abs(y - patch.point[1]) > 0.08) return null;
  if (centreHit.normal[1] < Math.cos(spec.maxSlopeRadians)) return null;

  // Support: the whole footprint must rest on the same surface.
  const r = spec.radius * 0.8;
  const tolerance = Math.max(0.05, spec.radius * 0.25);
  for (const [dx, dz] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ] as const) {
    const hit = raycastDown(analysis.grid, [px + dx, y + 0.3, pz + dz], 0.6);
    if (!hit || Math.abs(hit.point[1] - y) > tolerance) return null;
  }

  // Tier margin: every cell under the footprint (plus margin) is the same tier.
  const rings = Math.ceil((spec.radius + spec.edgeMargin) / cell);
  const step = analysis.surfaceOptions.stepTolerance;
  for (let ix = -rings; ix <= rings; ix += 1) {
    for (let iz = -rings; iz <= rings; iz += 1) {
      const list = analysis.surfaces.byCell.get(cellKey(patch.cellX + ix, patch.cellZ + iz));
      if (!list || !list.some((other) => Math.abs(other.point[1] - y) <= step)) return null;
    }
  }

  // Clearance: nothing of the scan inside the prop's own volume.
  if (
    analysis.grid.intersectsBox(
      [px - spec.radius, y + analysis.surfaceOptions.surfaceSkin, pz - spec.radius],
      [px + spec.radius, y + spec.height, pz + spec.radius],
    )
  ) {
    return null;
  }

  // Not on or against generated structures.
  for (const box of options.helperBoxes) {
    if (
      px + spec.radius > box.min[0] - 0.1 &&
      px - spec.radius < box.max[0] + 0.1 &&
      pz + spec.radius > box.min[2] - 0.1 &&
      pz - spec.radius < box.max[2] + 0.1 &&
      y + spec.height > box.min[1] &&
      y < box.max[1] + 0.2
    ) {
      return null;
    }
  }

  // Gameplay exclusions, tested against the prop's whole vertical axis.
  const base: Vec3 = [px, y, pz];
  const tip: Vec3 = [px, y + spec.height, pz];
  for (const zone of exclusion.exclusions) {
    if (segmentDistance(base, tip, zone.start, zone.end) < zone.radius + spec.radius + extraExclusionMargin) return null;
  }

  // Spacing between props.
  for (const other of taken) {
    const gap = horizontal(other.position, base);
    const overlapsVertically = y < other.position[1] + other.height && other.position[1] < y + spec.height;
    if (overlapsVertically && gap < (other.radius + spec.radius) * 1.1 + 0.02) return null;
  }

  return { position: base, normal: centreHit.normal };
}

/** Closest distance between segments p1–q1 and p2–q2. */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp(-c / a);
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? clamp((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  const c1 = [p1[0] + d1[0]! * s, p1[1] + d1[1]! * s, p1[2] + d1[2]! * s];
  const c2 = [p2[0] + d2[0]! * t, p2[1] + d2[1]! * t, p2[2] + d2[2]! * t];
  return Math.hypot(c1[0]! - c2[0]!, c1[1]! - c2[1]!, c1[2]! - c2[2]!);
}

// ---------------------------------------------------------------------------
// Surface patches and water

function placeSurfacePatches(
  analysis: SceneAnalysis,
  definition: BiomeDefinition,
  seed: string,
  budget: number,
): BiomeSurfacePatch[] {
  if (budget <= 0 || definition.surface.patchCoverage <= 0) return [];
  const random = seededRandom(`${seed}:patches`);
  const cell = analysis.surfaceOptions.cellSize;
  const standable = analysis.surfaces.standable;
  const floorY = standable.length ? Math.min(...standable.map((patch) => patch.point[1])) : 0;
  const maxSlope = Math.acos(Math.min(1, Math.max(0, definition.surface.upwardNormalMin)));
  const candidates = standable.filter((patch) => patch.slopeRadians <= maxSlope);
  if (candidates.length === 0) return [];
  // Coverage cap: the treatment may cover at most this share of the
  // standable area, so the scan's own texture stays recognisable.
  const coverageArea = candidates.length * cell * cell * definition.surface.patchCoverage;

  const chosen: BiomeSurfacePatch[] = [];
  let area = 0;
  let floorCount = 0;
  const shuffled = candidates.map((patch) => ({ patch, key: random() })).sort((a, b) => a.key - b.key);
  for (const { patch } of shuffled) {
    if (chosen.length >= budget || area >= coverageArea) break;
    const onFloor = Math.abs(patch.point[1] - floorY) <= 0.05;
    if (onFloor && floorCount >= Math.ceil(budget / 3)) continue;
    // Largest radius whose rings stay on this tier (never overhang an edge).
    let rings = 0;
    for (let k = 1; k <= 4; k += 1) {
      let ok = true;
      for (let ix = -k; ix <= k && ok; ix += 1) {
        for (let iz = -k; iz <= k; iz += 1) {
          if (Math.max(Math.abs(ix), Math.abs(iz)) !== k) continue;
          const list = analysis.surfaces.byCell.get(cellKey(patch.cellX + ix, patch.cellZ + iz));
          if (!list || !list.some((other) => Math.abs(other.point[1] - patch.point[1]) <= 0.05)) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) break;
      rings = k;
    }
    if (rings < 1) continue;
    const radius = cell * (rings + 0.3) * (0.7 + random() * 0.3);
    const position = patch.point;
    if (chosen.some((other) => horizontal(other.position, position) < (other.radius + radius) * 0.9 && Math.abs(other.position[1] - position[1]) < 0.2)) {
      continue;
    }
    const hit = raycastDown(analysis.grid, [position[0], position[1] + 0.3, position[2]], 0.6);
    if (!hit || Math.abs(hit.point[1] - position[1]) > 0.08) continue;
    chosen.push({ position: hit.point, normal: hit.normal, radius });
    area += Math.PI * radius * radius;
    if (onFloor) floorCount += 1;
  }
  return chosen;
}

/**
 * Water only around a game floor that is the lowest support in the scene and
 * that the scan never dips below. The ring sits under the floor's top, so it
 * can never cover a route or a reconstructed object.
 */
function waterRing(
  manifest: SceneManifest,
  analysis: SceneAnalysis,
  geometry: ReturnType<typeof assetGeometryFromLoaded>,
  diagnostics: string[],
): BiomeLayout["water"] {
  const floor = helperEntitiesOf(manifest).find((entity) => entity.kind === "floor");
  if (!floor) {
    diagnostics.push("No game floor, so no water: its edge could not be placed safely.");
    return null;
  }
  const floorBounds = computeBounds(helperEntityTriangles(floor));
  const floorTop = floorBounds.max[1];
  const lowestSupport = Math.min(...analysis.surfaces.standable.map((patch) => patch.point[1]));
  const scan = buildCollisionSet(manifest, geometry).filter((entry) => !entry.addedByGame);
  const scanMinY = scan.length ? computeBounds(mergeTriangleSoups(scan.map((entry) => entry.triangles))).min[1] : floorTop;
  if (lowestSupport < floorTop - 0.05 || scanMinY < floorTop - 0.05) {
    diagnostics.push("The scan reaches below the game floor, so water was left out.");
    return null;
  }
  // The scan, every standing surface and every other structure must lie
  // inside the floor's footprint: the ring is only ever seen beyond the
  // floor's edge, so nothing playable or reconstructed can hang over it.
  const inset = 0.2;
  const insideFloor = (x: number, z: number) =>
    x >= floorBounds.min[0] + inset && x <= floorBounds.max[0] - inset && z >= floorBounds.min[2] + inset && z <= floorBounds.max[2] - inset;
  const everything = buildCollisionSet(manifest, geometry).filter((entry) => entry.entityId !== floor.id);
  const extent = everything.length ? computeBounds(mergeTriangleSoups(everything.map((entry) => entry.triangles))) : null;
  if (
    (extent && (!insideFloor(extent.min[0], extent.min[2]) || !insideFloor(extent.max[0], extent.max[2]))) ||
    analysis.surfaces.standable.some((patch) => !insideFloor(patch.point[0], patch.point[2]) && patch.point[1] > floorTop + 0.05)
  ) {
    diagnostics.push("Part of the scene reaches past the floor's edge, so water was left out.");
    return null;
  }
  const halfX = (floorBounds.max[0] - floorBounds.min[0]) / 2;
  const halfZ = (floorBounds.max[2] - floorBounds.min[2]) / 2;
  const innerRadius = Math.min(halfX, halfZ) * 0.9;
  const outerRadius = Math.hypot(halfX, halfZ) + Math.max(6, Math.max(halfX, halfZ) * 0.75);
  if (!(innerRadius > 0) || !(outerRadius > innerRadius * 1.05)) return null;
  return {
    center: [(floorBounds.min[0] + floorBounds.max[0]) / 2, floorTop - 0.06, (floorBounds.min[2] + floorBounds.max[2]) / 2],
    innerRadius,
    outerRadius,
  };
}
