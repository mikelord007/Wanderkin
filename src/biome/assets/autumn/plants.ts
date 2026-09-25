/**
 * Autumn undergrowth and floor dressing:
 *
 *  - leafy shrubs: ground-resting canopy clumps (the same shingled leaf
 *    language as the trees) over a few bare stems, some with berries;
 *  - bracken ferns: arching leafleted fronds, part golden-rust, part still
 *    olive, browner at the tips;
 *  - mushrooms: toadstool clusters and lone caps on pale stems, with darker
 *    gills under the cap and a few pale spots on red caps;
 *  - acorns (nut + cupule) and fallen-leaf scatter lying flat on the ground.
 *
 * Tone stays structural: lit tops, darker undersides, baked ground AO.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { blade, builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";
import { addCanopy, leafCard, type CanopyPart, type Clump } from "./trees.js";

type Ramp = ReturnType<typeof linearRamp>;

// ---------------------------------------------------------------------------
// Shrubs

export interface AutumnShrubOptions {
  clumps: readonly Clump[];
  ramp: string;
  leaves: number;
  leafSize?: number;
  hang?: number;
  /** Bare stems visible under the rim. */
  stems?: number;
  /** Accent berries dotted on the upper outer surface. */
  berries?: number;
  seed: number;
  fit?: "height" | "size";
}

