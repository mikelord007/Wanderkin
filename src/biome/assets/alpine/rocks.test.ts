import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ALPINE_ART } from "../biomes/alpine.js";
import { variantMesh } from "../compose.js";
import { hull } from "../shapes.js";
import type { UnitMesh } from "../types.js";
import { alpineRocks, snowPillow } from "./rocks.js";

const tones = ALPINE_ART.tones;
const family = (id: string) => ALPINE_ART.families[id]!.variants.map((builder) => variantMesh(tones, builder));
const hero = family("rock-large");
const snowDark = new THREE.Color(tones.snow!.dark);
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const isSnow = (m: UnitMesh, i: number) => lum(m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!) >= 0.85 * lum(snowDark.r, snowDark.g, snowDark.b);

/** Share of the surface AREA that is snow. */
function snowShare(mesh: UnitMesh) {
  const p = (i: number) => new THREE.Vector3(mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!);
  let snow = 0;
  let all = 0;
  for (let k = 0; k < mesh.index.length; k += 3) {
    const [a, b, c] = [mesh.index[k]!, mesh.index[k + 1]!, mesh.index[k + 2]!];
    const area = new THREE.Vector3().subVectors(p(b), p(a)).cross(new THREE.Vector3().subVectors(p(c), p(a))).length() / 2;
    all += area;
    if (isSnow(mesh, a)) snow += area;
  }
  return snow / all;
}

describe("snow pillow", () => {
  const body = () => hull({ scale: [0.8, 0.8, 0.7], detail: 1, jitter: 0.08, seed: 5, floor: -0.4, cuts: [{ normal: [0.1, 1, 0], offset: 0.7 }] });

  it("lifts the up-facing faces into a pad with an edge wall, dropping the rock faces it covers", () => {
    const reference = body();
    const refTop = Math.max(...Array.from({ length: reference.getAttribute("position").count }, (_, i) => reference.getAttribute("position").getY(i)));
    const faces = reference.index!.count / 3;
    reference.dispose();
    const { rock, snow } = snowPillow(body(), { threshold: 0.55, depth: 0.08, overhang: 0.03 });
    const rockTris = rock.getAttribute("position").count / 3;
    const snowTris = snow.getAttribute("position").count / 3;
    expect(rockTris).toBeLessThan(faces);
    expect(snowTris).toBeGreaterThan(faces - rockTris); // top faces + edge walls
    const snowTop = Math.max(...Array.from({ length: snow.getAttribute("position").count }, (_, i) => snow.getAttribute("position").getY(i)));
    expect(snowTop).toBeCloseTo(refTop + 0.08, 5);
  });
});

describe("alpine rocks", () => {
  it("offers five hero families, four supporting rocks and three stones (≥ 8 rock variants)", () => {
    const set = alpineRocks();
    expect(set.hero).toHaveLength(5);
    expect(set.supporting).toHaveLength(4);
    expect(set.dressing).toHaveLength(3);
    for (const mesh of hero) {
      expect(mesh.maxY - mesh.minY).toBeCloseTo(1, 5);
      expect(mesh.radius).toBeLessThanOrEqual(0.9);
    }
  });

  it("heroes wear snow caps with bare dark stone below; small stones stay bare", () => {
    for (const mesh of hero) {
      const share = snowShare(mesh);
      expect(share).toBeGreaterThan(0.12);
      expect(share).toBeLessThan(0.6);
      // The rock meets the ground mostly bare (small companion stones may be capped).
      let low = 0;
      let lowSnow = 0;
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        if (mesh.positions[i * 3 + 1]! >= 0.05) continue;
        low += 1;
        if (isSnow(mesh, i)) lowSnow += 1;
      }
      expect(lowSnow / Math.max(1, low)).toBeLessThan(0.35);
    }
    for (const mesh of family("pebble")) expect(snowShare(mesh)).toBe(0);
  });

  it("the rounded boulder carries the heaviest cap; the crag only snowy ledges", () => {
    const [crag, round] = hero as [UnitMesh, UnitMesh];
    expect(snowShare(round)).toBeGreaterThan(snowShare(crag) * 1.8);
  });

  it("layered slate steps: snow sits on several separate slab tops at rising heights", () => {
    const slate = hero[2]!;
    const levels = new Set<number>();
    for (let i = 0; i < slate.positions.length / 3; i += 1) {
      if (isSnow(slate, i) && slate.normals[i * 3 + 1]! > 0.8) levels.add(Math.round(slate.positions[i * 3 + 1]! * 8));
    }
    expect(levels.size).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic", () => {
    const again = alpineRocks().hero.map((builder) => builder(tones));
    for (const [i, mesh] of again.entries()) expect(Array.from(mesh.colors)).toEqual(Array.from(hero[i]!.colors));
  });
});
