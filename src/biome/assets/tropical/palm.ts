/**
 * Tropical palms: ring-segmented, tapered trunks that lean and curve, under
 * layered crowns of feather fronds. Each frond is a curved rachis carrying
 * pairs of separate, V-folded leaflets that sweep toward the tip and hang
 * more the further out they are, so the crown reads as a palm from shape
 * alone, not from a few serrated planes.
 *
 * Crowns are built in tiers: short young fronds pointing up (light,
 * yellow-green), the main arching ring, a lower ring that droops past
 * horizontal (darker), and optionally one dry frond hanging against the
 * trunk. Tone is structural: dark at the rachis and crown, light at the
 * exposed leaflet tips.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;

export interface FrondOptions {
  length: number;
  /** Launch angle above horizontal, radians (negative hangs down). */
  rise: number;
  /** How strongly the rachis bends back down toward the tip. */
  droop: number;
  /** Leaflet pairs along the rachis. */
  leaflets: number;
  /** Longest leaflet, as a fraction of the frond length. */
  leafletLength: number;
  /** Leaflet half-width, as a fraction of its own length. */
  leafletWidth?: number;
  /** How far leaflets hang below the rachis plane (0 flat … 1 steep V). */
  hang: number;
  /** Sideways curl of the rachis, fraction of the length. */
  curl?: number;
  ramp: Ramp;
  rachis: THREE.Color;
  /** Tone shift for the whole frond, −0.3 … 0.3. */
  shade?: number;
  /** Wind weight at the base and tip (default 0.3 → 0.95). */
  sway?: readonly [number, number];
}

export interface FrondParts {
  /** Narrow up-facing ribbon (single-sided). */
  rachis: THREE.BufferGeometry;
  /** Leaflet diamonds (emit double-sided). */
  leaves: THREE.BufferGeometry;
}

