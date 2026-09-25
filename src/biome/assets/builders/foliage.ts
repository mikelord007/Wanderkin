/**
 * Foliage builders: layered bushes (4–10 overlapping irregular masses with
 * different scales and tones), broad-leaf rosettes, grass tufts and small
 * flowers. Smooth-shaded; lighter on exposed tops, darker low and inside.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { blade, builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, ToneRamp, UnitMesh, VariantBuilder } from "../types.js";

export interface BushOptions {
  /** Total overlapping masses, 4..10. */
  lobes: number;
  /** Horizontal spread of the ring masses (≈ 0.5 round … 0.9 wide). */
  spread: number;
  /** Relative height of the crown (0.8 low … 1.4 tall). */
  height: number;
  seed: number;
  /** Tone ramps by name (default foliage / foliageAlt). */
  ramp?: string;
  altRamp?: string;
  /** Lighter "new growth" on the top masses. */
  newGrowth?: boolean;
  /** Tiny accent blossoms dotted on the crown (count). */
  blossoms?: number;
}

export function bush(options: BushOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const main = tones[options.ramp ?? "foliage"] ?? tones.foliage;
    const alt = tones[options.altRamp ?? "foliageAlt"] ?? tones.foliageAlt;
    const count = Math.max(4, Math.min(10, Math.round(options.lobes)));
    const tops = count >= 7 ? 2 : 1;
    const ring = count - 1 - tops;
    const masses: { c: [number, number, number]; r: number; ramp: ToneRamp; bias: number }[] = [];
    masses.push({ c: [0, 0.36 * options.height, 0], r: 0.4, ramp: main, bias: 0 });
    for (let i = 0; i < ring; i += 1) {
      const angle = (i / ring) * Math.PI * 2 + (random() - 0.5) * 0.7;
      const distance = options.spread * (0.5 + random() * 0.22);
      masses.push({
        c: [Math.cos(angle) * distance, (0.2 + random() * 0.1) * options.height, Math.sin(angle) * distance],
        r: 0.24 + random() * 0.1,
        ramp: i % 2 === 0 ? alt : main,
        bias: (random() - 0.5) * 0.3 - 0.08,
      });
    }
    for (let i = 0; i < tops; i += 1) {
      const angle = random() * Math.PI * 2;
      masses.push({
        c: [Math.cos(angle) * 0.12, (0.58 + random() * 0.08) * options.height, Math.sin(angle) * 0.12],
        r: 0.22 + random() * 0.06,
        ramp: main,
        bias: options.newGrowth ? 0.28 : 0.1,
      });
    }
    masses.forEach((mass, index) => {
      const ry = mass.r * 0.82;
      const geometry = lobe({
        radius: [mass.r, ry, mass.r * (0.9 + random() * 0.2)],
        detail: 1,
        jitter: 0.13,
        seed: options.seed * 13 + index,
        // Flat underside resting on the ground plane.
        floor: Math.max(-1, -mass.c[1] / ry),
        center: mass.c,
      });
      kit.add(geometry, { color: rampTone(mass.ramp, { heightWeight: 0.45, bias: mass.bias }), sway: (p) => p.y * 0.7, smooth: true });
    });
    const blossoms = options.blossoms ?? 0;
    if (blossoms > 0) {
      const accent = new THREE.Color(tones.accent.light);
      for (let i = 0; i < blossoms; i += 1) {
        const mass = masses[1 + (i % (masses.length - 1))]!;
        const angle = random() * Math.PI * 2;
        const g = lobe({
          radius: [0.06, 0.04, 0.06],
          detail: 0,
          jitter: 0.1,
          seed: options.seed + 100 + i,
          center: [mass.c[0] + Math.cos(angle) * mass.r * 0.8, mass.c[1] + mass.r * 0.55, mass.c[2] + Math.sin(angle) * mass.r * 0.8],
        });
        kit.add(g, { color: accent, sway: 0.6, smooth: true });
      }
    }
    return kit.finish({ groundAo: { height: 0.3, strength: 0.3 } });
  };
}

