import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TROPICAL_ART } from "../biomes/tropical.js";
import { linearRamp } from "../meshKit.js";
import { fallenPalmFrond, frondGeometry, palmSprout, tropicalPalm } from "./palm.js";

const tones = TROPICAL_ART.tones;
const frond = (leaflets: number) =>
  frondGeometry({ length: 1, rise: 0.5, droop: 1, leaflets, leafletLength: 0.35, hang: 0.4, ramp: linearRamp(tones.foliage), rachis: new THREE.Color("#ccdd88") });

describe("tropical palm builders", () => {
  it("builds fronds from separate leaflet pairs on a rachis", () => {
    const { rachis, leaves } = frond(7);
    // Two leaflets per station, two triangles per leaflet.
    expect(leaves.index!.count / 3).toBe(7 * 2 * 2);
    // Rachis ribbon: one quad between consecutive stations (petiole, 7 leaflets, tip).
    expect(rachis.index!.count / 3).toBe((7 + 1) * 2);
    // The ribbon faces up so a single side is enough.
    const normal = rachis.getAttribute("normal");
    for (let i = 0; i < normal.count; i += 1) expect(normal.getY(i)).toBeGreaterThan(0);
  });

  it("leaflets hang below the rachis and sweep toward the tip", () => {
    const { leaves } = frond(6);
    const p = leaves.getAttribute("position");
    // Every leaflet is (base, edge, edge, tip); its tip hangs below its base.
    // Before the rachis turns down, tips also point further out.
    for (let i = 0; i < p.count; i += 4) {
      expect(p.getY(i + 3)).toBeLessThan(p.getY(i));
      if (i < p.count / 2) expect(p.getX(i + 3)).toBeGreaterThan(p.getX(i));
    }
  });

  it("is deterministic", () => {
    const build = tropicalPalm({
      trunk: { height: 0.7, lean: 0.2, segments: 6, baseRadius: 0.05 },
      crown: { fronds: 5, lower: 2, young: 1, dry: 1, length: 0.45, leaflets: 6, rise: 0.6, droop: 1.1, coconuts: 2, seed: 5 },
    });
    const a = build(tones);
    const b = build(tones);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
  });

  it("sets a leaning palm's base back so its crown stays over the axis", () => {
    const mesh = tropicalPalm({
      trunk: { height: 0.72, lean: 0.3, segments: 6, baseRadius: 0.05 },
      crown: { fronds: 6, length: 0.4, leaflets: 6, rise: 0.6, droop: 1.1, seed: 9 },
    })(tones);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      minX = Math.min(minX, mesh.positions[i]!);
      maxX = Math.max(maxX, mesh.positions[i]!);
    }
    // Without the set-back the crown would sit ~0.8 of the spread off-axis.
    expect(Math.abs(maxX + minX)).toBeLessThan((maxX - minX) * 0.35);
  });

  it("the trunk is ring-segmented: radius steps at every joint", () => {
    const mesh = tropicalPalm({
      trunk: { height: 0.8, lean: 0, segments: 6, baseRadius: 0.05 },
      crown: { fronds: 3, length: 0.3, leaflets: 3, rise: 0.6, droop: 1, seed: 1 },
    })(tones);
    // Trunk vertices come first: 6 sides per ring, 2 rings per segment.
    const rings = 6 * 2 + 1;
    const radii = Array.from({ length: rings }, (_, r) => Math.hypot(mesh.positions[r * 6 * 3]!, mesh.positions[r * 6 * 3 + 2]!));
    for (let r = 2; r < rings - 1; r += 2) expect(radii[r - 1]!).toBeGreaterThan(radii[r]! * 1.1);
  });

  it("dressing variants lie flat and low", () => {
    for (const mesh of [fallenPalmFrond(1)(tones), fallenPalmFrond(2, true)(tones)]) {
      expect(mesh.maxY - mesh.minY).toBeLessThan(0.3);
    }
    const sprout = palmSprout({ fronds: 7, length: 0.5, rise: 0.8, droop: 1, leaflets: 5, seed: 1 })(tones);
    expect(sprout.maxY).toBeCloseTo(1, 5);
  });
});
