/**
 * Monsoon plants: everything green in a drenched marsh hangs under the
 * weight of water.
 *
 *  - Rain palms: slender ringed trunks under crowns of long, heavy fronds
 *    that arch out and hang past horizontal, tips dripping toward the
 *    ground, with a skirt of dead fronds folded against the trunk.
 *  - Banana plants: a clump of fat pseudostems carrying huge paddle leaves,
 *    torn into strips along their edges by wind and rain, the older leaves
 *    collapsed and hanging.
 *  - Taro (elephant ear): broad heart-shaped leaves on long stalks, the
 *    blades tipped down so water runs off the point.
 *  - Fern clumps: arching, finely serrated fronds.
 *  - Reed beds: tall straight blades and cattail heads, leaning downwind.
 *  - Ginger lilies: short spikes of pink bracts (the biome's accent).
 *  - Fallen leaves: a torn banana leaf lying on the wet ground.
 *
 * Tone is structural: dark low and inside the crown, light on exposed leaf
 * tops. Everything is smooth-shaded and sways from the root.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { blade, builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------------------
// Leaves

interface LeafOptions {
  length: number;
  /** Half-width as a fraction of the length at the widest point. */
  width: number;
  /** Where along the leaf it is widest (0.2 heart … 0.55 paddle). */
  widest: number;
  /** Launch angle above horizontal, radians. */
  rise: number;
  /** Tip droop (0 stiff … 1.6 hanging). */
  droop: number;
  segments: number;
  ramp: Ramp;
  shade: number;
  /** Torn-into-strips outline (every other row narrows to this fraction). */
  torn?: number;
  fold?: number;
  sway: readonly [number, number];
}

function leaf(options: LeafOptions): THREE.BufferGeometry {
  const L = options.length;
  const w = options.width;
  const peak = options.widest;
  return blade({
    length: L,
    segments: options.segments,
    width: (t) => {
      // Rounded base swelling to the widest point, then a long taper to the tip.
      const k = t < peak ? Math.sin((Math.PI / 2) * Math.min(1, (t + 0.08) / (peak + 0.08))) : Math.cos((Math.PI / 2) * ((t - peak) / (1 - peak))) ** 0.8;
      return L * w * k;
    },
    lift: (t) => L * (Math.sin(options.rise) * t - options.droop * 0.7 * t * t),
    fold: options.fold ?? 0.22,
    serrate: options.torn,
    color: (t, side) => rampAt(options.ramp, clamp01(0.3 + t * 0.4 + (side === 0 ? -0.12 : 0.06) + options.shade)),
    sway: (t) => options.sway[0] + (options.sway[1] - options.sway[0]) * t,
  });
}

// ---------------------------------------------------------------------------
// Rain palm

export interface RainPalmOptions {
  /** Trunk height, native units (the crown adds ~0.25). */
  trunk: number;
  /** Horizontal lean of the crown over the base, native units. */
  bend: number;
  fronds: number;
  frondLength: number;
  /** How far the outer fronds hang (0.9 … 1.6). */
  droop: number;
  seed: number;
  /** Dead fronds hanging against the trunk under the crown. */
  skirt?: number;
}

