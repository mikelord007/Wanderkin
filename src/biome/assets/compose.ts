/**
 * Placement → composition. Each geometry-approved placement becomes one
 * cluster: a primary asset plus optional secondary and micro dressing, all
 * inside the single footprint geometry reserved for it.
 *
 * The containment guarantee does not depend on any builder being right:
 * after laying the cluster out, every transformed vertex is measured and the
 * whole cluster is scaled about its base point so its horizontal extent stays
 * within the drawn footprint and its top within the drawn height. Leans,
 * mirrors, fronds and companions included.
 *
 * Layout and per-member variation are seeded from the layout seed, the
 * placement id and the member's slot. Variant bags are consumed in layout
 * order, so a budget that cuts the tail never changes the clusters before it.
 */
import * as THREE from "three";
import type { BiomePropKind, BiomePropPlacement, EffectsQuality } from "../types.js";
import { PROP_UNIT_RADIUS } from "../render/propGeometry.js";
import { seededRandom } from "../render/selection.js";
import type { AssetFamily, AssetRole, BiomeArt, BiomeTones, CompositionPreset, UnitMesh, VariantBuilder } from "./types.js";

export type Vec3Tuple = [number, number, number];

export interface ComposedMember {
  familyId: string;
  family: AssetFamily;
  variant: number;
  mesh: UnitMesh;
  /** Unit mesh → world. */
  matrix: THREE.Matrix4;
  /** World base point (sway pivot) and world height. */
  base: Vec3Tuple;
  height: number;
  /** Linear RGB 3x3 tone transform (hue rotation × lightness), row-major. */
  tone: readonly number[];
  role: AssetRole;
}

export interface ComposedCluster {
  placementId: string;
  kind: BiomePropKind;
  presetId: string;
  base: Vec3Tuple;
  /** Unit support normal at the base (for ground decals). */
  normal: Vec3Tuple;
  /** Horizontal footprint radius the cluster was fitted into. */
  radius: number;
  /** Height the cluster was fitted under. */
  height: number;
  /** Uniform shrink applied by the fit (1 = none). */
  fit: number;
  members: ComposedMember[];
}

export interface ComposeInput {
  placement: BiomePropPlacement;
  /** Drawn height from selection (already clamped to the footprint). */
  height: number;
}

export interface CompositionResult {
  clusters: ComposedCluster[];
  /** Placements whose kind the art does not draw. */
  unstyled: number;
  /** Members removed to honour the triangle budget. */
  trimmed: number;
  triangles: number;
}

// ---------------------------------------------------------------------------
// Template cache: CPU-only arrays, keyed by tone set and builder identity.

const templates = new WeakMap<BiomeTones, WeakMap<VariantBuilder, UnitMesh>>();

