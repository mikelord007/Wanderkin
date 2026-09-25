/**
 * Autumn woodland rocks: cool grey granite that sits quietly under the warm
 * canopy, so colour stays with the leaves. Families:
 *
 *  - mossy boulders: rounded, flat-bottomed, with a moss cap that thickens
 *    toward the top (a green-olive blanket, not flecks);
 *  - lichen stones: angular, sheared slabs and crags whose side facets carry
 *    pale lichen patches;
 *  - a split boulder (two halves leaning apart) and a stacked tor;
 *  - supporting rocks and pebbles (size-fitted dressing).
 *
 * Tone is structural: lit up-facing planes, darker sides and undersides,
 * baked ground AO; moss by facing and height, lichen per whole facet (the
 * facet's normal picks it), never per-vertex noise.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { hash01, hull, type HullOptions } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

export interface WoodlandRockBody {
  shape: HullOptions;
  /** Base position (x, z) in body units. */
  at?: readonly [number, number];
  size?: number;
  /** Tilt about X then Z (radians) before resting on the ground. */
  tilt?: readonly [number, number];
  yaw?: number;
  /** Rest on top of the previous body instead of the ground (stacked tors). */
  stack?: boolean;
}

export interface WoodlandRockOptions {
  bodies: readonly WoodlandRockBody[];
  /** Tone ramp name (default "rock"). */
  ramp?: string;
  /** Moss on facets facing up more than this at mid height (0.3 … 0.9); omit for none. */
  moss?: number;
  /** Share of side facets (0 … 1) wearing a lichen patch. */
  lichen?: number;
  fit?: "height" | "size";
  sink?: number;
}

/** Rests a body on y = `ground`: anything below after tilting is flattened onto it. */
function rest(g: THREE.BufferGeometry, ground: number, clampDepth: number): void {
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) p.setY(i, Math.max(minY + clampDepth, p.getY(i)) - (minY + clampDepth) + ground);
}

export function woodlandRock(options: WoodlandRockOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "rock"] ?? tones.rock);
    const mossRamp = linearRamp(tones.moss ?? tones.foliage);
    const lichen = new THREE.Color((tones.lichen ?? tones.rock).base);
    const lichenLight = new THREE.Color((tones.lichen ?? tones.rock).light);
    let previousTop = 0;
    const geometries = options.bodies.map((body) => {
      const g = hull(body.shape);
      const size = body.size ?? 1;
      g.scale(size, size, size);
      if (body.tilt) {
        g.rotateX(body.tilt[0]);
        g.rotateZ(body.tilt[1]);
      }
      if (body.yaw) g.rotateY(body.yaw);
      rest(g, body.stack ? previousTop * 0.92 : 0, body.tilt ? 0.1 * size : 0);
      const [x, z] = body.at ?? [0, 0];
      g.translate(x, 0, z);
      g.computeBoundingBox();
      previousTop = g.boundingBox!.max.y;
      return g;
    });
    const moss = options.moss;
    const lichenShare = options.lichen ?? 0;
    for (const g of geometries) {
      kit.add(g, {
        color: (p, n) => {
          // Unit space: p.y 0 … 1 over the whole rock.
          const facing = n.y * 0.5 + 0.5;
          const c = rampAt(ramp, Math.min(1, Math.max(0, facing * 0.78 + p.y * 0.22 - 0.06)));
          if (moss !== undefined) {
            // The cap spreads further down the sides toward the top.
            const edge = moss - p.y * 0.45;
            const k = Math.min(1, Math.max(0, (n.y - edge) / 0.18));
            if (k > 0) return c.lerp(rampAt(mossRamp, Math.min(1, 0.3 + facing * 0.55 + p.y * 0.15)), k * 0.92);
          }
          if (lichenShare > 0 && n.y > -0.1 && n.y < 0.75 && p.y > 0.12) {
            // One decision per facet: faceted parts give every vertex of a
            // face the same normal, so the whole facet takes the patch.
            if (hash01(n.x * 13.1, n.y * 7.7, n.z * 11.3, 5) < lichenShare) return c.lerp(n.y > 0.35 ? lichenLight : lichen, 0.7);
          }
          return c;
        },
      });
    }
    return kit.finish({ fit: options.fit ?? "height", sink: options.sink ?? 0.05, groundAo: { height: 0.22, strength: 0.32 } });
  };
}

type Cut = { normal: readonly [number, number, number]; offset: number };
const cut = (x: number, y: number, z: number, offset: number): Cut => ({ normal: [x, y, z], offset });