export function rainPalm(options: RainPalmOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const trunkRamp = linearRamp(tones.trunk);
    const green = linearRamp(tones.foliage);
    const young = linearRamp(tones.foliageAlt);
    const dead = linearRamp(tones.dry);
    const H = options.trunk;
    const yaw0 = random() * Math.PI * 2;
    const spine = (t: number) =>
      new THREE.Vector3(Math.cos(yaw0) * options.bend * t ** 1.8, H * t, Math.sin(yaw0) * options.bend * t ** 1.8);
    const rings = 9;
    kit.add(
      tube({
        spine,
        radius: (t) => {
          const ring = 1 - Math.abs(((t * rings) % 1) * 2 - 1);
          return 0.05 * (1 - 0.4 * t) * (1 + 0.6 * (1 - Math.min(1, t / 0.08)) ** 2) * (1 + 0.08 * (1 - ring) ** 3);
        },
        rings: rings * 2,
        sides: 7,
        cap: "open",
        // Wet bark: dark at the foot and at each ring scar, a sheen higher up.
        color: (t) => rampAt(trunkRamp, clamp01(0.2 + t * 0.5 - (((t * rings) % 1) < 0.2 ? 0.22 : 0))),
        sway: (t) => t * t * 0.3,
      }),
      { color: "attribute", sway: "attribute", smooth: true },
    );
    const top = spine(1);
    kit.add(lobe({ radius: [0.05, 0.05, 0.05], detail: 1, jitter: 0.12, seed: options.seed, center: [top.x, top.y - 0.01, top.z] }), {
      color: new THREE.Color(tones.trunk.dark),
      sway: 0.3,
      smooth: true,
    });
    // Crown: a short upright spear of new leaves, the main arching ring,
    // and a lower ring hanging steeply (the weight of the rain).
    const total = options.fronds;
    for (let i = 0; i < total; i += 1) {
      const yaw = (i / total) * Math.PI * 2 + (random() - 0.5) * 0.4;
      const tier = i % 3; // 0 upper, 1 main, 2 hanging
      const rise = [0.95, 0.45, 0.1][tier]! + (random() - 0.5) * 0.15;
      const droop = options.droop * [0.55, 1, 1.35][tier]!;
      const length = options.frondLength * [0.7, 1, 0.95][tier]! * (0.9 + random() * 0.2);
      const g = leaf({
        length,
        width: 0.2,
        widest: 0.42,
        rise,
        droop,
        segments: 8,
        ramp: tier === 0 ? young : green,
        shade: tier === 2 ? -0.12 : (random() - 0.5) * 0.12,
        torn: 0.6,
        fold: 0.45,
        sway: [0.3, 1],
      });
      g.rotateY(yaw);
      g.translate(top.x, top.y, top.z);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    for (let i = 0; i < (options.skirt ?? 0); i += 1) {
      const yaw = random() * Math.PI * 2;
      const g = leaf({ length: options.frondLength * 0.55, width: 0.08, widest: 0.35, rise: -1.2, droop: 0.2, segments: 4, ramp: dead, shade: -0.1, fold: 0.5, sway: [0.2, 0.5] });
      g.rotateY(yaw);
      g.translate(top.x, top.y - 0.02, top.z);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ groundAo: { height: 0.1, strength: 0.3 } });
  };
}

export function rainPalmVariants(): VariantBuilder[] {
  return [
    rainPalm({ trunk: 1, bend: 0.12, fronds: 14, frondLength: 0.46, droop: 1.2, seed: 301, skirt: 2 }),
    rainPalm({ trunk: 1.2, bend: 0.26, fronds: 14, frondLength: 0.44, droop: 1.35, seed: 302, skirt: 1 }),
    rainPalm({ trunk: 0.85, bend: 0.05, fronds: 13, frondLength: 0.4, droop: 1.05, seed: 303, skirt: 2 }),
    rainPalm({ trunk: 1.1, bend: 0.18, fronds: 12, frondLength: 0.5, droop: 1.5, seed: 304 }),
  ];
}

/** Young palms under the canopy: short trunk, few fronds. */
export function youngPalmVariants(): VariantBuilder[] {
  return [
    rainPalm({ trunk: 0.35, bend: 0.03, fronds: 7, frondLength: 0.36, droop: 1.1, seed: 311 }),
    rainPalm({ trunk: 0.25, bend: 0.06, fronds: 6, frondLength: 0.34, droop: 1.3, seed: 312 }),
  ];
}

// ---------------------------------------------------------------------------
// Banana plant

export interface BananaOptions {
  /** Pseudostems in the clump (1–3). */
  stems: number;
  /** Leaves per stem. */
  leaves: number;
  seed: number;
  /** Share of leaves that have collapsed and hang (0 … 0.5). */
  collapsed?: number;
}

