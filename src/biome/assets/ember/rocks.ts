/**
 * Ember rock families (Ember art; built on the shared mesh kit).
 *
 * Volcanic ground reads through a few strong, deliberate forms, not noise:
 *  - basalt columns: hexagonal prisms packed on a lattice, stepped heights,
 *    bevelled pale ash-dusted tops over dark sides (the Giant's Causeway
 *    read), with the odd broken, tilted or jointed column;
 *  - obsidian: sheared volcanic-glass blades, near-black with a violet sheen
 *    on their up-facing cut planes;
 *  - cinder cones: miniature volcanoes with gullied flanks, a breached rim
 *    and a crater (optionally still glowing);
 *  - cooled lava: overlapping flattened lobes of dark crust, optionally with
 *    a molten toe where they meet the ground;
 *  - scoria: rust-brown porous stones for dressing.
 * Glow here is vertex colour only (never emissive, never an extra draw) and
 * used sparingly; the real glow lives in the ground cracks and the lava ring.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { hash01, hull, lobe, type HullOptions } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;
type Vec = THREE.Vector3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rampOf = (tones: BiomeTones, name: string, fallback: string): Ramp => linearRamp(tones[name] ?? tones[fallback] ?? tones.rock);

// ---------------------------------------------------------------------------
// Basalt columns

/** One hexagonal column. Positions are in the builder's native units. */
export interface ColumnSpec {
  x: number;
  z: number;
  /** Circumradius of the hexagon. */
  radius: number;
  height: number;
  /** Top slope along x / z (a sheared or broken top). */
  tilt?: readonly [number, number];
  /** Shear of the whole column along x / z per unit height (a leaning column). */
  lean?: readonly [number, number];
  /** Height fraction of a cross-joint: a lit ledge where the column narrows. */
  joint?: number;
  /** Tone offset for this column, −0.2..0.2. */
  shade?: number;
}

/**
 * A bevelled hexagonal prism as a flat-shaded triangle soup: slightly flared
 * foot, sides, an optional cross-joint ledge, a bevel ring and a flat top.
 * About 28 triangles (52 with a joint).
 */