export interface LeafRosetteOptions {
  leaves: number;
  /** Leaf length relative to the plant height (≈ 1.1–1.6). */
  length: number;
  /** Leaf half-width relative to its length (0.12 broad … 0.05 strappy). */
  width: number;
  /** Launch angle above horizontal, radians. */
  rise: number;
  /** Tip droop (0 stiff … 1 arching). */
  droop: number;
  seed: number;
  ramp?: string;
  /** Serrate the outline (0.3 split-leaf … undefined whole). */
  serrate?: number;
  /** Default `size`: a rosette is wider than tall, so its size is its span. */
  fit?: "height" | "size";
}

/** Broad-leaf plant: leaves on short stems radiating from the ground. */
export function leafRosette(options: LeafRosetteOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "foliage"] ?? tones.foliage);
    for (let i = 0; i < options.leaves; i += 1) {
      const yaw = (i / options.leaves) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const length = options.length * (0.75 + random() * 0.35);
      const rise = options.rise * (0.8 + random() * 0.4);
      const shade = (random() - 0.5) * 0.25;
      const leaf = blade({
        length,
        segments: 6,
        width: (t) => options.width * length * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)) ** 0.8,
        lift: (t) => length * (Math.sin(rise) * t - options.droop * 0.9 * t * t),
        fold: 0.35,
        ...(options.serrate === undefined ? {} : { serrate: options.serrate }),
        color: (t, side) => rampAt(ramp, Math.min(1, Math.max(0, 0.3 + t * 0.45 + (side === 0 ? 0.12 : 0) + shade))),
        sway: (t) => 0.25 + t * 0.75,
      });
      leaf.translate(0.02, 0.03, 0);
      leaf.rotateY(yaw);
      kit.add(leaf, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ fit: options.fit ?? "size", groundAo: { height: 0.25, strength: 0.25 } });
  };
}

export interface TuftOptions {
  blades: number;
  /** Outward lean of the outer blades, radians. */
  splay: number;
  seed: number;
  ramp?: string;
  /** Blade half-width relative to height. */
  width?: number;
}

/** Grass or dry-grass tuft: narrow blades fanning out and curling over. */
export function tuft(options: TuftOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "foliage"] ?? tones.foliage);
    for (let i = 0; i < options.blades; i += 1) {
      const yaw = (i / options.blades) * Math.PI * 2 + random() * 0.8;
      const length = 0.6 + random() * 0.4;
      const lean = options.splay * (0.4 + random() * 0.6);
      const shade = (random() - 0.5) * 0.3;
      const g = blade({
        length,
        segments: 3,
        width: (t) => (options.width ?? 0.05) * (1 - t * 0.8),
        lift: (t) => -0.28 * length * t * t,
        fold: 0.5,
        color: (t) => rampAt(ramp, Math.min(1, Math.max(0, 0.2 + t * 0.7 + shade))),
        sway: (t) => t,
      });
      // Stand the blade up, then lean it outward.
      g.rotateZ(Math.PI / 2 - lean);
      g.rotateY(yaw);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish();
  };
}

/** A few thin stems with small accent blossoms (use sparingly). */
export function flowers(options: { stems: number; seed: number; ramp?: string }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const stem = new THREE.Color(tones.foliage.dark);
    const petal = new THREE.Color((tones[options.ramp ?? "accent"] ?? tones.accent).light);
    const heart = new THREE.Color((tones[options.ramp ?? "accent"] ?? tones.accent).base);
    for (let i = 0; i < options.stems; i += 1) {
      const angle = random() * Math.PI * 2;
      const lean = 0.1 + random() * 0.25;
      const height = 0.7 + random() * 0.3;
      const top = new THREE.Vector3(Math.cos(angle) * lean * height, height, Math.sin(angle) * lean * height);
      kit.add(
        tube({
          spine: (t) => new THREE.Vector3(top.x * t * t, top.y * t, top.z * t * t),
          radius: () => 0.018,
          rings: 2,
          sides: 3,
          cap: "open",
        }),
        { color: stem, sway: (p) => p.y, smooth: true },
      );
      kit.add(lobe({ radius: [0.11, 0.045, 0.11], detail: 0, jitter: 0.2, seed: options.seed + i, center: [top.x, top.y, top.z] }), {
        color: petal,
        sway: 1,
        smooth: true,
      });
      kit.add(lobe({ radius: [0.04, 0.035, 0.04], detail: 0, jitter: 0, seed: 1, center: [top.x, top.y + 0.03, top.z] }), {
        color: heart,
        sway: 1,
        smooth: true,
      });
    }
    return kit.finish();
  };
}
