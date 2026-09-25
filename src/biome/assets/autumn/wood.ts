/**
 * Autumn deadwood: mossy fallen logs, cut and broken stumps, and a tall
 * broken snag (the `wood` hero). Bark is lit along the top and dark below;
 * moss settles on up-facing bark; cut ends show pale heartwood with a darker
 * growth ring and a bark rim; shelf fungi step up the sides.
 *
 * Everything is structural tone (facing, height, radius across a cut face),
 * never per-vertex noise.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;

/**
 * A cut end: concentric rings (heartwood → growth ring → bark rim) as a flat
 * disc facing +Y at the origin, with its own vertex colours.
 */
export function cutFace(radius: number, sides: number, heart: Ramp, bark: THREE.Color): THREE.BufferGeometry {
  const rings = [0, 0.45, 0.62, 0.8, 1];
  const tones = [heart.light, heart.base, heart.dark, heart.base, bark];
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  rings.forEach((k, r) => {
    const count = r === 0 ? 1 : sides;
    for (let s = 0; s < count; s += 1) {
      const a = (s / sides) * Math.PI * 2;
      positions.push(Math.cos(a) * radius * k, 0, Math.sin(a) * radius * k);
      const c = tones[r]!;
      colors.push(c.r, c.g, c.b);
    }
  });
  for (let s = 0; s < sides; s += 1) index.push(0, 1 + ((s + 1) % sides), 1 + s);
  for (let r = 1; r < rings.length - 1; r += 1) {
    const a0 = 1 + (r - 1) * sides;
    const b0 = 1 + r * sides;
    for (let s = 0; s < sides; s += 1) {
      const s1 = (s + 1) % sides;
      index.push(a0 + s, a0 + s1, b0 + s1, a0 + s, b0 + s1, b0 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A shelf-fungus bracket: a flattened half-lobe sticking out along `out`. */
function bracket(at: THREE.Vector3, out: THREE.Vector3, size: number, seed: number): THREE.BufferGeometry {
  const g = lobe({ radius: [size, size * 0.3, size * 0.8], detail: 0, jitter: 0.12, seed, floor: -0.6 });
  const yaw = Math.atan2(out.z, out.x);
  g.translate(size * 0.45, 0, 0);
  g.rotateY(-yaw);
  g.translate(at.x, at.y, at.z);
  return g;
}

/** Colour for bark parts in unit space: lit on top, moss on up-facing bark. */
function barkColor(bark: Ramp, moss: Ramp | null, mossFrom: number) {
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    const facing = n.y * 0.5 + 0.5;
    const c = rampAt(bark, Math.min(1, 0.15 + facing * 0.6 + p.y * 0.1));
    if (moss && n.y > mossFrom) return c.lerp(rampAt(moss, 0.35 + (n.y - mossFrom) * 1.2), Math.min(1, (n.y - mossFrom) / 0.15) * 0.9);
    return c;
  };
}

export interface MossyLogOptions {
  seed: number;
  /** Radius relative to the length (default 0.13: reads as a log, not a stick, at gameplay distance). */
  radius?: number;
  /** Bark ramp (default "trunk"). */
  ramp?: string;
  /** Moss on bark facing up more than this (omit for none). */
  moss?: number;
  /** One end broken into splinters instead of cut. */
  broken?: boolean;
  /** Shelf fungi on the side. */
  fungi?: number;
  /** A short snapped branch stub. */
  stub?: boolean;
}

/** A fallen log lying along X, length 1 (size fit). */
export function mossyLog(options: MossyLogOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const bark = linearRamp(tones[options.ramp ?? "trunk"] ?? tones.trunk);
    const heart = linearRamp(tones.heartwood ?? tones.dry);
    const moss = options.moss === undefined ? null : linearRamp(tones.moss ?? tones.foliage);
    const fungus = linearRamp(tones.fungus ?? tones.dry);
    const R = options.radius ?? 0.13;
    const bow = (random() - 0.5) * 0.12;
    const spine = (t: number) => new THREE.Vector3(-0.5 + t, R * 0.85, bow * Math.sin(t * Math.PI));
    const splinter = (a: number) => (Math.sin(a * 3 + options.seed) > 0.2 ? 1 : 0.55);
    kit.add(
      tube({
        spine,
        radius: (t, a) => {
          const body = R * (1 - 0.18 * t) * (1 + 0.05 * Math.cos(a * 5 + t * 3));
          return options.broken && t > 0.94 ? body * (0.55 + 0.45 * splinter(a) * (1 - (t - 0.94) / 0.06)) : body;
        },
        rings: 6,
        sides: 7,
        cap: options.broken ? "point" : "open",
      }),
      { color: barkColor(bark, moss, options.moss ?? 1), smooth: true },
    );
    const darkBark = new THREE.Color(tones[options.ramp ?? "trunk"]?.dark ?? tones.trunk.dark);
    // Cut ends: the base end always, the tip too unless it is broken.
    const ends: [number, number][] = options.broken ? [[0, -1]] : [[0, -1], [1, 1]];
    for (const [t, sign] of ends) {
      const at = spine(t);
      const ahead = spine(Math.min(1, t + 0.01)).sub(spine(Math.max(0, t - 0.01))).normalize().multiplyScalar(sign);
      const face = cutFace(R * (1 - 0.18 * t) * 1.02, 7, heart, darkBark);
      face.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ahead));
      face.translate(at.x, at.y, at.z);
      kit.add(face, { color: "attribute", smooth: true });
    }
    if (options.stub) {
      const from = spine(0.62);
      const to = from.clone().add(new THREE.Vector3(0.06, R * 1.6, 0.05));
      kit.add(tube({ spine: (t) => from.clone().lerp(to, t), radius: (t) => R * 0.4 * (1 - 0.4 * t), rings: 2, sides: 5, cap: "open" }), { color: barkColor(bark, null, 1), smooth: true });
      const face = cutFace(R * 0.24, 5, heart, darkBark);
      face.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
      face.translate(to.x, to.y, to.z);
      kit.add(face, { color: "attribute", smooth: true });
    }
    for (let i = 0; i < (options.fungi ?? 0); i += 1) {
      const t = 0.3 + i * 0.12 + random() * 0.05;
      const side = i % 2 === 0 ? 1 : -1;
      const at = spine(t).add(new THREE.Vector3(0, R * 0.1 - i * 0.02, side * R * 0.9));
      kit.add(bracket(at, new THREE.Vector3(0, 0, side), R * (0.55 - i * 0.08), options.seed * 5 + i), {
        color: (_p, n) => rampAt(fungus, Math.min(1, 0.3 + (n.y * 0.5 + 0.5) * 0.6)),
        smooth: true,
      });
    }
    return kit.finish({ fit: "size", sink: 0.03, groundAo: { height: 0.3, strength: 0.3 } });
  };
}

