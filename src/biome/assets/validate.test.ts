/**
 * Art-direction guardrails every registered biome must pass. They encode the
 * global rules in ENVIRONMENT_ARCHITECTURE.md §1–§3 so parallel biome work
 * stays one coherent visual system.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BIOME_IDS, getBiomeDefinition } from "../presets.js";
import { PROP_UNIT_RADIUS } from "../render/propGeometry.js";
import type { BiomePropKind } from "../types.js";
import { registeredBiomeArt } from "./biomes/index.js";
import { variantMesh } from "./compose.js";
import { resolveBiomeLighting } from "./lighting.js";
import { MAX_CONTACT_OPACITY } from "../render/contactDecals.js";
import type { AssetCategory } from "./types.js";

/** Spec "Repetition reduction" minimums (per biome that uses the category). */
const MIN_VARIANTS: Partial<Record<AssetCategory, number>> = { tree: 4, bush: 5, rock: 8, cactus: 5 };
/** Categories each shipped biome must provide. */
const REQUIRED: Record<string, AssetCategory[]> = {
  tropical: ["tree", "bush", "rock"],
  desert: ["cactus", "rock", "bush"],
  alpine: ["tree", "bush", "rock"],
  autumn: ["tree", "bush", "rock"],
  ember: ["rock", "bush"],
  monsoon: ["tree", "bush", "rock"],
};
/** §3.5 layer caps on art triangles (a new biome may declare anything up to these). */
const TRIANGLE_CAPS = { standard: 110_000, reduced: 45_000 };
/** Approved per-biome ceilings (Wave 2 addendum): raising one is a review decision. */
const APPROVED_TRIANGLES: Record<string, { standard: number; reduced: number }> = {
  tropical: { standard: 110_000, reduced: 45_000 },
  desert: { standard: 80_000, reduced: 35_000 },
  alpine: { standard: 80_000, reduced: 35_000 },
  autumn: { standard: 90_000, reduced: 45_000 },
  ember: { standard: 75_000, reduced: 32_000 },
  monsoon: { standard: 80_000, reduced: 35_000 },
};

function luminance(hex: string): number {
  const c = new THREE.Color(hex); // linear
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function hsl(hex: string) {
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(out, THREE.SRGBColorSpace);
  return out;
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d) * 360;
}

const arts = registeredBiomeArt();

it("every themed biome id has registered art (Original has none)", () => {
  expect(arts.map((art) => art.id).sort()).toEqual(BIOME_IDS.filter((id) => id !== "original").sort());
});

