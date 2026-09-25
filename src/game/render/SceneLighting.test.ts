import { describe, expect, it } from "vitest";
import { biomeSunPosition } from "./SceneLighting.js";

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
});
