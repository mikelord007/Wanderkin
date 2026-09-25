/**
 * Rock families: tiny stones, pebbles, medium rocks, layered slabs, clustered
 * rocks and large boulders. Faceted, flat-bottomed, asymmetric; lighter on
 * up-facing planes, darker on recesses and undersides. The planar cuts give
 * each variant its own deliberate slopes instead of a scaled icosphere.
 */
import * as THREE from "three";
import { MeshKit, rampTone } from "../meshKit.js";
import { hull } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Cut = { normal: readonly [number, number, number]; offset: number };

export interface RockShape {
  /** Width, height, depth of the body before fitting. */
  scale: readonly [number, number, number];
  detail: 0 | 1;
  jitter: number;
  seed: number;
  cuts: readonly Cut[];
  /** Flat base height in the unit sphere (−0.2 squat … −0.6 tall). */
  floor: number;
}

export interface RockOptions {
  /** Tone ramp name (default "rock"). */
  ramp?: string;
  /** Extra bodies: [shape, offset x, z (in body units), size factor]. */
  companions?: readonly (readonly [RockShape, number, number, number])[];
  /** Horizontal stacked slabs (layered sandstone), bottom to top. */
  layers?: readonly { shape: RockShape; y: number; shift: readonly [number, number] }[];
  sink?: number;
  /** `height` for hero boulders; `size` (largest dimension = 1) for dressing. */
  fit?: "height" | "size";
}

function toneFor(tones: BiomeTones, name: string) {
  return rampTone(tones[name] ?? tones.rock, { heightWeight: 0.2 });
}

/** One rock variant: a main body, optional companions or stacked layers. */
export function rock(main: RockShape, options: RockOptions = {}): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const color = toneFor(tones, options.ramp ?? "rock");
    if (options.layers) {
      for (const layer of options.layers) {
        const g = hull(layer.shape);
        g.translate(layer.shift[0], layer.y, layer.shift[1]);
        kit.add(g, { color });
      }
    } else {
      kit.add(hull(main), { color });
    }
    // Companions rest on the same ground plane as the main body's flat base.
    const first = options.layers?.[0];
    const groundY = first ? first.shape.floor * first.shape.scale[1] + first.y : main.floor * main.scale[1];
    for (const [shape, x, z, size] of options.companions ?? []) {
      const g = hull(shape);
      g.scale(size, size, size);
      g.translate(x, groundY - shape.floor * shape.scale[1] * size, z);
      kit.add(g, { color });
    }
    return kit.finish({ fit: options.fit ?? "height", sink: options.sink ?? 0.06, groundAo: { height: 0.25, strength: 0.28 } });
  };
}

const up = (x: number, y: number, z: number, offset: number): Cut => ({ normal: [x, y, z], offset });

/** A reusable spread of shapes; biomes pick from these and re-tone them. */
export const ROCK_SHAPES = {
  /** Wedge boulder: tall back, slanted top plane, one sheared side. */
  boulderWedge: { scale: [0.82, 1.0, 0.72], detail: 1, jitter: 0.08, seed: 11, floor: -0.45, cuts: [up(0.35, 1, -0.1, 0.62), up(-1, 0.2, 0.3, 0.78), up(0.2, -0.1, 1, 0.8)] },
  /** Rounded weathered boulder, low and wide. */
  boulderRound: { scale: [0.74, 0.84, 0.7], detail: 1, jitter: 0.1, seed: 23, floor: -0.35, cuts: [up(0.2, 1, 0.1, 0.72), up(0.9, 0.3, -0.2, 0.82), up(-0.5, 0.4, 0.8, 0.8)] },
  /** Angular crag: steep faces, sharp crown. */
  crag: { scale: [0.66, 1.1, 0.62], detail: 0, jitter: 0.12, seed: 37, floor: -0.5, cuts: [up(0.6, 1, 0.3, 0.7), up(-0.5, 0.6, -0.8, 0.72)] },
  /** Medium slab with one flat bench top. */
  slab: { scale: [1.25, 0.55, 0.95], detail: 0, jitter: 0.1, seed: 41, floor: -0.3, cuts: [up(0.1, 1, 0.05, 0.55)] },
  /** Medium knobbly rock. */
  knob: { scale: [1, 0.8, 0.9], detail: 1, jitter: 0.12, seed: 53, floor: -0.4, cuts: [up(-0.4, 1, 0.4, 0.75), up(0.8, 0.2, 0.5, 0.8)] },
  /** Pebble: squat, smooth-ish. */
  pebble: { scale: [1.1, 0.55, 0.9], detail: 0, jitter: 0.06, seed: 61, floor: -0.3, cuts: [] },
  /** Chip: small, sharp. */
  chip: { scale: [0.9, 0.6, 1.1], detail: 0, jitter: 0.15, seed: 71, floor: -0.35, cuts: [up(0.3, 1, 0, 0.6)] },
} satisfies Record<string, RockShape>;

/**
 * Default rock variants (≥ 8 across five families). Biomes may use these as
 * they are, re-toned, or build their own with {@link rock}.
 */
export function defaultRockVariants(ramp = "rock") {
  const s = ROCK_SHAPES;
  return {
    // Hero boulders (height fit): companions tuck in against the base.
    large: [
      rock(s.boulderWedge, { ramp, companions: [[s.chip, 0.6, 0.3, 0.22]] }),
      rock(s.boulderRound, { ramp, companions: [[s.pebble, 0.52, -0.22, 0.2]] }),
      rock(s.crag, { ramp, companions: [[s.pebble, 0.5, 0.35, 0.22]] }),
    ],
    clustered: [
      rock({ ...s.knob, scale: [0.62, 0.9, 0.58] }, { ramp, companions: [[s.chip, 0.55, 0.15, 0.42], [s.pebble, -0.2, 0.55, 0.36]] }),
    ],
    // Dressing (size fit: largest dimension = 1, so a preset's size range
    // means the same thing for a tall crag and a flat slab).
    medium: [
      rock(s.knob, { ramp, fit: "size" }),
      rock(s.slab, { ramp, fit: "size" }),
      rock({ ...s.boulderRound, seed: 29 }, { ramp, fit: "size" }),
    ],
    layered: [
      rock(s.slab, {
        ramp,
        fit: "size",
        layers: [
          { shape: s.slab, y: 0, shift: [0, 0] },
          { shape: { ...s.slab, seed: 43, scale: [0.95, 0.5, 0.75] }, y: 0.42, shift: [0.12, -0.08] },
          { shape: { ...s.chip, seed: 47, scale: [0.6, 0.45, 0.55] }, y: 0.78, shift: [-0.1, 0.05] },
        ],
      }),
    ],
    small: [
      rock(s.pebble, { ramp, sink: 0.05, fit: "size" }),
      rock(s.chip, { ramp, sink: 0.05, fit: "size" }),
      rock({ ...s.pebble, seed: 67, scale: [0.8, 0.6, 1.2] }, { ramp, sink: 0.05, fit: "size" }),
    ],
  };
}

/** Speckle-free tone check helper for tests: average colour of a mesh. */
export function meanColor(mesh: UnitMesh): THREE.Color {
  const c = new THREE.Color(0, 0, 0);
  const n = mesh.colors.length / 3;
  for (let i = 0; i < n; i += 1) c.add(new THREE.Color(mesh.colors[i * 3]!, mesh.colors[i * 3 + 1]!, mesh.colors[i * 3 + 2]!));
  return c.multiplyScalar(1 / Math.max(1, n));
}
