/**
 * Ember vegetation (Ember art; built on the shared mesh kit and shapes).
 *
 * What survives on a volcanic field, as strong dark silhouettes over ash:
 *  - snags: dead, charred trees. Fluted, gnarled trunks leaning off true,
 *    forking bare branches, splayed roots and a splintered top; one still
 *    smoulders at the foot, one is bleached pale by ash;
 *  - charred stumps: short, splintered, root-flared;
 *  - ash plants: wiry scrub under grey-sage leaf clumps, dense grey tussocks
 *    and dark ember ferns whose frond tips glow red;
 *  - fire lilies: the one bright accent, used sparingly.
 * Colour is structural (char darkest in the flutes and at the foot, lighter
 * on ridges and up high); the red is vertex colour only, never emissive.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { blade, builderRandom, hash01, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rampOf = (tones: BiomeTones, name: string, fallback = "trunk"): Ramp => linearRamp(tones[name] ?? tones[fallback] ?? tones.trunk);

// ---------------------------------------------------------------------------
// Snags and stumps

export interface BranchSpec {
  /** Where it leaves the trunk, 0 (foot) … 1 (top). */
  at: number;
  /** Heading around the trunk, radians. */
  angle: number;
  length: number;
  /** Climb per unit reach (negative droops). */
  rise: number;
  /** Adds a smaller fork near the branch end. */
  fork?: boolean;
}

export interface SnagOptions {
  /** Trunk height (native units; the crown of branches may add a little). */
  height: number;
  /** Trunk foot radius. */
  radius: number;
  /** Horizontal lean of the top over the foot, and a sideways S-bend. */
  lean: number;
  bend?: number;
  branches: readonly BranchSpec[];
  /** Splayed roots at the foot (count). */
  roots?: number;
  seed: number;
  /** Tone ramp (default "char"). */
  ramp?: string;
  /** Glowing embers in the flutes at the foot (vertex colour). */
  smoulder?: boolean;
  /** Two leaders from a split trunk (lightning-struck). */
  split?: boolean;
}

/** Fluted char: dark grooves, lighter ridges, lighter higher up. */
function charColor(char: Ramp, magma: Ramp | null, seed: number) {
  return (t: number, angle: number, height: number) => {
    const flute = Math.cos(angle * 3 + seed);
    const c = rampAt(char, clamp01(0.18 + 0.28 * height + 0.18 * flute));
    if (magma && height < 0.14 && flute < -0.2) c.lerp(rampAt(magma, 0.5 + 0.5 * (1 - height / 0.14)), 0.85 * clamp01((-flute - 0.2) / 0.5));
    return c;
  };
}

/** A tapered, gnarled limb from `from` along `dir` (native units). */
function limb(from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, droop: number, color: (t: number, a: number) => THREE.Color, sway: number) {
  const d = dir.clone().normalize();
  return tube({
    spine: (t) => from.clone().addScaledVector(d, length * t).add(new THREE.Vector3(0, droop * length * t * t, 0)),
    radius: (t) => radius * (1 - 0.82 * t),
    rings: 3,
    sides: 4,
    cap: "point",
    color,
    sway: (t) => sway * (0.4 + 0.6 * t),
  });
}

