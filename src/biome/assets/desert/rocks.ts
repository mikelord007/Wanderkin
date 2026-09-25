/**
 * Desert rock families (Desert art; built on the shared hull primitive).
 *
 * Sandstone reads through STEPPED horizontal bands of tone, not texture:
 * every rock is coloured by height into a few flat bands (lighter and darker
 * layers), still lit-top / shaded-underside, so layering survives any light
 * and stays posterisation-safe. Families:
 *  - sandstone boulder: rounded, wind-worn, banded;
 *  - hoodoo: a wind-eroded rock, narrow at the base and wider above;
 *  - mesa stack: stepped slabs shrinking upward, flat top;
 *  - angular desert rock: sheared planes, banded;
 *  - pebble cluster and small stones (size-fitted dressing).
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { hull, type HullOptions } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Cut = { normal: readonly [number, number, number]; offset: number };
const cut = (x: number, y: number, z: number, offset: number): Cut => ({ normal: [x, y, z], offset });

/** Stepped sandstone banding: `bands` flat layers by height, lit on top. */
function banded(tones: BiomeTones, bands: number, contrast: number, rampName = "rock") {
  const ramp = linearRamp(tones[rampName] ?? tones.rock);
  // Bands must beat facet shading to read, so they swing wider than the
  // facing term; the pattern is irregular so layers never look striped.
  const pattern = [0.2, -0.16, 0.3, -0.06, 0.12, -0.2];
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    const band = pattern[Math.min(pattern.length - 1, Math.floor(Math.max(0, p.y) * bands)) % pattern.length]!;
    const facing = n.y * 0.5 + 0.5;
    return rampAt(ramp, Math.min(1, Math.max(0, 0.26 + facing * 0.34 + p.y * 0.1 + band * contrast)));
  };
}

/**
 * Narrow the hull toward the ground (wind erosion undercut): radius scales
 * from `waist` at the base to 1 at `height`, keeping the flat base.
 */
function undercut(geometry: THREE.BufferGeometry, waist: number, floorY: number, topY: number): void {
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const t = Math.min(1, Math.max(0, (y - floorY) / Math.max(1e-6, topY - floorY)));
    const k = waist + (1 - waist) * Math.min(1, t / 0.6) ** 0.7;
    position.setXYZ(i, position.getX(i) * k, y, position.getZ(i) * k);
  }
}

export interface SandstoneOptions {
  shape: HullOptions;
  bands?: number;
  contrast?: number;
  /** Base width fraction for a wind-eroded undercut (1 = none). */
  waist?: number;
  /** Stacked slabs instead of one body: [width, height, depth, shiftX, shiftZ] bottom to top. */
  stack?: readonly (readonly [number, number, number, number, number])[];
  companions?: readonly (readonly [HullOptions, number, number, number])[];
  fit?: "height" | "size";
  sink?: number;
}

export function sandstone(options: SandstoneOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const color = banded(tones, options.bands ?? 4, options.contrast ?? 1);
    let ground = options.shape.floor * options.shape.scale[1];
    if (options.stack) {
      let y = 0;
      options.stack.forEach(([w, h, d, sx, sz], i) => {
        const slab = hull({ ...options.shape, seed: options.shape.seed + i * 7, scale: [w, h, d], floor: -0.4, cuts: [cut(0, 1, 0, 0.55), ...(options.shape.cuts ?? []).slice(0, 1)] });
        // Each slab rests on the previous one's flat top.
        slab.translate(sx, y + 0.4 * h, sz);
        if (i === 0) ground = y;
        y += (0.55 + 0.4) * h * 0.92;
        kit.add(slab, { color });
      });
    } else {
      const body = hull(options.shape);
      if (options.waist !== undefined && options.waist < 1) {
        const top = Math.max(...Array.from({ length: body.getAttribute("position").count }, (_, i) => body.getAttribute("position").getY(i)));
        undercut(body, options.waist, ground, top);
      }
      kit.add(body, { color });
    }
    for (const [shape, x, z, size] of options.companions ?? []) {
      const g = hull(shape);
      g.scale(size, size, size);
      g.translate(x, ground - shape.floor * shape.scale[1] * size, z);
      kit.add(g, { color });
    }
    return kit.finish({ fit: options.fit ?? "height", sink: options.sink ?? 0.05, groundAo: { height: 0.2, strength: 0.3 } });
  };
}

