/**
 * Alpine rock families (Alpine art; built on the shared hull primitive).
 *
 * Snow on alpine rock is a PILLOW, not a tint: every up-facing facet of the
 * rock body is lifted into a thick pad of snow that bulges slightly past the
 * rock's edge, with a short shaded wall where it meets the stone. So a
 * boulder reads as "dark rock under a snow cap" by silhouette, from the side
 * as well as from above, and flat ledges on crags collect their own caps.
 *
 * Families:
 *  - angular granite crag (steep sheared planes, snow only on the ledges);
 *  - rounded snow-capped boulder (big soft cap);
 *  - layered slate (thin tilted slabs, stepped, snow on every slab);
 *  - split boulder (two halves leaning apart around a crack);
 *  - wedge boulder with companion stones;
 *  - supporting blocks, slabs and clusters; small stones and chips.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { hull, type HullOptions } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";
import { snowRamp } from "./conifer.js";

type Cut = { normal: readonly [number, number, number]; offset: number };
const cut = (x: number, y: number, z: number, offset: number): Cut => ({ normal: [x, y, z], offset });

export interface SnowPillowOptions {
  /** Facets whose normal.y exceeds this carry snow (0.5 … 0.85). */
  threshold: number;
  /** Pad thickness, native units. */
  depth: number;
  /** How far the pad's edge bulges past the rock, native units. */
  overhang?: number;
}

/**
 * Splits an indexed body into bare rock faces and a snow pad built from its
 * up-facing faces: the pad's top is those faces lifted by `depth`, its edge
 * a wall down to the rock along the region's boundary. The covered rock
 * faces are dropped (never seen), so a cap costs only its edge walls.
 */
export function snowPillow(body: THREE.BufferGeometry, options: SnowPillowOptions) {
  const position = body.getAttribute("position");
  const index = body.index ? Array.from({ length: body.index.count }, (_, i) => body.index!.getX(i)) : Array.from({ length: position.count }, (_, i) => i);
  const vertex = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
  const rockTris: number[] = [];
  const snowTris: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    a.copy(vertex(index[t]!));
    b.copy(vertex(index[t + 1]!));
    c.copy(vertex(index[t + 2]!));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    (n.y > options.threshold ? snowTris : rockTris).push(index[t]!, index[t + 1]!, index[t + 2]!);
  }
  // Boundary edges of the snow region: edges used by exactly one snow face.
  const edgeUse = new Map<string, number>();
  const key = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);
  for (let t = 0; t < snowTris.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const k = key(snowTris[t + e]!, snowTris[t + ((e + 1) % 3)]!);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }
  const boundary = new Set<number>();
  for (const [k, uses] of edgeUse) if (uses === 1) for (const i of k.split(":")) boundary.add(Number(i));
  // Horizontal centre of the body, for the outward bulge of the pad edge.
  const centre = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) centre.add(vertex(i));
  centre.multiplyScalar(1 / Math.max(1, position.count));
  const overhang = options.overhang ?? options.depth * 0.5;
  const lifted = new Map<number, THREE.Vector3>();
  const lift = (i: number) => {
    let v = lifted.get(i);
    if (!v) {
      v = vertex(i);
      if (boundary.has(i)) {
        // Soft, slightly overhanging edge: lower than the pad's crown.
        const out = new THREE.Vector3(v.x - centre.x, 0, v.z - centre.z);
        if (out.lengthSq() > 1e-9) v.addScaledVector(out.normalize(), overhang);
        v.y += options.depth * 0.55;
      } else {
        v.y += options.depth;
      }
      lifted.set(i, v);
    }
    return v;
  };
  const soup = (list: THREE.Vector3[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(list.flatMap((v) => [v.x, v.y, v.z]), 3));
    return g;
  };
  const rock: THREE.Vector3[] = [];
  for (let t = 0; t < rockTris.length; t += 1) rock.push(vertex(rockTris[t]!));
  const snow: THREE.Vector3[] = [];
  for (let t = 0; t < snowTris.length; t += 1) snow.push(lift(snowTris[t]!));
  // Edge walls, wound to face outward (same order as the face that owns the edge).
  for (let t = 0; t < snowTris.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const i = snowTris[t + e]!;
      const j = snowTris[t + ((e + 1) % 3)]!;
      if (edgeUse.get(key(i, j)) !== 1) continue;
      const lo0 = vertex(i);
      const lo1 = vertex(j);
      const hi0 = lift(i);
      const hi1 = lift(j);
      snow.push(lo0, lo1, hi1, lo0, hi1, hi0);
    }
  }
  body.dispose();
  return { rock: soup(rock), snow: soup(snow) };
}