export function snag(options: SnagOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const char = rampOf(tones, options.ramp ?? "char");
    const magma = options.smoulder ? rampOf(tones, "magma", "accent") : null;
    const tone = charColor(char, magma, options.seed);
    const H = options.height;
    const bend = options.bend ?? 0;
    const spine = (t: number) => new THREE.Vector3(options.lean * t ** 1.6, H * t, bend * Math.sin(Math.PI * t));
    const leaders = options.split ? 2 : 1;
    const trunkTop = options.split ? 0.62 : 1;
    kit.add(
      tube({
        spine: (t) => spine(t * trunkTop),
        radius: (t, a) => {
          const flare = 1 + 0.9 * (1 - Math.min(1, t / 0.12)) ** 2;
          return options.radius * (1 - 0.72 * t * trunkTop) * flare * (1 + 0.14 * Math.cos(a * 3 + options.seed));
        },
        rings: 7,
        sides: 6,
        cap: options.split ? "dome" : "point",
        domeScale: 0.3,
        color: (t, a) => tone(t, a, Math.min(1, t) * trunkTop),
        sway: (t) => 0.08 * t,
      }),
      { color: "attribute", sway: "attribute", smooth: true },
    );
    // Split trunk: two leaders diverge from the fork.
    if (options.split) {
      const fork = spine(trunkTop);
      for (let l = 0; l < leaders; l += 1) {
        const a = options.seed + l * Math.PI + 0.4;
        const top = new THREE.Vector3(Math.cos(a) * H * 0.16, H * (0.36 - l * 0.08), Math.sin(a) * H * 0.12);
        kit.add(
          tube({
            spine: (t) => fork.clone().addScaledVector(top, t).add(new THREE.Vector3(0, 0, 0)),
            radius: (t, ang) => options.radius * 0.5 * (1 - 0.85 * t) * (1 + 0.1 * Math.cos(ang * 3)),
            rings: 4,
            sides: 5,
            cap: "point",
            color: (t, ang) => tone(t, ang, trunkTop + t * 0.38),
            sway: () => 0.1,
          }),
          { color: "attribute", sway: "attribute", smooth: true },
        );
      }
    }
    for (const branch of options.branches) {
      const from = spine(branch.at * trunkTop);
      const dir = new THREE.Vector3(Math.cos(branch.angle), branch.rise, Math.sin(branch.angle));
      const r = options.radius * (0.56 - 0.2 * branch.at);
      const color = (t: number, a: number) => tone(t, a, branch.at * trunkTop + 0.1 * t);
      kit.add(limb(from, dir, branch.length, r, branch.rise < 0 ? -0.25 : 0.12, color, 0.18), { color: "attribute", sway: "attribute", smooth: true });
      if (branch.fork) {
        const d = dir.clone().normalize();
        const at = from.clone().addScaledVector(d, branch.length * 0.55);
        const turn = branch.angle + (random() < 0.5 ? 0.7 : -0.7);
        const forkDir = new THREE.Vector3(Math.cos(turn), Math.max(0.5, branch.rise + 0.5), Math.sin(turn));
        kit.add(limb(at, forkDir, branch.length * 0.5, r * 0.55, 0.1, color, 0.22), { color: "attribute", sway: "attribute", smooth: true });
      }
    }
    // Roots splay out and dive into the ash.
    const roots = options.roots ?? 3;
    for (let i = 0; i < roots; i += 1) {
      const a = (i / roots) * Math.PI * 2 + random() * 0.8 + options.seed;
      const from = new THREE.Vector3(Math.cos(a) * options.radius * 0.5, H * 0.05, Math.sin(a) * options.radius * 0.5);
      const reach = options.radius * (1.6 + random() * 0.8);
      kit.add(
        tube({
          spine: (t) => from.clone().add(new THREE.Vector3(Math.cos(a) * reach * t, -H * 0.06 * t, Math.sin(a) * reach * t)),
          radius: (t) => options.radius * 0.36 * (1 - 0.8 * t),
          rings: 2,
          sides: 4,
          cap: "point",
          color: (t, ang) => tone(t, ang, 0),
        }),
        { color: "attribute", smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.08, strength: 0.3 } });
  };
}

