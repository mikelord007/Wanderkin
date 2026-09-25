import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUTUMN_ART } from "../biomes/autumn.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";
import { WOODLAND_ROCK_SHAPES as S, woodlandRock } from "./rocks.js";
import { AUTUMN_WALL } from "./wall.js";
import { TROPICAL_WALL } from "../tropical/wall.js";
import { mossyLog, stump } from "./wood.js";

const tones = AUTUMN_ART.tones;
const mossy = (c: THREE.Color) => c.g > c.b * 1.3 && c.g > c.r * 0.98;
const colorAt = (m: UnitMesh, i: number) => new THREE.Color(m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!);
const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe("autumn woodland rocks", () => {
  it("moss caps sit on up-facing facets, and bare rock stays grey", () => {
    const bare = woodlandRock({ bodies: [{ shape: S.dome }] })(tones);
    const capped = woodlandRock({ moss: 0.6, bodies: [{ shape: S.dome }] })(tones);
    let mossCount = 0;
    for (let i = 0; i < bare.colors.length / 3; i += 1) expect(mossy(colorAt(bare, i))).toBe(false);
    for (let i = 0; i < capped.colors.length / 3; i += 1) {
      if (!mossy(colorAt(capped, i))) continue;
      mossCount += 1;
      expect(capped.normals[i * 3 + 1]!).toBeGreaterThan(0.1);
    }
    expect(mossCount).toBeGreaterThan(0);
  });

  it("lichen is decided per facet: every vertex of a face agrees", () => {
    const mesh = woodlandRock({ lichen: 0.5, bodies: [{ shape: S.crag }] })(tones);
    for (let f = 0; f < mesh.index.length; f += 3) {
      const [a, b, c] = [mesh.index[f]!, mesh.index[f + 1]!, mesh.index[f + 2]!];
      const ny = mesh.normals[a * 3 + 1]!;
      // Faces away from the ground AO band share one colour decision.
      if (mesh.positions[a * 3 + 1]! > 0.25 && mesh.positions[b * 3 + 1]! > 0.25 && mesh.positions[c * 3 + 1]! > 0.25 && ny > 0 && ny < 0.7) {
        const pale = [a, b, c].map((v) => colorAt(mesh, v).getHSL({ h: 0, s: 0, l: 0 }).s < 0.2 ? 0 : 1);
        expect(new Set(pale).size).toBe(1);
      }
    }
  });

  it("hero rocks cover mossy boulders, a split boulder, a tor and lichen crags (8+ rock variants)", () => {
    const rockVariants = Object.values(AUTUMN_ART.families).filter((f) => f.category === "rock").reduce((n, f) => n + f.variants.length, 0);
    expect(rockVariants).toBeGreaterThanOrEqual(8);
    expect(AUTUMN_ART.families["rock-mossy"]!.variants.length).toBeGreaterThanOrEqual(4);
    expect(AUTUMN_ART.families["rock-lichen"]!.variants.length).toBeGreaterThanOrEqual(2);
  });
});

describe("autumn deadwood", () => {
  it("logs lie low; snags stand tall and narrow", () => {
    for (const build of AUTUMN_ART.families.log!.variants) {
      const m = variantMesh(tones, build);
      expect(m.maxY - m.minY).toBeLessThan(0.35);
    }
    for (const build of AUTUMN_ART.families.snag!.variants) {
      const m = variantMesh(tones, build);
      expect(m.maxY - m.minY).toBeCloseTo(1, 5);
      expect(m.radius).toBeLessThan(0.38);
    }
  });

  it("cut ends show pale heartwood lighter than the bark", () => {
    const log = mossyLog({ seed: 1 })(tones);
    const cut = stump({ seed: 2, height: 1.5 })(tones);
    for (const mesh of [log, cut]) {
      let max = 0;
      for (let i = 0; i < mesh.colors.length / 3; i += 1) max = Math.max(max, colorAt(mesh, i).r);
      // Heartwood light (#d8b88c) is far brighter than any bark tone.
      expect(max).toBeGreaterThan(new THREE.Color(tones.trunk.light).r * 1.2);
    }
  });

  it("is deterministic", () => {
    const a = stump({ seed: 7, height: 5, broken: true, fungi: 2, fit: "height" })(tones);
    const b = stump({ seed: 7, height: 5, broken: true, fungi: 2, fit: "height" })(tones);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});

describe("autumn timber shells", () => {
  it("is the art's wall style", () => {
    expect(AUTUMN_ART.wall).toBe(AUTUMN_WALL);
  });

  it("heavy beams band strongly and read darker and richer than tropical planks", () => {
    const { side, top } = AUTUMN_WALL;
    expect(luminance(side.light) / luminance(side.dark)).toBeGreaterThan(4);
    expect(luminance(top.base)).toBeGreaterThan(luminance(side.base));
    expect(luminance(AUTUMN_WALL.rim)).toBeGreaterThan(luminance(top.light));
    expect(luminance(AUTUMN_WALL.recess)).toBeLessThan(luminance(side.dark));
    // Enough courses and beam ends that tall steps never show a flat face.
    expect(AUTUMN_WALL.strata[0]).toBeGreaterThanOrEqual(5);
    expect(AUTUMN_WALL.joints![0]).toBeGreaterThanOrEqual(5);
    // A darker, redder wood than Tropical's sun-bleached planks.
    expect(luminance(side.base)).toBeLessThan(luminance(TROPICAL_WALL.side.base));
    const hsl = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });
    expect(hsl(side.base).s).toBeGreaterThan(hsl(TROPICAL_WALL.side.base).s);
  });
});
