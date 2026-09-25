/**
 * Tropical bushes and ground foliage. Instead of one polyhedral blob, a bush
 * is a dark interior of a few overlapping masses wrapped in a fringe of
 * folded leaves that point outward and up: the leaf tips notch the outline
 * and catch the light, the masses give it body and shade.
 *
 * Tones stay structural: interior masses use the deep ramp, outer leaves
 * run from a darker base to a light tip, upward-facing leaves are lighter,
 * and new growth on top uses the yellow-green ramp.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { blade, builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;
const UP = new THREE.Vector3(0, 1, 0);

export interface LeafOptions {
  length: number;
  /** Half-width as a fraction of the length. */
  width: number;
  /** Tip drop as a fraction of the length. */
  droop: number;
  ramp: Ramp;
  /** Tone offset for the whole leaf. */
  shade: number;
  sway: readonly [number, number];
}

/**
 * A rounded, folded leaf along +X lying in the XZ plane (face up): base,
 * two edge pairs, a raised midrib and the tip (6 triangles). Emit
 * double-sided.
 */
export function leafGeometry(options: LeafOptions): THREE.BufferGeometry {
  const L = options.length;
  const w = L * options.width;
  const fold = w * 0.3;
  const positions = [
    0, 0, 0, // 0 base
    L * 0.3, -fold, -w * 0.92, // 1 edge
    L * 0.3, -fold, w * 0.92, // 2 edge
    L * 0.66, -fold - L * options.droop * 0.4, -w * 0.8, // 3 edge
    L * 0.66, -fold - L * options.droop * 0.4, w * 0.8, // 4 edge
    L * 0.5, L * 0.03 - L * options.droop * 0.25, 0, // 5 midrib (raised: the fold)
    L, -L * options.droop, 0, // 6 tip
  ];
  const tone = (v: number) => rampAt(options.ramp, Math.min(1, Math.max(0, v + options.shade)));
  const colors = [tone(0.12), tone(0.4), tone(0.42), tone(0.6), tone(0.62), tone(0.62), tone(0.85)].flatMap((c) => [c.r, c.g, c.b]);
  const [s0, s1] = options.sway;
  const m = (s0 + s1) / 2;
  const sway = [s0, m, m, m, m, m, s1];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex([0, 5, 1, 0, 2, 5, 1, 5, 3, 5, 2, 4, 3, 5, 6, 5, 4, 6]);
  g.computeVertexNormals();
  return g;
}