export interface StumpOptions {
  seed: number;
  /** Stump height over its radius (≈ 1.5 low … 4 tall). */
  height: number;
  ramp?: string;
  moss?: number;
  /** Jagged broken top instead of a flat saw cut. */
  broken?: boolean;
  fungi?: number;
  roots?: number;
  /** Root reach in trunk radii (default 2.2; tall snags keep it short to fit narrow footprints). */
  rootReach?: number;
  /** Size fit for dressing (default) or height fit for heroes. */
  fit?: "height" | "size";
}

/** A stump (short) or a snag (tall, broken): flared, rooted, cut or splintered top. */
export function stump(options: StumpOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const bark = linearRamp(tones[options.ramp ?? "trunk"] ?? tones.trunk);
    const heart = linearRamp(tones.heartwood ?? tones.dry);
    const moss = options.moss === undefined ? null : linearRamp(tones.moss ?? tones.foliage);
    const fungus = linearRamp(tones.fungus ?? tones.dry);
    const darkBark = new THREE.Color(tones[options.ramp ?? "trunk"]?.dark ?? tones.trunk.dark);
    const R = 0.1;
    const H = R * options.height;
    const lean = (random() - 0.5) * H * 0.08;
    const spine = (t: number) => new THREE.Vector3(lean * t * t, H * t, 0);
    const spike = (a: number) => {
      // Two or three tall splinters around the break.
      const s = Math.sin(a * 2 + options.seed) + 0.6 * Math.sin(a * 5 + options.seed * 3);
      return Math.max(0, s);
    };
    const radius = (t: number, a: number) => R * (1 - 0.15 * t) * (1 + 0.7 * (1 - Math.min(1, t / 0.2)) ** 2) * (1 + 0.05 * Math.cos(a * 6));
    kit.add(
      tube({
        spine,
        radius: (t, a) => (options.broken && t === 1 ? radius(t, a) * 0.8 : radius(t, a)),
        rings: options.height > 3 ? 7 : 4,
        sides: 9,
        cap: "open",
      }),
      { color: barkColor(bark, moss, options.moss ?? 1), smooth: true },
    );
    const top = spine(1);
    if (options.broken) {
      // Splintered break: a ring of spikes rising from the rim to a sunken centre.
      const sides = 9;
      const positions: number[] = [top.x, top.y - R * 0.3, top.z];
      const colors: number[] = [];
      const pale = rampAt(heart, 0.4);
      colors.push(pale.r, pale.g, pale.b);
      for (let s = 0; s < sides; s += 1) {
        const a = (s / sides) * Math.PI * 2;
        const r = radius(1, a) * 0.8;
        positions.push(top.x + Math.cos(a) * r, top.y + spike(a) * R * 1.6, top.z + Math.sin(a) * r);
        const c = rampAt(heart, 0.55 + spike(a) * 0.25);
        colors.push(c.r, c.g, c.b);
      }
      const index: number[] = [];
      for (let s = 0; s < sides; s += 1) index.push(0, 1 + ((s + 1) % sides), 1 + s);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(index);
      g.computeVertexNormals();
      kit.add(g, { color: "attribute", doubleSided: true });
    } else {
      const face = cutFace(radius(1, 0) * 0.98, 9, heart, darkBark);
      face.translate(top.x, top.y + 0.001, top.z);
      kit.add(face, { color: "attribute", smooth: true });
    }
    // Surface roots.
    const roots = options.roots ?? 4;
    const turn = random() * Math.PI * 2;
    for (let i = 0; i < roots; i += 1) {
      const a = turn + (i / roots) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const from = new THREE.Vector3(Math.cos(a) * R * 0.9, R * 0.7, Math.sin(a) * R * 0.9);
      const reach = R * ((options.rootReach ?? 1.9) + random() * 0.4);
      const to = new THREE.Vector3(Math.cos(a) * reach, 0, Math.sin(a) * reach);
      kit.add(
        tube({ spine: (t) => from.clone().lerp(to, t).setY(from.y * (1 - t) ** 1.8), radius: (t) => R * 0.34 * (1 - 0.7 * t), rings: 2, sides: 5, cap: "point" }),
        { color: barkColor(bark, moss, (options.moss ?? 1) - 0.1), smooth: true },
      );
    }
    for (let i = 0; i < (options.fungi ?? 0); i += 1) {
      const a = random() * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const at = spine(0.3 + (i / Math.max(1, options.fungi! )) * 0.5).addScaledVector(out, R * 0.95);
      kit.add(bracket(at, out, R * (0.7 - i * 0.1), options.seed * 7 + i), {
        color: (_p, n) => rampAt(fungus, Math.min(1, 0.3 + (n.y * 0.5 + 0.5) * 0.6)),
        smooth: true,
      });
    }
    return kit.finish({ fit: options.fit ?? "size", sink: 0.02, groundAo: { height: 0.2, strength: 0.3 } });
  };
}
