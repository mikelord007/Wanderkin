import { describe, expect, it } from "vitest";
import { biomeLightRig, biomeSunPosition } from "./SceneLighting.js";

describe("biome sun placement", () => {
  const centre = { x: 1, y: 2, z: 3 };

  it("keeps the biome's horizontal direction at the style key distance", () => {
    const [x, y, z] = biomeSunPosition([3, 3, 4], centre, 10);
    expect(Math.hypot(x - centre.x, y - centre.y, z - centre.z)).toBeCloseTo(10, 9);
    expect((x - centre.x) / (z - centre.z)).toBeCloseTo(3 / 4, 9);
  });

  it("clamps elevation so shadows stay readable", () => {
    const steep = biomeSunPosition([0.01, 100, 0], centre, 10);
    expect(Math.asin((steep[1] - centre.y) / 10)).toBeCloseTo((52 * Math.PI) / 180, 6);
    const low = biomeSunPosition([10, 0.1, 0], centre, 10);
    expect(Math.asin((low[1] - centre.y) / 10)).toBeCloseTo((24 * Math.PI) / 180, 6);
  });

  it("survives degenerate input", () => {
    for (const v of biomeSunPosition([0, Number.NaN, 0], centre, 10)) expect(Number.isFinite(v)).toBe(true);
  });

  it("biome rig trades flat ambient for directional sky/ground fill and tighter shadows", () => {
    const rig = biomeLightRig({ lighting: { sun: "#fff", sky: "#fff", ground: "#fff", intensity: 2, ambient: 0.8, direction: [1, 1, 1] } }, 0.5);
    expect(rig.ambient).toBeLessThan(0.8);
    expect(rig.hemisphere).toBeGreaterThan(0.5);
    // Roughly the same total fill: nothing gets much darker overall.
    expect(rig.ambient + rig.hemisphere).toBeGreaterThan(0.8 + 0.5 - 0.1);
    expect(rig.shadowNormalBias).toBeLessThan(0.012);
    const broken = biomeLightRig({ lighting: { sun: "#fff", sky: "#fff", ground: "#fff", intensity: 2, ambient: Number.NaN, direction: [1, 1, 1] } }, 0.5);
    expect(Number.isFinite(broken.ambient) && Number.isFinite(broken.hemisphere)).toBe(true);
  });

  it("honours a biome's own elevation range and fill tuning", () => {
    const centre0 = { x: 0, y: 0, z: 0 };
    const high = biomeSunPosition([1, 10, 0], centre0, 10, [(20 * Math.PI) / 180, (60 * Math.PI) / 180]);
    expect(Math.asin(high[1] / 10)).toBeCloseTo((60 * Math.PI) / 180, 6);
    const lighting = { sun: "#fff", sky: "#fff", ground: "#fff", intensity: 2, ambient: 1, direction: [1, 1, 1] as [number, number, number] };
    const flat = biomeLightRig({ lighting }, 0.5, { ambientKeep: 1, hemisphereShare: 0 });
    expect(flat.ambient).toBe(1);
    expect(flat.hemisphere).toBe(0.5);
  });
});
