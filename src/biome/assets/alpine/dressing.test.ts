import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getBiomeDefinition } from "../../presets.js";
import { PROP_UNIT_RADIUS } from "../../render/propGeometry.js";
import { ALPINE_ART } from "../biomes/alpine.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";

const tones = ALPINE_ART.tones;
const family = (id: string) => ALPINE_ART.families[id]!.variants.map((builder) => variantMesh(tones, builder));
const snowDark = new THREE.Color(tones.snow!.dark);
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/**
 * Snow vs needles/bark/stone: shaded snow (incl. contact AO at a mound's foot)
 * stays above half the shaded-snow luminance; needles and bark sit far below.
 */
const isSnow = (m: UnitMesh, i: number) => lum(m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!) >= 0.5 * lum(snowDark.r, snowDark.g, snowDark.b);
const hue = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).h * 360;
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));

describe("alpine shrubs", () => {
  const shrubs = family("dwarf-pine");

  it("offers five shrubs (bush minimum) inside the shrub footprint", () => {
    expect(shrubs.length).toBeGreaterThanOrEqual(5);
    for (const mesh of shrubs) expect(mesh.radius).toBeLessThanOrEqual(PROP_UNIT_RADIUS.shrub);
  });

  it("buried shrubs are snow mounds with dark needles or twigs breaking through the top", () => {
    for (const mesh of shrubs.slice(3)) {
      let darkTop = 0;
      let low = 0;
      let lowSnow = 0;
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        const y = mesh.positions[i * 3 + 1]!;
        if (!isSnow(mesh, i)) darkTop = Math.max(darkTop, y);
        // The mound's outer skirt near the ground.
        if (y < 0.15 && Math.hypot(mesh.positions[i * 3]!, mesh.positions[i * 3 + 2]!) > mesh.radius * 0.5) {
          low += 1;
          if (isSnow(mesh, i)) lowSnow += 1;
        }
      }
      expect(darkTop, "needles or twigs rise well above the snow mound").toBeGreaterThan(0.6);
      expect(lowSnow / low, "the base is a snow mound").toBeGreaterThan(0.8);
    }
  });

  it("dwarf pines carry snow on their sprigs and spread wider when they sprawl", () => {
    const [upright, sprawling, compact] = shrubs as [UnitMesh, UnitMesh, UnitMesh];
    for (const mesh of [upright, sprawling, compact]) {
      let snow = 0;
      for (let i = 0; i < mesh.positions.length / 3; i += 1) if (isSnow(mesh, i)) snow += 1;
      expect(snow / (mesh.positions.length / 3)).toBeGreaterThan(0.15);
    }
    expect(sprawling.radius).toBeGreaterThan(compact.radius * 1.3);
  });
});

describe("alpine trail markers", () => {
  const markers = family("marker");

  it("stay inside the narrow wood footprint", () => {
    expect(markers.length).toBeGreaterThanOrEqual(4);
    for (const mesh of markers) expect(mesh.radius).toBeLessThanOrEqual(PROP_UNIT_RADIUS.wood * 1.1);
  });

  it("cairns taper: each band of the stack is no wider than the one below", () => {
    for (const mesh of markers.slice(0, 2)) {
      const bands = 4;
      const width = new Array<number>(bands).fill(0);
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        const b = Math.min(bands - 1, Math.max(0, Math.floor(mesh.positions[i * 3 + 1]! * bands)));
        width[b] = Math.max(width[b]!, Math.hypot(mesh.positions[i * 3]!, mesh.positions[i * 3 + 2]!));
      }
      expect(width[3]!).toBeLessThan(width[0]!);
    }
  });

  it("the painted bands are red, well away from the collectible's hue", () => {
    const collectible = hue(new THREE.Color(getBiomeDefinition("alpine").mission.collectibleColor));
    for (const hex of [tones.paint!.base, tones.paint!.light]) {
      expect(hueGap(hue(new THREE.Color(hex)), collectible)).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("alpine ground dressing", () => {
  it("snow drifts are low, all-snow crescents", () => {
    for (const mesh of family("drift")) {
      expect(mesh.maxY - mesh.minY).toBeLessThan(0.2);
      for (let i = 0; i < mesh.positions.length / 3; i += 1) expect(isSnow(mesh, i)).toBe(true);
    }
  });

  it("wintry: no flowers, grass is dry straw", () => {
    expect(Object.keys(ALPINE_ART.families).some((id) => id.includes("flower"))).toBe(false);
    const straw = new THREE.Color(tones.dry.base).getHSL({ h: 0, s: 0, l: 0 });
    expect(straw.s).toBeLessThan(0.4);
  });

  it("negative space: clusters stay small (≤ 5 members) and most presets carry at most one piece of snow dressing", () => {
    expect(ALPINE_ART.budgets.membersPerCluster.standard).toBeLessThanOrEqual(5);
    for (const presets of Object.values(ALPINE_ART.compositions)) {
      for (const { preset } of presets ?? []) {
        const drifts = preset.members.filter((m) => m.family === "drift").reduce((n, m) => n + m.count[1], 0);
        expect(drifts).toBeLessThanOrEqual(1);
      }
    }
  });
});
