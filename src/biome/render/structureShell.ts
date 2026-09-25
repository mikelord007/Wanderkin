/**
 * Stylised visual shell for a box helper (generated stairs, bridges, stepped
 * routes, authored steps) in a themed look. Visual only: the collider, the
 * entity transform and its dimensions never change, and the shell is never
 * raycast.
 *
 * Built in the box's LOCAL frame (the helper group applies the transform):
 *  - Top: one flat face at exactly the collider's top, covering the whole
 *    top rectangle, so the walkable surface is never visually reduced.
 *  - Rim: a bevel from the top edge going OUTWARD and down, in a light
 *    highlight tone, marking the collision edge.
 *  - Sides: horizontal strata that step in and out, with chamfered corners,
 *    uneven columns and darker crack columns; ledges face up (light) or down
 *    (recess dark).
 *  - Base: sinks a little below the collider bottom so it never floats.
 * Every vertex stays within the box ± τ horizontally, where
 * τ = min(1.2 cm, 4% of the smaller horizontal side) in world units.
 */
import * as THREE from "three";
import type { WallStyle } from "../assets/types.js";
import { seededRandom } from "./selection.js";

/** World-unit shell tolerance for a box of the given world footprint. */
export function shellTolerance(worldWidth: number, worldDepth: number): number {
  return Math.min(0.012, 0.04 * Math.min(worldWidth, worldDepth));
}

/** How far the shell reaches below the collider bottom, world units. */
export const SHELL_SINK = 0.02;

export interface StructureShellInput {
  /** Local box dimensions (entity `dimensions`). */
  dimensions: readonly [number, number, number];
  /** Entity transform scale (may be non-uniform or negative). */
  scale: readonly [number, number, number];
  style: WallStyle;
  seed: string;
}

export interface StructureShell {
  mesh: THREE.Mesh;
  /** Local-space tolerances actually used (for tests). */
  tolerance: { x: number; z: number };
  dispose(): void;
}

interface OutlinePoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Which perimeter column this point starts (for crack colouring). */
  column: number;
}

/**
 * Perimeter of the box rectangle, clockwise seen from above (+Y), with
 * each corner split into two points (chamfer) and long sides subdivided into
 * columns. The same parametrisation at chamfer 0 is the exact rectangle.
 */
function perimeter(hx: number, hz: number, columnsX: number, columnsZ: number): { base: OutlinePoint[]; corner: boolean[] } {
  const base: OutlinePoint[] = [];
  const corner: boolean[] = [];
  let column = 0;
  const side = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, columns: number) => {
    for (let i = 0; i < columns; i += 1) {
      const t = i / columns;
      base.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx, nz, column: column++ });
      corner.push(i === 0);
    }
    // Duplicate the end corner so chamfering can move it along this side.
    base.push({ x: x1, z: z1, nx, nz, column: column++ });
    corner.push(true);
  };
  side(-hx, hz, hx, hz, 0, 1, columnsX); // +Z side, west → east
  side(hx, hz, hx, -hz, 1, 0, columnsZ); // +X side, south → north
  side(hx, -hz, -hx, -hz, 0, -1, columnsX); // −Z side
  side(-hx, -hz, -hx, hz, -1, 0, columnsZ); // −X side
  return { base, corner };
}