/** A charred, splintered stump with splayed roots. */
export function charredStump(options: { height: number; radius: number; seed: number; roots?: number; smoulder?: boolean; branch?: boolean }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const char = rampOf(tones, "char");
    const magma = options.smoulder ? rampOf(tones, "magma", "accent") : null;
    const tone = charColor(char, magma, options.seed);
    const H = options.height;
    const body = tube({
      spine: (t) => new THREE.Vector3(0.03 * t, H * t, 0),
      radius: (t, a) => options.radius * (1 - 0.18 * t) * (1 + 0.7 * (1 - Math.min(1, t / 0.2)) ** 2) * (1 + 0.12 * Math.cos(a * 3 + options.seed)),
      rings: 4,
      sides: 7,
      cap: "dome",
      domeScale: 0.25,
      color: (t, a) => (t > 1 ? rampAt(char, 0.62) : tone(t, a, Math.min(1, t) * 0.8)),
      sway: () => 0,
    });
    // Splinter the broken top: rim and cap vertices jag up and down by angle.
    const position = body.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y < H * 0.9) continue;
      const a = Math.atan2(position.getZ(i), position.getX(i));
      const k = Math.round(((a + Math.PI) / (Math.PI * 2)) * 7) % 7;
      const jag = (hash01(k, options.seed, 5) - 0.35) * H * 0.55;
      position.setY(i, y + Math.max(-H * 0.12, jag) * ((y - H * 0.9) / (H * 0.1 + 1e-6) > 0.5 ? 1 : 0.5));
    }
    body.computeVertexNormals();
    kit.add(body, { color: "attribute", sway: "attribute", smooth: true });
    const roots = options.roots ?? 4;
    for (let i = 0; i < roots; i += 1) {
      const a = (i / roots) * Math.PI * 2 + random() * 0.6;
      const from = new THREE.Vector3(Math.cos(a) * options.radius * 0.6, H * 0.12, Math.sin(a) * options.radius * 0.6);
      const reach = options.radius * (1.1 + random() * 0.4);
      kit.add(
        tube({
          spine: (t) => from.clone().add(new THREE.Vector3(Math.cos(a) * reach * t, -H * 0.14 * t, Math.sin(a) * reach * t)),
          radius: (t) => options.radius * 0.4 * (1 - 0.8 * t),
          rings: 2,
          sides: 4,
          cap: "point",
          color: (t, ang) => tone(t, ang, 0),
        }),
        { color: "attribute", smooth: true },
      );
    }
    if (options.branch) {
      // One surviving stub of a limb.
      const from = new THREE.Vector3(0, H * 0.7, 0);
      kit.add(limb(from, new THREE.Vector3(0.8, 0.9, 0.3), H * 0.7, options.radius * 0.35, 0.1, (t, a) => tone(t, a, 0.7), 0), { color: "attribute", smooth: true });
    }
    return kit.finish({ groundAo: { height: 0.15, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// Ash plants

export interface TussockOptions {
  blades: number;
  /** Blade length relative to the clump height (≈ 0.8 … 1.3). */
  length: number;
  /** Outward splay of the outer blades, radians. */
  splay: number;
  seed: number;
  ramp?: string;
  width?: number;
}

/** A dense grey tussock: many blades fanning from a tight base, arching over. */
export function tussock(options: TussockOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = rampOf(tones, options.ramp ?? "ashgrass", "dry");
    for (let i = 0; i < options.blades; i += 1) {
      const yaw = i * 2.39996 + random() * 0.4; // golden-angle fan: even, not radial
      const inner = i < options.blades * 0.35;
      const length = options.length * (inner ? 1 : 0.7 + random() * 0.3);
      const lean = options.splay * (inner ? 0.25 + random() * 0.25 : 0.6 + random() * 0.5);
      const shade = (random() - 0.5) * 0.25 + (inner ? 0.1 : -0.05);
      const g = blade({
        length,
        segments: 3,
        width: (t) => (options.width ?? 0.045) * (1 - t * 0.85),
        lift: (t) => -0.3 * length * t * t,
        fold: 0.5,
        color: (t) => rampAt(ramp, clamp01(0.12 + t * 0.8 + shade)),
        sway: (t) => t,
      });
      g.rotateZ(Math.PI / 2 - lean);
      g.rotateY(yaw);
      g.translate(Math.cos(yaw) * 0.03, 0, -Math.sin(yaw) * 0.03);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ groundAo: { height: 0.3, strength: 0.35 } });
  };
}

/**
 * Dark ember fern: arching serrated fronds from a low crown, the last third
 * of each frond turning ember red.
 */
export function emberFern(options: { fronds: number; seed: number; rise?: number; droop?: number; tips?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const leaf = rampOf(tones, "fern", "foliage");
    const tip = rampOf(tones, "accent");
    const tipFrom = 1 - (options.tips ?? 0.32);
    for (let i = 0; i < options.fronds; i += 1) {
      const yaw = (i / options.fronds) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const length = 0.9 + random() * 0.35;
      const rise = (options.rise ?? 0.95) * (0.8 + random() * 0.35);
      const droop = (options.droop ?? 0.9) * (0.85 + random() * 0.3);
      const shade = (random() - 0.5) * 0.2;
      const g = blade({
        length,
        segments: 8,
        width: (t) => length * 0.13 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)) ** 0.8,
        // Arches over along its length; pitched up below (shuttlecock crown).
        lift: (t) => -length * droop * 0.45 * t * t,
        fold: 0.4,
        serrate: 0.3,
        color: (t, side) => {
          const c = rampAt(leaf, clamp01(0.2 + t * 0.55 + (side === 0 ? -0.12 : 0.04) + shade));
          if (t > tipFrom) c.lerp(rampAt(tip, 0.35 + 0.65 * ((t - tipFrom) / (1 - tipFrom))), clamp01((t - tipFrom) / 0.12));
          return c;
        },
        sway: (t) => 0.3 + 0.7 * t,
      });
      g.rotateZ(rise);
      g.rotateY(yaw);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ groundAo: { height: 0.25, strength: 0.3 } });
  };
}

