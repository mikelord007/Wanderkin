/**
 * Tree builders: palms (curved, tapered, ring-segmented trunks; crowns of
 * folded, serrated, drooping fronds), a generic broad-leaf tree (tapered
 * trunk, one or two branches, layered crown masses) with a default canopy
 * set, layered-tier conifers (snow-cap friendly: faceted, upward tiers), and
 * the dressing that falls from them (fallen fronds, driftwood).
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { blade, builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

export interface PalmOptions {
  /** Trunk height before the crown (native units; crown adds ~0.2). */
  trunk: number;
  /** Horizontal lean of the crown over the base (native units). */
  bend: number;
  /** Extra S-curve (0 none … 0.1 strong). */
  wiggle?: number;
  fronds: number;
  frondLength: number;
  /** Launch angle of the fronds above horizontal, radians. */
  frondRise: number;
  /** How strongly frond tips droop (0.6 … 1.4). */
  droop: number;
  seed: number;
  coconuts?: number;
  /** Visible ring segments on the trunk. */
  segments?: number;
}

function frond(length: number, rise: number, droop: number, ramp: ReturnType<typeof linearRamp>, shade: number, withSway: boolean) {
  return blade({
    length,
    segments: 10,
    width: (t) => length * 0.17 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)) ** 0.7,
    lift: (t) => length * (Math.sin(rise) * t - droop * 0.7 * t * t),
    fold: 0.45,
    serrate: 0.28,
    sweep: (t) => length * 0.04 * t * t,
    color: (t, side) => rampAt(ramp, Math.min(1, Math.max(0, 0.22 + t * 0.55 + (side === 0 ? -0.1 : 0.05) + shade))),
    sway: withSway ? (t) => 0.45 + 0.55 * t : undefined,
  });
}