export function hexColumn(spec: ColumnSpec, seed: number, yaw = Math.PI / 6, bevel = 0.2): THREE.BufferGeometry {
  const { x: cx, z: cz, radius: r, height: h } = spec;
  const [tx, tz] = spec.tilt ?? [0, 0];
  const [lx, lz] = spec.lean ?? [0, 0];
  // Irregular hexagon: each corner a little in or out, fixed per column.
  const wobble = Array.from({ length: 6 }, (_, k) => 1 + (hash01(k, seed, 3.7) - 0.5) * 0.16);
  const ring = (factor: number, y: (x: number, z: number) => number): Vec[] =>
    wobble.map((w, k) => {
      const a = yaw + (k * Math.PI) / 3;
      const x = Math.cos(a) * r * factor * w;
      const z = Math.sin(a) * r * factor * w;
      const yy = y(x, z);
      return new THREE.Vector3(cx + x + lx * yy, yy, cz + z + lz * yy);
    });
  const topY = (x: number, z: number) => h + tx * x + tz * z;
  const drop = bevel * r * 0.85;
  const positions: number[] = [];
  const tri = (a: Vec, b: Vec, c: Vec) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  // Lower ring → upper ring (outward), or outer → inner at one height (up).
  const band = (lower: Vec[], upper: Vec[]) => {
    for (let k = 0; k < 6; k += 1) {
      const n = (k + 1) % 6;
      tri(lower[k]!, upper[k]!, lower[n]!);
      tri(lower[n]!, upper[k]!, upper[n]!);
    }
  };
  const foot = ring(1.04, () => 0);
  let narrow = 1;
  let lower = foot;
  if (spec.joint !== undefined) {
    const y = h * spec.joint;
    const ledge = ring(1, () => y);
    narrow = 0.9;
    const inner = ring(narrow, () => y);
    band(lower, ledge);
    band(ledge, inner);
    lower = inner;
  }
  const shoulder = ring(narrow, (x, z) => topY(x, z) - drop);
  const top = ring(narrow * (1 - bevel), topY);
  band(lower, shoulder);
  band(shoulder, top);
  for (let k = 1; k < 5; k += 1) tri(top[0]!, top[k + 1]!, top[k]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Column tone: pale ash-dusted flat tops, a mid bevel, dark sides that
 * lighten toward the top, per-column shade so the pack never reads as one
 * block.
 */
function columnTone(side: Ramp, top: Ramp, shade: number) {
  return (p: Vec, n: Vec) => {
    if (n.y > 0.85) return rampAt(top, clamp01(0.62 + 0.3 * p.y + shade));
    if (n.y > 0.3) return rampAt(top, clamp01(0.22 + 0.2 * p.y + shade));
    const facing = n.y * 0.5 + 0.5;
    return rampAt(side, clamp01(0.12 + 0.55 * p.y + (facing - 0.5) * 0.5 + shade));
  };
}

/** Axial hex-lattice cell → centre, for columns that pack edge to edge. */
export function latticeCell(q: number, r: number, spacing: number): [number, number] {
  return [spacing * (q + r / 2), spacing * r * (Math.sqrt(3) / 2)];
}

export interface ColumnClusterOptions {
  columns: readonly ColumnSpec[];
  seed: number;
  /** Side and top ramps (default "rock" / "ash"). */
  ramp?: string;
  topRamp?: string;
  /** Extra obsidian or scoria bodies at the foot. */
  extras?: readonly ((kit: MeshKit, tones: BiomeTones) => void)[];
  fit?: "height" | "size";
  /** Lay the whole group on its side (fallen column pieces). */
  fallen?: boolean;
}

export function columnCluster(options: ColumnClusterOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const side = rampOf(tones, options.ramp ?? "rock", "rock");
    const top = rampOf(tones, options.topRamp ?? "ash", "stoneTop");
    options.columns.forEach((column, i) => {
      const seed = options.seed * 17 + i;
      const g = hexColumn(column, seed);
      if (options.fallen) {
        // Stand-up column → lying on a flat side face (yaw π/6 puts a face down).
        g.rotateZ(Math.PI / 2);
        g.translate(0, column.radius * Math.sqrt(3) / 2, 0);
      }
      const shade = column.shade ?? (hash01(i, options.seed, 9.1) - 0.5) * 0.16;
      kit.add(g, { color: columnTone(side, top, shade) });
    });
    for (const extra of options.extras ?? []) extra(kit, tones);
    return kit.finish({ fit: options.fit ?? "height", sink: 0.03, groundAo: { height: 0.18, strength: 0.32 } });
  };
}

// ---------------------------------------------------------------------------
// Obsidian

export interface ShardSpec {
  x: number;
  z: number;
  /** Half extents of the body before cuts. */
  size: readonly [number, number, number];
  /** Shear per unit height along x / z (lean away from the cluster). */
  lean?: readonly [number, number];
  /** Rotation about the vertical axis before leaning. */
  yaw?: number;
  seed: number;
  /** Extra planar cuts (sheared faces). */
  cuts?: HullOptions["cuts"];
}

/** A sheared volcanic-glass blade standing on a flat base at y = 0. */
export function shard(spec: ShardSpec): THREE.BufferGeometry {
  const floor = -0.62;
  const g = hull({
    scale: spec.size,
    detail: 0,
    jitter: 0.08,
    seed: spec.seed,
    floor,
    // Flattened flanks make a blade; a steep crown cut gives the sharp tip.
    cuts: spec.cuts ?? [
      { normal: [1, 0.15, 0.1], offset: 0.62 },
      { normal: [-1, 0.25, -0.1], offset: 0.66 },
      { normal: [0.35, 1, 0.2], offset: 0.86 },
    ],
  });
  g.rotateY(spec.yaw ?? 0);
  g.translate(0, -floor * spec.size[1], 0);
  const [lx, lz] = spec.lean ?? [0, 0];
  const position = g.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const y = Math.max(0, position.getY(i));
    position.setXYZ(i, position.getX(i) + lx * y + spec.x, y, position.getZ(i) + lz * y + spec.z);
  }
  return g;
}

/** Glass: near-black sides, a violet sheen on up-facing cut planes. */
function obsidianTone(glass: Ramp) {
  return (p: Vec, n: Vec) => rampAt(glass, clamp01(0.12 + 0.8 * Math.max(0, n.y) ** 1.6 + 0.12 * p.y));
}

export function obsidianShards(options: { shards: readonly ShardSpec[]; ramp?: string; fit?: "height" | "size"; extras?: ColumnClusterOptions["extras"] }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const glass = rampOf(tones, options.ramp ?? "obsidian", "rock");
    for (const spec of options.shards) kit.add(shard(spec), { color: obsidianTone(glass) });
    for (const extra of options.extras ?? []) extra(kit, tones);
    return kit.finish({ fit: options.fit ?? "height", sink: 0.03, groundAo: { height: 0.15, strength: 0.3 } });
  };
}