describe.each(arts.map((art) => [art.id, art] as const))("art guardrails: %s", (_id, art) => {
  it("tone ramps are ordered, restrained and hue-coherent", () => {
    for (const [name, ramp] of Object.entries(art.tones)) {
      const [d, b, l] = [ramp.dark, ramp.base, ramp.light].map(luminance) as [number, number, number];
      expect(d, `${name} dark < base`).toBeLessThan(b);
      expect(b, `${name} base < light`).toBeLessThan(l);
      for (const hex of [ramp.dark, ramp.base, ramp.light]) {
        const { s, l: light } = hsl(hex);
        expect(s, `${name} ${hex} saturation`).toBeLessThanOrEqual(0.78);
        expect(light, `${name} ${hex} lightness`).toBeGreaterThanOrEqual(0.1);
        expect(light, `${name} ${hex} lightness`).toBeLessThanOrEqual(0.88);
      }
      const hues = [ramp.dark, ramp.base, ramp.light].map(hsl).filter((c) => c.s > 0.15).map((c) => c.h);
      for (const h of hues) expect(hueGap(h, hues[0]!), `${name} hue drift`).toBeLessThanOrEqual(40);
    }
  });

  it("dressing accents never share the collectible's hue", () => {
    const collectible = hsl(getBiomeDefinition(art.id).mission.collectibleColor).h;
    for (const hex of [art.tones.accent.base, art.tones.accent.light]) {
      expect(hueGap(hsl(hex).h, collectible)).toBeGreaterThanOrEqual(30);
    }
  });

  it("every variant is one unit tall on its base, inside its radius and triangle budget", () => {
    for (const [id, family] of Object.entries(art.families)) {
      expect(family.variants.length, id).toBeGreaterThan(0);
      for (const [index, builder] of family.variants.entries()) {
        const mesh = variantMesh(art.tones, builder);
        const label = `${id}[${index}]`;
        expect(mesh.triangles, `${label} triangles`).toBeLessThanOrEqual(family.triangleBudget);
        expect(mesh.radius, `${label} radius`).toBeLessThanOrEqual(family.unitRadius + 1e-6);
        expect(mesh.maxY, `${label} top`).toBeLessThanOrEqual(1 + 1e-6);
        expect(mesh.minY, `${label} sink`).toBeGreaterThanOrEqual(-0.16);
        if (family.role === "hero") expect(mesh.maxY - mesh.minY, `${label} hero height`).toBeCloseTo(1, 5);
        expect(mesh.index.length % 3).toBe(0);
        for (let i = 0; i < mesh.colors.length; i += 1) expect(Number.isFinite(mesh.colors[i]!)).toBe(true);
      }
    }
  });

  it("meets the spec's minimum variant counts", () => {
    const counts = new Map<AssetCategory, number>();
    for (const family of Object.values(art.families)) counts.set(family.category, (counts.get(family.category) ?? 0) + family.variants.length);
    for (const category of REQUIRED[art.id] ?? []) expect(counts.get(category) ?? 0, category).toBeGreaterThan(0);
    for (const [category, minimum] of Object.entries(MIN_VARIANTS)) {
      const count = counts.get(category as AssetCategory);
      if (count !== undefined) expect(count, category).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("compositions reference real families and primaries fit their placement kind", () => {
    const kinds = getBiomeDefinition(art.id).props.kinds.filter((kind) => kind !== "windsock");
    for (const kind of kinds) expect(art.compositions[kind]?.length ?? 0, `${kind} has a preset`).toBeGreaterThan(0);
    for (const [kind, presets] of Object.entries(art.compositions) as [BiomePropKind, typeof art.compositions.palm][]) {
      for (const { preset, weight } of presets ?? []) {
        expect(weight).toBeGreaterThan(0);
        const primary = art.families[preset.primary];
        expect(primary, `${preset.id} primary`).toBeDefined();
        // A primary wider than its kind's footprint would shrink the whole cluster.
        expect(primary!.unitRadius, `${preset.id} primary radius`).toBeLessThanOrEqual(PROP_UNIT_RADIUS[kind] * 1.1 + 1e-9);
        for (const member of preset.members) {
          expect(art.families[member.family], `${preset.id} → ${member.family}`).toBeDefined();
          expect(member.height[1], `${preset.id} member below the primary`).toBeLessThanOrEqual(1);
          expect(member.ring[1]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("lighting adjustments, if any, sit inside their documented bounds (no silent clamping)", () => {
    const l = art.lighting;
    if (!l) return;
    const within = (v: number | undefined, lo: number, hi: number, name: string) => {
      if (v !== undefined) {
        expect(v, name).toBeGreaterThanOrEqual(lo);
        expect(v, name).toBeLessThanOrEqual(hi);
      }
    };
    within(l.ambientKeep, 0.3, 1, "ambientKeep");
    within(l.hemisphereShare, 0, 1, "hemisphereShare");
    within(l.fogScale, 0.6, 1.6, "fogScale");
    within(l.contactStrength, 0, 1.5, "contactStrength");
    if (l.sunElevation) {
      within(l.sunElevation[0], 15, 65, "sunElevation[0]");
      within(l.sunElevation[1], 15, 65, "sunElevation[1]");
      expect(l.sunElevation[0]).toBeLessThanOrEqual(l.sunElevation[1]);
    }
  });

  it("wall (structure shell) ramps follow the same tone rules, and a course height is positive", () => {
    for (const name of ["top", "side"] as const) {
      const ramp = art.wall[name];
      const [d, b, l] = [ramp.dark, ramp.base, ramp.light].map(luminance) as [number, number, number];
      expect(d, `wall.${name} dark < base`).toBeLessThan(b);
      expect(b, `wall.${name} base < light`).toBeLessThan(l);
      for (const hex of [ramp.dark, ramp.base, ramp.light]) {
        const { s, l: light } = hsl(hex);
        expect(s, `wall.${name} ${hex} saturation`).toBeLessThanOrEqual(0.78);
        expect(light, `wall.${name} ${hex} lightness`).toBeGreaterThanOrEqual(0.1);
        expect(light, `wall.${name} ${hex} lightness`).toBeLessThanOrEqual(0.88);
      }
      const hues = [ramp.dark, ramp.base, ramp.light].map(hsl).filter((c) => c.s > 0.15).map((c) => c.h);
      for (const h of hues) expect(hueGap(h, hues[0]!), `wall.${name} hue drift`).toBeLessThanOrEqual(40);
    }
    for (const hex of [art.wall.recess, art.wall.rim]) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    if (art.wall.courseHeight !== undefined) expect(art.wall.courseHeight).toBeGreaterThan(0);
  });

  it("contact shadows stay within the readability cap (§9) after the lighting multiplier", () => {
    const strength = resolveBiomeLighting(art.lighting).contactStrength;
    expect(art.ground.contactOpacity * strength).toBeLessThanOrEqual(MAX_CONTACT_OPACITY + 1e-9);
  });

  it("atmosphere and ground styles only restyle what the definition enables", () => {
    const definition = getBiomeDefinition(art.id);
    if (art.atmosphere?.water && art.atmosphere.water !== "liquid") expect(definition.ambient.water, "water style without water").toBe(true);
    if (art.atmosphere?.particles) expect(definition.ambient.effect, "particle preset without particles").not.toBe("none");
    const collectible = hsl(definition.mission.collectibleColor).h;
    const tint = art.atmosphere?.particleTint;
    if (tint !== undefined) {
      expect(definition.ambient.effect, "particle tint without particles").not.toBe("none");
      expect(tint).toMatch(/^#[0-9a-f]{6}$/i);
      const c = hsl(tint);
      expect(c.s, `particleTint ${tint} saturation`).toBeLessThanOrEqual(0.78);
      expect(c.l, `particleTint ${tint} lightness`).toBeGreaterThanOrEqual(0.1);
      expect(c.l, `particleTint ${tint} lightness`).toBeLessThanOrEqual(0.88);
      // Drifting specks must never read as collectibles.
      if (c.s > 0.15) expect(hueGap(c.h, collectible), `particleTint ${tint} hue`).toBeGreaterThanOrEqual(30);
    }
    const rain = art.atmosphere?.rain;
    if (rain) {
      // Rain splashes need the ground heights geometry only bakes for `ambient.rain`.
      expect(definition.ambient.rain, "rain style without ambient.rain").toBe(true);
      expect(rain.intensity).toBeGreaterThan(0);
      expect(rain.intensity).toBeLessThanOrEqual(1);
      if (rain.wetness !== undefined) {
        expect(rain.wetness).toBeGreaterThanOrEqual(0);
        expect(rain.wetness).toBeLessThanOrEqual(1);
      }
      if (rain.tint !== undefined) {
        expect(rain.tint).toMatch(/^#[0-9a-f]{6}$/i);
        const c = hsl(rain.tint);
        expect(c.s, `rain tint ${rain.tint} saturation`).toBeLessThanOrEqual(0.78);
        if (c.s > 0.15) expect(hueGap(c.h, collectible), `rain tint ${rain.tint} hue`).toBeGreaterThanOrEqual(30);
      }
    }
    const { ground } = art;
    if (ground.crackGlow) {
      expect(ground.cracks ?? 0, "crackGlow needs cracks").toBeGreaterThan(0);
      // A glowing crack must never read as a collectible.
      expect(hueGap(hsl(ground.crackGlow).h, collectible), "crackGlow hue").toBeGreaterThanOrEqual(30);
    }
    if (ground.patches) {
      expect(ground.patches.tints.length).toBeGreaterThan(0);
      for (const tint of ground.patches.tints) {
        expect(tint.weight).toBeGreaterThan(0);
        expect(hsl(tint.color).s, `${tint.color} saturation`).toBeLessThanOrEqual(0.78);
      }
      const litter = ground.patches.litter ?? [];
      expect(litter.length).toBeLessThanOrEqual(3);
      for (const hex of litter) {
        const c = hsl(hex);
        if (c.s > 0.15) expect(hueGap(c.h, collectible), `${hex} litter hue`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("art triangle budgets sit within the layer caps and the approved per-biome ceilings", () => {
    const { standard, reduced } = art.budgets.triangles;
    expect(standard, "standard ≤ layer cap").toBeLessThanOrEqual(TRIANGLE_CAPS.standard);
    expect(reduced, "reduced ≤ layer cap").toBeLessThanOrEqual(TRIANGLE_CAPS.reduced);
    const approved = APPROVED_TRIANGLES[art.id];
    expect(approved, "every shipped biome has an approved ceiling").toBeDefined();
    expect(standard, "standard ≤ approved").toBeLessThanOrEqual(approved!.standard);
    expect(reduced, "reduced ≤ approved").toBeLessThanOrEqual(approved!.reduced);
  });

  it("reduced effects budgets are strictly lower", () => {
    expect(art.budgets.triangles.reduced).toBeLessThan(art.budgets.triangles.standard);
    expect(art.budgets.membersPerCluster.reduced).toBeLessThan(art.budgets.membersPerCluster.standard);
    for (const family of Object.values(art.families)) if (family.role === "micro") expect(family.castShadow).toBe(false);
  });
});
