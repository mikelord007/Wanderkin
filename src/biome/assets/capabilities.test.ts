/**
 * Wave 2 shared capabilities: snow caps and the conifer / broadleaf canopy
 * sets. The per-biome guardrails (validate.test.ts) cover every registered
 * art; these pin the builders' own contracts.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { conifer, defaultBroadleafVariants, defaultConiferVariants } from "./builders/trees.js";
import { snowCap, withSnowCap } from "./meshKit.js";
import { rock, ROCK_SHAPES } from "./builders/rocks.js";
import type { BiomeTones } from "./types.js";

const ramp = (dark: string, base: string, light: string) => ({ dark, base, light });
const TONES: BiomeTones = {
  foliage: ramp("#1d4538", "#2c604d", "#4c8468"),
  foliageAlt: ramp("#264c3d", "#386a54", "#669676"),
  crimson: ramp("#6e2319", "#9c3525", "#c65a40"),
  trunk: ramp("#4a3526", "#6b4d36", "#916f50"),
  rock: ramp("#5d646e", "#808792", "#a8aeb7"),
  soil: ramp("#8e979f", "#aeb7bf", "#cdd5dc"),
  dry: ramp("#80734f", "#a39672", "#c6ba96"),
  cactus: ramp("#2f5a45", "#437660", "#6c9a80"),
  accent: ramp("#8a3668", "#b4568a", "#d98ab3"),
  stoneTop: ramp("#a9b7c4", "#c4d0db", "#d6e0e9"),
  stoneSide: ramp("#5b626c", "#7a818c", "#a0a7b1"),
  stoneRecess: ramp("#3b4047", "#474c54", "#555b63"),
};
const SNOW = "#eef4f8";

describe("snow cap", () => {
  const base = rock(ROCK_SHAPES.boulderWedge)(TONES);

  it("whitens upward faces only and never moves geometry", () => {
    const capped = snowCap(base, { color: SNOW, threshold: 0.55 });
    expect(capped.positions).toEqual(base.positions);
    expect(capped.normals).toEqual(base.normals);
    expect(capped.index).toEqual(base.index);
    expect(capped.sway).toEqual(base.sway);
    expect([capped.radius, capped.minY, capped.maxY, capped.triangles]).toEqual([base.radius, base.minY, base.maxY, base.triangles]);
    const snow = new THREE.Color(SNOW);
    const distance = (colors: Float32Array, i: number) => Math.hypot(colors[i * 3]! - snow.r, colors[i * 3 + 1]! - snow.g, colors[i * 3 + 2]! - snow.b);
    let whitenedUp = 0;
    for (let i = 0; i < base.positions.length / 3; i += 1) {
      const ny = base.normals[i * 3 + 1]!;
      if (ny < 0.2) {
        // Sides and undersides keep their rock colour exactly.
        for (let c = 0; c < 3; c += 1) expect(capped.colors[i * 3 + c]).toBeCloseTo(base.colors[i * 3 + c]!, 6);
      } else if (ny > 0.9 && distance(capped.colors, i) < distance(base.colors, i)) whitenedUp += 1;
    }
    expect(whitenedUp).toBeGreaterThan(0);
  });

  it("is a no-op at strength 0 and does not mutate its input", () => {
    const before = Float32Array.from(base.colors);
    const none = snowCap(base, { color: SNOW, threshold: 0.55, strength: 0 });
    expect(Array.from(none.colors)).toEqual(Array.from(before));
    snowCap(base, { color: SNOW, threshold: 0.2 });
    expect(Array.from(base.colors)).toEqual(Array.from(before));
  });

  it("wraps a builder without changing its shape", () => {
    const builder = defaultConiferVariants()[0]!;
    const plain = builder(TONES);
    const capped = withSnowCap(builder, { color: SNOW, threshold: 0.55, heightBias: 0.6 })(TONES);
    expect(capped.positions).toEqual(plain.positions);
    expect(capped.colors).not.toEqual(plain.colors);
  });
});

describe("conifer and broadleaf canopy sets", () => {
  it("conifers are one unit tall, narrow, light and deterministic", () => {
    const variants = defaultConiferVariants();
    expect(variants.length).toBeGreaterThanOrEqual(4);
    for (const builder of variants) {
      const mesh = builder(TONES);
      expect(mesh.maxY - mesh.minY).toBeCloseTo(1, 5);
      expect(mesh.radius).toBeLessThanOrEqual(0.62);
      expect(mesh.triangles).toBeLessThanOrEqual(600);
      expect(Array.from(builder(TONES).positions)).toEqual(Array.from(mesh.positions));
    }
  });

  it("conifer tiers stack: the crown is widest low and narrows to the top", () => {
    const mesh = conifer({ tiers: 5, width: 0.4, droop: 0.28, trunk: 0.08, seed: 9 })(TONES);
    const widthAt = (lo: number, hi: number) => {
      let r = 0;
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        const y = mesh.positions[i * 3 + 1]!;
        if (y >= lo && y < hi) r = Math.max(r, Math.hypot(mesh.positions[i * 3]!, mesh.positions[i * 3 + 2]!));
      }
      return r;
    };
    expect(widthAt(0.1, 0.4)).toBeGreaterThan(widthAt(0.5, 0.8));
    expect(widthAt(0.5, 0.8)).toBeGreaterThan(widthAt(0.9, 1.01));
  });

  it("broadleaf canopies cycle their crown tones and stay within a tree footprint", () => {
    const plain = defaultBroadleafVariants();
    const autumn = defaultBroadleafVariants([["crimson", "crimson"]]);
    expect(plain.length).toBeGreaterThanOrEqual(4);
    for (const [i, builder] of plain.entries()) {
      const a = builder(TONES);
      const b = autumn[i]!(TONES);
      expect(a.maxY - a.minY).toBeCloseTo(1, 5);
      expect(a.radius).toBeLessThanOrEqual(0.62);
      expect(b.positions).toEqual(a.positions);
      expect(b.colors).not.toEqual(a.colors);
    }
  });
});
