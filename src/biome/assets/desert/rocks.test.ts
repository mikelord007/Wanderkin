import { describe, expect, it } from "vitest";
import { DESERT_ART } from "../biomes/desert.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";

function bandStats(mesh: UnitMesh, bands: number) {
  const width = new Array(bands).fill(0);
  const luma = new Array(bands).fill(0);
  const count = new Array(bands).fill(0);
  for (let i = 0; i < mesh.positions.length / 3; i += 1) {
    const y = mesh.positions[i * 3 + 1]!;
    const b = Math.min(bands - 1, Math.max(0, Math.floor(((y - mesh.minY) / (mesh.maxY - mesh.minY)) * bands)));
    width[b] = Math.max(width[b], Math.hypot(mesh.positions[i * 3]!, mesh.positions[i * 3 + 2]!));
    luma[b] += 0.2126 * mesh.colors[i * 3]! + 0.7152 * mesh.colors[i * 3 + 1]! + 0.0722 * mesh.colors[i * 3 + 2]!;
    count[b] += 1;
  }
  return { width, luma: luma.map((l, b) => (count[b] ? l / count[b] : 0)) };
}

describe("desert rocks", () => {
  const hero = DESERT_ART.families["rock-large"]!.variants.map((builder) => variantMesh(DESERT_ART.tones, builder));

  it("sandstone reads in layers: tone alternates up the boulder, not just darker at the base", () => {
    const { luma } = bandStats(hero[0]!, 6);
    let flips = 0;
    for (let b = 2; b < luma.length; b += 1) if (Math.sign(luma[b]! - luma[b - 1]!) !== Math.sign(luma[b - 1]! - luma[b - 2]!)) flips += 1;
    expect(flips).toBeGreaterThanOrEqual(1);
  });

  it("the cap-rock hoodoo is wider at its cap than at its pillar", () => {
    const { width } = bandStats(hero[1]!, 5);
    expect(width[4]!).toBeGreaterThan(width[1]! * 1.3);
  });

  it("offers boulder, hoodoo, mesa stack and angular families plus supporting and dressing stones", () => {
    expect(hero).toHaveLength(4);
    expect(DESERT_ART.families["rock-medium"]!.variants.length).toBeGreaterThanOrEqual(4);
    expect(DESERT_ART.families.pebble!.variants.length).toBeGreaterThanOrEqual(3);
  });
});