/** Dressing helper: obsidian shards added to another builder's kit. */
export function withShards(shards: readonly ShardSpec[], ramp = "obsidian") {
  return (kit: MeshKit, tones: BiomeTones) => {
    const glass = rampOf(tones, ramp, "rock");
    for (const spec of shards) kit.add(shard(spec), { color: obsidianTone(glass) });
  };
}

// ---------------------------------------------------------------------------
// Scoria

/** Porous rust-brown stone: faceted hull, lit on top, darker low. */
function scoriaTone(stone: Ramp) {
  return (p: Vec, n: Vec) => rampAt(stone, clamp01(0.2 + 0.45 * (n.y * 0.5 + 0.5) + 0.25 * p.y));
}

/** Dressing helper: scoria stones resting on the ground plane at y = 0. */
export function withStones(stones: readonly (readonly [HullOptions, number, number, number])[], ramp = "scoria") {
  return (kit: MeshKit, tones: BiomeTones) => {
    const stone = rampOf(tones, ramp, "rock");
    for (const [shape, x, z, size] of stones) {
      const g = hull(shape);
      g.scale(size, size, size);
      g.translate(x, -shape.floor * shape.scale[1] * size, z);
      kit.add(g, { color: scoriaTone(stone) });
    }
  };
}

export function scoria(shape: HullOptions, options: { ramp?: string; fit?: "height" | "size"; companions?: readonly (readonly [HullOptions, number, number, number])[] } = {}): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const stone = rampOf(tones, options.ramp ?? "scoria", "rock");
    const g = hull(shape);
    g.translate(0, -shape.floor * shape.scale[1], 0);
    kit.add(g, { color: scoriaTone(stone) });
    withStones(options.companions ?? [], options.ramp ?? "scoria")(kit, tones);
    return kit.finish({ fit: options.fit ?? "height", sink: options.fit === "size" ? 0.05 : 0.04, groundAo: { height: 0.25, strength: 0.28 } });
  };
}

// ---------------------------------------------------------------------------
// Cinder cones

export interface CinderConeOptions {
  seed: number;
  /** Lathe segments around (odd counts avoid a symmetric silhouette). */
  sides?: number;
  /** Gully ridges around the flank. */
  ridges?: number;
  /** How far one side of the rim is broken down (0 … 0.2). */
  breach?: number;
  /** Shear of the cone toward +x per unit height. */
  lean?: number;
  /** Crater still glowing (vertex colour, not emissive). */
  glow?: boolean;
  /** Base radius relative to the rim height (≈ 0.6 steep … 0.85 low). */
  spread?: number;
  extras?: ColumnClusterOptions["extras"];
}