export interface AlpineRockOptions {
  /**
   * Bodies: [shape, x, z, size, tilt about z (radians), lift, yaw]. Each
   * rests its flat base on the ground plane, raised by `lift` (stacked slabs).
   */
  bodies: readonly (readonly [HullOptions, number, number, number, number?, number?, number?])[];
  /** Snow pad; omit for bare stones. */
  snow?: SnowPillowOptions;
  /** Tone ramp name (default "rock"). */
  ramp?: string;
  fit?: "height" | "size";
  sink?: number;
  /** Stacked slabs alternate between the ramp and a darker shade (slate bedding). */
  bedding?: boolean;
}

export function alpineRock(options: AlpineRockOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const rampName = options.ramp ?? "rock";
    const ramp = tones[rampName] ?? tones.rock;
    const snow = snowRamp(tones);
    const snowColor = (_p: THREE.Vector3, n: THREE.Vector3) => rampAt(snow, Math.min(1, Math.max(0, 0.25 + 0.7 * n.y)));
    const linear = linearRamp(ramp);
    options.bodies.forEach(([shape, x, z, size, tilt = 0, raise = 0, yaw = 0], i) => {
      const g = hull(shape);
      g.scale(size, size, size);
      // Rest every body on the shared ground plane (its flat base at y = 0).
      g.translate(0, -shape.floor * shape.scale[1] * size, 0);
      if (tilt) g.rotateZ(tilt);
      if (yaw) g.rotateY(yaw);
      g.translate(x, raise, z);
      const shade = options.bedding ? (i % 2 === 0 ? 0 : -0.35) : 0;
      const color = shade
        ? (p: THREE.Vector3, n: THREE.Vector3) => rampAt(linear, Math.min(1, Math.max(0, (n.y * 0.5 + 0.5) * 0.8 + p.y * 0.2 + shade * 0.5)))
        : rampTone(ramp, { heightWeight: 0.2 });
      if (options.snow) {
        const { rock, snow: pad } = snowPillow(g, { ...options.snow, depth: options.snow.depth * size, overhang: (options.snow.overhang ?? options.snow.depth * 0.5) * size });
        kit.add(rock, { color });
        if (pad.getAttribute("position").count > 0) kit.add(pad, { color: snowColor });
        else pad.dispose();
      } else {
        kit.add(g, { color });
      }
    });
    return kit.finish({ fit: options.fit ?? "height", sink: options.sink ?? 0.06, groundAo: { height: 0.22, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// Shapes

const crag: HullOptions = { scale: [0.6, 1.15, 0.56], detail: 0, jitter: 0.1, seed: 301, floor: -0.5, cuts: [cut(0.5, 1, 0.25, 0.66), cut(-0.6, 0.55, -0.7, 0.7), cut(-0.95, 0.15, 0.35, 0.74), cut(0.2, 0.05, 1, 0.78)] };
const roundBoulder: HullOptions = { scale: [0.8, 0.8, 0.74], detail: 1, jitter: 0.09, seed: 307, floor: -0.38, cuts: [cut(0.15, 1, 0.1, 0.78), cut(0.9, 0.25, -0.2, 0.84)] };
const wedge: HullOptions = { scale: [0.84, 0.95, 0.7], detail: 1, jitter: 0.08, seed: 311, floor: -0.45, cuts: [cut(0.4, 1, -0.1, 0.6), cut(-1, 0.2, 0.3, 0.78), cut(0.2, -0.1, 1, 0.8)] };
const half: HullOptions = { scale: [0.46, 0.9, 0.7], detail: 1, jitter: 0.08, seed: 313, floor: -0.45, cuts: [cut(1, 0.05, 0, 0.55), cut(0.1, 1, 0.2, 0.72)] };
const slab = (seed: number, w: number, d: number, t = 0.22): HullOptions => ({ scale: [w, t, d], detail: 0, jitter: 0.07, seed, floor: -0.35, cuts: [cut(0.05, 1, 0.02, 0.5), cut(0.9, 0.2, 0.3, 0.9)] });
const block: HullOptions = { scale: [0.9, 0.7, 0.8], detail: 0, jitter: 0.12, seed: 331, floor: -0.4, cuts: [cut(0.2, 1, -0.1, 0.62), cut(-0.8, 0.3, 0.6, 0.8)] };
const stone: HullOptions = { scale: [1, 0.6, 0.85], detail: 0, jitter: 0.08, seed: 341, floor: -0.3 };
const chip: HullOptions = { scale: [0.8, 0.62, 1.05], detail: 0, jitter: 0.15, seed: 347, floor: -0.35, cuts: [cut(0.3, 1, 0, 0.6)] };

const SNOW_HEAVY: SnowPillowOptions = { threshold: 0.45, depth: 0.09, overhang: 0.04 };
const SNOW_CAP: SnowPillowOptions = { threshold: 0.55, depth: 0.07, overhang: 0.035 };
const SNOW_LEDGE: SnowPillowOptions = { threshold: 0.62, depth: 0.06, overhang: 0.025 };

/** The Alpine rock set: hero boulders, supporting rocks and dressing stones. */
export function alpineRocks() {
  return {
    hero: [
      // Angular granite crag: a main spire and a lower shoulder, steep planes,
      // snow only on the ledges, a chip at its foot.
      alpineRock({ bodies: [[crag, -0.08, 0, 1], [{ ...crag, seed: 303, scale: [0.5, 0.8, 0.5] }, 0.3, -0.14, 0.72, -0.12], [chip, 0.34, 0.34, 0.22]], snow: SNOW_LEDGE }),
      // Rounded boulder under a big soft cap, a stone tucked beside it.
      alpineRock({ bodies: [[roundBoulder, 0, 0, 1], [stone, 0.5, -0.24, 0.22]], snow: SNOW_HEAVY }),
      // Layered slate: thin tilted slabs stepping up, snow on every slab.
      alpineRock({
        ramp: "slate",
        bedding: true,
        snow: SNOW_CAP,
        bodies: [
          // Bedding dips one way and each slab is broken off at its own angle,
          // so the stack reads as a weathered outcrop, not a tiered cake.
          [slab(351, 0.7, 0.54, 0.3), -0.06, 0, 1, 0.12, 0, 0],
          [slab(353, 0.56, 0.46, 0.3), 0.06, -0.05, 1, 0.2, 0.19, 0.45],
          [slab(355, 0.46, 0.36, 0.3), 0.14, 0.04, 1, 0.26, 0.38, -0.35],
          [slab(357, 0.3, 0.24, 0.26), 0.2, -0.03, 1, 0.34, 0.56, 0.8],
        ],
      }),
      // Split boulder: two halves leaning apart around a snow-filled crack.
      alpineRock({ bodies: [[half, -0.22, 0, 1, 0.1], [{ ...half, seed: 317, scale: [0.42, 0.8, 0.66] }, 0.24, 0.04, 1, -0.14]], snow: SNOW_CAP }),
      // Wedge boulder with two companion stones.
      alpineRock({ bodies: [[wedge, 0, 0, 1], [chip, 0.5, 0.3, 0.22], [stone, -0.42, 0.36, 0.18]], snow: SNOW_HEAVY }),
    ],
    supporting: [
      alpineRock({ bodies: [[block, 0, 0, 1]], snow: SNOW_CAP, fit: "size" }),
      alpineRock({ bodies: [[{ ...roundBoulder, seed: 361 }, 0, 0, 1]], snow: SNOW_HEAVY, fit: "size" }),
      alpineRock({ ramp: "slate", bodies: [[slab(363, 1.1, 0.8), 0, 0, 1, 0.1]], snow: SNOW_CAP, fit: "size" }),
      // Small cluster: three stones sharing one cap line.
      alpineRock({ bodies: [[stone, 0, 0, 0.8], [chip, 0.62, 0.2, 0.55], [{ ...stone, seed: 367 }, -0.3, 0.6, 0.5]], snow: SNOW_CAP, fit: "size" }),
    ],
    dressing: [
      alpineRock({ bodies: [[stone, 0, 0, 1]], fit: "size", sink: 0.04 }),
      alpineRock({ bodies: [[chip, 0, 0, 1]], fit: "size", sink: 0.04 }),
      alpineRock({ ramp: "slate", bodies: [[{ ...stone, seed: 371, scale: [1.2, 0.4, 0.8] }, 0, 0, 1]], fit: "size", sink: 0.04 }),
    ],
  };
}