/** Turns a +X-pointing part to point along `dir`, rolled about it by `roll`, then moves it to `at`. */
export function orient(g: THREE.BufferGeometry, dir: THREE.Vector3, at: THREE.Vector3, roll = 0): THREE.BufferGeometry {
  const x = dir.clone().normalize();
  const reference = Math.abs(x.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP;
  const z = new THREE.Vector3().crossVectors(x, reference).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  g.rotateX(roll);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  g.translate(at.x, at.y, at.z);
  return g;
}

/** Points a +X part along `dir` with its face (+Y) turned toward `face`, then moves it to `at`. */
export function orientFacing(g: THREE.BufferGeometry, dir: THREE.Vector3, face: THREE.Vector3, at: THREE.Vector3): THREE.BufferGeometry {
  const x = dir.clone().normalize();
  const y = face.clone().addScaledVector(x, -face.dot(x));
  if (y.lengthSq() < 1e-8) return orient(g, dir, at);
  y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  g.translate(at.x, at.y, at.z);
  return g;
}

/** A five-petal flower facing `dir` (flat star, 10 triangles). */
export function blossomGeometry(radius: number, petal: THREE.Color, heart: THREE.Color, seed: number): THREE.BufferGeometry {
  const random = builderRandom(seed);
  const positions = [0, 0.15 * radius, 0];
  const colors = [heart.r, heart.g, heart.b];
  const start = random() * Math.PI * 2;
  for (let i = 0; i < 10; i += 1) {
    const a = start + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * 0.42;
    positions.push(Math.cos(a) * r, i % 2 === 0 ? 0.08 * radius : 0, Math.sin(a) * r);
    const c = i % 2 === 0 ? petal : petal.clone().lerp(heart, 0.35);
    colors.push(c.r, c.g, c.b);
  }
  const index: number[] = [];
  for (let i = 0; i < 10; i += 1) index.push(0, 1 + ((i + 1) % 10), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Leafy bush

export interface Mass {
  /** Centre x, y, z and radius (native units). */
  c: readonly [number, number, number];
  r: number;
  /** Vertical squash (default 0.85). */
  squash?: number;
  /** Tone ramp name for this mass. */
  ramp?: string;
  bias?: number;
}

export interface LeafyBushOptions {
  masses: readonly Mass[];
  /** Leaves in the outer fringe. */
  leaves: number;
  /** Leaf length as a fraction of the mass radius it grows from. */
  leafSize: number;
  /** Leaf half-width as a fraction of its length (default 0.4). */
  leafWidth?: number;
  /** Leaves point this much more upward than their surface normal. */
  lift?: number;
  droop?: number;
  seed: number;
  /** Accent blossoms on the outer surface. */
  flowers?: number;
  /** Fit to height (hero) or largest dimension (dressing). */
  fit?: "height" | "size";
}

export function leafyBush(options: LeafyBushOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramps: Record<string, Ramp> = {
      foliage: linearRamp(tones.foliage),
      foliageAlt: linearRamp(tones.foliageAlt),
      foliageDeep: linearRamp(tones.foliageDeep ?? tones.foliage),
    };
    const masses = options.masses;
    let top = 0;
    const centre = new THREE.Vector3();
    let weight = 0;
    for (const m of masses) {
      top = Math.max(top, m.c[1] + m.r * (m.squash ?? 0.85));
      centre.addScaledVector(new THREE.Vector3(...m.c), m.r);
      weight += m.r;
    }
    centre.multiplyScalar(1 / weight);
    masses.forEach((m, i) => {
      const ry = m.r * (m.squash ?? 0.85);
      kit.add(
        lobe({ radius: [m.r, ry, m.r * (0.9 + random() * 0.2)], detail: 1, jitter: 0.12, seed: options.seed * 17 + i, floor: Math.max(-1, -m.c[1] / ry), center: m.c }),
        { color: rampTone(tones[m.ramp ?? "foliageDeep"] ?? tones.foliage, { heightWeight: 0.5, bias: m.bias ?? -0.15 }), sway: (p) => p.y * 0.5, smooth: true },
      );
    });
    // Outer fringe: leaves on the outward-facing upper surface of each mass.
    const totalR = masses.reduce((s, m) => s + m.r * m.r, 0);
    const dir = new THREE.Vector3();
    let placed = 0;
    for (let attempt = 0; placed < options.leaves && attempt < options.leaves * 6; attempt += 1) {
      let roll = random() * totalR;
      let m = masses[0]!;
      for (const candidate of masses) {
        roll -= candidate.r * candidate.r;
        if (roll <= 0) {
          m = candidate;
          break;
        }
      }
      const a = random() * Math.PI * 2;
      const y = -0.2 + random() * 1.1;
      dir.set(Math.cos(a) * Math.sqrt(Math.max(0, 1 - y * y)), Math.min(1, y), Math.sin(a) * Math.sqrt(Math.max(0, 1 - y * y)));
      const squash = m.squash ?? 0.85;
      const at = new THREE.Vector3(...m.c).addScaledVector(new THREE.Vector3(dir.x, dir.y * squash, dir.z), m.r * 0.86);
      if (at.y < 0.03) continue;
      // Only leaves on the outside of the whole bush: interior ones are wasted.
      const outward = at.clone().sub(centre).setY(0);
      const flat = new THREE.Vector3(dir.x, 0, dir.z);
      if (outward.lengthSq() > 1e-6 && flat.lengthSq() > 1e-6 && outward.normalize().dot(flat.normalize()) < -0.1 && dir.y < 0.6) continue;
      // Shingled: the leaf faces out along the surface normal and points up
      // the surface, tilted outward so its tip lifts off and notches the outline.
      const normal = new THREE.Vector3(dir.x, dir.y / squash, dir.z).normalize();
      let upSlope = UP.clone().addScaledVector(normal, -normal.y);
      if (upSlope.lengthSq() < 0.04) upSlope = (flat.lengthSq() > 1e-6 ? flat : new THREE.Vector3(Math.cos(a), 0, Math.sin(a))).normalize();
      upSlope.normalize();
      const high = at.y / Math.max(1e-6, top);
      // Lower leaves spill outward; each leaf also turns about the normal so
      // the fringe does not comb in one direction.
      const tilt = Math.min(1.45, (options.lift ?? 0.75) + (1 - high) * 0.5 + (random() - 0.5) * 0.5);
      const pointing = upSlope.multiplyScalar(Math.cos(tilt)).addScaledVector(normal, Math.sin(tilt)).normalize();
      pointing.applyAxisAngle(normal, (random() - 0.5) * 1.4);
      const rampName = high > 0.75 && random() < 0.6 ? "foliageAlt" : random() < 0.5 ? "foliage" : "foliageAlt";
      const leaf = leafGeometry({
        length: m.r * options.leafSize * (0.8 + random() * 0.4),
        width: (options.leafWidth ?? 0.4) * (0.9 + random() * 0.2),
        droop: (options.droop ?? 0.3) * (0.7 + random() * 0.6),
        ramp: ramps[rampName]!,
        shade: -0.12 + high * 0.28 + (random() - 0.5) * 0.12,
        sway: [0.3 + high * 0.4, 0.55 + high * 0.45],
      });
      leaf.rotateX((random() - 0.5) * 0.5);
      kit.add(orientFacing(leaf, pointing, normal, at), { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
      placed += 1;
    }
    const flowers = options.flowers ?? 0;
    const petal = new THREE.Color(tones.accent.light).lerp(new THREE.Color(tones.accent.base), 0.35);
    const heart = new THREE.Color(tones.accent.dark);
    for (let i = 0; i < flowers; i += 1) {
      const m = masses[i % masses.length]!;
      const a = random() * Math.PI * 2;
      const y = 0.25 + random() * 0.5;
      dir.set(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y));
      const at = new THREE.Vector3(...m.c).addScaledVector(new THREE.Vector3(dir.x, dir.y * (m.squash ?? 0.85), dir.z), m.r * 0.95);
      const g = blossomGeometry(m.r * 0.34, petal, heart, options.seed * 31 + i);
      // Face the blossom outward: its local +Y along the surface direction.
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())));
      g.translate(at.x, at.y, at.z);
      kit.add(g, { color: "attribute", sway: 0.5, smooth: true, doubleSided: true });
    }
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.3, strength: 0.32 } });
  };
}

