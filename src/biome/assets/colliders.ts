/**
 * Composed clusters → primitive colliders for the props that should block
 * the character (`src/game/core/propColliders.ts` installs them).
 *
 * Colliders come from what is actually drawn: each hero or supporting
 * member of a cluster is measured once from its own unit mesh (cached per
 * template, so a look switch re-measures nothing) and gets one cheap convex
 * shape in that member's world transform, leans and the cluster fit
 * included:
 *
 *  - trees: a capsule as thick as the narrowest cross-section of the lower
 *    trunk (above any root flare, below the crown), up the whole height;
 *  - cacti and markers: a capsule as thick as the column or post near the
 *    ground;
 *  - rocks: a box over the rock's horizontal extent, trimmed so its corners
 *    stay inside a rounded hull;
 *  - bushes and upright dressing: a cylinder over the dense core of the
 *    foliage, a little lower than the top so leaves stay soft;
 *  - flat dressing (logs, slabs): a trimmed box, like rocks.
 *
 * Micro members (pebbles, flowers, fallen fronds) and grass never collide.
 * Every collider stays inside its cluster's geometry-approved footprint, so
 * it inherits every clearance `placement.ts` proved for that footprint:
 * spawn, checkpoints, objectives and the verified route between them. A
 * collider that pokes out (a box corner past a round hull, a leaning trunk)
 * is trimmed horizontally to fit, and left out if that would lose more than
 * a third of it.
 */
import * as THREE from "three";
import type { PropCollider, PropColliderShape } from "../../game/core/propColliders.js";
import type { BiomePropPlacement } from "../types.js";
import type { ComposedCluster, ComposedMember } from "./compose.js";
import type { AssetCategory, UnitMesh } from "./types.js";

/** Vertical band (unit heights) where a trunk or column is measured. */
const TRUNK_BAND: readonly [number, number] = [0.02, 0.15];
/** Slices a tree's lower trunk is measured in; its collider takes the thinnest. */
const TREE_SLICES = { from: 0.02, to: 0.42, size: 0.05 } as const;
/** Vertical band where foliage/body mass is measured. */
const BODY_BAND: readonly [number, number] = [0.1, 0.6];
/** Share of the body band's vertices inside the core radius. */
const BODY_PERCENTILE = 0.8;
/** Box colliders keep this share of a hull's horizontal extent. */
const BOX_TRIM = 0.8;
/** Bushes are solid to this share of their height; the top stays soft. */
const BUSH_HEIGHT_SHARE = 0.85;
/** Dressing wider than this × its height is treated as lying flat. */
const FLAT_ASPECT = 1.2;
/** Least share of its size a collider may be trimmed to so it fits. */
const MIN_TRIM = 0.65;
/** Smallest collider radius worth installing (metres). */
const MIN_RADIUS = 0.004;
/** Windsock pole radius per unit height (`windsock.ts`: 0.018–0.026). */
const WINDSOCK_POLE_RADIUS = 0.026;
const WINDSOCK_POLE_TOP = 0.96;

interface MeshProfile {
  trunkRadius: number;
  /** Narrowest slice of the lower trunk, so root flare never widens it. */
  treeTrunkRadius: number;
  bodyRadius: number;
  min: [number, number];
  max: [number, number];
  top: number;
}

const profiles = new WeakMap<UnitMesh, MeshProfile>();

