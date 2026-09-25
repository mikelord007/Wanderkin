/**
 * Autumn broadleaf trees. A tree is a tapered, flared trunk with a few limbs
 * reaching up into a crown of overlapping, flat-bottomed canopy clumps, each
 * wrapped in a fringe of small leaf cards that notch the outline.
 *
 * Tone is structural, not noise: each clump is lit on top and on its outer
 * face, mid on the sides and shaded underneath and toward the crown's core;
 * clumps can carry different ramps (amber, rust, gold, olive) so a tree can
 * be "turning" (olive low, amber high) instead of one flat colour. Leaves in
 * the fringe take their clump's ramp, a touch lighter on top.
 *
 * Leaning trees set their base back so the crown stays over the placement
 * axis, like the tropical palms.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { builderRandom, hash01, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;
const UP = new THREE.Vector3(0, 1, 0);

/** One canopy clump, native units (tree ≈ 1 tall). */
export interface Clump {
  c: readonly [number, number, number];
  r: number;
  /** Vertical squash (default 0.78). */
  squash?: number;
  /** Tone ramp name (default the tree's crown ramp). */
  ramp?: string;
  /** Tone shift, −1 … 1 (new growth up, shaded clumps down). */
  bias?: number;
  /** No limb grows to this clump (small top clumps). */
  noLimb?: boolean;
}

export interface AutumnTreeOptions {
  trunk: {
    /** Trunk height up to the crown (native units). */
    height: number;
    /** Horizontal offset of the trunk top along +x. */
    lean: number;
    /** Curve exponent of the lean (1 straight … 2.5 bows late). */
    bow?: number;
    baseRadius: number;
    /** Tone ramp name (default "trunk"; "birch" for pale bark). */
    ramp?: string;
    /** Dark bark marks (birch). */
    marks?: boolean;
    /** Surface roots at the base (default 4). */
    roots?: number;
  };
  crown: {
    clumps: readonly Clump[];
    /** Default ramp name for the clumps. */
    ramp: string;
    /** Leaf cards in the fringe. */
    leaves: number;
    /** Leaf length as a fraction of its clump radius (default 0.6). */
    leafSize?: number;
    /** How much the fringe hangs (0 perky … 1 drooping; default 0.45). */
    hang?: number;
    /** Extra bare twigs poking out of the crown (late autumn). */
    twigs?: number;
    /** Clump radius multiplier so neighbours overlap into one crown (default 1.12). */
    swell?: number;
    /** Most limbs drawn (to the largest clumps; default 4). */
    limbs?: number;
  };
  seed: number;
  /** Fit (heroes: height). */
  fit?: "height" | "size";
}

// ---------------------------------------------------------------------------
// Parts

