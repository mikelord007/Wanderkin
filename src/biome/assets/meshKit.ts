/**
 * CPU mesh kit shared by every biome asset builder. Builders assemble parts
 * (each with a colour source and a sway source), and `finish()` produces a
 * {@link UnitMesh}: one unit tall, base on y = 0, indexed, with per-vertex
 * normals, linear vertex colours and wind weights.
 *
 * Colour and sway functions are evaluated AFTER fitting, in unit space
 * (y = 0 at the base, 1 at the top), so tone rules such as "lighter on top,
 * darker near the ground" read the same whatever size a builder worked in.
 * A part may instead carry its own `color` / `aSway` attributes ("attribute").
 *
 * Nothing here touches the GPU. The batcher copies UnitMeshes into merged
 * bucket geometries, so templates can be cached freely.
 */
import * as THREE from "three";
import type { UnitMesh } from "./types.js";

/** Per-vertex colour (linear): a constant, a function of the unit-space vertex, or the part's own attribute. */
export type ColorSource = THREE.Color | ((position: THREE.Vector3, normal: THREE.Vector3) => THREE.Color) | "attribute";
/** Per-vertex sway weight 0..1: a constant, a function of the unit-space vertex, or the part's own `aSway`. */
export type SwaySource = number | ((position: THREE.Vector3) => number) | "attribute";

export interface PartOptions {
  color: ColorSource;
  sway?: SwaySource;
  /** Keep shared vertex normals (foliage, trunks); otherwise every face gets its own. */
  smooth?: boolean;
  /** Also emit the back faces (thin blades, fronds, leaves). */
  doubleSided?: boolean;
}

export interface FinishOptions {
  /**
   * `height` (default): exactly one unit tall, as every hero asset must be.
   * `size`: the largest dimension (height or footprint diameter) is one
   * unit, for flat dressing such as fallen fronds, logs and pebbles.
   */
  fit?: "height" | "size";
  /** Rest the lowest point this far (in final unit heights) below y = 0. */
  sink?: number;
  /**
   * Baked ambient occlusion near the ground: vertices below `height` (unit)
   * are darkened by up to `strength` (0..1) at y = 0.
   */
  groundAo?: { height: number; strength: number };
}

interface RawPart {
  positions: number[];
  normals: number[];
  colors: number[] | null;
  sway: number[] | null;
  index: number[];
  options: PartOptions;
}

/** Builds one asset variant from deformed primitives. */
export class MeshKit {
  private readonly parts: RawPart[] = [];

  /** Adds a part; the kit takes ownership of `geometry` and disposes it. */
  add(geometry: THREE.BufferGeometry, options: PartOptions): this {
    let g = geometry;
    if (!options.smooth && g.index) {
      g = g.toNonIndexed();
      geometry.dispose();
    }
    if (!options.smooth || !g.getAttribute("normal")) g.computeVertexNormals();
    const position = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    const color = g.getAttribute("color");
    const sway = g.getAttribute("aSway");
    const raw: RawPart = {
      positions: Array.from(position.array as ArrayLike<number>).slice(0, position.count * 3),
      normals: [],
      colors: options.color === "attribute" ? [] : null,
      sway: options.sway === "attribute" ? [] : null,
      index: [],
      options,
    };
    const n = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      n.fromBufferAttribute(normal, i).normalize();
      raw.normals.push(n.x, n.y, n.z);
      if (raw.colors) {
        if (!color) throw new Error("MeshKit part asked for a colour attribute it does not have");
        raw.colors.push(color.getX(i), color.getY(i), color.getZ(i));
      }
      if (raw.sway) {
        if (!sway) throw new Error("MeshKit part asked for an aSway attribute it does not have");
        raw.sway.push(sway.getX(i));
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 1) raw.index.push(g.index.getX(i));
    else for (let i = 0; i < position.count; i += 1) raw.index.push(i);
    g.dispose();
    this.parts.push(raw);
    return this;
  }