export function banana(options: BananaOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const stemRamp = linearRamp(tones.stem ?? tones.foliageAlt);
    const green = linearRamp(tones.foliageAlt);
    const deep = linearRamp(tones.foliage);
    const dead = linearRamp(tones.dry);
    for (let s = 0; s < options.stems; s += 1) {
      const main = s === 0;
      const angle = (s / Math.max(1, options.stems)) * Math.PI * 2 + random();
      const offset = main ? 0 : 0.09 + random() * 0.04;
      const height = main ? 0.72 : 0.36 + random() * 0.2;
      const base = new THREE.Vector3(Math.cos(angle) * offset, 0, Math.sin(angle) * offset);
      const lean = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(main ? 0.02 : 0.06);
      const spine = (t: number) => base.clone().addScaledVector(lean, t * t).setY(height * t);
      kit.add(
        tube({
          spine,
          radius: (t) => (main ? 0.052 : 0.036) * (1 - 0.35 * t) * (1 + 0.35 * (1 - Math.min(1, t / 0.12)) ** 2),
          rings: 4,
          sides: 7,
          cap: "open",
          color: (t) => rampAt(stemRamp, clamp01(0.2 + t * 0.6)),
          sway: (t) => t * 0.3,
        }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      const top = spine(1);
      const count = main ? options.leaves : Math.max(2, options.leaves - 2);
      for (let i = 0; i < count; i += 1) {
        const yaw = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.5 + angle;
        const hanging = random() < (options.collapsed ?? 0.25);
        const length = (main ? 0.42 : 0.3) * (0.85 + random() * 0.2);
        const g = leaf({
          length,
          width: 0.2,
          widest: 0.5,
          rise: hanging ? -0.35 : 0.85 + random() * 0.3,
          droop: hanging ? 0.6 : 1.05 + random() * 0.3,
          segments: 8,
          ramp: hanging ? dead : i % 2 === 0 ? green : deep,
          shade: hanging ? -0.15 : (random() - 0.5) * 0.14,
          torn: hanging ? 0.2 : 0.55,
          fold: 0.12,
          sway: [0.35, 1],
        });
        g.rotateY(yaw);
        g.translate(top.x, top.y - 0.02 - (hanging ? 0.05 : 0), top.z);
        kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
      }
    }
    return kit.finish({ groundAo: { height: 0.18, strength: 0.3 } });
  };
}

export function bananaVariants(): VariantBuilder[] {
  return [
    banana({ stems: 1, leaves: 7, seed: 321, collapsed: 0.2 }),
    banana({ stems: 2, leaves: 6, seed: 322, collapsed: 0.3 }),
    banana({ stems: 3, leaves: 6, seed: 323, collapsed: 0.25 }),
  ];
}

// ---------------------------------------------------------------------------
// Taro (elephant ear)

export function taro(options: { leaves: number; seed: number; spread: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const green = linearRamp(tones.foliage);
    const alt = linearRamp(tones.foliageAlt);
    const stalk = new THREE.Color(tones.stem?.base ?? tones.foliageAlt.dark);
    for (let i = 0; i < options.leaves; i += 1) {
      const yaw = (i / options.leaves) * Math.PI * 2 + (random() - 0.5) * 0.7;
      const reach = options.spread * (0.4 + random() * 0.6);
      const h = 0.55 + random() * 0.4;
      const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      const tip = dir.clone().multiplyScalar(reach).setY(h);
      // Stalk: arches out from the crown to the leaf's heart.
      kit.add(
        tube({
          spine: (t) => new THREE.Vector3(tip.x * t ** 1.6, h * Math.sin((t * Math.PI) / 2), tip.z * t ** 1.6),
          radius: (t) => 0.022 * (1 - 0.5 * t),
          rings: 4,
          sides: 4,
          cap: "open",
        }),
        { color: stalk, sway: (p) => p.y * 0.6, smooth: true },
      );
      // Heart-shaped blade hung from the stalk top, point down and out.
      const length = 0.36 + random() * 0.12;
      const g = leaf({ length, width: 0.36, widest: 0.22, rise: 0.1, droop: 1.1, segments: 7, ramp: i % 2 ? alt : green, shade: (random() - 0.5) * 0.15, fold: 0.18, sway: [0.6, 1] });
      g.translate(-length * 0.12, 0, 0);
      g.rotateY(-yaw);
      g.translate(tip.x, tip.y, tip.z);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ groundAo: { height: 0.25, strength: 0.3 } });
  };
}