/** Trunk, body and extent of a unit mesh (height 1, base on y = 0). */
export function meshProfile(mesh: UnitMesh): MeshProfile {
  const cached = profiles.get(mesh);
  if (cached) return cached;
  const p = mesh.positions;
  let trunk = 0;
  let trunkSamples = 0;
  const sliceCount = Math.ceil((TREE_SLICES.to - TREE_SLICES.from) / TREE_SLICES.size);
  const slices = new Array<number>(sliceCount).fill(-1);
  const body: number[] = [];
  const min: [number, number] = [Infinity, Infinity];
  const max: [number, number] = [-Infinity, -Infinity];
  let top = 0;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const y = p[i + 1]!;
    const z = p[i + 2]!;
    const r = Math.hypot(x, z);
    if (y >= TRUNK_BAND[0] && y <= TRUNK_BAND[1]) {
      trunk = Math.max(trunk, r);
      trunkSamples += 1;
    }
    if (y >= BODY_BAND[0] && y <= BODY_BAND[1]) body.push(r);
    if (y >= TREE_SLICES.from && y < TREE_SLICES.to) {
      const slice = Math.floor((y - TREE_SLICES.from) / TREE_SLICES.size);
      slices[slice] = Math.max(slices[slice]!, r);
    }
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], z);
    top = Math.max(top, y);
  }
  body.sort((a, b) => a - b);
  const bodyRadius = body.length ? body[Math.min(body.length - 1, Math.floor(body.length * BODY_PERCENTILE))]! : 0;
  const trunkRadius = trunkSamples > 0 ? trunk : bodyRadius * 0.5;
  const sampled = slices.filter((radius) => radius > 0);
  const profile: MeshProfile = {
    trunkRadius,
    treeTrunkRadius: sampled.length ? Math.min(...sampled) : trunkRadius,
    bodyRadius,
    min: Number.isFinite(min[0]) ? min : [0, 0],
    max: Number.isFinite(max[0]) ? max : [0, 0],
    top,
  };
  profiles.set(mesh, profile);
  return profile;
}

type LocalShape =
  | { kind: "capsule"; radius: number; bottom: number; top: number }
  | { kind: "cylinder"; radius: number; top: number }
  | { kind: "box"; centre: [number, number]; half: [number, number]; top: number };

/** The solid part of one member in its unit space, or null when it has none. */
function localShape(category: AssetCategory, profile: MeshProfile): LocalShape | null {
  const { top } = profile;
  if (!(top > 0)) return null;
  const box = (): LocalShape => ({
    kind: "box",
    centre: [(profile.min[0] + profile.max[0]) / 2, (profile.min[1] + profile.max[1]) / 2],
    half: [((profile.max[0] - profile.min[0]) / 2) * BOX_TRIM, ((profile.max[1] - profile.min[1]) / 2) * BOX_TRIM],
    top,
  });
  switch (category) {
    case "tree":
      return { kind: "capsule", radius: profile.treeTrunkRadius, bottom: 0, top };
    case "cactus":
    case "marker":
      return { kind: "capsule", radius: profile.trunkRadius, bottom: 0, top };
    case "rock":
      return box();
    case "bush":
      return { kind: "cylinder", radius: profile.bodyRadius, top: top * BUSH_HEIGHT_SHARE };
    case "dressing": {
      const halfWidth = Math.max(profile.max[0] - profile.min[0], profile.max[1] - profile.min[1]) / 2;
      if (halfWidth > top * FLAT_ASPECT) return box();
      return { kind: "cylinder", radius: profile.bodyRadius * 0.85, top: top * BUSH_HEIGHT_SHARE };
    }
    case "grass":
      return null;
  }
}

const scratch = {
  position: new THREE.Vector3(),
  rotation: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  point: new THREE.Vector3(),
  axis: new THREE.Vector3(),
};

/** One member's collider in world space, or null when it has no solid part. */
export function memberCollider(member: ComposedMember, id: string): PropCollider | null {
  if (member.role === "micro") return null;
  const local = localShape(member.family.category, meshProfile(member.mesh));
  if (!local) return null;
  member.matrix.decompose(scratch.position, scratch.rotation, scratch.scale);
  const s = Math.abs(scratch.scale.y);
  if (!(s > 0)) return null;
  const rotation = { x: scratch.rotation.x, y: scratch.rotation.y, z: scratch.rotation.z, w: scratch.rotation.w };
  // Horizontal lean of the member's up axis: how far its top drifts sideways.
  scratch.axis.set(0, 1, 0).applyQuaternion(scratch.rotation);
  const lean = Math.hypot(scratch.axis.x, scratch.axis.z);

  let centre: THREE.Vector3;
  let shape: PropColliderShape;
  let reach: number;
  let height: number;
  if (local.kind === "capsule") {
    const radius = local.radius * s;
    if (radius < MIN_RADIUS) return null;
    // Bottom sphere centred on the base (sunk into the ground), top sphere
    // just under the mesh's top: the side is straight from the ground up.
    const lower = local.bottom;
    const upper = Math.max(lower, local.top - local.radius);
    centre = scratch.point.set(0, (lower + upper) / 2, 0).applyMatrix4(member.matrix);
    const halfHeight = ((upper - lower) / 2) * s;
    shape = { kind: "capsule", radius, halfHeight };
    reach = radius + halfHeight * lean;
    height = local.top * s;
  } else if (local.kind === "cylinder") {
    const radius = local.radius * s;
    if (radius < MIN_RADIUS) return null;
    centre = scratch.point.set(0, local.top / 2, 0).applyMatrix4(member.matrix);
    const halfHeight = (local.top / 2) * s;
    shape = { kind: "cylinder", radius, halfHeight };
    reach = radius + halfHeight * lean;
    height = local.top * s;
  } else {
    const hx = local.half[0] * s;
    const hz = local.half[1] * s;
    if (Math.min(hx, hz) < MIN_RADIUS) return null;
    centre = scratch.point.set(local.centre[0], local.top / 2, local.centre[1]).applyMatrix4(member.matrix);
    const hy = (local.top / 2) * s;
    shape = { kind: "cuboid", halfExtents: { x: hx, y: hy, z: hz } };
    reach = Math.hypot(hx, hz) + hy * lean;
    height = local.top * s;
  }
  return {
    id,
    shape,
    position: { x: centre.x, y: centre.y, z: centre.z },
    rotation,
    baseY: member.base[1],
    height,
    reach,
  };
}