const pebble: HullOptions = { scale: [1, 0.55, 0.85], detail: 0, jitter: 0.08, seed: 91, floor: -0.3 };
const chip: HullOptions = { scale: [0.8, 0.6, 1.05], detail: 0, jitter: 0.15, seed: 97, floor: -0.35, cuts: [cut(0.3, 1, 0, 0.6)] };

/** The Desert rock set: hero boulders, supporting rocks and dressing stones. */
export function desertRocks() {
  return {
    hero: [
      // Rounded, wind-worn sandstone boulder, slightly undercut at the base.
      sandstone({ shape: { scale: [0.8, 0.92, 0.72], detail: 1, jitter: 0.08, seed: 101, floor: -0.4, cuts: [cut(0.15, 1, 0.1, 0.74), cut(0.9, 0.2, -0.3, 0.84)] }, bands: 5, waist: 0.78, companions: [[pebble, 0.55, 0.3, 0.2]] }),
      // Balanced cap-rock (hoodoo): a narrow banded pillar under a wider cap.
      sandstone({ shape: { scale: [1, 1, 1], detail: 1, jitter: 0.08, seed: 107, floor: -0.4 }, bands: 6, stack: [[0.36, 0.78, 0.32, 0, 0], [0.6, 0.26, 0.54, 0.04, -0.02]] }),
      // Mesa stack: stepped slabs, flat top.
      sandstone({ shape: { scale: [1, 1, 1], detail: 0, jitter: 0.08, seed: 113, floor: -0.4, cuts: [cut(0.2, 0.3, 1, 0.8)] }, bands: 3, contrast: 0.8, stack: [[0.64, 0.34, 0.56, 0, 0], [0.52, 0.3, 0.45, 0.05, -0.03], [0.38, 0.26, 0.33, -0.03, 0.04]] }),
      // Angular desert rock: sheared planes.
      sandstone({ shape: { scale: [0.68, 1.0, 0.6], detail: 0, jitter: 0.13, seed: 127, floor: -0.5, cuts: [cut(0.6, 1, 0.3, 0.66), cut(-0.5, 0.6, -0.8, 0.7), cut(-0.9, 0.1, 0.4, 0.8)] }, bands: 4, companions: [[chip, 0.5, -0.3, 0.26]] }),
    ],
    supporting: [
      sandstone({ shape: { scale: [1.1, 0.6, 0.9], detail: 0, jitter: 0.1, seed: 131, floor: -0.3, cuts: [cut(0.1, 1, 0.05, 0.5)] }, bands: 2, fit: "size" }),
      sandstone({ shape: { scale: [1, 0.8, 0.9], detail: 1, jitter: 0.12, seed: 137, floor: -0.4, cuts: [cut(-0.4, 1, 0.4, 0.72)] }, bands: 3, fit: "size" }),
      sandstone({ shape: { scale: [1, 1, 1], detail: 0, jitter: 0.08, seed: 139, floor: -0.4 }, bands: 2, stack: [[0.9, 0.3, 0.75, 0, 0], [0.7, 0.26, 0.55, 0.08, 0.04]], fit: "size" }),
      // Small rock cluster.
      sandstone({ shape: { scale: [0.7, 0.7, 0.62], detail: 0, jitter: 0.12, seed: 149, floor: -0.35 }, bands: 2, fit: "size", companions: [[chip, 0.62, 0.2, 0.55], [pebble, -0.3, 0.6, 0.5]] }),
    ],
    dressing: [
      sandstone({ shape: pebble, bands: 1, fit: "size", sink: 0.04 }),
      sandstone({ shape: chip, bands: 1, fit: "size", sink: 0.04 }),
      sandstone({ shape: { ...pebble, seed: 157, scale: [0.8, 0.5, 1.2] }, bands: 1, fit: "size", sink: 0.04 }),
    ],
  };
}
