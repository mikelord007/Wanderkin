/**
 * Tropical rocks in two clearly different families:
 *
 *  - rounded, weathered pale limestone (smooth-ish hulls, few broad cuts,
 *    moss on the up-facing facets), often with companion stones;
 *  - angular, dark coastal basalt (tilted slabs and crags with sheared
 *    planes), cooler and heavier.
 *
 * Faceted and flat-bottomed; tone is structural (light up-facing planes,
 * dark undersides and near the ground), moss only on upward facets high
 * on the body, never as noise.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { hull, lobe, type HullOptions } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

export interface RockBody {
  shape: HullOptions;
  /** Base position (x, z) in body units. */
  at?: readonly [number, number];
  size?: number;
  /** Tilt about X then Z (radians) before resting on the ground: strata, leaning slabs. */
  tilt?: readonly [number, number];
  /** Spin about Y (radians). */
  yaw?: number;
}

export interface TropicalRockOptions {
  bodies: readonly RockBody[];
  /** Tone ramp name (default "rock"). */
  ramp?: string;
  /** Moss on facets facing up more than this (0.7 … 0.95); omit for none. */
  moss?: number;
  fit?: "height" | "size";
  sink?: number;
}

/**
 * Rests a body on y = 0: after tilting, everything below the new ground
 * plane is flattened onto it, so tilted slabs sit on a flat footing
 * instead of balancing on an edge.
 */
function restOnGround(g: THREE.BufferGeometry, clampDepth: number): void {
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) p.setY(i, Math.max(minY + clampDepth, p.getY(i)) - (minY + clampDepth));
}

export function tropicalRock(options: TropicalRockOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "rock"] ?? tones.rock);
    const mossRamp = linearRamp(tones.foliageDeep ?? tones.foliage);
    const moss = options.moss;
    let height = 0;
    const bodies = options.bodies.map((body) => {
      const g = hull(body.shape);
      const size = body.size ?? 1;
      g.scale(size, size, size);
      if (body.tilt) {
        g.rotateX(body.tilt[0]);
        g.rotateZ(body.tilt[1]);
      }
      if (body.yaw) g.rotateY(body.yaw);
      // Tilted bodies lose a sliver to a flat footing.
      restOnGround(g, body.tilt ? 0.12 * size : 0);
      const [x, z] = body.at ?? [0, 0];
      g.translate(x, 0, z);
      g.computeBoundingBox();
      height = Math.max(height, g.boundingBox!.max.y);
      return g;
    });
    for (const g of bodies) {
      kit.add(g, {
        color: (p, n) => {
          // Unit space: p.y 0 … 1 over the whole rock.
          const facing = n.y * 0.5 + 0.5;
          const t = Math.min(1, Math.max(0, facing * 0.8 + p.y * 0.25 - 0.08));
          const c = rampAt(ramp, t);
          if (moss !== undefined && n.y > moss && p.y > 0.42) {
            return rampAt(mossRamp, 0.35 + (n.y - moss) * 2).lerp(c, 0.18);
          }
          return c;
        },
      });
    }
    return kit.finish({ fit: options.fit ?? "height", sink: options.sink ?? 0.05, groundAo: { height: 0.22, strength: 0.3 } });
  };
}

/** Two or three coconuts half sunk in the sand (micro dressing). */
export function fallenCoconuts(options: { count: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const nut = linearRamp(tones.nut ?? tones.trunk);
    const spots: [number, number, number][] = [[0, 0, 0.5], [0.42, 0.12, 0.42], [-0.18, 0.4, 0.38]];
    for (let i = 0; i < Math.min(options.count, spots.length); i += 1) {
      const [x, z, r] = spots[i]!;
      kit.add(
        lobe({ radius: [r, r * 0.92, r * 1.05], detail: 0, jitter: 0.08, seed: options.seed + i, floor: -0.3, center: [x, r * 0.3, z] }),
        { color: (_p, n) => rampAt(nut, 0.25 + (n.y * 0.5 + 0.5) * 0.6), smooth: true },
      );
    }
    return kit.finish({ fit: "size", sink: 0.08 });
  };
}

type Cut = { normal: readonly [number, number, number]; offset: number };
const cut = (x: number, y: number, z: number, offset: number): Cut => ({ normal: [x, y, z], offset });

/** Hull shapes for the tropical families. */
export const TROPICAL_ROCK_SHAPES = {
  /** Pale rounded boulder: dome, one broad bench. */
  dome: { scale: [0.8, 0.8, 0.72], detail: 1, jitter: 0.06, seed: 101, floor: -0.35, cuts: [cut(0.3, 1, 0.1, 0.78), cut(-0.8, 0.3, 0.4, 0.86)] },
  /** Low pebble-smooth loaf. */
  loaf: { scale: [1.0, 0.55, 0.72], detail: 1, jitter: 0.05, seed: 103, floor: -0.3, cuts: [cut(0.1, 1, 0, 0.8)] },
  /** Weathered knob, slightly lumpy. */
  knob: { scale: [0.78, 0.9, 0.7], detail: 1, jitter: 0.1, seed: 107, floor: -0.4, cuts: [cut(-0.4, 1, 0.4, 0.8), cut(0.8, 0.2, 0.5, 0.84)] },
  /** Dark angular crag with a sheared crown. */
  crag: { scale: [0.62, 1.1, 0.56], detail: 0, jitter: 0.14, seed: 111, floor: -0.5, cuts: [cut(0.7, 1, 0.2, 0.62), cut(-0.6, 0.5, -0.8, 0.7), cut(0.1, 0.2, 1, 0.7)] },
  /** Coastal slab: thick, flat-topped, sheared ends. */
  slab: { scale: [1.2, 0.42, 0.7], detail: 0, jitter: 0.1, seed: 113, floor: -0.4, cuts: [cut(0.05, 1, 0, 0.62), cut(1, 0.3, 0, 0.82), cut(-1, 0.5, 0.2, 0.8)] },
  /** Wedge: tall back, slanted face. */
  wedge: { scale: [0.8, 1.0, 0.7], detail: 1, jitter: 0.08, seed: 117, floor: -0.45, cuts: [cut(0.5, 1, -0.1, 0.55), cut(-1, 0.2, 0.3, 0.76), cut(0.2, -0.1, 1, 0.78)] },
  /** Small stones. */
  pebble: { scale: [1.1, 0.55, 0.9], detail: 0, jitter: 0.06, seed: 121, floor: -0.3, cuts: [] },
  chip: { scale: [0.9, 0.62, 1.1], detail: 0, jitter: 0.15, seed: 123, floor: -0.35, cuts: [cut(0.3, 1, 0, 0.62)] },
} satisfies Record<string, HullOptions>;
