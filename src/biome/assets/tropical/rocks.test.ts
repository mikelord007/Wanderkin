import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TROPICAL_ART } from "../biomes/tropical.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";
import { fallenCoconuts, TROPICAL_ROCK_SHAPES as S, tropicalRock } from "./rocks.js";

const tones = TROPICAL_ART.tones;

function meanLuminance(mesh: UnitMesh): number {
  let sum = 0;
  for (let i = 0; i < mesh.colors.length; i += 3) sum += 0.2126 * mesh.colors[i]! + 0.7152 * mesh.colors[i + 1]! + 0.0722 * mesh.colors[i + 2]!;
  return sum / (mesh.colors.length / 3);
}

function greenish(mesh: UnitMesh): number {
  let n = 0;
  for (let i = 0; i < mesh.colors.length; i += 3) {
    const c = new THREE.Color(mesh.colors[i]!, mesh.colors[i + 1]!, mesh.colors[i + 2]!);
    if (c.g > c.r * 1.25 && c.g > c.b * 1.25) n += 1;
  }
  return n;
}

describe("tropical rocks", () => {
  it("round and coastal families read differently: pale versus dark", () => {
    const round = TROPICAL_ART.families["rock-round"]!.variants.map((v) => meanLuminance(variantMesh(tones, v)));
    const coastal = TROPICAL_ART.families["rock-coastal"]!.variants.map((v) => meanLuminance(variantMesh(tones, v)));
    expect(Math.min(...round)).toBeGreaterThan(Math.max(...coastal) * 1.5);
  });

  it("moss sits only on up-facing facets high on the body", () => {
    const mossy = tropicalRock({ moss: 0.8, bodies: [{ shape: S.dome }] })(tones);
    const bare = tropicalRock({ bodies: [{ shape: S.dome }] })(tones);
    expect(greenish(bare)).toBe(0);
    expect(greenish(mossy)).toBeGreaterThan(0);
    for (let i = 0; i < mossy.colors.length; i += 3) {
      const c = new THREE.Color(mossy.colors[i]!, mossy.colors[i + 1]!, mossy.colors[i + 2]!);
      if (c.g > c.r * 1.25 && c.g > c.b * 1.25) {
        expect(mossy.normals[i + 1]!).toBeGreaterThan(0.8);
        expect(mossy.positions[i + 1]!).toBeGreaterThan(0.3);
      }
    }
  });

  it("tilted slabs rest on a flat footing instead of an edge", () => {
    const mesh = tropicalRock({ ramp: "rockDark", bodies: [{ shape: S.slab, tilt: [0.1, 0.6] }] })(tones);
    let atBase = 0;
    for (let i = 1; i < mesh.positions.length; i += 3) if (mesh.positions[i]! < mesh.minY + 1e-4) atBase += 1;
    // A flat footing has many vertices on the lowest plane, not one or two.
    expect(atBase).toBeGreaterThanOrEqual(9);
  });

  it("is deterministic, and coconuts lie low", () => {
    const build = tropicalRock({ bodies: [{ shape: S.crag }, { shape: S.chip, at: [0.4, 0.2], size: 0.2 }] });
    expect(Array.from(build(tones).positions)).toEqual(Array.from(build(tones).positions));
    const nuts = fallenCoconuts({ count: 3, seed: 1 })(tones);
    expect(nuts.maxY - nuts.minY).toBeLessThan(0.45);
  });
});