/** A miniature volcano: gullied flanks, broken rim, crater. */
export function cinderCone(options: CinderConeOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const spread = options.spread ?? 0.7;
    const rim = 0.9;
    // Profile: foot → flank → rim → crater wall → crater floor.
    const profile = [
      [spread, 0],
      [spread * 0.93, 0.08],
      [spread * 0.76, 0.3],
      [spread * 0.56, 0.58],
      [spread * 0.42, 0.8],
      [spread * 0.36, rim],
      [spread * 0.27, rim - 0.05],
      [spread * 0.14, rim - 0.17],
      [0, rim - 0.2],
    ].map(([x, y]) => new THREE.Vector2(x!, y!));
    const sides = options.sides ?? 11;
    const g = new THREE.LatheGeometry(profile, sides);
    g.deleteAttribute("uv");
    g.deleteAttribute("normal");
    const position = g.getAttribute("position");
    const ridges = options.ridges ?? 5;
    const breach = options.breach ?? 0;
    const breachAt = hash01(options.seed, 1, 2) * Math.PI * 2;
    const lean = options.lean ?? 0;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-6) continue;
      const a = Math.atan2(z, x);
      // Seam duplicates share a position, so they share the hash.
      const noise = hash01(Math.round(x * 997), Math.round(z * 997), Math.round(y * 97), options.seed) - 0.5;
      const gully = Math.cos(a * ridges + options.seed) * 0.07 * smoothstep(0.02, 0.5, y) * (y < rim ? 1 : 0.4);
      const k = 1 + noise * 0.12 + gully;
      const high = smoothstep(rim - 0.35, rim, y);
      const broken = breach * Math.max(0, Math.cos(a - breachAt)) ** 3 * high;
      const yy = y > 0 ? y - broken + noise * 0.04 * high : 0;
      position.setXYZ(i, x * k + lean * yy, yy, z * k);
    }
    const scoriaRamp = rampOf(tones, "scoria", "rock");
    const ash = rampOf(tones, "ash", "stoneTop");
    const magma = rampOf(tones, "magma", "accent");
    kit.add(g, {
      color: (p, n) => {
        const radial = Math.hypot(p.x, p.z);
        const inward = radial > 1e-6 ? -(n.x * p.x + n.z * p.z) / radial : 1;
        // Crater wall and floor: faces turned in toward the axis, up high.
        if (inward > 0.05 && p.y > 0.55) {
          const depth = clamp01((1 - p.y) / 0.3);
          return options.glow ? rampAt(magma, clamp01(0.25 + 0.75 * depth)) : rampAt(scoriaRamp, clamp01(0.12 - 0.1 * depth));
        }
        const a = Math.atan2(p.z, p.x);
        const valley = Math.cos(a * ridges + options.seed) * 0.5 + 0.5;
        const base = rampAt(scoriaRamp, clamp01(0.14 + 0.42 * (n.y * 0.5 + 0.5) + 0.2 * p.y - 0.14 * (1 - valley)));
        // Pale ash settles on the upper flank and the rim.
        return base.lerp(rampAt(ash, 0.4), 0.55 * smoothstep(0.62, 0.95, p.y) * clamp01(n.y + 0.2));
      },
    });
    for (const extra of options.extras ?? []) extra(kit, tones);
    return kit.finish({ sink: 0.03, groundAo: { height: 0.2, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// Cooled lava lobes

/** [x, z, radius x, height, radius z] of one flattened lobe. */
export type LobeSpec = readonly [number, number, number, number, number];

export function lavaLobes(options: { lobes: readonly LobeSpec[]; seed: number; glow?: boolean; fit?: "height" | "size"; extras?: ColumnClusterOptions["extras"] }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const crust = rampOf(tones, "crust", "rock");
    const magma = rampOf(tones, "magma", "accent");
    options.lobes.forEach(([x, z, rx, ry, rz], i) => {
      const floor = -0.25;
      const g = lobe({ radius: [rx, ry, rz], detail: 1, jitter: 0.12, seed: options.seed * 7 + i, floor, center: [x, -floor * ry, z] });
      kit.add(g, {
        color: (p, n) => {
          const c = rampAt(crust, clamp01(0.14 + 0.62 * Math.max(0, n.y) + 0.14 * p.y + (i % 2 ? -0.06 : 0.04)));
          // Molten toe: the lobe's leading edge still glows where it meets the ground.
          if (options.glow && n.y < 0.75) c.lerp(rampAt(magma, 0.55), 0.85 * (1 - smoothstep(0.02, 0.14, p.y)));
          return c;
        },
      });
    });
    for (const extra of options.extras ?? []) extra(kit, tones);
    return kit.finish({ fit: options.fit ?? "height", sink: 0.02, groundAo: { height: 0.2, strength: options.glow ? 0 : 0.25 } });
  };
}

// ---------------------------------------------------------------------------
// The Ember rock set

const cut = (x: number, y: number, z: number, offset: number) => ({ normal: [x, y, z] as const, offset });
const PEBBLE: HullOptions = { scale: [1, 0.6, 0.85], detail: 0, jitter: 0.14, seed: 201, floor: -0.3 };
const CHIP: HullOptions = { scale: [0.8, 0.55, 1.05], detail: 0, jitter: 0.16, seed: 207, floor: -0.35, cuts: [cut(0.3, 1, 0, 0.58)] };
// Wedge of scoria: slanted top, sheared flanks.
const SCORIA_ROCK: HullOptions = {
  scale: [0.72, 0.95, 0.66], detail: 1, jitter: 0.14, seed: 211, floor: -0.42,
  cuts: [cut(0.35, 1, -0.1, 0.58), cut(-1, 0.2, 0.3, 0.7), cut(0.2, -0.1, 1, 0.74), cut(0.8, 0.3, -0.6, 0.76)],
};

/** Build a column pack from axial cells: [q, r, height, extra?]. */
function pack(
  spacing: number,
  cells: readonly (readonly [number, number, number, Partial<ColumnSpec>?])[],
  radius = (spacing / Math.sqrt(3)) * 0.97,
): ColumnSpec[] {
  return cells.map(([q, r, height, extra]) => {
    const [x, z] = latticeCell(q, r, spacing);
    return { x, z, radius, height, ...extra };
  });
}

/**
 * Tall, narrow column stacks and obsidian spires for the tall-narrow
 * (`cactus`) footprint: 0.34 of the height.
 */
export function emberSpires(): VariantBuilder[] {
  return [
    // Colonnade: a tight pack stepping down from one tall column.
    columnCluster({
      seed: 1,
      columns: pack(0.13, [
        [0, 0, 1, { joint: 0.56 }], [1, 0, 0.84, { tilt: [0.25, 0] }], [0, 1, 0.72], [-1, 1, 0.6, { tilt: [-0.2, 0.3] }],
        [-1, 0, 0.5], [0, -1, 0.66, { joint: 0.4 }], [1, -1, 0.38, { tilt: [0.4, -0.2] }],
      ]),
    }),
    // Twin pillars with broken stumps.
    columnCluster({
      seed: 2,
      columns: pack(0.14, [
        [0, 0, 1, { tilt: [0.35, 0.1], joint: 0.62 }], [1, 0, 0.8, { tilt: [-0.15, 0.3] }], [0, 1, 0.3, { tilt: [0.5, 0] }], [1, -1, 0.2, { tilt: [0, -0.6] }],
      ]),
      extras: [withStones([[CHIP, -0.13, 0.1, 0.08], [PEBBLE, 0.2, 0.13, 0.06]], "rock")],
    }),
    // Leaning column: one column pushed off true by the cooling flow.
    columnCluster({
      seed: 3,
      columns: pack(0.13, [
        [0, 0, 1, { lean: [0.1, 0.04], joint: 0.45 }], [-1, 1, 0.7, { lean: [0.05, 0.02] }], [0, -1, 0.52], [-1, 0, 0.36, { tilt: [0.3, 0.3] }],
      ]),
    }),
    // Obsidian spire: one tall blade and two small shards leaning out.
    obsidianShards({
      shards: [
        { x: 0, z: 0, size: [0.14, 1, 0.1], lean: [0.05, 0.02], yaw: 0.3, seed: 31 },
        { x: 0.13, z: 0.08, size: [0.08, 0.42, 0.07], lean: [0.28, 0.12], yaw: 1.1, seed: 33 },
        { x: -0.1, z: 0.12, size: [0.07, 0.3, 0.06], lean: [-0.3, 0.2], yaw: 2.2, seed: 35 },
      ],
    }),
    // Crossed obsidian blades over a basalt stub.
    obsidianShards({
      shards: [
        { x: -0.04, z: 0, size: [0.12, 0.9, 0.09], lean: [-0.12, 0.03], yaw: 0.9, seed: 41 },
        { x: 0.06, z: 0.03, size: [0.11, 0.74, 0.08], lean: [0.2, -0.06], yaw: 2.4, seed: 43 },
        { x: 0.02, z: -0.12, size: [0.06, 0.26, 0.05], lean: [0.1, -0.35], yaw: 0.2, seed: 45 },
      ],
      extras: [(kit, tones) => {
        const side = rampOf(tones, "rock", "rock");
        const top = rampOf(tones, "ash", "stoneTop");
        kit.add(hexColumn({ x: -0.12, z: 0.13, radius: 0.08, height: 0.22, tilt: [0.2, 0.3] }, 47), { color: columnTone(side, top, 0) });
      }],
    }),
  ];
}

/** The Ember rock set: hero rocks, supporting rocks and dressing stones. */
export function emberRocks() {
  const causeway = pack(0.2, [
    [0, 0, 1], [1, 0, 0.86, { tilt: [0.1, 0] }], [0, 1, 0.9], [-1, 1, 0.76, { tilt: [-0.12, 0.1] }], [-1, 0, 0.7],
    [0, -1, 0.8, { tilt: [0, -0.18] }], [1, -1, 0.64], [2, -1, 0.46, { tilt: [0.2, -0.1] }], [2, 0, 0.5],
    [1, 1, 0.6], [-2, 1, 0.4], [-2, 2, 0.28, { tilt: [-0.3, 0.2] }], [1, -2, 0.34],
  ]);
  const plateau = pack(0.2, [
    [0, 0, 0.62, { tilt: [0.04, 0] }], [1, 0, 0.6], [0, 1, 0.58], [-1, 1, 0.62, { tilt: [0, 0.05] }], [-1, 0, 1, { joint: 0.6 }],
    [0, -1, 0.56], [1, -1, 0.4, { tilt: [0.35, -0.2] }], [-1, 2, 0.26], [-2, 1, 0.7, { tilt: [-0.2, 0] }], [2, -1, 0.22],
  ]);
  return {
    hero: [
      // Causeway steps: a hexagonal pack stepping down across the cluster.
      columnCluster({ seed: 11, columns: causeway }),
      // Plateau with one tall sentinel column.
      columnCluster({ seed: 13, columns: plateau }),
      // Cinder cone with a glowing crater and scoria at its foot.
      cinderCone({ seed: 3, glow: true, breach: 0.14, lean: 0.05, spread: 0.64, extras: [withStones([[PEBBLE, 0.6, 0.16, 0.09], [CHIP, -0.42, 0.42, 0.08]])] }),
      // Old, cold cone: lower, wider, deeply gullied, dark crater.
      cinderCone({ seed: 7, spread: 0.72, ridges: 7, breach: 0.2, lean: -0.04, sides: 13 }),
      // Cooled lava: overlapping crust lobes, one still molten at the toe.
      lavaLobes({ seed: 5, glow: true, lobes: [[0, 0, 0.4, 0.6, 0.32], [0.26, 0.12, 0.26, 0.36, 0.22], [-0.22, 0.2, 0.22, 0.3, 0.2], [0.08, -0.26, 0.2, 0.24, 0.18]] }),
      // Obsidian outcrop: low, wide splay of glass blades.
      obsidianShards({
        shards: [
          { x: 0, z: 0, size: [0.2, 1, 0.14], lean: [0.08, 0], yaw: 0.2, seed: 51 },
          { x: 0.24, z: 0.06, size: [0.16, 0.62, 0.12], lean: [0.4, 0.05], yaw: 1.3, seed: 53 },
          { x: -0.22, z: 0.14, size: [0.15, 0.55, 0.11], lean: [-0.38, 0.18], yaw: 2.5, seed: 55 },
          { x: 0.04, z: -0.24, size: [0.12, 0.4, 0.1], lean: [0.05, -0.45], yaw: 0.7, seed: 57 },
        ],
        extras: [withStones([[PEBBLE, 0.46, -0.2, 0.1]], "rock")],
      }),
      // Scoria boulder: porous, rust-brown, with a companion.
      scoria(SCORIA_ROCK, { companions: [[PEBBLE, 0.44, 0.22, 0.2], [CHIP, -0.34, 0.32, 0.16]] }),
    ],
    supporting: [
      // Fallen column pieces.
      columnCluster({ seed: 21, fit: "size", fallen: true, columns: [
        { x: 0, z: 0, radius: 0.14, height: 0.62, tilt: [0.3, 0] },
        { x: -0.2, z: 0.26, radius: 0.12, height: 0.42 },
      ] }),
      // Short column stubs.
      columnCluster({ seed: 23, fit: "size", columns: pack(0.2, [[0, 0, 0.34, { tilt: [0.2, 0.1] }], [1, 0, 0.26], [0, 1, 0.2, { tilt: [-0.3, 0] }]]) }),
      // Small crust lobes.
      lavaLobes({ seed: 25, fit: "size", lobes: [[0, 0, 0.4, 0.26, 0.32], [0.34, 0.14, 0.26, 0.18, 0.22]] }),
      // Glass shard pair.
      obsidianShards({ fit: "size", shards: [
        { x: 0, z: 0, size: [0.16, 0.6, 0.12], lean: [0.2, 0], yaw: 0.4, seed: 61 },
        { x: -0.16, z: 0.1, size: [0.12, 0.4, 0.1], lean: [-0.35, 0.1], yaw: 1.9, seed: 63 },
      ] }),
      scoria({ ...SCORIA_ROCK, seed: 213, scale: [1, 0.66, 0.86] }, { fit: "size" }),
    ],
    dressing: [
      scoria(PEBBLE, { fit: "size" }),
      scoria(CHIP, { fit: "size", ramp: "rock" }),
      obsidianShards({ fit: "size", shards: [{ x: 0, z: 0, size: [0.3, 0.34, 0.22], lean: [0.2, 0], seed: 71 }] }),
      columnCluster({ seed: 73, fit: "size", columns: [{ x: 0, z: 0, radius: 0.3, height: 0.26, tilt: [0.25, 0] }] }),
    ],
  };
}