  finish(options: FinishOptions = {}): UnitMesh {
    let minY = Infinity;
    let maxY = -Infinity;
    let rawRadius = 0;
    for (const part of this.parts) {
      for (let i = 0; i < part.positions.length; i += 3) {
        minY = Math.min(minY, part.positions[i + 1]!);
        maxY = Math.max(maxY, part.positions[i + 1]!);
        rawRadius = Math.max(rawRadius, Math.hypot(part.positions[i]!, part.positions[i + 2]!));
      }
    }
    const height = maxY - minY;
    if (!(height > 0) || !Number.isFinite(height)) throw new Error("Biome asset has no height");
    const scale = 1 / (options.fit === "size" ? Math.max(height, rawRadius * 2) : height);
    const sink = options.sink ?? 0;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const sway: number[] = [];
    const index: number[] = [];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const c = new THREE.Color();
    for (const part of this.parts) {
      const emit = (back: boolean) => {
        const base = positions.length / 3;
        const count = part.positions.length / 3;
        for (let i = 0; i < count; i += 1) {
          // Unit space before sinking: colour/sway rules see y from 0 at the base.
          p.set(part.positions[i * 3]! * scale, (part.positions[i * 3 + 1]! - minY) * scale, part.positions[i * 3 + 2]! * scale);
          n.set(part.normals[i * 3]!, part.normals[i * 3 + 1]!, part.normals[i * 3 + 2]!);
          if (back) n.negate();
          const { color } = part.options;
          if (part.colors) c.setRGB(part.colors[i * 3]!, part.colors[i * 3 + 1]!, part.colors[i * 3 + 2]!);
          else if (typeof color === "function") c.copy(color(p, n));
          else c.copy(color as THREE.Color);
          if (options.groundAo && p.y < options.groundAo.height) {
            const k = 1 - options.groundAo.strength * (1 - p.y / options.groundAo.height) ** 2;
            c.multiplyScalar(k);
          }
          const swaySource = part.options.sway ?? 0;
          const s = part.sway ? part.sway[i]! : typeof swaySource === "function" ? swaySource(p) : (swaySource as number);
          positions.push(p.x, p.y - sink, p.z);
          normals.push(n.x, n.y, n.z);
          colors.push(c.r, c.g, c.b);
          sway.push(Math.min(1, Math.max(0, s)));
        }
        for (let i = 0; i < part.index.length; i += 3) {
          const a = base + part.index[i]!;
          const b = base + part.index[i + 1]!;
          const d = base + part.index[i + 2]!;
          if (back) index.push(a, d, b);
          else index.push(a, b, d);
        }
      };
      emit(false);
      if (part.options.doubleSided) emit(true);
    }
    this.parts.length = 0;
    return measured(
      new Float32Array(positions),
      new Float32Array(normals),
      new Float32Array(colors),
      new Float32Array(sway),
      new Uint32Array(index),
    );
  }
}

/** Measures arrays that already follow the unit convention; nothing is moved. */
function measured(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  sway: Float32Array,
  index: Uint32Array,
): UnitMesh {
  let minY = Infinity;
  let maxY = -Infinity;
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    minY = Math.min(minY, positions[i + 1]!);
    maxY = Math.max(maxY, positions[i + 1]!);
    radius = Math.max(radius, Math.hypot(positions[i]!, positions[i + 2]!));
  }
  return { positions, normals, colors, sway, index, radius, minY, maxY, triangles: index.length / 3 };
}

/**
 * Wraps an existing merged geometry (position/normal/color[/aSway]) that is
 * already one unit tall on its base, without moving it.
 */
export function unitMeshFromGeometry(geometry: THREE.BufferGeometry): UnitMesh {
  const position = geometry.getAttribute("position");
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const swayAttribute = geometry.getAttribute("aSway");
  const count = position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sway = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
    normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], i * 3);
    if (color) colors.set([color.getX(i), color.getY(i), color.getZ(i)], i * 3);
    else colors.fill(1, i * 3, i * 3 + 3);
    sway[i] = swayAttribute ? swayAttribute.getX(i) : 0;
  }
  const index = geometry.index
    ? Uint32Array.from({ length: geometry.index.count }, (_, i) => geometry.index!.getX(i))
    : Uint32Array.from({ length: count }, (_, i) => i);
  return measured(positions, normals, colors, sway, index);
}

// ---------------------------------------------------------------------------
// Tone helpers (linear colours from sRGB ramps)

export interface ToneRule {
  /** 0 = pure normal-facing rule, 1 = pure height rule. */
  heightWeight?: number;
  /** Shift toward light (+) or dark (−), −1..1. */
  bias?: number;
}

/**
 * Structural tone: light on up-facing and high surfaces, base on the sides,
 * dark on down-facing and low surfaces. Returns a colour function for
 * {@link MeshKit.add}.
 */
export function rampTone(ramp: { dark: string; base: string; light: string }, rule: ToneRule = {}): (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color {
  const dark = new THREE.Color(ramp.dark);
  const base = new THREE.Color(ramp.base);
  const light = new THREE.Color(ramp.light);
  const heightWeight = rule.heightWeight ?? 0.35;
  const bias = rule.bias ?? 0;
  return (p, n) => {
    const facing = n.y * 0.5 + 0.5;
    const t = Math.min(1, Math.max(0, facing * (1 - heightWeight) + p.y * heightWeight + bias * 0.5));
    return rampAt({ dark, base, light }, t);
  };
}

/** Linear colour at t in [0, 1] along dark → base → light. */
export function rampAt(ramp: { dark: THREE.Color; base: THREE.Color; light: THREE.Color }, t: number): THREE.Color {
  const out = new THREE.Color();
  if (t < 0.5) return out.copy(ramp.dark).lerp(ramp.base, smooth(t / 0.5));
  return out.copy(ramp.base).lerp(ramp.light, smooth((t - 0.5) / 0.5));
}

export function linearRamp(ramp: { dark: string; base: string; light: string }) {
  return { dark: new THREE.Color(ramp.dark), base: new THREE.Color(ramp.base), light: new THREE.Color(ramp.light) };
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
