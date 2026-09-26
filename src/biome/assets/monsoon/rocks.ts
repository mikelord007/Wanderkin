/**
 * Monsoon rocks: dark, rain-darkened basalt and river stone under cushions
 * of moss. Moss is a colour on the up-facing facets only (it grows where
 * water settles), so the silhouette stays the rock's and the triangle count
 * does not change. The shapes come from the shared hull builder: rounded
 * river boulders, a split boulder, a stepped ledge, a leaning stone and
 * low slabs, then supporting stones and pebbles.
 */
import { snowCap } from "../meshKit.js";
import { rock, ROCK_SHAPES, type RockShape } from "../builders/rocks.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

const up = (x: number, y: number, z: number, offset: number) => ({ normal: [x, y, z] as const, offset });

/** Moss settles on facets facing up; more on the crown. */
function mossy(builder: VariantBuilder, threshold: number, strength = 0.9): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const mesh = builder(tones);
    // Two passes: the darker base moss on most up-facing facets, then the
    // lit moss on the flattest tops, so cushions read with a tonal edge.
    const base = snowCap(mesh, { color: tones.moss?.base ?? tones.foliage.base, threshold, heightBias: 0.5, strength });
    return snowCap(base, { color: tones.moss?.light ?? tones.foliage.light, threshold: Math.min(0.92, threshold + 0.25), heightBias: 0.6, strength: 0.75 });
  };
}

const s = ROCK_SHAPES;
const river: RockShape = { scale: [0.86, 0.7, 0.78], detail: 1, jitter: 0.07, seed: 401, floor: -0.35, cuts: [up(0.1, 1, 0.1, 0.78)] };
const leaning: RockShape = { scale: [0.55, 1.15, 0.5], detail: 1, jitter: 0.1, seed: 407, floor: -0.55, cuts: [up(0.7, 1, 0.1, 0.6), up(-0.9, 0.1, 0.4, 0.75)] };
const ledge: RockShape = { scale: [1.05, 0.62, 0.85], detail: 0, jitter: 0.08, seed: 409, floor: -0.3, cuts: [up(0.05, 1, 0, 0.52)] };

export function monsoonRocks() {
  return {
    hero: [
      mossy(rock({ ...river, scale: [0.72, 0.8, 0.66] }, { ramp: "rock", companions: [[s.pebble, 0.42, 0.2, 0.24]] }), 0.45),
      mossy(rock({ ...s.boulderRound, seed: 411 }, { ramp: "rock", companions: [[s.chip, -0.45, 0.3, 0.28], [s.pebble, 0.42, -0.3, 0.2]] }), 0.5),
      mossy(rock(leaning, { ramp: "rock", companions: [[river, 0.45, 0.1, 0.42]] }), 0.55),
      // Split boulder: two halves leaning apart.
      mossy(rock({ ...s.boulderWedge, seed: 415 }, { ramp: "rock", companions: [[{ ...s.boulderWedge, seed: 416, scale: [0.7, 0.85, 0.62] }, -0.5, 0.05, 0.8]] }), 0.5),
      // Stepped ledge.
      mossy(rock(ledge, { ramp: "rock", layers: [
        { shape: ledge, y: 0, shift: [0, 0] },
        { shape: { ...ledge, seed: 419, scale: [0.9, 0.55, 0.7] }, y: 0.36, shift: [0.15, -0.05] },
        { shape: { ...s.knob, seed: 421, scale: [0.55, 0.5, 0.5] }, y: 0.7, shift: [-0.12, 0.08] },
      ] }), 0.6),
    ],
    supporting: [
      mossy(rock(s.knob, { ramp: "rock", fit: "size" }), 0.5),
      mossy(rock({ ...river, seed: 431 }, { ramp: "rock", fit: "size" }), 0.45),
      mossy(rock(s.slab, { ramp: "rock", fit: "size" }), 0.6),
    ],
    dressing: [
      rock(s.pebble, { ramp: "rock", sink: 0.05, fit: "size" }),
      rock({ ...s.pebble, seed: 441, scale: [0.8, 0.5, 1.2] }, { ramp: "rock", sink: 0.05, fit: "size" }),
      mossy(rock(s.chip, { ramp: "rock", sink: 0.05, fit: "size" }), 0.6, 0.7),
    ],
  };
}