export function palm(options: PalmOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const trunkRamp = linearRamp(tones.trunk);
    const leafRamp = linearRamp(tones.foliage);
    const altRamp = linearRamp(tones.foliageAlt);
    const H = options.trunk;
    const wiggle = options.wiggle ?? 0;
    const spine = (t: number) =>
      new THREE.Vector3(options.bend * t ** 1.7 + wiggle * Math.sin(t * Math.PI * 1.5), H * t, wiggle * 0.5 * Math.sin(t * Math.PI));
    const segments = options.segments ?? 7;
    const baseRadius = 0.062;
    kit.add(
      tube({
        spine,
        radius: (t) => {
          const taper = baseRadius * (1 - 0.42 * t) * (1 + 0.55 * (1 - Math.min(1, t / 0.1)) ** 2);
          const ring = 1 - Math.abs(((t * segments) % 1) * 2 - 1); // 0 at joints, 1 mid-segment
          return taper * (1 + 0.1 * (1 - ring) ** 3);
        },
        rings: segments * 2,
        sides: 7,
        cap: "open",
        color: (t) => {
          const ring = ((t * segments) % 1);
          // Darker band at each joint, lighter toward the crown.
          return rampAt(trunkRamp, Math.min(1, Math.max(0, 0.35 + t * 0.35 - (ring < 0.22 ? 0.25 : 0))));
        },
        sway: (t) => t * t * 0.35,
      }),
      { color: "attribute", sway: "attribute", smooth: true },
    );
    const top = spine(1);
    // Crown knob hides the trunk end and anchors the fronds.
    kit.add(lobe({ radius: [0.055, 0.045, 0.055], detail: 1, jitter: 0.1, seed: options.seed, center: [top.x, top.y, top.z] }), {
      color: new THREE.Color(tones.trunk.dark),
      sway: 0.35,
      smooth: true,
    });
    for (let i = 0; i < options.fronds; i += 1) {
      const yaw = (i / options.fronds) * Math.PI * 2 + (random() - 0.5) * 0.45;
      // Alternate an upper and a lower tier so the crown has depth.
      const upper = i % 2 === 0;
      const rise = options.frondRise * (upper ? 1.15 : 0.55) + (random() - 0.5) * 0.15;
      const length = options.frondLength * (upper ? 0.85 : 1) * (0.9 + random() * 0.2);
      const leaf = frond(length, rise, options.droop * (upper ? 0.85 : 1.1), upper ? leafRamp : altRamp, (random() - 0.5) * 0.15, true);
      leaf.rotateY(yaw);
      leaf.translate(top.x, top.y + 0.01, top.z);
      kit.add(leaf, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    const nuts = options.coconuts ?? 3;
    for (let i = 0; i < nuts; i += 1) {
      const a = (i / Math.max(1, nuts)) * Math.PI * 2 + random();
      kit.add(
        lobe({ radius: [0.03, 0.034, 0.03], detail: 0, jitter: 0.05, seed: i, center: [top.x + Math.cos(a) * 0.045, top.y - 0.035, top.z + Math.sin(a) * 0.045] }),
        { color: rampTone(tones.trunk, { bias: -0.4 }), sway: 0.35, smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.08, strength: 0.25 } });
  };
}

export interface BroadleafTreeOptions {
  trunk: number;
  lean: number;
  /** Crown masses (4–8). */
  masses: number;
  crownWidth: number;
  seed: number;
  branches?: number;
  /** Tone names for alternating crown masses (default foliage / foliageAlt). */
  crown?: readonly [string, string];
}

/** Generic stylised tree: tapered trunk, branch stubs, layered crown masses. */
export function broadleafTree(options: BroadleafTreeOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const trunkRamp = linearRamp(tones.trunk);
    const crownA = tones[options.crown?.[0] ?? "foliage"] ?? tones.foliage;
    const crownB = tones[options.crown?.[1] ?? "foliageAlt"] ?? tones.foliageAlt;
    const H = options.trunk;
    const spine = (t: number) => new THREE.Vector3(options.lean * t * t, H * t, 0);
    kit.add(
      tube({
        spine,
        radius: (t) => 0.07 * (1 - 0.55 * t) * (1 + 0.6 * (1 - Math.min(1, t / 0.12)) ** 2),
        rings: 6,
        sides: 7,
        cap: "point",
        color: (t) => rampAt(trunkRamp, 0.3 + t * 0.3),
        sway: (t) => t * t * 0.2,
      }),
      { color: "attribute", sway: "attribute", smooth: true },
    );
    const top = spine(1);
    const branchCount = options.branches ?? 2;
    const crownCentres: THREE.Vector3[] = [top.clone().add(new THREE.Vector3(0, 0.12, 0))];
    for (let b = 0; b < branchCount; b += 1) {
      const from = spine(0.55 + b * 0.15);
      const a = random() * Math.PI * 2;
      const to = from.clone().add(new THREE.Vector3(Math.cos(a) * options.crownWidth * 0.45, 0.22, Math.sin(a) * options.crownWidth * 0.45));
      kit.add(
        tube({ spine: (t) => from.clone().lerp(to, t).add(new THREE.Vector3(0, -0.05 * Math.sin(Math.PI * t), 0)), radius: (t) => 0.03 * (1 - 0.5 * t), rings: 3, sides: 5, cap: "point", color: () => rampAt(trunkRamp, 0.4), sway: () => 0.3 }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      crownCentres.push(to);
    }
    for (let m = 0; m < options.masses; m += 1) {
      const anchor = crownCentres[m % crownCentres.length]!;
      const a = random() * Math.PI * 2;
      const d = random() * options.crownWidth * 0.25;
      const r = options.crownWidth * (0.22 + random() * 0.12);
      kit.add(
        lobe({ radius: [r, r * 0.8, r], detail: 1, jitter: 0.14, seed: options.seed * 7 + m, center: [anchor.x + Math.cos(a) * d, anchor.y + (random() - 0.3) * 0.12, anchor.z + Math.sin(a) * d] }),
        { color: rampTone(m % 2 ? crownB : crownA, { heightWeight: 0.5, bias: (random() - 0.5) * 0.3 }), sway: (p) => 0.3 + p.y * 0.5, smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.1, strength: 0.25 } });
  };
}

/** A palm frond lying on the ground (micro dressing). */
export function fallenFrond(seed: number): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones.dry);
    const length = 1;
    const leaf = frond(length, 0.12, 0.2, ramp, (random() - 0.5) * 0.2, false);
    leaf.translate(-0.5, 0, 0);
    leaf.rotateY(random() * Math.PI);
    kit.add(leaf, { color: "attribute", smooth: true, doubleSided: true });
    return kit.finish({ fit: "size", sink: 0.01 });
  };
}

/** Bleached, gently bent log lying on its side (driftwood / dry branch). */
export function lyingLog(options: { seed: number; ramp?: string; fork?: boolean }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "trunk"] ?? tones.trunk);
    const bow = 0.08 + random() * 0.08;
    kit.add(
      tube({
        spine: (t) => new THREE.Vector3(-0.5 + t, 0.06 + 0.02 * Math.sin(t * Math.PI), bow * Math.sin(t * Math.PI)),
        radius: (t) => 0.06 * (1 - 0.45 * t) * (1 + 0.1 * Math.sin(t * 17)),
        rings: 6,
        sides: 5,
        cap: "dome",
        domeScale: 0.4,
        closeBase: true,
        color: (t, a) => rampAt(ramp, 0.35 + 0.35 * Math.max(0, Math.sin(a)) + t * 0.1),
      }),
      { color: "attribute" },
    );
    if (options.fork) {
      const at = new THREE.Vector3(0.05, 0.08, bow);
      kit.add(
        tube({
          spine: (t) => at.clone().add(new THREE.Vector3(0.3 * t, 0.12 * t, 0.22 * t)),
          radius: (t) => 0.03 * (1 - 0.6 * t),
          rings: 2,
          sides: 4,
          cap: "point",
          color: () => rampAt(ramp, 0.5),
        }),
        { color: "attribute" },
      );
    }
    return kit.finish({ fit: "size", sink: 0.03 });
  };
}