// ---------------------------------------------------------------------------
// Broad-leaf clump (elephant ear / young banana)

export interface BroadleafClumpOptions {
  leaves: number;
  /** Leaf blade length (native units, plant height ≈ 1). */
  leafLength: number;
  /** Blade half-width as a fraction of its length. */
  leafWidth: number;
  seed: number;
  /** Split (serrated) blades, like a young banana / monstera. */
  split?: number;
  ramp?: string;
  fit?: "height" | "size";
}

export function broadleafClump(options: BroadleafClumpOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const main = linearRamp(tones[options.ramp ?? "foliage"] ?? tones.foliage);
    const alt = linearRamp(tones.foliageAlt);
    const stem = linearRamp(tones.foliageDeep ?? tones.foliage);
    const start = random() * Math.PI * 2;
    for (let i = 0; i < options.leaves; i += 1) {
      const inner = i >= options.leaves - 2;
      const yaw = start + (i / options.leaves) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const reach = inner ? 0.08 + random() * 0.06 : 0.18 + random() * 0.12;
      const rise = inner ? 0.72 + random() * 0.12 : 0.42 + random() * 0.2;
      const cx = Math.cos(yaw);
      const cz = Math.sin(yaw);
      const end = new THREE.Vector3(cx * reach, rise, cz * reach);
      kit.add(
        tube({
          spine: (t) => new THREE.Vector3(end.x * t * t, end.y * t, end.z * t * t),
          radius: (t) => 0.024 * (1 - 0.45 * t),
          rings: 3,
          sides: 4,
          cap: "open",
          color: (t) => rampAt(stem, 0.3 + t * 0.4),
          sway: (t) => t * 0.5,
        }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      const length = options.leafLength * (inner ? 0.75 : 0.85 + random() * 0.3);
      const ramp = inner || random() < 0.3 ? alt : main;
      const shade = (random() - 0.5) * 0.14 + (inner ? 0.08 : 0);
      const lean = inner ? 0.9 : 0.25 + random() * 0.25;
      const leaf = blade({
        length,
        segments: 5,
        // Heart-ish: broad near the base, pointed tip.
        width: (t) => length * options.leafWidth * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.85)) ** 0.6,
        lift: (t) => length * (Math.sin(lean) * t - 0.55 * t * t),
        fold: 0.28,
        ...(options.split === undefined ? {} : { serrate: options.split }),
        color: (t, side) => rampAt(ramp, Math.min(1, Math.max(0, 0.3 + t * 0.35 + (side === 0 ? 0.12 : 0) + shade))),
        sway: (t) => 0.5 + t * 0.5,
      });
      // Hang the blade from the stem tip, pointing outward.
      leaf.translate(-length * 0.06, 0, 0);
      leaf.rotateY(-yaw);
      leaf.translate(end.x, end.y, end.z);
      kit.add(leaf, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ fit: options.fit ?? "height", groundAo: { height: 0.2, strength: 0.3 } });
  };
}

