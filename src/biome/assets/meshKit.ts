/**
 * CPU mesh kit shared by every biome asset builder. Builders assemble parts
 * (each with a colour source and a sway source), and `finish()` produces a
 * {@link UnitMesh}: one unit tall, base on y = 0, indexed, with per-vertex
 * normals, linear vertex colours and wind weights.
 *
 * Nothing here touches the GPU. The batcher copies UnitMeshes into merged
 * bucket geometries, so templates can be cached freely.
 */
import * as THREE from "three";
import type { UnitMesh } from "./types.js";

/** Per-vertex colour: a constant, or a function of the vertex. */
export type ColorSource = THREE.Color | ((position: THREE.Vector3, normal: THREE.Vector3) => THREE.Color);
/** Per-vertex sway weight 0..1: a constant, or a function of the vertex (unit space, before fitting). */
export type SwaySource = number | ((position: THREE.Vector3) => number);

export interface FinishOptions {
  /** Rest the lowest point this far (in final unit heights) below y = 0. */
  sink?: number;
  /** Keep the parts' native height instead of fitting to one unit. */
  keepScale?: boolean;
}

interface Part {
  geometry: THREE.BufferGeometry;
  color: ColorSource;
  sway: SwaySource;
  /** Use the part's own normals (smooth); otherwise recompute per face. */
  smooth: boolean;
}

/** Builds one asset variant from deformed primitives. */
export class MeshKit {
  private readonly parts: Part[] = [];

  /**
   * Adds a part. The kit takes ownership of `geometry`. `smooth` keeps the
   * part's vertex normals shared across faces (foliage, trunks); otherwise
   * every face gets its own normal (faceted rock).
   */
  add(geometry: THREE.BufferGeometry, color: ColorSource, sway: SwaySource = 0, smooth = false): this {
    this.parts.push({ geometry, color, sway, smooth });
    return this;
  }

  finish(options: FinishOptions = {}): UnitMesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const sway: number[] = [];
    const index: number[] = [];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const part of this.parts) {
      let geometry = part.geometry;
      if (!part.smooth && geometry.index) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        geometry = flat;
      }
      if (!part.smooth || !geometry.getAttribute("normal")) geometry.computeVertexNormals();
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const base = positions.length / 3;
      for (let i = 0; i < position.count; i += 1) {
        p.fromBufferAttribute(position, i);
        n.fromBufferAttribute(normal, i).normalize();
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        const c = typeof part.color === "function" ? part.color(p, n) : part.color;
        colors.push(c.r, c.g, c.b);
        const s = typeof part.sway === "number" ? part.sway : part.sway(p);
        sway.push(Math.min(1, Math.max(0, s)));
      }
      if (geometry.index) {
        for (let i = 0; i < geometry.index.count; i += 1) index.push(base + geometry.index.getX(i));
      } else {
        for (let i = 0; i < position.count; i += 1) index.push(base + i);
      }
      geometry.dispose();
    }
    this.parts.length = 0;
    return unitMeshFromArrays(
      new Float32Array(positions),
      new Float32Array(normals),
      new Float32Array(colors),
      new Float32Array(sway),
      new Uint32Array(index),
      options,
    );
  }
}

/**
 * Fits raw arrays to the unit-height convention and measures them. Positions
 * are rewritten in place.
 */
export function unitMeshFromArrays(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  sway: Float32Array,
  index: Uint32Array,
  options: FinishOptions = {},
): UnitMesh {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    minY = Math.min(minY, positions[i]!);
    maxY = Math.max(maxY, positions[i]!);
  }
  const height = maxY - minY;
  if (!(height > 0) || !Number.isFinite(height)) throw new Error("Biome asset has no height");
  const scale = options.keepScale ? 1 : 1 / height;
  const sink = options.sink ?? 0;
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i]! * scale;
    positions[i + 1] = (positions[i + 1]! - minY) * scale - sink;
    positions[i + 2] = positions[i + 2]! * scale;
    radius = Math.max(radius, Math.hypot(positions[i]!, positions[i + 2]!));
  }
  return {
    positions,
    normals,
    colors,
    sway,
    index,
    radius,
    minY: -sink,
    maxY: height * scale - sink,
    triangles: index.length / 3,
  };
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