export interface ConiferOptions {
  /** Stacked foliage tiers, 3–6. */
  tiers: number;
  /** Bottom tier radius relative to the tree height (≈ 0.3 slim … 0.5 wide). */
  width: number;
  /** How far tier tips hang below their base, relative to tier height. */
  droop: number;
  /** Bare trunk showing under the lowest tier, fraction of the height. */
  trunk: number;
  seed: number;
  /** Serrations (branch tips) per tier ring (default 9). */
  points?: number;
}

/**
 * One conifer tier: a serrated, drooping skirt around an apex. Tips hang
 * below the tier base and notches sit higher, so each tier reads as a layer
 * of branches, not a smooth cone. Closed underneath so it never looks hollow.
 */
function coniferTier(radius: number, height: number, baseY: number, points: number, droop: number, seed: number): THREE.BufferGeometry {
  const random = builderRandom(seed);
  const positions: number[] = [0, baseY + height, 0];
  const index: number[] = [];
  const ring = points * 2;
  const turn = random() * Math.PI;
  for (let k = 0; k < ring; k += 1) {
    const tip = k % 2 === 0;
    const angle = turn + (k / ring) * Math.PI * 2 + (random() - 0.5) * 0.12;
    const r = radius * (tip ? 1 - random() * 0.08 : 0.7);
    const y = baseY + (tip ? -droop * height * (0.8 + random() * 0.4) : droop * height * 0.25);
    positions.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
  }
  const under = positions.length / 3;
  positions.push(0, baseY + height * 0.18, 0);
  for (let k = 0; k < ring; k += 1) {
    const a = 1 + k;
    const b = 1 + ((k + 1) % ring);
    index.push(0, b, a);
    index.push(under, a, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Stylised conifer: a short trunk under stacked, serrated, drooping tiers. */
export function conifer(options: ConiferOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const trunkRamp = linearRamp(tones.trunk);
    const H = 1;
    const trunkTop = options.trunk * H + 0.05;
    kit.add(
      tube({
        spine: (t) => new THREE.Vector3(0, trunkTop * t, 0),
        radius: (t) => 0.045 * (1 - 0.3 * t) * (1 + 0.5 * (1 - Math.min(1, t / 0.2)) ** 2),
        rings: 2,
        sides: 6,
        cap: "open",
        color: (t) => rampAt(trunkRamp, 0.3 + t * 0.2),
      }),
      { color: "attribute", smooth: true },
    );
    const tiers = Math.max(3, Math.min(6, Math.round(options.tiers)));
    const span = H - options.trunk * H;
    const tierHeight = (span / tiers) * 1.55; // tiers overlap
    for (let i = 0; i < tiers; i += 1) {
      const f = i / (tiers - 1);
      const radius = options.width * (1 - 0.72 * f) * (0.94 + random() * 0.12);
      const baseY = options.trunk * H + (span - tierHeight) * f;
      const ramp = i % 2 === 0 ? tones.foliage : tones.foliageAlt;
      kit.add(coniferTier(radius, tierHeight, baseY, options.points ?? 9, options.droop, options.seed * 31 + i), {
        color: rampTone(ramp, { heightWeight: 0.35, bias: (f - 0.5) * 0.3 }),
        sway: (p) => 0.2 + p.y * 0.6,
      });
    }
    return kit.finish({ groundAo: { height: 0.12, strength: 0.3 } });
  };
}

/** Default conifer spread: tall slim, classic, wide squat, young (≥ 4). */
export function defaultConiferVariants() {
  return [
    conifer({ tiers: 5, width: 0.34, droop: 0.28, trunk: 0.08, seed: 1 }),
    conifer({ tiers: 4, width: 0.44, droop: 0.32, trunk: 0.1, seed: 2 }),
    conifer({ tiers: 3, width: 0.52, droop: 0.36, trunk: 0.12, seed: 3, points: 10 }),
    conifer({ tiers: 4, width: 0.3, droop: 0.22, trunk: 0.14, seed: 4, points: 7 }),
    conifer({ tiers: 6, width: 0.4, droop: 0.26, trunk: 0.06, seed: 5 }),
  ];
}

/**
 * Default broadleaf canopy spread: round, tall oval, spreading, young (≥ 4).
 * `crowns` cycles crown tone pairs across the variants (e.g. autumn reds and
 * golds); omitted = foliage / foliageAlt everywhere.
 */
export function defaultBroadleafVariants(crowns: readonly (readonly [string, string])[] = []) {
  const shapes: Omit<BroadleafTreeOptions, "crown">[] = [
    { trunk: 0.5, lean: 0.03, masses: 7, crownWidth: 0.55, seed: 1 },
    { trunk: 0.62, lean: -0.02, masses: 6, crownWidth: 0.52, seed: 2, branches: 1 },
    { trunk: 0.46, lean: 0.04, masses: 8, crownWidth: 0.5, seed: 3, branches: 3 },
    { trunk: 0.4, lean: 0.02, masses: 4, crownWidth: 0.5, seed: 4, branches: 1 },
    { trunk: 0.55, lean: -0.04, masses: 6, crownWidth: 0.53, seed: 5 },
  ];
  return shapes.map((shape, i) => {
    const crown = crowns.length > 0 ? crowns[i % crowns.length] : undefined;
    return broadleafTree(crown ? { ...shape, crown } : shape);
  });
}