export function variantMesh(tones: BiomeTones, builder: VariantBuilder): UnitMesh {
  let byBuilder = templates.get(tones);
  if (!byBuilder) {
    byBuilder = new WeakMap();
    templates.set(tones, byBuilder);
  }
  let mesh = byBuilder.get(builder);
  if (!mesh) {
    mesh = builder(tones);
    byBuilder.set(builder, mesh);
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// Variant picking: a shuffle bag per family spreads variants evenly and never
// repeats one back to back across a refill.

export class VariantPicker {
  private readonly bags = new Map<string, number[]>();
  private readonly last = new Map<string, number>();
  private readonly random: () => number;

  constructor(seed: string) {
    this.random = seededRandom(`${seed}:variants`);
  }

  next(familyId: string, family: AssetFamily): number {
    const count = family.variants.length;
    if (count <= 1) return 0;
    let bag = this.bags.get(familyId);
    if (!bag || bag.length === 0) {
      // Rarity = how many rounds a variant appears in. Each round is its own
      // shuffle with no duplicates, and the first pick of a round is never the
      // last pick of the previous one, so no variant repeats back to back.
      const copies = Array.from({ length: count }, (_, v) =>
        Math.max(1, Math.round(Math.max(0, family.weights?.[v] ?? 1) * 4)));
      const rounds = Math.max(...copies);
      const sequence: number[] = [];
      let previous = this.last.get(familyId);
      for (let r = 0; r < rounds; r += 1) {
        const round = copies.flatMap((c, v) => (c > r ? [v] : []));
        for (let i = round.length - 1; i > 0; i -= 1) {
          const j = Math.floor(this.random() * (i + 1));
          [round[i], round[j]] = [round[j]!, round[i]!];
        }
        if (round.length > 1 && round[0] === previous) [round[0], round[1]] = [round[1]!, round[0]!];
        if (round.length === 1 && round[0] === previous) continue;
        sequence.push(...round);
        previous = sequence[sequence.length - 1];
      }
      if (sequence.length === 0) sequence.push(...copies.map((_, v) => v).filter((v) => v !== this.last.get(familyId)));
      bag = sequence.reverse();
      this.bags.set(familyId, bag);
    }
    const variant = bag.pop()!;
    this.last.set(familyId, variant);
    return variant;
  }
}

// ---------------------------------------------------------------------------

const ROLE_ORDER: Readonly<Record<AssetRole, number>> = { micro: 0, supporting: 1, hero: 2 };
const UP = new THREE.Vector3(0, 1, 0);

interface LocalMember {
  familyId: string;
  family: AssetFamily;
  x: number;
  z: number;
  height: number;
  yaw: number;
  primary: boolean;
  /** Stable slot in the layout; seeds this member's own random stream. */
  slot: number;
}

function lerp([a, b]: readonly [number, number], t: number): number {
  return a + (b - a) * t;
}

function pickPreset(options: readonly { preset: CompositionPreset; weight: number }[], random: () => number): CompositionPreset | null {
  const total = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
  if (options.length === 0 || !(total > 0)) return null;
  let roll = random() * total;
  for (const option of options) {
    roll -= Math.max(0, option.weight);
    if (roll <= 0) return option.preset;
  }
  return options[options.length - 1]!.preset;
}

/** Smooth value noise in [-1, 1] over world XZ (one cell ≈ `cell` units). */
function regionNoise(x: number, z: number, cell: number, salt: number): number {
  const hash = (i: number, j: number) => {
    const h = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  };
  const u = x / cell;
  const v = z / cell;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const su = fu * fu * (3 - 2 * fu);
  const sv = fv * fv * (3 - 2 * fv);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * su;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * su;
  return a + (b - a) * sv;
}

/**
 * Regional tone drift: neighbouring groves share a slight hue/lightness
 * offset that changes slowly across the scene (natural patchiness, not
 * per-object noise). Bounded by the art's own jitter limits.
 */
export function regionalTone(art: BiomeArt, x: number, z: number): { hue: number; light: number } {
  const cell = 1.2; // world units: a few groves per cell on a room-scale scan
  return {
    hue: ((regionNoise(x, z, cell, 1) * art.variation.hueJitterDeg * 0.6) * Math.PI) / 180,
    light: regionNoise(x, z, cell, 2) * art.variation.toneJitter * 0.8,
  };
}

/** Row-major linear-RGB hue rotation about the grey axis, times a lightness factor. */
export function toneMatrix(hueRadians: number, lightness: number): number[] {
  const c = Math.cos(hueRadians);
  const s = Math.sin(hueRadians);
  const a = (1 - c) / 3;
  const b = Math.sqrt(1 / 3) * s;
  const k = 1 + lightness;
  return [c + a, a - b, a + b, a + b, c + a, a - b, a - b, a + b, c + a].map((v) => v * k);
}

/**
 * Lays out one cluster in the placement's local disc and fits it into the
 * footprint. Returns null when the art has no preset for the kind.
 */
export function composeCluster(
  art: BiomeArt,
  input: ComposeInput,
  seed: string,
  quality: EffectsQuality,
  picker: VariantPicker,
): ComposedCluster | null {
  const { placement, height } = input;
  const kind = placement.kind;
  const random = seededRandom(`${seed}:cluster:${placement.id}`);
  const preset = pickPreset(art.compositions[kind] ?? [], random);
  if (!preset) return null;
  const primaryFamily = art.families[preset.primary];
  if (!primaryFamily || primaryFamily.variants.length === 0) return null;

  const radius = Math.min(placement.radius, height * PROP_UNIT_RADIUS[kind]);
  const cap = Math.max(1, art.budgets.membersPerCluster[quality]);

  // ---- Layout in the local disc (world axes, relative to the base) --------
  const local: LocalMember[] = [];
  const offsetAngle = random() * Math.PI * 2;
  // The primary may sit off-centre only as far as its own extent allows.
  const offsetRoom = Math.max(0, radius - primaryFamily.unitRadius * height);
  const offset = Math.min(offsetRoom, (preset.primaryOffset ?? 0) * radius * random());
  local.push({
    familyId: preset.primary,
    family: primaryFamily,
    x: Math.cos(offsetAngle) * offset,
    z: Math.sin(offsetAngle) * offset,
    height,
    yaw: placement.yaw,
    primary: true,
    slot: 0,
  });
  const spacing = (member: LocalMember) => member.family.unitRadius * member.height * 0.45;
  let slot = 0;
  for (const group of preset.members) {
    const family = art.families[group.family];
    const chance = group.chance ?? 1;
    const roll = random();
    const count = Math.round(lerp(group.count, random()));
    if (!family || family.variants.length === 0 || roll > chance) continue;
    if (quality === "reduced" && family.role === "micro") continue;
    for (let i = 0; i < count; i += 1) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const angle = random() * Math.PI * 2;
        const ringRoll = random();
        let memberHeight = lerp(group.height, random()) * height;
        // Keep the whole member inside the footprint: its ring distance plus
        // its own extent. A member too wide for its ring is shrunk (never by
        // more than half) instead of forcing the fit to shrink the cluster.
        const inner = group.ring[0] * radius;
        const room = radius - inner;
        if (family.unitRadius * memberHeight > room) {
          const shrunk = room / family.unitRadius;
          if (shrunk < memberHeight * 0.5) continue;
          memberHeight = shrunk;
        }
        const outer = Math.max(inner, Math.min(group.ring[1] * radius, radius - family.unitRadius * memberHeight));
        const distance = inner + (outer - inner) * ringRoll;
        const candidate: LocalMember = {
          familyId: group.family,
          family,
          x: Math.cos(angle) * distance,
          z: Math.sin(angle) * distance,
          height: memberHeight,
          yaw: random() * Math.PI * 2,
          primary: false,
          slot: (slot += 1),
        };
        const clear = local.every((other) =>
          Math.hypot(other.x - candidate.x, other.z - candidate.z) >= spacing(other) + spacing(candidate));
        if (clear && memberHeight > 0) {
          local.push(candidate);
          break;
        }
      }
    }
  }
  // Keep the most important members when over the per-cluster cap.
  const kept = local
    .map((member, order) => ({ member, order }))
    .sort((a, b) => (a.member.primary ? -1 : b.member.primary ? 1 : ROLE_ORDER[b.member.family.role] - ROLE_ORDER[a.member.family.role] || a.order - b.order))
    .slice(0, cap)
    .sort((a, b) => a.order - b.order)
    .map(({ member }) => member);

  // ---- World transforms -----------------------------------------------------
  const [bx, by, bz] = placement.position;
  const normal = new THREE.Vector3(placement.normal[0], placement.normal[1], placement.normal[2]);
  if (!(normal.lengthSq() > 1e-12) || normal.normalize().y < 0.2) normal.copy(UP);
  const tilt = new THREE.Quaternion().setFromUnitVectors(UP, normal);
  const planeY = (x: number, z: number) => -(normal.x * x + normal.z * z) / normal.y;
  const rotation = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();
  const leanQuat = new THREE.Quaternion();
  const leanAxis = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  const region = regionalTone(art, bx, bz);
  const members: ComposedMember[] = kept.map((member) => {
    // Each member draws from its own stream, so dropping one member (reduced
    // quality, the per-cluster cap) never changes how another looks.
    const random = seededRandom(`${seed}:cluster:${placement.id}:m${member.slot}`);
    const family = member.family;
    const variant = picker.next(member.familyId, family);
    const mesh = variantMesh(art.tones, family.variants[variant]!);
    yawQuat.setFromAxisAngle(UP, member.yaw);
    const lean = (family.leanMax ?? 0) * random();
    const leanDirection = random() * Math.PI * 2;
    leanAxis.set(Math.cos(leanDirection), 0, Math.sin(leanDirection));
    leanQuat.setFromAxisAngle(leanAxis, lean);
    rotation.identity().slerp(tilt, Math.min(1, Math.max(0, family.alignToNormal ?? 0)));
    rotation.multiply(leanQuat).multiply(yawQuat);
    const mirror = family.mirror && random() < 0.5 ? -1 : 1;
    const [embedLow, embedHigh] = family.embed ?? [0, 0];
    const embed = lerp([embedLow, embedHigh], random()) * member.height;
    const hueJitter = ((random() * 2 - 1) * art.variation.hueJitterDeg * Math.PI) / 180;
    const lightJitter = (random() * 2 - 1) * art.variation.toneJitter;
    const y = by + planeY(member.x, member.z) - embed;
    position.set(bx + member.x, y, bz + member.z);
    scale.set(member.height * mirror, member.height, member.height);
    return {
      familyId: member.familyId,
      family,
      variant,
      mesh,
      matrix: new THREE.Matrix4().compose(position, rotation, scale),
      base: [bx + member.x, y, bz + member.z],
      height: member.height,
      tone: toneMatrix(hueJitter + region.hue, lightJitter + region.light),
      role: family.role,
    };
  });

  // ---- Fit: measure the real transformed extent and shrink about the base ---
  let extent = 0;
  let top = 0;
  const v = new THREE.Vector3();
  for (const member of members) {
    const p = member.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i]!, p[i + 1]!, p[i + 2]!).applyMatrix4(member.matrix);
      extent = Math.max(extent, Math.hypot(v.x - bx, v.z - bz));
      top = Math.max(top, v.y - by);
    }
  }
  const fit = Math.min(1, extent > 0 ? radius / extent : 1, top > 0 ? height / top : 1);
  if (fit < 1) {
    const about = new THREE.Matrix4()
      .makeTranslation(bx, by, bz)
      .multiply(new THREE.Matrix4().makeScale(fit, fit, fit))
      .multiply(new THREE.Matrix4().makeTranslation(-bx, -by, -bz));
    for (const member of members) {
      member.matrix.premultiply(about);
      member.base = [bx + (member.base[0] - bx) * fit, by + (member.base[1] - by) * fit, bz + (member.base[2] - bz) * fit];
      member.height *= fit;
    }
  }

  return {
    placementId: placement.id,
    kind,
    presetId: preset.id,
    base: [bx, by, bz],
    normal: [normal.x, normal.y, normal.z],
    radius,
    height,
    fit,
    members,
  };
}

