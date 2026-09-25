/**
 * Ember vegetation: silhouettes and where the red goes. Budgets, radii and
 * heights per family are covered by validate.test.ts.
 */
import { describe, expect, it } from "vitest";
import { EMBER_ART } from "../biomes/ember.js";
import type { UnitMesh } from "../types.js";
import { charredStump, emberBushes, emberFern, emberSnags, fireLily, snag, tussock } from "./plants.js";

const tones = EMBER_ART.tones;
const lum = (m: UnitMesh, i: number) => 0.2126 * m.colors[i * 3]! + 0.7152 * m.colors[i * 3 + 1]! + 0.0722 * m.colors[i * 3 + 2]!;
const meanLum = (m: UnitMesh) => {
  let s = 0;
  const n = m.colors.length / 3;
  for (let i = 0; i < n; i += 1) s += lum(m, i);
  return s / n;
};
/** Clearly red vertices (the accent / magma, not warm char). */
const redVertices = (m: UnitMesh) => {
  const out: number[] = [];
  for (let i = 0; i < m.colors.length / 3; i += 1) {
    const [r, g, b] = [m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!];
    if (r > 0.12 && r > g * 3 && r > b * 3) out.push(i);
  }
  return out;
};
const y = (m: UnitMesh, i: number) => m.positions[i * 3 + 1]!;
const reach = (m: UnitMesh, i: number) => Math.hypot(m.positions[i * 3]!, m.positions[i * 3 + 2]!);

describe("snags and stumps", () => {
  it("snags are tall dark silhouettes with limbs reaching out", () => {
    for (const builder of emberSnags()) {
      const mesh = builder(tones);
      expect(mesh.maxY - mesh.minY).toBeCloseTo(1, 5);
      // Limbs make the silhouette: well beyond a bare pole's width.
      expect(mesh.radius).toBeGreaterThan(0.2);
    }
    const charred = snag({ height: 1, radius: 0.08, lean: 0.1, seed: 9, branches: [{ at: 0.5, angle: 0, length: 0.3, rise: 1 }] })(tones);
    const bleached = snag({ height: 1, radius: 0.08, lean: 0.1, seed: 9, ramp: "ash", branches: [{ at: 0.5, angle: 0, length: 0.3, rise: 1 }] })(tones);
    expect(meanLum(charred)).toBeLessThan(0.05);
    expect(meanLum(bleached)).toBeGreaterThan(meanLum(charred) * 3);
  });

  it("smouldering glows only in the flutes at the foot", () => {
    const cold = snag({ height: 1, radius: 0.09, lean: 0.05, seed: 3, branches: [] })(tones);
    const hot = snag({ height: 1, radius: 0.09, lean: 0.05, seed: 3, smoulder: true, branches: [] })(tones);
    expect(redVertices(cold)).toHaveLength(0);
    const red = redVertices(hot);
    expect(red.length).toBeGreaterThan(0);
    for (const i of red) expect(y(hot, i)).toBeLessThan(0.16);
    expect(hot.positions).toEqual(cold.positions);
  });

  it("stumps have a splintered, uneven top", () => {
    const mesh = charredStump({ height: 0.7, radius: 0.1, seed: 11 })(tones);
    const tops: number[] = [];
    for (let i = 0; i < mesh.positions.length / 3; i += 1) if (y(mesh, i) > 0.6 && reach(mesh, i) > 0.02) tops.push(y(mesh, i));
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(0.12);
  });
});

describe("ash plants and accents", () => {
  it("offers at least five bush designs, all one unit tall", () => {
    const bushes = emberBushes().map((b) => b(tones));
    expect(bushes.length).toBeGreaterThanOrEqual(5);
    for (const mesh of bushes) expect(mesh.maxY - mesh.minY).toBeCloseTo(1, 5);
    // Distinct designs, not reseeds: triangle counts and radii differ.
    expect(new Set(bushes.map((m) => `${m.triangles}:${m.radius.toFixed(2)}`)).size).toBe(bushes.length);
  });

  it("tussocks stay grey: no red anywhere", () => {
    expect(redVertices(tussock({ blades: 14, length: 1, splay: 0.5, seed: 1 })(tones))).toHaveLength(0);
  });

  it("ember-fern red is confined to the outer frond tips", () => {
    const mesh = emberFern({ fronds: 7, seed: 6, rise: 1.2, droop: 0.32 })(tones);
    const red = redVertices(mesh);
    expect(red.length).toBeGreaterThan(0);
    // Red sits out on the fronds, never in the crown at the base.
    for (const i of red) expect(Math.hypot(reach(mesh, i), y(mesh, i))).toBeGreaterThan(0.45);
    expect(red.length / (mesh.colors.length / 3)).toBeLessThan(0.45);
  });

  it("fire-lily red is only the flowers, up on their stems", () => {
    const mesh = fireLily({ stems: 2, leaves: 6, seed: 1 })(tones);
    const red = redVertices(mesh);
    expect(red.length).toBeGreaterThan(0);
    for (const i of red) expect(y(mesh, i)).toBeGreaterThan(0.5);
  });

  it("is deterministic", () => {
    const a = emberSnags()[0]!(tones);
    const b = emberSnags()[0]!(tones);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
  });
});
