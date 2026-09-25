import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ALPINE_ART } from "../biomes/alpine.js";
import { DESERT_ART } from "../biomes/desert.js";
import { TROPICAL_ART } from "../biomes/tropical.js";
import { ALPINE_WALL } from "./wall.js";

const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const hsl = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);

describe("alpine snow-topped granite shells", () => {
  it("is the art's wall style", () => {
    expect(ALPINE_ART.wall).toBe(ALPINE_WALL);
  });

  it("courses band strongly enough to beat facet shading, under a snow top and a brighter rim", () => {
    const { side, top } = ALPINE_WALL;
    for (const ramp of [side, top]) {
      expect(luminance(ramp.dark)).toBeLessThan(luminance(ramp.base));
      expect(luminance(ramp.base)).toBeLessThan(luminance(ramp.light));
    }
    // Frost-lit course vs dark course: several times brighter, in linear light.
    expect(luminance(side.light) / luminance(side.dark)).toBeGreaterThan(4);
    // Snow top reads far lighter than the stone; the rim lighter still; seams darkest.
    expect(luminance(top.dark)).toBeGreaterThan(luminance(side.light));
    expect(luminance(ALPINE_WALL.rim)).toBeGreaterThan(luminance(top.light));
    expect(luminance(ALPINE_WALL.recess)).toBeLessThan(luminance(side.dark));
    // Seams dark enough to keep the courses legible in furniture shade.
    expect(ALPINE_WALL.seam ?? 0.7).toBeGreaterThanOrEqual(0.7);
  });

  it("is cold stone, distinct from the desert's sandstone and the tropical timber", () => {
    // Cool blue-grey (hue 190–240°) and far less saturated than both.
    for (const hex of [ALPINE_WALL.side.base, ALPINE_WALL.top.base]) {
      const { h } = hsl(hex);
      expect(h * 360).toBeGreaterThan(190);
      expect(h * 360).toBeLessThan(240);
    }
    expect(hsl(ALPINE_WALL.side.base).s).toBeLessThan(hsl(DESERT_ART.wall.side.base).s * 0.5);
    expect(hsl(ALPINE_WALL.side.base).s).toBeLessThan(hsl(TROPICAL_ART.wall.side.base).s);
    // Heavy courses: fewer, thicker strata than the timber planks.
    expect(ALPINE_WALL.strata[1]).toBeLessThanOrEqual(TROPICAL_ART.wall.strata[0]);
  });
});