export function createStructureShell({ dimensions, scale, style, seed }: StructureShellInput): StructureShell {
  const [w, h, d] = dimensions.map((v) => Math.abs(v)) as [number, number, number];
  const sx = Math.max(1e-6, Math.abs(scale[0]));
  const sy = Math.max(1e-6, Math.abs(scale[1]));
  const sz = Math.max(1e-6, Math.abs(scale[2]));
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const tauWorld = shellTolerance(w * sx, d * sz);
  const tx = tauWorld / sx;
  const tz = tauWorld / sz;
  const random = seededRandom(`${seed}:shell`);

  const columnsX = Math.max(2, Math.min(10, Math.round((w * sx) / 0.08)));
  const columnsZ = Math.max(2, Math.min(10, Math.round((d * sz) / 0.08)));
  const { base, corner } = perimeter(hx, hz, columnsX, columnsZ);
  // Erosion marks: short darker columns confined to one stratum each.
  const cracks = new Set<string>();
  const [notchLow, notchHigh] = style.notches;
  const notchCount = Math.round(notchLow + (notchHigh - notchLow) * random()) * 2;
  const crackRolls = Array.from({ length: notchCount }, () => [random(), random()] as const);

  // Corner chamfer: small and inward, below the full-size top.
  const chamfer = style.rounding * Math.min(0.02 / Math.min(sx, sz), 0.12 * Math.min(hx, hz));
  /** Horizontal offset along each point's outward normal, clamped to ±τ. */
  const outline = (offset: number, jitter: number[] | null, chamferAmount: number) =>
    base.map((p, k) => {
      const tau = p.nx !== 0 ? tx : tz;
      const o = Math.max(-tau, Math.min(tau, offset * tau + (jitter ? jitter[k]! * tau : 0)));
      let x = p.x + p.nx * o;
      let z = p.z + p.nz * o;
      if (corner[k] && chamferAmount > 0) {
        // Pull corner points back along their side, toward the side's middle.
        const alongX = p.nx === 0;
        if (alongX) x -= Math.sign(p.x) * chamferAmount;
        else z -= Math.sign(p.z) * chamferAmount;
      }
      return { x, z };
    });

  // ---- Strata ----------------------------------------------------------------
  const [strataLow, strataHigh] = style.strata;
  const strata = Math.max(1, Math.round(strataLow + (strataHigh - strataLow) * random()));
  const rimDrop = Math.min((tauWorld * 1.2) / sy, h * 0.12);
  const sideTop = hy - rimDrop;
  const sideBottom = -hy - SHELL_SINK / sy;
  const cuts: number[] = [sideTop];
  for (let i = 1; i < strata; i += 1) {
    const t = i / strata + (random() - 0.5) * (0.4 / strata);
    cuts.push(sideTop - (sideTop - sideBottom) * t);
  }
  cuts.push(sideBottom);
  for (const [column, layer] of crackRolls) cracks.add(`${Math.floor(column * base.length)}:${Math.floor(layer * (cuts.length - 1))}`);
  const layers = cuts.slice(0, -1).map((top, i) => {
    // Alternate out/in with the style's stepping; the top layer sits fully
    // out so the rim bevel reads as a lip.
    const out = i === 0 ? 1 : i % 2 === 1 ? 1 - style.stepping * 1.4 : 0.9;
    const jitter = base.map(() => (random() - 0.5) * 0.5 * style.stepping);
    // Strata read mostly through tone (the geometry may only move ±τ):
    // alternate clearly lighter and darker bands.
    const tone = (i % 2 === 0 ? 0.72 : 0.3) + (random() - 0.5) * 0.16;
    return { top, bottom: cuts[i + 1]!, ring: outline(Math.max(-1, Math.min(1, out)), jitter, chamfer), tone };
  });

  // ---- Triangles (non-indexed, flat shaded) ------------------------------
  const positions: number[] = [];
  const colors: number[] = [];
  const toLinear = (hex: string) => new THREE.Color(hex);
  const top = { dark: toLinear(style.top.dark), base: toLinear(style.top.base), light: toLinear(style.top.light) };
  const side = { dark: toLinear(style.side.dark), base: toLinear(style.side.base), light: toLinear(style.side.light) };
  const recess = toLinear(style.recess);
  const rim = toLinear(style.rim);
  const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number], color: THREE.Color) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
  };
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], color: THREE.Color) => {
    tri(a, b, c, color);
    tri(a, c, d, color);
  };

  // Top: fan over the exact rectangle at y = hy (covers the whole collider top).
  const rect = outline(0, null, 0);
  const centre: [number, number, number] = [0, hy, 0];
  // One even tone: per-triangle variation would show the fan as a sunburst.
  const topColor = mix(top.base, top.light, 0.55);
  for (let k = 0; k < rect.length; k += 1) {
    const a = rect[k]!;
    const b = rect[(k + 1) % rect.length]!;
    tri(centre, [a.x, hy, a.z], [b.x, hy, b.z], topColor);
  }
  // Rim bevel: exact rectangle at the top → first stratum (outward, lower).
  const first = layers[0]!;
  for (let k = 0; k < rect.length; k += 1) {
    const n = (k + 1) % rect.length;
    const a = rect[k]!;
    const b = rect[n]!;
    const c = first.ring[n]!;
    const e = first.ring[k]!;
    quad([a.x, hy, a.z], [e.x, sideTop, e.z], [c.x, sideTop, c.z], [b.x, hy, b.z], rim);
  }
  // Strata walls and the ledges between them.
  layers.forEach((layer, i) => {
    for (let k = 0; k < layer.ring.length; k += 1) {
      const n = (k + 1) % layer.ring.length;
      const a = layer.ring[k]!;
      const b = layer.ring[n]!;
      const crack = cracks.has(`${k}:${i}`);
      const heightT = (layer.top - sideBottom) / Math.max(1e-6, sideTop - sideBottom);
      let color = mix(side.dark, side.light, layer.tone + 0.2 * heightT - 0.1);
      if (i === layers.length - 1) color = mix(color, recess, 0.35); // darker base
      if (crack) color = mix(color, recess, 0.6);
      quad([a.x, layer.top, a.z], [a.x, layer.bottom, a.z], [b.x, layer.bottom, b.z], [b.x, layer.top, b.z], color);
    }
    const next = layers[i + 1];
    if (!next) return;
    for (let k = 0; k < layer.ring.length; k += 1) {
      const n = (k + 1) % layer.ring.length;
      const a = layer.ring[k]!;
      const b = layer.ring[n]!;
      const c = next.ring[n]!;
      const e = next.ring[k]!;
      const y = layer.bottom;
      // This winding faces up where the lower layer sticks out (a lit ledge)
      // and down where the upper one overhangs (a shaded recess).
      const lowerOut = (c.x - b.x) * base[n]!.nx + (c.z - b.z) * base[n]!.nz > 0;
      quad([a.x, y, a.z], [e.x, y, e.z], [c.x, y, c.z], [b.x, y, b.z], lowerOut ? mix(top.dark, top.base, 0.5) : recess);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "biome-structure-shell";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  return {
    mesh,
    tolerance: { x: tx, z: tz },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