/** Adds a frond's parts to a kit after `transform` (rotate/translate in place). */
export function addFrond(kit: MeshKit, parts: FrondParts, transform: (g: THREE.BufferGeometry) => void): void {
  transform(parts.rachis);
  transform(parts.leaves);
  kit.add(parts.rachis, { color: "attribute", sway: "attribute", smooth: true });
  kit.add(parts.leaves, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
}

/**
 * One feather frond along +X from the origin, with `color` and `aSway`
 * attributes. Leaflets are separate diamonds (base, two folded edges, tip)
 * so the gaps between them read at gameplay distance.
 */
export function frondGeometry(options: FrondOptions): FrondParts {
  const L = options.length;
  const curl = options.curl ?? 0.05;
  const shade = options.shade ?? 0;
  const [swayBase, swayTip] = options.sway ?? [0.3, 0.95];
  const widthK = options.leafletWidth ?? 0.17;
  const rise = Math.sin(options.rise);
  const at = (t: number) => new THREE.Vector3(L * t * Math.cos(options.rise * 0.6), L * (rise * t - options.droop * 0.7 * t * t), L * curl * t * t);
  const rib = buffers();
  const leaf = buffers();
  const swayAt = (t: number) => swayBase + (swayTip - swayBase) * t;
  const tone = (v: number) => rampAt(options.ramp, Math.min(1, Math.max(0, v + shade)));
  const up = new THREE.Vector3(0, 1, 0);
  const frame = (t: number) => {
    const tangent = at(Math.min(1, t + 1e-3)).sub(at(Math.max(0, t - 1e-3))).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();
    return { tangent, side, normal };
  };

  // Leaflet stations, bare petiole first.
  const n = Math.max(2, Math.round(options.leaflets));
  const stations = [0, ...Array.from({ length: n }, (_, i) => 0.16 + (0.8 * (i + 0.5)) / n), 1];

  // Rachis: a narrow ribbon, lighter than the leaflets.
  let previous: [number, number] | null = null;
  for (const t of stations) {
    const p = at(t);
    const { side } = frame(t);
    const w = L * 0.02 * (1 - 0.75 * t);
    const c = options.rachis.clone().multiplyScalar(0.85 + 0.15 * t);
    const a = rib.push(p.clone().addScaledVector(side, -w), c, swayAt(t));
    const b = rib.push(p.clone().addScaledVector(side, w), c, swayAt(t));
    // Faces up.
    if (previous) rib.index.push(previous[0], previous[1], a, previous[1], b, a);
    previous = [a, b];
  }

  // Leaflets: longest mid-frond, sweeping toward the tip, hanging more outward.
  const u = new THREE.Vector3();
  for (let i = 1; i <= n; i += 1) {
    const t = stations[i]!;
    const base = at(t);
    const { tangent, side, normal } = frame(t);
    const profile = Math.sin(Math.PI * (0.15 + 0.8 * t)) ** 0.7;
    const length = L * options.leafletLength * profile;
    const width = length * widthK;
    const hang = options.hang * (0.45 + 0.8 * t);
    const midTone = 0.34 + 0.2 * (1 - Math.abs(2 * t - 1));
    for (const s of [-1, 1]) {
      const dir = new THREE.Vector3()
        .addScaledVector(side, s * 0.82)
        .addScaledVector(tangent, 0.5)
        .addScaledVector(normal, -hang)
        .normalize();
      // Width runs along the rachis, so leaflets lie in the frond's plane.
      const across = u.copy(tangent).addScaledVector(dir, -tangent.dot(dir)).normalize().clone();
      const keel = new THREE.Vector3().crossVectors(dir, across).normalize();
      if (keel.dot(normal) < 0) keel.negate();
      // Midline base → tip droops at the tip; the edges fold below it (V keel).
      const tipPoint = base.clone().addScaledVector(dir, length).addScaledVector(keel, -length * 0.14);
      const mid = base.clone().lerp(tipPoint, 0.42).addScaledVector(keel, -width * 0.45);
      const b = leaf.push(base, tone(midTone - 0.18), swayAt(t));
      const l = leaf.push(mid.clone().addScaledVector(across, width), tone(midTone + 0.05), swayAt(t) + 0.03);
      const r = leaf.push(mid.clone().addScaledVector(across, -width), tone(midTone), swayAt(t) + 0.03);
      const tip = leaf.push(tipPoint, tone(midTone + 0.34), swayAt(t) + 0.06);
      leaf.index.push(b, l, tip, b, tip, r);
    }
  }
  return { rachis: rib.geometry(), leaves: leaf.geometry() };
}

function buffers() {
  const positions: number[] = [];
  const colors: number[] = [];
  const sway: number[] = [];
  const index: number[] = [];
  return {
    index,
    push(v: THREE.Vector3, c: THREE.Color, s: number): number {
      positions.push(v.x, v.y, v.z);
      colors.push(c.r, c.g, c.b);
      sway.push(Math.min(1, Math.max(0, s)));
      return positions.length / 3 - 1;
    },
    geometry(): THREE.BufferGeometry {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
      g.setIndex(index);
      g.computeVertexNormals();
      return g;
    },
  };
}

// ---------------------------------------------------------------------------
// Trunk

export interface TrunkOptions {
  /** Trunk height, native units. */
  height: number;
  /** Horizontal offset of the top over the base (the lean), native units. */
  lean: number;
  /** Direction of the lean around Y, radians. */
  leanYaw?: number;
  /** How late the curve turns (1 straight lean … 2.5 banana curve). */
  bow?: number;
  /** S-curve amplitude (0 none … 0.06 strong). */
  wiggle?: number;
  segments: number;
  baseRadius: number;
  /** Top radius as a fraction of the base radius. */
  topRatio?: number;
  /** Local origin of the trunk base. */
  origin?: readonly [number, number, number];
}

/** The trunk's centre line (for placing the crown). */
export function trunkSpine(options: TrunkOptions): (t: number) => THREE.Vector3 {
  const bow = options.bow ?? 1.6;
  const wiggle = options.wiggle ?? 0;
  const yaw = options.leanYaw ?? 0;
  const [ox, oy, oz] = options.origin ?? [0, 0, 0];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (t) => {
    const lateral = options.lean * t ** bow + wiggle * Math.sin(t * Math.PI * 1.6);
    const twist = wiggle * 0.6 * Math.sin(t * Math.PI);
    return new THREE.Vector3(ox + lateral * c - twist * s, oy + options.height * t, oz + lateral * s + twist * c);
  };
}

/**
 * A ring-segmented trunk: each segment flares toward a lighter lip over a
 * darker joint, like stacked frond scars. Rings are packed toward each lip
 * so the step reads crisply with few triangles.
 */
export function addTrunk(kit: MeshKit, options: TrunkOptions, ramp: Ramp): THREE.Vector3 {
  const spine = trunkSpine(options);
  const segments = options.segments;
  const topRatio = options.topRatio ?? 0.62;
  // Two rings per segment: the joint (phase 0) and the lip (phase 1/2),
  // which sits at 86% of the segment so the step up to the next joint is short.
  const warp = (t: number) => {
    if (t >= 1) return 1;
    const k = Math.floor(t * segments + 1e-9);
    const ph = t * segments - k;
    const w = ph < 0.5 ? ph * 2 * 0.86 : 0.86 + (ph - 0.5) * 2 * 0.14;
    return (k + w) / segments;
  };
  const lip = (t: number) => {
    const x = t * segments;
    return Math.abs(x - Math.round(x)) > 0.25;
  };
  kit.add(
    tube({
      spine: (t) => spine(warp(t)),
      radius: (t) => {
        const y = warp(t);
        const taper = options.baseRadius * (1 - (1 - topRatio) * y) * (1 + 0.6 * (1 - Math.min(1, y / 0.12)) ** 2);
        return taper * (lip(t) && t < 1 ? 1.08 : 0.9);
      },
      rings: segments * 2,
      sides: 6,
      cap: "open",
      color: (t) => {
        const v = 0.28 + 0.34 * warp(t) + (lip(t) ? 0.2 : -0.12);
        return rampAt(ramp, Math.min(1, Math.max(0, v)));
      },
      sway: (t) => warp(t) ** 2 * 0.3,
    }),
    { color: "attribute", sway: "attribute", smooth: true },
  );
  return spine(1);
}

// ---------------------------------------------------------------------------
// Crown

export interface CrownOptions {
  /** Main arching fronds. */
  fronds: number;
  /** Short young fronds pointing up from the centre. */
  young?: number;
  /** Lower fronds drooping past horizontal. */
  lower?: number;
  /** Dry fronds hanging against the trunk. */
  dry?: number;
  length: number;
  leaflets: number;
  /** Main-ring launch angle, radians. */
  rise: number;
  droop: number;
  coconuts?: number;
  seed: number;
  /** Knob radius at the crown centre. */
  knob?: number;
}

export function addCrown(kit: MeshKit, top: THREE.Vector3, options: CrownOptions, tones: BiomeTones): void {
  const random = builderRandom(options.seed);
  const leaf = linearRamp(tones.foliage);
  const fresh = linearRamp(tones.foliageAlt);
  const deep = linearRamp(tones.foliageDeep ?? tones.foliage);
  const dry = linearRamp(tones.dry);
  const rachis = new THREE.Color(tones.foliageAlt.light).lerp(new THREE.Color(tones.dry.light), 0.35);
  const dryRachis = new THREE.Color(tones.dry.base);
  const add = (yaw: number, frond: FrondOptions, drop = 0) =>
    addFrond(kit, frondGeometry(frond), (g) => g.rotateY(yaw).translate(top.x, top.y + drop, top.z));
  const start = random() * Math.PI * 2;
  const main = options.fronds;
  for (let i = 0; i < main; i += 1) {
    const yaw = start + (i / main) * Math.PI * 2 + (random() - 0.5) * 0.35;
    add(yaw, {
      length: options.length * (0.9 + random() * 0.2),
      rise: options.rise + (random() - 0.5) * 0.2,
      droop: options.droop * (0.9 + random() * 0.25),
      leaflets: options.leaflets,
      leafletLength: 0.36,
      leafletWidth: 0.2,
      hang: 0.32,
      curl: (random() - 0.5) * 0.12,
      ramp: i % 3 === 1 ? fresh : leaf,
      rachis,
      shade: (random() - 0.5) * 0.14,
    });
  }
  const lower = options.lower ?? 0;
  for (let i = 0; i < lower; i += 1) {
    const yaw = start + ((i + 0.5) / lower) * Math.PI * 2 + (random() - 0.5) * 0.5;
    add(yaw, {
      length: options.length * (0.85 + random() * 0.15),
      rise: options.rise * 0.35,
      droop: options.droop * 0.95,
      leaflets: options.leaflets,
      leafletLength: 0.34,
      leafletWidth: 0.2,
      hang: 0.45,
      curl: (random() - 0.5) * 0.1,
      ramp: deep,
      rachis: rachis.clone().multiplyScalar(0.8),
      shade: -0.08 + (random() - 0.5) * 0.1,
    }, -0.006);
  }
  const young = options.young ?? 0;
  for (let i = 0; i < young; i += 1) {
    const yaw = start + ((i + 0.3) / young) * Math.PI * 2 + (random() - 0.5) * 0.5;
    add(yaw, {
      length: options.length * (0.5 + random() * 0.12),
      rise: 1.15 + random() * 0.2,
      droop: 0.55,
      leaflets: Math.max(3, options.leaflets - 3),
      leafletLength: 0.3,
      hang: 0.35,
      ramp: fresh,
      rachis,
      shade: 0.12,
    }, 0.004);
  }
  const dryCount = options.dry ?? 0;
  for (let i = 0; i < dryCount; i += 1) {
    const yaw = start + random() * Math.PI * 2;
    add(yaw, {
      length: options.length * 0.8,
      rise: -1.05 - random() * 0.2,
      droop: 0.25,
      leaflets: Math.max(3, options.leaflets - 2),
      leafletLength: 0.28,
      leafletWidth: 0.13,
      hang: 0.85,
      ramp: dry,
      rachis: dryRachis,
      shade: (random() - 0.5) * 0.1,
      sway: [0.25, 0.5],
    }, -0.01);
  }
  const knob = options.knob ?? 0.04;
  kit.add(lobe({ radius: [knob, knob * 0.8, knob], detail: 0, jitter: 0.12, seed: options.seed, center: [top.x, top.y - knob * 0.2, top.z] }), {
    color: new THREE.Color(tones.trunk.dark),
    sway: 0.3,
    smooth: true,
  });
  const nuts = options.coconuts ?? 0;
  for (let i = 0; i < nuts; i += 1) {
    const a = (i / Math.max(1, nuts)) * Math.PI * 2 + random() * 0.8;
    const r = knob * 0.62;
    kit.add(
      lobe({ radius: [r, r * 1.1, r], detail: 0, jitter: 0.06, seed: options.seed + i, center: [top.x + Math.cos(a) * knob * 0.95, top.y - knob * 0.85, top.z + Math.sin(a) * knob * 0.95] }),
      { color: rampTone(tones.nut ?? tones.trunk, { bias: -0.1 }), sway: 0.3, smooth: true },
    );
  }
}

// ---------------------------------------------------------------------------
// Variants

export interface TropicalPalmOptions {
  trunk: Omit<TrunkOptions, "origin">;
  crown: CrownOptions;
  /** A second, shorter trunk from the same base (twin palm). */
  twin?: { trunk: Omit<TrunkOptions, "origin">; crown: CrownOptions; offset: readonly [number, number] };
}

export function tropicalPalm(options: TropicalPalmOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const bark = linearRamp(tones.trunk);
    // Set the base back against the lean so the crown, not the base, sits
    // over the axis: a leaning palm then fits its footprint at full size.
    const back = (trunk: Omit<TrunkOptions, "origin">, x = 0, z = 0): TrunkOptions => {
      const shift = trunk.lean * 0.6;
      const yaw = trunk.leanYaw ?? 0;
      return { ...trunk, origin: [x - Math.cos(yaw) * shift, 0, z - Math.sin(yaw) * shift] };
    };
    const top = addTrunk(kit, options.twin ? { ...options.trunk, origin: [0, 0, 0] } : back(options.trunk), bark);
    addCrown(kit, top, options.crown, tones);
    if (options.twin) {
      const [x, z] = options.twin.offset;
      const second = addTrunk(kit, { ...options.twin.trunk, origin: [x, 0, z] }, bark);
      addCrown(kit, second, options.twin.crown, tones);
    }
    return kit.finish({ groundAo: { height: 0.07, strength: 0.3 } });
  };
}