export function autumnShrub(options: AutumnShrubOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const parts: CanopyPart[] = [];
    const ramp = (name: string | undefined): Ramp => linearRamp(tones[name ?? options.ramp] ?? tones.foliage);
    const bark = linearRamp(tones.trunk);
    // Stems first: from the ground toward the clump centres.
    for (let i = 0; i < (options.stems ?? 0); i += 1) {
      const k = options.clumps[i % options.clumps.length]!;
      const from = new THREE.Vector3((random() - 0.5) * 0.08, 0, (random() - 0.5) * 0.08);
      const to = new THREE.Vector3(k.c[0] * 0.8, k.c[1], k.c[2] * 0.8);
      parts.push({
        g: tube({ spine: (t) => from.clone().lerp(to, t), radius: (t) => 0.022 * (1 - 0.6 * t), rings: 2, sides: 4, cap: "point", color: (t) => rampAt(bark, 0.25 + t * 0.2) }),
        double: false,
        sway: (p) => p.y * 0.4,
      });
    }
    // Low clumps settle onto the ground so the shrub never hovers on its stems.
    const clumps = options.clumps.map((k) => {
      const ry = k.r * (k.squash ?? 0.78);
      return k.c[1] - ry < 0.1 ? { ...k, c: [k.c[0], Math.min(k.c[1], ry * 0.85), k.c[2]] as const } : k;
    });
    addCanopy(parts, clumps, { leaves: options.leaves, leafSize: options.leafSize ?? 0.75, hang: options.hang ?? 0.35, ground: true }, ramp, random, options.seed);
    const berries = options.berries ?? 0;
    if (berries > 0) {
      const berry = linearRamp(tones.berry ?? tones.accent);
      // Small berries in bunches of three, just proud of the leafy surface.
      for (let i = 0; i < berries; i += 1) {
        const k = clumps[Math.floor(i / 3) % clumps.length]!;
        const a = (Math.floor(i / 3) * 2.4 + (i % 3) * 0.16) + random() * 0.05;
        const y = 0.35 + (i % 3) * 0.08;
        const xz = Math.sqrt(1 - y * y);
        const at: [number, number, number] = [k.c[0] + Math.cos(a) * xz * k.r * 1.04, k.c[1] + y * k.r * (k.squash ?? 0.78) * 1.04, k.c[2] + Math.sin(a) * xz * k.r * 1.04];
        const g = lobe({ radius: [0.022, 0.022, 0.022], detail: 0, jitter: 0.05, seed: options.seed * 3 + i, center: at });
        const colors: number[] = [];
        const n = g.getAttribute("normal");
        for (let v = 0; v < n.count; v += 1) {
          const lit = rampAt(berry, 0.3 + (n.getY(v) * 0.5 + 0.5) * 0.65);
          colors.push(lit.r, lit.g, lit.b);
        }
        g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        parts.push({ g, double: false, sway: () => 0.5 });
      }
    }
    for (const part of parts) kit.add(part.g, { color: "attribute", sway: part.sway, smooth: true, doubleSided: part.double });
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.25, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// Bracken

export interface BrackenOptions {
  fronds: number;
  /** Frond length relative to the plant (native units). */
  length: number;
  /** Launch angle above horizontal, radians. */
  rise: number;
  /** Tip droop (0 stiff … 1.2 arching). */
  droop: number;
  /** Main frond ramp, and the ramp every `altEvery`-th frond uses. */
  ramp: string;
  altRamp?: string;
  altEvery?: number;
  /** Leaflet serration (lower = deeper cut). */
  serrate?: number;
  seed: number;
  fit?: "height" | "size";
}

export function bracken(options: BrackenOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const main = linearRamp(tones[options.ramp] ?? tones.foliage);
    const alt = linearRamp(tones[options.altRamp ?? options.ramp] ?? tones.foliage);
    const dry = linearRamp(tones.dry);
    const turn = random() * Math.PI * 2;
    for (let i = 0; i < options.fronds; i += 1) {
      const inner = i >= options.fronds - 2;
      const yaw = turn + (i / options.fronds) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const length = options.length * (inner ? 0.75 : 0.85 + random() * 0.3);
      const rise = options.rise * (inner ? 1.2 : 0.85 + random() * 0.3);
      const ramp = options.altEvery && i % options.altEvery === 0 ? alt : main;
      const shade = (random() - 0.5) * 0.18;
      const g = blade({
        length,
        segments: 10,
        // Broad, feathery frond: widest a third of the way out, pointed tip.
        width: (t) => length * 0.17 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)) ** 0.7,
        // Droop only; the launch angle is a real tilt below, so upright
        // fronds stay narrow instead of reaching their full length sideways.
        lift: (t) => -length * options.droop * 0.5 * t * t,
        fold: 0.3,
        serrate: options.serrate ?? 0.55,
        sweep: (t) => length * 0.05 * t * t * (i % 2 ? 1 : -1),
        // Browner, drier toward the tips; the midrib a touch darker.
        color: (t, side) => {
          const c = rampAt(ramp, Math.min(1, Math.max(0, 0.25 + t * 0.5 + (side === 0 ? -0.08 : 0.04) + shade)));
          return t > 0.7 ? c.lerp(rampAt(dry, 0.45 + shade), (t - 0.7) * 1.4) : c;
        },
        sway: (t) => 0.2 + t * 0.8,
      });
      g.rotateZ(Math.min(1.45, rise));
      g.rotateY(-yaw);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.3, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// Mushrooms

export interface Cap {
  /** Base position (native units). */
  at: readonly [number, number];
  /** Stem height and cap radius. */
  h: number;
  r: number;
  /** Stem lean toward +x, radians-ish (small). */
  lean?: number;
  /** Cap shape: squashed dome (default 0.55) … flat plate (0.3). */
  dome?: number;
}

export interface MushroomOptions {
  caps: readonly Cap[];
  /** Cap ramp name. */
  ramp: string;
  /** Pale spots on each cap (fly agaric). */
  spots?: number;
  seed: number;
  fit?: "height" | "size";
}

export function mushrooms(options: MushroomOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const cap = linearRamp(tones[options.ramp] ?? tones.accent);
    const stem = linearRamp(tones.stem ?? tones.birch ?? tones.rock);
    const gill = rampAt(stem, 0.05).lerp(rampAt(cap, 0.1), 0.35);
    const spot = rampAt(stem, 0.95);
    options.caps.forEach((m, i) => {
      const lean = m.lean ?? (random() - 0.5) * 0.2;
      const top = new THREE.Vector3(m.at[0] + lean * m.h, m.h, m.at[1]);
      const base = new THREE.Vector3(m.at[0], 0, m.at[1]);
      kit.add(
        tube({
          spine: (t) => base.clone().lerp(top, t).add(new THREE.Vector3(lean * m.h * 0.3 * Math.sin(Math.PI * t), 0, 0)),
          radius: (t) => m.r * 0.26 * (1 + 0.45 * (1 - t) ** 2) * (1 - 0.12 * t),
          rings: 3,
          sides: 6,
          cap: "open",
        }),
        { color: (_p, n) => rampAt(stem, 0.35 + (n.y * 0.5 + 0.5) * 0.4), sway: 0, smooth: true },
      );
      const dome = m.dome ?? 0.55;
      const g = lobe({ radius: [m.r, m.r * dome, m.r], detail: 1, jitter: 0.05, seed: options.seed * 11 + i, floor: -0.2, center: [top.x, top.y - m.r * dome * 0.05, top.z] });
      kit.add(g, {
        color: (_p, n) => (n.y < -0.4 ? gill.clone() : rampAt(cap, Math.min(1, 0.2 + (n.y * 0.5 + 0.5) * 0.75))),
        sway: 0.05,
        smooth: true,
      });
      for (let s = 0; s < (options.spots ?? 0); s += 1) {
        const a = random() * Math.PI * 2;
        const d = 0.25 + random() * 0.45;
        const y = Math.sqrt(Math.max(0, 1 - d * d));
        const at: [number, number, number] = [top.x + Math.cos(a) * d * m.r, top.y + y * m.r * dome * 0.98, top.z + Math.sin(a) * d * m.r];
        kit.add(lobe({ radius: [m.r * 0.14, m.r * 0.05, m.r * 0.12], detail: 0, jitter: 0.1, seed: options.seed * 13 + s + i * 7, center: at }), {
          color: spot.clone(),
          sway: 0.05,
          smooth: true,
        });
      }
    });
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.25, strength: 0.25 } });
  };
}