/**
 * Fire lily: a clump of grey strap leaves and a few tall stems, each topped
 * by a flared red trumpet. The biome's one bright accent.
 */
export function fireLily(options: { stems: number; leaves: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const leaf = rampOf(tones, "ashleaf", "foliage");
    const petal = rampOf(tones, "accent");
    const stem = new THREE.Color(tones.fern?.dark ?? tones.foliage.dark);
    for (let i = 0; i < options.leaves; i += 1) {
      const yaw = (i / options.leaves) * Math.PI * 2 + random() * 0.6;
      const length = 0.36 + random() * 0.16;
      const g = blade({
        length,
        segments: 3,
        width: (t) => 0.035 * (1 - t * 0.7),
        lift: (t) => length * (1.5 * t - 0.8 * t * t),
        fold: 0.4,
        color: (t) => rampAt(leaf, clamp01(0.2 + t * 0.6)),
        sway: (t) => t * 0.8,
      });
      g.rotateY(yaw);
      kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    for (let s = 0; s < options.stems; s += 1) {
      const a = random() * Math.PI * 2;
      const lean = 0.08 + random() * 0.14;
      const h = 0.72 + random() * 0.28 - s * 0.08;
      const top = new THREE.Vector3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h);
      kit.add(
        tube({ spine: (t) => new THREE.Vector3(top.x * t * t, top.y * t, top.z * t * t), radius: () => 0.014, rings: 2, sides: 3, cap: "open" }),
        { color: stem, sway: (p) => p.y, smooth: true },
      );
      // Trumpet: a small calyx and four flared, curling petals.
      kit.add(lobe({ radius: [0.03, 0.04, 0.03], detail: 0, jitter: 0.05, seed: options.seed + s, center: [top.x, top.y, top.z] }), { color: rampAt(petal, 0.1), sway: 1, smooth: true });
      const petals = 4;
      for (let p = 0; p < petals; p += 1) {
        const yaw = (p / petals) * Math.PI * 2 + a;
        const g = blade({
          length: 0.13,
          segments: 2,
          width: (t) => 0.035 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)),
          lift: (t) => 0.13 * (1.1 * t - 0.45 * t * t),
          fold: 0.2,
          color: (t) => rampAt(petal, clamp01(0.25 + 0.75 * t)),
          sway: () => 1,
        });
        g.rotateY(yaw);
        g.translate(top.x, top.y, top.z);
        kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
      }
    }
    return kit.finish({ groundAo: { height: 0.2, strength: 0.3 } });
  };
}

/**
 * Ash scrub: wiry charred stems forking up under a loose crown of small
 * grey-sage leaf clumps, lower and sparser than desert scrub.
 */
