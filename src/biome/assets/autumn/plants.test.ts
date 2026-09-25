import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUTUMN_ART } from "../biomes/autumn.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";
import { acorns, autumnShrub, bracken, leafScatter, mushrooms } from "./plants.js";

const tones = AUTUMN_ART.tones;
const colorAt = (m: UnitMesh, i: number) => new THREE.Color(m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!);
const hueDeg = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }).h * 360;

describe("autumn undergrowth", () => {
  it("shrubs rest on the ground: the lowest canopy vertex is at the base", () => {
    const shrub = autumnShrub({ ramp: "foliage", leaves: 12, seed: 1, clumps: [{ c: [0, 0.3, 0], r: 0.2 }, { c: [0.1, 0.5, 0], r: 0.15 }] })(tones);
    let lowCanopy = Infinity;
    for (let i = 0; i < shrub.positions.length / 3; i += 1) {
      const c = colorAt(shrub, i);
      // Canopy vertices are foliage-coloured (orange: r clearly above b).
      if (c.r > c.b * 2) lowCanopy = Math.min(lowCanopy, shrub.positions[i * 3 + 1]!);
    }
    expect(lowCanopy).toBeLessThan(0.05);
  });

  it("bracken fronds stand up instead of sprawling (hero radius within the dry-plant class)", () => {
    for (const build of AUTUMN_ART.families.fern!.variants) {
      const m = variantMesh(tones, build);
      expect(m.radius).toBeLessThanOrEqual(0.748);
      expect(m.maxY - m.minY).toBeCloseTo(1, 5);
    }
    const sprawl = bracken({ fronds: 5, length: 1, rise: 0.4, droop: 0.5, ramp: "foliage", seed: 1 })(tones);
    const upright = bracken({ fronds: 5, length: 1, rise: 1.3, droop: 0.5, ramp: "foliage", seed: 1 })(tones);
    expect(upright.radius).toBeLessThan(sprawl.radius * 0.5);
  });

  it("toadstools have pale stems, cap-coloured tops and darker gills underneath", () => {
    const m = mushrooms({ ramp: "capRed", seed: 3, caps: [{ at: [0, 0], h: 0.5, r: 0.2 }] })(tones);
    let top = new THREE.Color(0, 0, 0);
    let under = new THREE.Color(0, 0, 0);
    let topN = 0;
    let underN = 0;
    for (let i = 0; i < m.positions.length / 3; i += 1) {
      const ny = m.normals[i * 3 + 1]!;
      if (m.positions[i * 3 + 1]! < 0.6) continue;
      if (ny > 0.7) {
        top.add(colorAt(m, i));
        topN += 1;
      } else if (ny < -0.6) {
        under.add(colorAt(m, i));
        underN += 1;
      }
    }
    top = top.multiplyScalar(1 / topN);
    under = under.multiplyScalar(1 / underN);
    expect(hueDeg(top)).toBeLessThan(30); // red-orange cap
    expect(under.r + under.g + under.b).toBeLessThan(top.r + top.g + top.b + 0.5);
    expect(under.r).toBeLessThan(top.r);
  });

  it("no dressing colour shares the collectible's hue", () => {
    const collectible = new THREE.Color("#3fc9d6").getHSL({ h: 0, s: 0, l: 0 }).h * 360;
    for (const name of ["capRed", "capBrown", "capPale", "berry", "acorn", "foliage", "foliageAlt", "rust", "olive"]) {
      const c = new THREE.Color(tones[name]!.base);
      const gap = Math.abs(hueDeg(c) - collectible) % 360;
      expect(Math.min(gap, 360 - gap), name).toBeGreaterThanOrEqual(30);
    }
  });

  it("floor dressing lies flat and low", () => {
    for (const mesh of [acorns({ count: 3, seed: 1 })(tones), leafScatter({ count: 6, seed: 2, ramps: ["foliage", "rust"] })(tones)]) {
      expect(mesh.maxY - mesh.minY).toBeLessThan(0.4);
    }
  });

  it("every autumn composition kind has at least two presets (variety of groupings)", () => {
    for (const kind of ["palm", "shrub", "dry-plant", "rock", "wood"] as const) {
      expect(AUTUMN_ART.compositions[kind]?.length ?? 0, kind).toBeGreaterThanOrEqual(2);
    }
  });
});