export interface ClusterColliderResult {
  colliders: PropCollider[];
  /** Solid members left out because their shape would leave the footprint. */
  outside: number;
}

/**
 * Colliders for every drawn cluster, primaries first (in layout order) and
 * then companions tallest first, so a collider budget cut on the physics
 * side only ever drops the smallest companions.
 */
export function clusterColliders(
  clusters: readonly ComposedCluster[],
  drawn: (member: ComposedMember) => boolean = () => true,
): ClusterColliderResult {
  const primaries: PropCollider[] = [];
  const companions: PropCollider[] = [];
  let outside = 0;
  for (const cluster of clusters) {
    cluster.members.forEach((member, index) => {
      if (!drawn(member)) return;
      const collider = memberCollider(member, `${cluster.placementId}:${index}`);
      if (!collider) return;
      const gap = Math.hypot(collider.position.x - cluster.base[0], collider.position.z - cluster.base[2]);
      const fitted = trimToReach(collider, cluster.radius - gap);
      if (!fitted) {
        outside += 1;
        return;
      }
      (index === 0 ? primaries : companions).push(fitted);
    });
  }
  companions.sort((a, b) => b.height - a.height);
  return { colliders: [...primaries, ...companions], outside };
}

/**
 * The collider narrowed horizontally so it reaches no further than `allowed`
 * from its centre, or null when that would take more than a third off it.
 */
function trimToReach(collider: PropCollider, allowed: number): PropCollider | null {
  if (collider.reach <= allowed + 1e-9) return collider;
  const shape = collider.shape;
  // The part of the reach that comes from the lean, which trimming the
  // cross-section cannot change.
  const tiltReach = shape.kind === "cuboid"
    ? collider.reach - Math.hypot(shape.halfExtents.x, shape.halfExtents.z)
    : collider.reach - shape.radius;
  const across = shape.kind === "cuboid" ? Math.hypot(shape.halfExtents.x, shape.halfExtents.z) : shape.radius;
  const k = (allowed - tiltReach) / across;
  if (!(k >= MIN_TRIM)) return null;
  const trimmed: PropColliderShape = shape.kind === "cuboid"
    ? { kind: "cuboid", halfExtents: { x: shape.halfExtents.x * k, y: shape.halfExtents.y, z: shape.halfExtents.z * k } }
    : { ...shape, radius: shape.radius * k };
  return { ...collider, shape: trimmed, reach: tiltReach + across * k };
}

/** The windsock's pole: a thin wall at the placement, as tall as the pole. */
export function windsockCollider(placement: BiomePropPlacement, height: number): PropCollider {
  const radius = WINDSOCK_POLE_RADIUS * height;
  const poleTop = WINDSOCK_POLE_TOP * height;
  const upper = Math.max(0, poleTop - radius);
  const [x, y, z] = placement.position;
  return {
    id: `${placement.id}:pole`,
    shape: { kind: "capsule", radius, halfHeight: upper / 2 },
    position: { x, y: y + upper / 2, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    baseY: y,
    height: poleTop,
    reach: radius,
  };
}