/** Hull shapes for the woodland families. */
export const WOODLAND_ROCK_SHAPES = {
  /** Big rounded boulder: dome, one broad shoulder. */
  dome: { scale: [0.82, 0.8, 0.74], detail: 1, jitter: 0.07, seed: 201, floor: -0.38, cuts: [cut(0.25, 1, 0.1, 0.8), cut(-0.8, 0.35, 0.4, 0.86)] },
  /** Low, wide, half-buried loaf. */
  loaf: { scale: [1.0, 0.52, 0.76], detail: 1, jitter: 0.06, seed: 203, floor: -0.28, cuts: [cut(0.1, 1, 0.05, 0.82)] },
  /** Rounded knob (split halves, stack pieces). */
  knob: { scale: [0.76, 0.86, 0.7], detail: 1, jitter: 0.1, seed: 207, floor: -0.4, cuts: [cut(-0.4, 1, 0.4, 0.8), cut(0.8, 0.2, 0.5, 0.84)] },
  /** Half of a split boulder: a flat sheared face on +x. */
  half: { scale: [0.72, 0.9, 0.78], detail: 1, jitter: 0.07, seed: 209, floor: -0.4, cuts: [cut(1, 0.05, 0, 0.18), cut(-0.3, 1, 0.1, 0.8)] },
  /** Angular crag with a sheared crown. */
  crag: { scale: [0.62, 1.08, 0.56], detail: 0, jitter: 0.12, seed: 211, floor: -0.5, cuts: [cut(0.7, 1, 0.2, 0.64), cut(-0.6, 0.5, -0.8, 0.72), cut(0.1, 0.2, 1, 0.72)] },
  /** Thick slab with a flat bench top and sheared ends. */
  slab: { scale: [1.2, 0.44, 0.74], detail: 0, jitter: 0.1, seed: 213, floor: -0.4, cuts: [cut(0.05, 1, 0, 0.62), cut(1, 0.3, 0, 0.82), cut(-1, 0.5, 0.2, 0.8)] },
  /** Small stones. */
  pebble: { scale: [1.1, 0.55, 0.9], detail: 0, jitter: 0.06, seed: 221, floor: -0.3, cuts: [] },
  chip: { scale: [0.9, 0.62, 1.1], detail: 0, jitter: 0.15, seed: 223, floor: -0.35, cuts: [cut(0.3, 1, 0, 0.62)] },
} satisfies Record<string, HullOptions>;

const S = WOODLAND_ROCK_SHAPES;

/** The Autumn rock set (8+ variants across five families). */
export function woodlandRocks() {
  return {
    mossy: [
      // Big mossy dome with a companion stone and a chip.
      woodlandRock({ moss: 0.7, bodies: [{ shape: S.dome }, { shape: S.pebble, at: [0.56, 0.2], size: 0.24 }, { shape: S.chip, at: [-0.3, 0.5], size: 0.16 }] }),
      // Moss-blanketed humped boulder with a smaller one tucked against it.
      woodlandRock({ moss: 0.56, bodies: [{ shape: { ...S.loaf, scale: [0.76, 0.92, 0.66], floor: -0.36 } }, { shape: { ...S.knob, seed: 231 }, at: [0.34, -0.2], size: 0.4 }, { shape: S.pebble, at: [-0.42, 0.22], size: 0.18 }] }),
      // Split boulder: two halves leaning apart, moss on both crowns.
      woodlandRock({ moss: 0.72, bodies: [{ shape: S.half, at: [-0.12, 0], tilt: [0, 0.12] }, { shape: { ...S.half, seed: 233 }, at: [0.18, 0.04], yaw: Math.PI, tilt: [0, 0.14] }] }),
      // Stacked tor: a wide base, a smaller rounded stone on top.
      woodlandRock({ moss: 0.76, lichen: 0.25, bodies: [{ shape: S.loaf, size: 0.95 }, { shape: { ...S.knob, seed: 235, scale: [0.6, 0.62, 0.56] }, at: [0.06, -0.02], stack: true }, { shape: S.chip, at: [0.58, 0.3], size: 0.2 }] }),
    ],
    lichen: [
      // Tall lichen crag with a leaning companion.
      woodlandRock({ lichen: 0.45, moss: 0.85, bodies: [{ shape: S.crag }, { shape: { ...S.crag, seed: 241 }, at: [0.4, 0.22], size: 0.56, tilt: [0.22, -0.28] }, { shape: S.chip, at: [-0.38, 0.4], size: 0.2 }] }),
      // Tilted slabs leaning together.
      woodlandRock({ lichen: 0.4, bodies: [{ shape: { ...S.slab, scale: [0.85, 0.55, 0.7] }, tilt: [0.08, 0.75] }, { shape: { ...S.slab, seed: 243, scale: [0.85, 0.55, 0.7] }, at: [-0.22, 0.28], size: 0.8, tilt: [0.12, 0.88], yaw: 0.35 }, { shape: S.chip, at: [0.42, -0.3], size: 0.2 }] }),
    ],
    // Supporting rocks (size-fitted).
    medium: [
      woodlandRock({ fit: "size", moss: 0.5, bodies: [{ shape: { ...S.dome, seed: 251 } }] }),
      woodlandRock({ fit: "size", lichen: 0.4, bodies: [{ shape: { ...S.slab, seed: 253 } }] }),
      woodlandRock({ fit: "size", moss: 0.7, bodies: [{ shape: { ...S.knob, seed: 255 } }, { shape: S.pebble, at: [0.5, 0.1], size: 0.35 }] }),
      woodlandRock({ fit: "size", lichen: 0.35, bodies: [{ shape: { ...S.crag, seed: 257, scale: [0.8, 0.7, 0.6] }, tilt: [0.2, 0.35] }] }),
    ],
    pebbles: [
      woodlandRock({ fit: "size", sink: 0.05, bodies: [{ shape: S.pebble }] }),
      woodlandRock({ fit: "size", sink: 0.05, bodies: [{ shape: { ...S.pebble, seed: 261, scale: [0.8, 0.6, 1.2] } }] }),
      woodlandRock({ fit: "size", sink: 0.05, moss: 0.6, bodies: [{ shape: S.chip }] }),
    ],
  };
}