// ---------------------------------------------------------------------------
// Floor dressing

/** Two or three acorns with their cups, and a fallen oak leaf (size fit). */
export function acorns(options: { count: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const nut = linearRamp(tones.acorn ?? tones.dry);
    const cup = linearRamp(tones.trunk);
    const spots: [number, number, number][] = [[0, 0, 0], [0.34, 0.16, 1.1], [-0.2, 0.3, 2.3]];
    for (let i = 0; i < Math.min(3, options.count); i += 1) {
      const [x, z, yaw] = spots[i]!;
      const lying = i > 0 || random() < 0.5;
      const g = lobe({ radius: [0.13, 0.17, 0.13], detail: 0, jitter: 0.04, seed: options.seed + i, center: [0, 0.17, 0] });
      const c = lobe({ radius: [0.14, 0.07, 0.14], detail: 0, jitter: 0.12, seed: options.seed + 9 + i, center: [0, 0.3, 0] });
      for (const part of [g, c]) {
        if (lying) {
          part.translate(0, -0.13, 0);
          part.rotateZ(Math.PI / 2);
          part.translate(0, 0.13, 0);
        }
        part.rotateY(yaw);
        part.translate(x, 0, z);
      }
      kit.add(g, { color: (_p, n) => rampAt(nut, 0.25 + (n.y * 0.5 + 0.5) * 0.6), smooth: true });
      kit.add(c, { color: (_p, n) => rampAt(cup, 0.3 + (n.y * 0.5 + 0.5) * 0.4) });
    }
    const leaf = leafCard(0.5, 0.42, 0.05, linearRamp(tones.foliage), -0.05);
    leaf.rotateY(random() * Math.PI * 2);
    leaf.translate(-0.1, 0.02, -0.25);
    kit.add(leaf, { color: "attribute", smooth: true });
    return kit.finish({ fit: "size", sink: 0.02 });
  };
}

/** A handful of fallen leaves lying almost flat, in mixed autumn ramps (size fit). */
export function leafScatter(options: { count: number; seed: number; ramps: readonly string[] }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    for (let i = 0; i < options.count; i += 1) {
      const a = (i / options.count) * Math.PI * 2 + random() * 0.8;
      const d = 0.15 + random() * 0.35;
      const ramp = linearRamp(tones[options.ramps[i % options.ramps.length]!] ?? tones.foliage);
      const leaf = leafCard(0.3 + random() * 0.12, 0.45, -0.12 - random() * 0.1, ramp, (random() - 0.5) * 0.2);
      // Leaf tips curl up a little (negative droop), base on the ground.
      leaf.rotateY(random() * Math.PI * 2);
      leaf.translate(Math.cos(a) * d, 0.01 + i * 0.004, Math.sin(a) * d);
      kit.add(leaf, { color: "attribute", smooth: true });
    }
    return kit.finish({ fit: "size", sink: 0 });
  };
}
