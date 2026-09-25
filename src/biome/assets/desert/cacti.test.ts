import { describe, expect, it } from "vitest";
import { DESERT_ART } from "../biomes/desert.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";

/** Horizontal extent in eight height bands: a coarse silhouette signature. */
function silhouette(mesh: UnitMesh): number[] {
  const bands = new Array(8).fill(0);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const y = mesh.positions[i + 1]!;
    const band = Math.min(7, Math.max(0, Math.floor(((y - mesh.minY) / (mesh.maxY - mesh.minY)) * 8)));
    bands[band] = Math.max(bands[band], Math.hypot(mesh.positions[i]!, mesh.positions[i + 2]!));
  }
  return bands;
}

describe("desert cacti", () => {
  const tall = DESERT_ART.families["cactus-tall"]!.variants.map((builder) => variantMesh(DESERT_ART.tones, builder));

  it("tall cacti have clearly different silhouettes (branching vs column vs cluster)", () => {
    const signatures = tall.map(silhouette);
    for (let a = 0; a < signatures.length; a += 1) {
      for (let b = a + 1; b < signatures.length; b += 1) {
        const difference = signatures[a]!.reduce((sum, value, i) => sum + Math.abs(value - signatures[b]![i]!), 0);
        expect(difference, `variants ${a} and ${b}`).toBeGreaterThan(0.08);
      }
    }
  });

  it("branching saguaros reach well beyond their trunk; the plain column does not", () => {
    const [twoArms, , threeArms, column] = tall;
    const trunkBand = (mesh: UnitMesh) => silhouette(mesh)[1]!;
    const widest = (mesh: UnitMesh) => Math.max(...silhouette(mesh));
    expect(widest(twoArms!)).toBeGreaterThan(trunkBand(twoArms!) * 1.6);
    expect(widest(threeArms!)).toBeGreaterThan(trunkBand(threeArms!) * 1.6);
    expect(widest(column!)).toBeLessThan(trunkBand(column!) * 1.3);
  });

  it("is deterministic", () => {
    const again = DESERT_ART.families["cactus-tall"]!.variants.map((builder) => builder(DESERT_ART.tones));
    expect(Array.from(again[0]!.positions)).toEqual(Array.from(tall[0]!.positions));
  });
});