/**
 * Composes every drawn placement, then trims micro (then supporting) members,
 * last clusters first, until the art's triangle budget holds. Primaries are
 * never trimmed; the placement budget already bounds them.
 */
export function composeLayout(
  art: BiomeArt,
  inputs: readonly ComposeInput[],
  seed: string,
  quality: EffectsQuality,
): CompositionResult {
  const picker = new VariantPicker(seed);
  const clusters: ComposedCluster[] = [];
  let unstyled = 0;
  for (const input of inputs) {
    const cluster = composeCluster(art, input, seed, quality, picker);
    if (cluster) clusters.push(cluster);
    else unstyled += 1;
  }
  let triangles = clusters.reduce((sum, cluster) => sum + cluster.members.reduce((s, m) => s + m.mesh.triangles, 0), 0);
  const cap = art.budgets.triangles[quality];
  let trimmed = 0;
  for (const role of ["micro", "supporting"] as const) {
    for (let c = clusters.length - 1; c >= 0 && triangles > cap; c -= 1) {
      const cluster = clusters[c]!;
      for (let m = cluster.members.length - 1; m >= 1 && triangles > cap; m -= 1) {
        const member = cluster.members[m]!;
        if (member.role !== role) continue;
        triangles -= member.mesh.triangles;
        cluster.members.splice(m, 1);
        trimmed += 1;
      }
    }
  }
  return { clusters, unstyled, trimmed, triangles };
}