export function ashScrub(options: { stems: number; clumps: number; seed: number; spread?: number; leafRamp?: string }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const wood = rampOf(tones, "char");
    const leaves = tones[options.leafRamp ?? "ashleaf"] ?? tones.foliage;
    const spread = options.spread ?? 0.5;
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < options.stems; i += 1) {
      const a = (i / options.stems) * Math.PI * 2 + random() * 0.8;
      const lean = spread * (0.6 + random() * 0.5);
      const h = 0.5 + random() * 0.35;
      const end = new THREE.Vector3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h);
      const bow = (random() - 0.5) * 0.12;
      kit.add(
        tube({
          spine: (t) => new THREE.Vector3(end.x * t + bow * Math.sin(Math.PI * t), end.y * t, end.z * t),
          radius: (t) => 0.024 * (1 - 0.75 * t),
          rings: 3,
          sides: 4,
          cap: "point",
          color: (t) => rampAt(wood, 0.25 + t * 0.35),
          sway: (t) => t * 0.7,
        }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      // A bare twig pokes past the leaves: the silhouette stays wiry.
      const from = end.clone().multiplyScalar(0.7);
      const twig = end.clone().multiplyScalar(1.18).add(new THREE.Vector3(Math.cos(a + 1) * 0.1, 0.1, Math.sin(a + 1) * 0.1));
      kit.add(
        tube({ spine: (t) => from.clone().lerp(twig, t), radius: (t) => 0.012 * (1 - 0.8 * t), rings: 2, sides: 3, cap: "point", color: () => rampAt(wood, 0.4), sway: () => 0.8 }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      tips.push(end);
    }
    // Overlapping round clumps pulled in toward the stems, so the crown reads
    // as one notched cushion with bare twigs poking through, not caps on sticks.
    for (let i = 0; i < options.clumps; i += 1) {
      const tip = tips[i % tips.length]!;
      const r = 0.12 + random() * 0.05;
      const pull = 0.62 + random() * 0.14;
      kit.add(
        lobe({ radius: [r, r * 0.86, r * (0.9 + random() * 0.2)], detail: 1, jitter: 0.2, seed: options.seed * 5 + i, center: [tip.x * pull, tip.y * (0.78 + random() * 0.1), tip.z * pull] }),
        { color: rampTone(leaves, { heightWeight: 0.4, bias: (random() - 0.5) * 0.3 }), sway: 0.7, smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.2, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// The Ember vegetation set

export function emberSnags(): VariantBuilder[] {
  return [
    // Tall forked snag leaning off true, three reaching limbs.
    snag({ height: 1, radius: 0.09, lean: 0.12, bend: 0.03, seed: 1, roots: 3, branches: [
      { at: 0.4, angle: 0.3, length: 0.46, rise: 0.8, fork: true },
      { at: 0.58, angle: 2.6, length: 0.38, rise: 1, fork: true },
      { at: 0.76, angle: 4.4, length: 0.28, rise: 0.7, fork: true },
    ] }),
    // Twisted dead tree: one long drooping limb, one short stub.
    snag({ height: 0.9, radius: 0.095, lean: -0.1, bend: 0.07, seed: 2, roots: 4, branches: [
      { at: 0.5, angle: 1.2, length: 0.5, rise: -0.1, fork: true },
      { at: 0.7, angle: 4.2, length: 0.24, rise: 0.8, fork: true },
      { at: 0.32, angle: 3, length: 0.12, rise: 0.3 },
    ] }),
    // Lightning-split trunk, still smouldering at the foot.
    snag({ height: 0.95, radius: 0.1, lean: 0.05, seed: 3, split: true, smoulder: true, roots: 3, branches: [
      { at: 0.5, angle: 3.3, length: 0.3, rise: 0.6, fork: true },
    ] }),
    // Bleached ash-grey snag: pale, sparse, strong against the dark ground.
    snag({ height: 1, radius: 0.075, lean: 0.06, bend: -0.04, seed: 4, ramp: "ash", roots: 3, branches: [
      { at: 0.36, angle: 5.2, length: 0.34, rise: 0.8, fork: true },
      { at: 0.58, angle: 1.9, length: 0.4, rise: 1.1, fork: true },
      { at: 0.82, angle: 3.6, length: 0.2, rise: 0.5 },
    ] }),
    // Candelabra: short limbs turning upward all round.
    snag({ height: 0.85, radius: 0.1, lean: 0.03, seed: 5, roots: 4, branches: [
      { at: 0.38, angle: 0.8, length: 0.32, rise: 1.4 },
      { at: 0.46, angle: 2.9, length: 0.34, rise: 1.3, fork: true },
      { at: 0.54, angle: 5, length: 0.3, rise: 1.5, fork: true },
    ] }),
  ];
}

export function emberStumps(): VariantBuilder[] {
  return [
    charredStump({ height: 0.72, radius: 0.1, seed: 11, roots: 4 }),
    charredStump({ height: 0.8, radius: 0.09, seed: 12, roots: 3, branch: true }),
    charredStump({ height: 0.66, radius: 0.11, seed: 13, roots: 5, smoulder: true }),
  ];
}

export function emberBushes(): VariantBuilder[] {
  return [
    ashScrub({ stems: 5, clumps: 4, seed: 1 }),
    ashScrub({ stems: 6, clumps: 5, seed: 2, spread: 0.62 }),
    ashScrub({ stems: 4, clumps: 3, seed: 3, spread: 0.4, leafRamp: "ashgrass" }),
    tussock({ blades: 18, length: 1, splay: 0.42, seed: 4 }),
    tussock({ blades: 14, length: 1.2, splay: 0.38, seed: 5, width: 0.04 }),
    emberFern({ fronds: 7, seed: 6, rise: 1.2, droop: 0.32 }),
    emberFern({ fronds: 9, seed: 7, rise: 1.36, droop: 0.4, tips: 0.26 }),
  ];
}