/** A small pointed leaf card along +X, face up (6 triangles). Emit double-sided. */
export function leafCard(length: number, width: number, droop: number, ramp: Ramp, shade: number): THREE.BufferGeometry {
  const L = length;
  const w = L * width;
  const fold = w * 0.35;
  const positions = [
    0, 0, 0,
    L * 0.32, -fold, -w,
    L * 0.32, -fold, w,
    L * 0.68, -fold - L * droop * 0.35, -w * 0.7,
    L * 0.68, -fold - L * droop * 0.35, w * 0.7,
    L * 0.5, L * 0.04 - L * droop * 0.2, 0,
    L, -L * droop, 0,
  ];
  const tone = (v: number) => rampAt(ramp, Math.min(1, Math.max(0, v + shade)));
  const colors = [tone(0.2), tone(0.45), tone(0.47), tone(0.62), tone(0.64), tone(0.66), tone(0.8)].flatMap((c) => [c.r, c.g, c.b]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex([0, 5, 1, 0, 2, 5, 1, 5, 3, 5, 2, 4, 3, 5, 6, 5, 4, 6]);
  g.computeVertexNormals();
  return g;
}

/** Points a +X part along `dir` with its face (+Y) toward `face`, then moves it to `at`. */
export function aim(g: THREE.BufferGeometry, dir: THREE.Vector3, face: THREE.Vector3, at: THREE.Vector3): THREE.BufferGeometry {
  const x = dir.clone().normalize();
  let y = face.clone().addScaledVector(x, -face.dot(x));
  if (y.lengthSq() < 1e-8) y = Math.abs(x.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP.clone();
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  g.translate(at.x, at.y, at.z);
  return g;
}

/** Colours a geometry per vertex (native space) and returns it. */
function paint(g: THREE.BufferGeometry, color: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const position = g.getAttribute("position");
  const normal = g.getAttribute("normal");
  const colors: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i);
    const c = color(p, n);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

function insideAny(point: THREE.Vector3, clumps: readonly Clump[], except: number, margin: number): boolean {
  return clumps.some((k, i) => {
    if (i === except) return false;
    const sq = k.squash ?? 0.78;
    const dx = (point.x - k.c[0]) / k.r;
    const dy = (point.y - k.c[1]) / (k.r * sq);
    const dz = (point.z - k.c[2]) / k.r;
    return dx * dx + dy * dy + dz * dz < margin;
  });
}

export type CanopyPart = { g: THREE.BufferGeometry; double: boolean; sway: (p: THREE.Vector3) => number };

export interface CanopySpec {
  leaves: number;
  leafSize?: number;
  hang?: number;
  /** Clumps rest on the ground (shrubs): flat bottoms at y = 0, no leaves below it. */
  ground?: boolean;
}

/**
 * Adds canopy clumps and their shingled leaf fringe to `parts` (native
 * space). Returns the crown's volume-weighted core.
 */
export function addCanopy(
  parts: CanopyPart[],
  clumps: readonly Clump[],
  spec: CanopySpec,
  ramp: (name: string | undefined) => Ramp,
  random: () => number,
  seed: number,
): THREE.Vector3 {
  // Crown extent (for tone: core vs. rim, low vs. high).
  let crownLow = Infinity;
  let crownHigh = -Infinity;
  const core = new THREE.Vector3();
  let weight = 0;
  for (const k of clumps) {
    const sq = k.squash ?? 0.78;
    crownLow = Math.min(crownLow, k.c[1] - k.r * sq * 0.4);
    crownHigh = Math.max(crownHigh, k.c[1] + k.r * sq);
    core.addScaledVector(new THREE.Vector3(...k.c), k.r ** 3);
    weight += k.r ** 3;
  }
  core.multiplyScalar(1 / weight);
  const crownSpan = Math.max(1e-3, crownHigh - crownLow);

  // ---- Canopy clumps -----------------------------------------------------
  const toCore = new THREE.Vector3();
  clumps.forEach((k, i) => {
    const sq = k.squash ?? 0.78;
    const ry = k.r * sq;
    const r = ramp(k.ramp);
    const bias = k.bias ?? 0;
    const g = lobe({
      radius: [k.r, ry, k.r * (0.92 + random() * 0.16)],
      detail: 1,
      jitter: 0.12,
      seed: seed * 17 + i,
      // Flat-bottomed clumps read as stylised canopy layers.
      // Ground-resting clumps (shrubs) reach down to y = 0 and sit flat on it.
      floor: spec.ground ? Math.max(-1, -k.c[1] / ry) : -0.45,
      center: k.c,
    });
    paint(g, (p, n) => {
      const facing = n.y * 0.5 + 0.5;
      const high = (p.y - crownLow) / crownSpan;
      toCore.set(p.x - core.x, (p.y - core.y) * 0.6, p.z - core.z);
      const rim = toCore.lengthSq() > 1e-8 ? Math.max(0, toCore.normalize().dot(n)) : 0;
      const t = facing * 0.6 + high * 0.26 + rim * 0.14 - 0.14 + bias * 0.5;
      return rampAt(r, Math.min(1, Math.max(0, t)));
    });
    parts.push({ g, double: false, sway: (p) => 0.25 + p.y * 0.5 });
  });

  // ---- Shingled leaf fringe on the outer shell ---------------------------
  // Leaves lie along the clump surface and lift off it: on top they point
  // up the slope (a leafy, notched crown line), below the rim they hang
  // (a ragged underside instead of a clean blob edge). Only points on the
  // crown's outer shell get leaves; buried ones would be wasted triangles.
  const totalR = clumps.reduce((s, k) => s + k.r * k.r, 0);
  const hang = spec.hang ?? 0.45;
  const dir = new THREE.Vector3();
  let placed = 0;
  for (let attempt = 0; placed < spec.leaves && attempt < spec.leaves * 10; attempt += 1) {
    let roll = random() * totalR;
    let index = 0;
    for (let i = 0; i < clumps.length; i += 1) {
      roll -= clumps[i]!.r ** 2;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    const k = clumps[index]!;
    const sq = k.squash ?? 0.78;
    const a = random() * Math.PI * 2;
    const y = -0.42 + random() * 1.35;
    const cy = Math.min(1, y);
    const xz = Math.sqrt(Math.max(0, 1 - cy * cy));
    dir.set(Math.cos(a) * xz, cy, Math.sin(a) * xz);
    const at = new THREE.Vector3(k.c[0] + dir.x * k.r * 0.9, k.c[1] + Math.max(-0.45, dir.y) * k.r * sq * 0.9, k.c[2] + dir.z * k.r * 0.9);
    if (insideAny(at, clumps, index, 0.85)) continue;
    if (spec.ground && at.y < k.r * 0.25) continue;
    const normal = new THREE.Vector3(dir.x, dir.y / sq, dir.z).normalize();
    let slope = UP.clone().addScaledVector(normal, -normal.y);
    if (slope.lengthSq() < 0.02) slope = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    slope.normalize();
    const below = dir.y < -0.12;
    // Up the slope and out (0 = flush … π/2 = straight out); hanging below.
    const tilt = below ? 0.35 + random() * 0.4 : 0.5 + random() * 0.45;
    const along = below ? slope.clone().multiplyScalar(-(0.6 + hang * 0.4)) : slope;
    const pointing = along.multiplyScalar(Math.cos(tilt)).addScaledVector(normal, Math.sin(tilt)).normalize();
    pointing.applyAxisAngle(normal, (random() - 0.5) * 1.3);
    const high = (at.y - crownLow) / crownSpan;
    const leaf = leafCard(
      k.r * (spec.leafSize ?? 0.55) * (0.8 + random() * 0.4),
      0.45 * (0.85 + random() * 0.3),
      0.2 + hang * 0.35 * random(),
      ramp(k.ramp),
      -0.2 + high * 0.28 + (below ? -0.12 : dir.y * 0.12) + (k.bias ?? 0) * 0.5,
    );
    leaf.rotateX((random() - 0.5) * 0.6);
    parts.push({ g: aim(leaf, pointing, normal, at), double: true, sway: (p) => 0.35 + p.y * 0.6 });
    placed += 1;
  }
  return core;
}

// ---------------------------------------------------------------------------
// Tree

export function autumnTree(options: AutumnTreeOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const parts: CanopyPart[] = [];
    const ramp = (name: string | undefined): Ramp => linearRamp(tones[name ?? options.crown.ramp] ?? tones.foliage);
    const { trunk, crown } = options;
    const bark = linearRamp(tones[trunk.ramp ?? "trunk"] ?? tones.trunk);
    const barkDark = new THREE.Color(tones.trunk.dark);
    const H = trunk.height;
    const bow = trunk.bow ?? 1.6;
    const spine = (t: number) => new THREE.Vector3(trunk.lean * t ** bow, H * t, 0);
    const swell = crown.swell ?? 1.12;
    const clumps: Clump[] = crown.clumps.map((k) => ({ ...k, r: k.r * swell }));

    // ---- Trunk: tapered, flared at the base, lit on one side ---------------
    const lightAngle = 0.6;
    const trunkGeo = tube({
      spine,
      radius: (t, a) => {
        const flare = 1 + 0.75 * (1 - Math.min(1, t / 0.16)) ** 2;
        const knot = 1 + 0.06 * Math.sin(a * 3 + options.seed) * (1 - t);
        return trunk.baseRadius * (1 - 0.5 * t) * flare * knot;
      },
      rings: 7,
      sides: 7,
      cap: "point",
      color: (t, a) => {
        const lit = 0.5 + 0.5 * Math.cos(a - lightAngle);
        let c = rampAt(bark, Math.min(1, 0.22 + 0.25 * t + 0.3 * lit));
        if (trunk.marks) {
          // Birch: short dark bark bands at fixed heights, on part of the girth.
          const band = Math.floor(t * 7);
          if (band > 0 && hash01(band, options.seed) > 0.35 && Math.cos(a - hash01(band, 3, options.seed) * 6.28) > 0.2) {
            c = c.lerp(barkDark, 0.75);
          }
        }
        return c;
      },
    });
    parts.push({ g: trunkGeo, double: false, sway: (p) => p.y * p.y * 0.2 });

    // Surface roots splaying from the flare.
    const roots = trunk.roots ?? 4;
    const rootTurn = random() * Math.PI * 2;
    for (let i = 0; i < roots; i += 1) {
      const a = rootTurn + (i / roots) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const reach = trunk.baseRadius * (2.1 + random() * 0.8);
      const from = new THREE.Vector3(Math.cos(a) * trunk.baseRadius * 0.6, trunk.baseRadius * 1.3, Math.sin(a) * trunk.baseRadius * 0.6);
      const to = new THREE.Vector3(Math.cos(a) * reach, 0, Math.sin(a) * reach);
      parts.push({
        g: tube({
          spine: (t) => from.clone().lerp(to, t).setY(from.y * (1 - t) ** 1.6),
          radius: (t) => trunk.baseRadius * 0.55 * (1 - 0.75 * t),
          rings: 2,
          sides: 4,
          cap: "point",
          color: (t) => rampAt(bark, 0.3 - t * 0.15),
        }),
        double: false,
        sway: () => 0,
      });
    }

    // ---- Limbs into the clumps ---------------------------------------------
    const top = spine(1);
    const limbTargets = clumps
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => !k.noLimb && new THREE.Vector3(...k.c).distanceTo(top) >= k.r * 0.6)
      .sort((a, b) => b.k.r - a.k.r)
      .slice(0, crown.limbs ?? 4);
    limbTargets.forEach(({ k, i }) => {
      const to = new THREE.Vector3(...k.c);
      const from = spine(Math.min(1, 0.72 + 0.28 * hash01(i, options.seed)));
      const end = from.clone().lerp(to, 0.78);
      const r0 = trunk.baseRadius * 0.48;
      parts.push({
        g: tube({
          spine: (t) => from.clone().lerp(end, t).add(new THREE.Vector3(0, -0.04 * Math.sin(Math.PI * t), 0)),
          radius: (t) => r0 * (1 - 0.6 * t),
          rings: 3,
          sides: 5,
          cap: "point",
          color: (t) => rampAt(bark, 0.35 + t * 0.15),
        }),
        double: false,
        sway: (p) => 0.1 + p.y * 0.25,
      });
    });

    // Bare twigs poking out of the crown (late-autumn silhouettes).
    for (let i = 0; i < (crown.twigs ?? 0); i += 1) {
      const k = clumps[i % clumps.length]!;
      const a = random() * Math.PI * 2;
      const from = new THREE.Vector3(k.c[0] + Math.cos(a) * k.r * 0.5, k.c[1] + k.r * 0.1, k.c[2] + Math.sin(a) * k.r * 0.5);
      const to = from.clone().add(new THREE.Vector3(Math.cos(a) * k.r * 0.8, k.r * (0.5 + random() * 0.5), Math.sin(a) * k.r * 0.8));
      parts.push({
        g: tube({ spine: (t) => from.clone().lerp(to, t), radius: (t) => 0.012 * (1 - 0.7 * t), rings: 2, sides: 3, cap: "point", color: () => rampAt(bark, 0.3) }),
        double: false,
        sway: () => 0.6,
      });
    }

    const core = addCanopy(parts, clumps, crown, ramp, random, options.seed);

    // ---- Centre the crown over the axis (leaning trees set the base back) --
    const shift = new THREE.Vector3(-core.x * 0.85, 0, -core.z * 0.85);
    for (const part of parts) {
      part.g.translate(shift.x, 0, shift.z);
      kit.add(part.g, { color: "attribute", sway: part.sway, smooth: true, doubleSided: part.double });
    }
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.1, strength: 0.28 } });
  };
}
