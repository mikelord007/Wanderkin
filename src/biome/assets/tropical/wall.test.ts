import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DESERT_ART } from "../biomes/desert.js";
import { TROPICAL_ART } from "../biomes/tropical.js";
import { TROPICAL_WALL } from "./wall.js";

const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe("tropical timber shells", () => {
  it("is the art's wall style", () => {
    expect(TROPICAL_ART.wall).toBe(TROPICAL_WALL);
  });

  it("planks band strongly enough to beat facet shading", () => {
    const { side, top } = TROPICAL_WALL;
    for (const ramp of [side, top]) {
      expect(luminance(ramp.dark)).toBeLessThan(luminance(ramp.base));
      expect(luminance(ramp.base)).toBeLessThan(luminance(ramp.light));
    }
    // Pale plank vs damp plank: several times brighter, in linear light.
    expect(luminance(side.light) / luminance(side.dark)).toBeGreaterThan(4);
    // Walkable face reads lighter than the sides; the rim lighter still; gaps darkest.
    expect(luminance(top.base)).toBeGreaterThan(luminance(side.base));
    expect(luminance(TROPICAL_WALL.rim)).toBeGreaterThan(luminance(top.light));
    expect(luminance(TROPICAL_WALL.recess)).toBeLessThan(luminance(side.dark));
  });

  it("many thin plank strata, distinct from the desert's sandstone", () => {
    expect(TROPICAL_WALL.strata[0]).toBeGreaterThanOrEqual(5);
    const saturation = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).s;
    // Bleached timber is far less saturated than the desert's orange sandstone.
    expect(saturation(TROPICAL_WALL.side.base)).toBeLessThan(saturation(DESERT_ART.wall.side.base) * 0.7);
  });
});