// ---------------------------------------------------------------------------
// Ground cover

/** Tropical grass: a few broad, arching blades (cheap: 5 triangles a side each). */
export function tropicalGrass(options: { blades: number; splay: number; seed: number; ramp?: string; width?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "foliage"] ?? tones.foliage);
    const positions: number[] = [];
    const colors: number[] = [];
    const sway: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < options.blades; i += 1) {
      const yaw = (i / options.blades) * Math.PI * 2 + random() * 0.9;
      const height = 0.6 + random() * 0.4;
      const lean = options.splay * (0.5 + random() * 0.6);
      const w = (options.width ?? 0.07) * (0.8 + random() * 0.4);
      const shade = (random() - 0.5) * 0.25;
      const base = positions.length / 3;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // Rows at t = 0, 0.45, 0.8 (two vertices each), then the tip.
      const rows = [0, 0.45, 0.8, 1];
      rows.forEach((t, r) => {
        const out = Math.sin(lean) * height * t * (0.6 + 0.8 * t);
        const y = height * t * (1 - 0.35 * t * lean);
        const half = r === rows.length - 1 ? 0 : w * (1 - t * 0.7);
        const col = rampAt(ramp, Math.min(1, Math.max(0, 0.18 + t * 0.7 + shade)));
        for (const side of r === rows.length - 1 ? [0] : [-1, 1]) {
          positions.push(c * out - s * half * side, y, s * out + c * half * side);
          colors.push(col.r, col.g, col.b);
          sway.push(t);
        }
      });
      index.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 5, base + 2, base + 5, base + 4, base + 4, base + 5, base + 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
    g.setIndex(index);
    g.computeVertexNormals();
    kit.add(g, { color: "attribute", sway: "attribute", smooth: true, doubleSided: true });
    return kit.finish();
  };
}

/** A few thin stems each ending in a five-petal blossom (use sparingly). */
export function tropicalFlowers(options: { stems: number; seed: number; petalRamp?: string }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = tones[options.petalRamp ?? "accent"] ?? tones.accent;
    const petal = new THREE.Color(ramp.light).lerp(new THREE.Color(ramp.base), 0.3);
    const heart = new THREE.Color(ramp.dark);
    const leaf = linearRamp(tones.foliage);
    for (let i = 0; i < options.stems; i += 1) {
      const a = random() * Math.PI * 2;
      const lean = 0.08 + random() * 0.22;
      const h = 0.62 + random() * 0.38;
      const top = new THREE.Vector3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h);
      kit.add(
        tube({ spine: (t) => new THREE.Vector3(top.x * t * t, top.y * t, top.z * t * t), radius: () => 0.02, rings: 2, sides: 3, cap: "open" }),
        { color: new THREE.Color(tones.foliage.dark), sway: (p) => p.y, smooth: true },
      );
      const g = blossomGeometry(0.16 + random() * 0.05, petal, heart, options.seed * 13 + i);
      g.rotateX((random() - 0.5) * 0.5);
      g.translate(top.x, top.y, top.z);
      kit.add(g, { color: "attribute", sway: 1, smooth: true, doubleSided: true });
      // One small leaf low on each stem.
      const l = leafGeometry({ length: 0.28, width: 0.32, droop: 0.15, ramp: leaf, shade: 0, sway: [0.2, 0.5] });
      kit.add(orient(l, new THREE.Vector3(Math.cos(a + 2), 0.5, Math.sin(a + 2)), new THREE.Vector3(top.x * 0.1, h * 0.3, top.z * 0.1)), {
        color: "attribute",
        sway: "attribute",
        smooth: true,
        doubleSided: true,
      });
    }
    return kit.finish();
  };
}
