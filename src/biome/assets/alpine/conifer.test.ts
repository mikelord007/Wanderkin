import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ALPINE_ART } from "../biomes/alpine.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";
import { alpineConiferVariants } from "./conifer.js";

const tones = ALPINE_ART.tones;
const heroes = ALPINE_ART.families.conifer!.variants.map((builder) => variantMesh(tones, builder));
const young = ALPINE_ART.families["young-conifer"]!.variants.map((builder) => variantMesh(tones, builder));
const snowBase = new THREE.Color(tones.snow!.dark);

const luma = (m: UnitMesh, i: number) => 0.2126 * m.colors[i * 3]! + 0.7152 * m.colors[i * 3 + 1]! + 0.0722 * m.colors[i * 3 + 2]!;
/** Snow = at least as bright as the shaded-snow tone (needles and bark are far darker). */
const isSnow = (m: UnitMesh, i: number) => luma(m, i) >= 0.9 * (0.2126 * snowBase.r + 0.7152 * snowBase.g + 0.0722 * snowBase.b);

/** Widest vertex per height band. */
function profile(mesh: UnitMesh, bands: number) {
  const width = new Array<number>(bands).fill(0);
  for (let i = 0; i < mesh.positions.length / 3; i += 1) {
    const b = Math.min(bands - 1, Math.max(0, Math.floor(mesh.positions[i * 3 + 1]! * bands)));
    width[b] = Math.max(width[b]!, Math.hypot(mesh.positions[i * 3]!, mesh.positions[i * 3 + 2]!));
  }
  return width;
}

describe("alpine conifers", () => {
  it("offers five hero designs and three young trees, within the tree footprint and budget", () => {
    expect(heroes).toHaveLength(5);
    expect(young.length).toBeGreaterThanOrEqual(3);
    for (const mesh of [...heroes, ...young]) {
      expect(mesh.maxY - mesh.minY).toBeCloseTo(1, 5);
      expect(mesh.radius).toBeLessThanOrEqual(0.62);
      expect(mesh.triangles).toBeLessThanOrEqual(900);
    }
  });

  it("carries snow on the upper faces of its tiers, never on undersides", () => {
    for (const mesh of heroes) {
      let snowUp = 0;
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        const ny = mesh.normals[i * 3 + 1]!;
        if (isSnow(mesh, i)) expect(ny, "snow faces up or out, never down").toBeGreaterThan(-0.2);
        if (ny > 0.3 && isSnow(mesh, i)) snowUp += 1;
      }
      // A real share of the up-facing surface is snow, not a dusting.
      expect(snowUp / (mesh.positions.length / 3)).toBeGreaterThan(0.12);
    }
  });

  it("green branch tips hang out below every snow pad", () => {
    for (const mesh of heroes) {
      // For every snow vertex, a needle vertex sits further out and lower
      // around the same bearing: the pad rests ON the branches.
      const n = mesh.positions.length / 3;
      const needles: { a: number; r: number; y: number }[] = [];
      const pads: { a: number; r: number; y: number }[] = [];
      for (let i = 0; i < n; i += 1) {
        const x = mesh.positions[i * 3]!;
        const z = mesh.positions[i * 3 + 2]!;
        const v = { a: Math.atan2(z, x), r: Math.hypot(x, z), y: mesh.positions[i * 3 + 1]! };
        if (v.y < 0.05) continue;
        (isSnow(mesh, i) ? pads : needles).push(v);
      }
      const covered = pads.filter((p) => p.r < 0.03 || needles.some((q) => {
        const d = Math.abs(((q.a - p.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        return d < 0.4 && q.r > p.r && q.y < p.y;
      }));
      expect(covered.length / pads.length).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("reads as stacked tiers: the silhouette steps in and out, widest low, narrow at the top", () => {
    for (const mesh of heroes) {
      const width = profile(mesh, 20);
      let steps = 0;
      for (let b = 1; b < width.length; b += 1) if (width[b]! > width[b - 1]! * 1.08) steps += 1;
      expect(steps, "tier ledges").toBeGreaterThanOrEqual(2);
      expect(Math.max(...width.slice(2, 8))).toBeGreaterThan(Math.max(...width.slice(16)) * 1.8);
    }
  });

  it("the designs differ: a squat fir, an airy larch, a wind-bent pine and a veteran with a bare top", () => {
    const [spruce, fir, windBent, larch, veteran] = heroes as [UnitMesh, UnitMesh, UnitMesh, UnitMesh, UnitMesh];
    expect(fir.radius).toBeGreaterThan(spruce.radius * 1.2);
    expect(larch.radius).toBeLessThan(spruce.radius);
    // Wind-bent: far more crown downwind (+x) of the trunk root than upwind.
    let root = 0;
    let rootCount = 0;
    for (let i = 0; i < windBent.positions.length / 3; i += 1) {
      if (windBent.positions[i * 3 + 1]! < 0.01) {
        root += windBent.positions[i * 3]!;
        rootCount += 1;
      }
    }
    root /= rootCount;
    let plus = 0;
    let minus = 0;
    for (let i = 0; i < windBent.positions.length / 3; i += 1) {
      if (windBent.positions[i * 3 + 1]! < 0.3) continue;
      plus = Math.max(plus, windBent.positions[i * 3]! - root);
      minus = Math.max(minus, root - windBent.positions[i * 3]!);
    }
    expect(plus).toBeGreaterThan(minus * 1.3);
    // Veteran: its topmost point is bare weathered wood, not snow or needles.
    let top = 0;
    for (let i = 1; i < veteran.positions.length / 3; i += 1) if (veteran.positions[i * 3 + 1]! > veteran.positions[top * 3 + 1]!) top = i;
    const c = new THREE.Color(veteran.colors[top * 3]!, veteran.colors[top * 3 + 1]!, veteran.colors[top * 3 + 2]!);
    const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
    expect(hsl.s).toBeLessThan(0.35);
    expect(isSnow(veteran, top)).toBe(false);
  });

  it("is deterministic", () => {
    const again = alpineConiferVariants().map((builder) => builder(tones));
    for (const [i, mesh] of again.entries()) {
      expect(Array.from(mesh.positions)).toEqual(Array.from(heroes[i]!.positions));
      expect(Array.from(mesh.colors)).toEqual(Array.from(heroes[i]!.colors));
    }
  });
});