export function fernClump(options: { fronds: number; seed: number; arch: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const green = linearRamp(tones.foliage);
    const alt = linearRamp(tones.foliageAlt);
    for (let i = 0; i < options.fronds; i += 1) {
      const yaw = (i / options.fronds) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const length = 0.8 + random() * 0.2;
      // Inner fronds stand nearly upright, outer ones arch over further.
      const inner = i % 2 === 0;
      const g = leaf({ length, width: 0.15, widest: 0.45, rise: 0, droop: options.arch * (inner ? 0.7 : 1), segments: 8, ramp: i % 3 === 0 ? alt : green, shade: (random() - 0.5) * 0.2, torn: 0.25, fold: 0.3, sway: [0.2, 1] });
      g.rotateZ(inner ? 1.5 : 1.36);
      g.rotateY(yaw);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    // A dark crown mass hides where the fronds meet.
    kit.add(lobe({ radius: [0.14, 0.1, 0.14], detail: 1, jitter: 0.15, seed: options.seed, floor: -0.2 }), {
      color: rampTone(tones.foliage, { bias: -0.6 }),
      sway: 0.1,
      smooth: true,
    });
    return kit.finish({ groundAo: { height: 0.3, strength: 0.35 } });
  };
}

/** Bushes: taro and ferns, ≥ 5 variants between them. */
export function monsoonBushVariants(): VariantBuilder[] {
  return [
    taro({ leaves: 5, seed: 331, spread: 0.28 }),
    taro({ leaves: 7, seed: 332, spread: 0.32 }),
    taro({ leaves: 4, seed: 333, spread: 0.24 }),
    fernClump({ fronds: 9, seed: 341, arch: 0.8 }),
    fernClump({ fronds: 11, seed: 342, arch: 0.75 }),
    fernClump({ fronds: 7, seed: 343, arch: 0.8 }),
  ];
}

// ---------------------------------------------------------------------------
// Reeds

export function reeds(options: { blades: number; heads: number; seed: number; lean: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const reed = linearRamp(tones.reed ?? tones.dry);
    for (let i = 0; i < options.blades; i += 1) {
      const yaw = random() * Math.PI * 2;
      const r = random() * 0.12;
      const length = 0.55 + random() * 0.45;
      const tilt = options.lean * (0.3 + random() * 0.7);
      const shade = (random() - 0.5) * 0.25;
      const g = blade({
        length,
        segments: 3,
        width: (t) => 0.022 * (1 - t * 0.85),
        lift: (t) => -0.12 * length * t * t,
        fold: 0.6,
        color: (t) => rampAt(reed, clamp01(0.15 + t * 0.75 + shade)),
        sway: (t) => t,
      });
      g.rotateZ(Math.PI / 2 - tilt);
      g.rotateY(yaw);
      g.translate(Math.cos(yaw) * r, 0, Math.sin(yaw) * r);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    // Cattails: a thin stem topped by a dark brown velvet head.
    const head = rampTone(tones.cattail ?? tones.trunk, { heightWeight: 0.1 });
    for (let i = 0; i < options.heads; i += 1) {
      const angle = random() * Math.PI * 2;
      const r = 0.03 + random() * 0.08;
      const h = 0.75 + random() * 0.25;
      const lean = options.lean * 0.25;
      const base = new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      const topAt = (t: number) => base.clone().add(new THREE.Vector3(lean * t * t * 0.3, h * t, 0));
      kit.add(tube({ spine: topAt, radius: () => 0.008, rings: 2, sides: 3, cap: "open" }), { color: new THREE.Color(tones.reed?.base ?? tones.dry.base), sway: (p) => p.y, smooth: true });
      const top = topAt(1);
      kit.add(
        tube({ spine: (t) => new THREE.Vector3(top.x, top.y - 0.14 + t * 0.12, top.z), radius: () => 0.022, rings: 1, sides: 5, cap: "dome", domeScale: 0.6 }),
        { color: head, sway: 1, smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.2, strength: 0.3 } });
  };
}

export function reedVariants(): VariantBuilder[] {
  return [
    reeds({ blades: 11, heads: 3, seed: 351, lean: 0.25 }),
    reeds({ blades: 9, heads: 2, seed: 352, lean: 0.4 }),
    reeds({ blades: 12, heads: 4, seed: 353, lean: 0.18 }),
  ];
}

// ---------------------------------------------------------------------------
// Accent flowers and dressing

/** Ginger lily: a few upright stems with stacked pink bracts. */
export function gingerLily(options: { stems: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const stem = new THREE.Color(tones.foliage.base);
    const bract = rampTone(tones.accent, { heightWeight: 0.6 });
    const green = linearRamp(tones.foliage);
    for (let i = 0; i < options.stems; i += 1) {
      const angle = random() * Math.PI * 2;
      const r = random() * 0.12;
      const h = 0.7 + random() * 0.3;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      kit.add(tube({ spine: (t) => new THREE.Vector3(x, h * t * 0.8, z), radius: () => 0.018, rings: 2, sides: 4, cap: "open" }), { color: stem, sway: (p) => p.y, smooth: true });
      // Bract head: a stack of three pointed lobes.
      for (let k = 0; k < 3; k += 1) {
        const size = 0.07 - k * 0.015;
        kit.add(lobe({ radius: [size, size * 1.3, size], detail: 0, jitter: 0.15, seed: options.seed + i * 3 + k, center: [x, h * 0.8 + k * 0.07, z] }), { color: bract, sway: 1, smooth: true });
      }
      // One strap leaf per stem.
      const g = leaf({ length: 0.45, width: 0.12, widest: 0.4, rise: 0.8, droop: 1, segments: 4, ramp: green, shade: 0, sway: [0.2, 0.9] });
      g.rotateY(angle + 1);
      g.translate(x, 0.15, z);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish();
  };
}

/** A torn banana leaf lying on the wet ground (size fit). */
export function fallenLeaf(seed: number): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(seed);
    const kit = new MeshKit();
    const g = leaf({ length: 1, width: 0.2, widest: 0.5, rise: 0.05, droop: 0.12, segments: 6, ramp: linearRamp(random() < 0.5 ? tones.dry : tones.foliageAlt), shade: -0.1, torn: 0.45, fold: 0.1, sway: [0, 0.2] });
    g.translate(-0.5, 0.02, 0);
    g.rotateY(random() * Math.PI);
    kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    return kit.finish({ fit: "size" });
  };
}
