import { describe, expect, it } from "vitest";
import { LIGHTING_DEFAULTS, resolveBiomeLighting } from "./lighting.js";

describe("biome lighting adjustments", () => {
  it("defaults reproduce the standard themed rig exactly", () => {
    expect(resolveBiomeLighting(undefined)).toEqual(LIGHTING_DEFAULTS);
    expect(resolveBiomeLighting({})).toEqual(LIGHTING_DEFAULTS);
    expect(LIGHTING_DEFAULTS.ambientKeep).toBe(0.62);
    expect(LIGHTING_DEFAULTS.hemisphereShare).toBe(0.45);
    expect(LIGHTING_DEFAULTS.sunElevation[0]).toBeCloseTo((24 * Math.PI) / 180, 12);
    expect(LIGHTING_DEFAULTS.sunElevation[1]).toBeCloseTo((52 * Math.PI) / 180, 12);
  });

  it("clamps every knob to its bounds and orders the elevation range", () => {
    const wild = resolveBiomeLighting({ ambientKeep: 5, hemisphereShare: -1, sunElevation: [80, 5], fogScale: 9, contactStrength: -2 });
    expect(wild.ambientKeep).toBe(1);
    expect(wild.hemisphereShare).toBe(0);
    expect(wild.sunElevation[0]).toBeCloseTo((15 * Math.PI) / 180, 12);
    expect(wild.sunElevation[1]).toBeCloseTo((65 * Math.PI) / 180, 12);
    expect(wild.fogScale).toBe(1.6);
    expect(wild.contactStrength).toBe(0);
    const nan = resolveBiomeLighting({ ambientKeep: Number.NaN, fogScale: Number.POSITIVE_INFINITY });
    expect(nan.ambientKeep).toBe(LIGHTING_DEFAULTS.ambientKeep);
    expect(nan.fogScale).toBe(1);
  });
});
