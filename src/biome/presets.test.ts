import { describe, expect, it } from "vitest";
import { BIOME_IDS, effectiveBudget, getBiomeDefinition, isBiomeId } from "./presets.js";
import type { BiomeId } from "./types.js";

const HEX = /^#[0-9a-f]{6}$/i;

describe("biome presets", () => {
  it("ships Original, Tropical Island, Desert, Alpine, Autumn and Ember with their own ids", () => {
    expect(BIOME_IDS).toEqual(["original", "tropical", "desert", "alpine", "autumn", "ember", "monsoon"]);
    for (const id of BIOME_IDS) expect(getBiomeDefinition(id).id).toBe(id);
    expect(getBiomeDefinition("tropical").name).toBe("Tropical Island");
    expect(getBiomeDefinition("desert").name).toBe("Desert");
    expect(getBiomeDefinition("alpine").name).toBe("Snowy Alpine");
    expect(getBiomeDefinition("autumn").name).toBe("Autumn Forest");
    expect(getBiomeDefinition("ember").name).toBe("Volcanic Ember");
    expect(getBiomeDefinition("monsoon").name).toBe("Monsoon Marsh");
  });

  it("keeps the shared manifest schema ids and the renderer ids identical", async () => {
    const { SCENE_BIOME_IDS } = await import("../../shared/manifest.js");
    expect([...BIOME_IDS]).toEqual([...SCENE_BIOME_IDS]);
  });

  it("falls back to Original for an unknown id instead of throwing", () => {
    expect(getBiomeDefinition("volcano" as BiomeId).id).toBe("original");
    expect(isBiomeId("volcano")).toBe(false);
    expect(isBiomeId("desert")).toBe(true);
  });

  it("uses only valid colours, unit wind and sane numeric ranges", () => {
    for (const id of BIOME_IDS) {
      const d = getBiomeDefinition(id);
      for (const colour of [
        ...Object.values(d.palette),
        d.lighting.sun, d.lighting.sky, d.lighting.ground,
        d.sky.zenith, d.sky.horizon, d.surface.color, d.mission.collectibleColor,
      ]) expect(colour).toMatch(HEX);
      expect(Math.hypot(...d.wind.direction)).toBeCloseTo(1, 6);
      expect(d.wind.strength).toBeGreaterThanOrEqual(0);
      expect(d.wind.strength).toBeLessThanOrEqual(1);
      expect(d.surface.blend).toBeLessThanOrEqual(0.6);
      expect(d.sky.fogFar).toBeGreaterThan(d.sky.fogNear);
      expect(d.props.scaleRange[1]).toBeGreaterThanOrEqual(d.props.scaleRange[0]);
    }
  });

  it("Original draws nothing and tints nothing", () => {
    const original = getBiomeDefinition("original");
    expect(original.props.kinds).toEqual([]);
    expect(original.surface.blend).toBe(0);
    expect(original.ambient).toEqual({ effect: "none", water: false });
    expect(original.budget).toEqual({ props: 0, patches: 0, particles: 0, drawCalls: 0 });
  });

  it("gives Desert a windsock and dust, Tropical water and palms", () => {
    expect(getBiomeDefinition("desert").props.kinds).toContain("windsock");
    expect(getBiomeDefinition("desert").ambient.effect).toBe("dust");
    expect(getBiomeDefinition("tropical").props.kinds).toContain("palm");
    expect(getBiomeDefinition("tropical").ambient.water).toBe(true);
  });

  it("reduced quality lowers every budget", () => {
    for (const id of ["tropical", "desert", "alpine", "autumn", "ember", "monsoon"] as const) {
      const d = getBiomeDefinition(id);
      const reduced = effectiveBudget(d, "reduced");
      expect(effectiveBudget(d, "standard")).toEqual(d.budget);
      expect(reduced.props).toBeLessThan(d.budget.props);
      expect(reduced.particles).toBeLessThan(d.budget.particles);
      expect(reduced.patches).toBeLessThan(d.budget.patches);
      expect(reduced.drawCalls).toBeLessThan(d.budget.drawCalls);
    }
  });

  it("themed budgets stay inside the architecture caps (ENVIRONMENT_ARCHITECTURE.md §8)", () => {
    for (const id of ["tropical", "desert", "alpine", "autumn", "ember", "monsoon"] as const) {
      const { budget, props } = getBiomeDefinition(id);
      expect(budget.drawCalls).toBeLessThanOrEqual(14);
      expect(budget.props).toBeLessThanOrEqual(160);
      expect(budget.patches).toBeLessThanOrEqual(24);
      expect(budget.particles).toBeLessThanOrEqual(300);
      expect(props.density).toBeLessThanOrEqual(1);
    }
  });
});