/**
 * A stemless palm sprout / cycad: feather fronds rising from a knob at the
 * ground. Tropical ground foliage and bush-patch dressing.
 */
export function palmSprout(options: { fronds: number; length: number; rise: number; droop: number; leaflets: number; seed: number; fit?: "height" | "size" }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const leaf = linearRamp(tones.foliage);
    const fresh = linearRamp(tones.foliageAlt);
    const deep = linearRamp(tones.foliageDeep ?? tones.foliage);
    const rachis = new THREE.Color(tones.foliageAlt.base);
    const start = random() * Math.PI * 2;
    for (let i = 0; i < options.fronds; i += 1) {
      const inner = i % 3 === 2;
      const parts = frondGeometry({
        length: options.length * (inner ? 0.7 : 0.9 + random() * 0.2),
        rise: options.rise * (inner ? 1.25 : 0.85 + random() * 0.3),
        droop: options.droop * (0.85 + random() * 0.3),
        leaflets: options.leaflets,
        leafletLength: 0.3,
        hang: 0.45,
        curl: (random() - 0.5) * 0.15,
        ramp: inner ? fresh : i % 3 === 0 ? leaf : deep,
        rachis,
        shade: (random() - 0.5) * 0.12,
        sway: [0.15, 0.9],
      });
      const yaw = start + (i / options.fronds) * Math.PI * 2 + (random() - 0.5) * 0.4;
      addFrond(kit, parts, (g) => g.rotateY(yaw).translate(0, 0.015, 0));
    }
    kit.add(lobe({ radius: [0.035, 0.03, 0.035], detail: 0, jitter: 0.1, seed: options.seed, center: [0, 0.012, 0] }), {
      color: new THREE.Color(tones.trunk.dark),
      smooth: true,
    });
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.2, strength: 0.3 } });
  };
}

/** A palm frond lying on the sand: dry, with a few leaflets still green at the base. */
export function fallenPalmFrond(seed: number, green = false): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(seed);
    const kit = new MeshKit();
    const parts = frondGeometry({
      length: 1,
      rise: 0.08,
      droop: 0.12,
      leaflets: 7,
      leafletLength: 0.3,
      leafletWidth: 0.15,
      hang: 0.25,
      curl: (random() - 0.5) * 0.3,
      ramp: linearRamp(green ? tones.foliageAlt : tones.dry),
      rachis: new THREE.Color(tones.dry.light),
      shade: green ? -0.1 : (random() - 0.5) * 0.15,
      sway: [0, 0.05],
    });
    addFrond(kit, parts, (g) => g.translate(-0.5, 0.01, 0));
    return kit.finish({ fit: "size", sink: 0.01 });
  };
}
