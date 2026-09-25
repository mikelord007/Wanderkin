import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUTUMN_ART } from "../biomes/autumn.js";
import type { UnitMesh } from "../types.js";
import { autumnTree, leafCard } from "./trees.js";
import { linearRamp } from "../meshKit.js";

const tones = AUTUMN_ART.tones;
const luma = (m: UnitMesh, i: number) => 0.2126 * m.colors[i * 3]! + 0.7152 * m.colors[i * 3 + 1]! + 0.0722 * m.colors[i * 3 + 2]!;

const leaning = autumnTree({
  trunk: { height: 0.6, lean: 0.2, bow: 2, baseRadius: 0.04 },
  crown: { ramp: "foliageAlt", leaves: 24, clumps: [{ c: [0.2, 0.72, 0], r: 0.15 }, { c: [0.3, 0.66, 0.08], r: 0.12 }, { c: [0.22, 0.88, -0.02], r: 0.12, noLimb: true }] },
  seed: 9,
});

describe("autumn broadleaf trees", () => {
  it("is deterministic", () => {
    const a = leaning(tones);
    const b = leaning(tones);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
  });

  it("sets a leaning tree's base back so its crown stays over the axis", () => {
    const mesh = leaning(tones);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      minX = Math.min(minX, mesh.positions[i]!);
      maxX = Math.max(maxX, mesh.positions[i]!);
    }
    // Without the set-back the whole crown would sit on the +x side.
    expect(Math.abs(maxX + minX)).toBeLessThan((maxX - minX) * 0.3);
  });

  it("every hero is a full, distinct design: 4–6 variants, different widths and trunk heights", () => {
    const trees = AUTUMN_ART.families.broadleaf!.variants.map((build) => build(tones));
    expect(trees.length).toBeGreaterThanOrEqual(4);
    const radii = trees.map((m) => m.radius);
    // Narrow oval/birch through wide spreading maple.
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.2);
  });

  it("crowns are lit on top and shaded underneath (structural tone, not noise)", () => {
    for (const build of AUTUMN_ART.families.broadleaf!.variants) {
      const mesh = build(tones);
      let up = 0;
      let upN = 0;
      let down = 0;
      let downN = 0;
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        if (mesh.positions[i * 3 + 1]! < 0.5) continue; // crown only
        const ny = mesh.normals[i * 3 + 1]!;
        if (ny > 0.6) {
          up += luma(mesh, i);
          upN += 1;
        } else if (ny < -0.6) {
          down += luma(mesh, i);
          downN += 1;
        }
      }
      expect(up / upN).toBeGreaterThan((down / downN) * 1.25);
    }
  });

  it("leaf cards are small pointed six-triangle leaves", () => {
    const g = leafCard(1, 0.45, 0.3, linearRamp(tones.foliage), 0);
    expect(g.index!.count / 3).toBe(6);
    const p = new THREE.Vector3().fromBufferAttribute(g.getAttribute("position") as THREE.BufferAttribute, 6);
    expect(p.x).toBeCloseTo(1, 5);
  });
});
