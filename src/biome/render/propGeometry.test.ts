import { describe, expect, it } from "vitest";
import { getBiomeDefinition } from "../presets.js";
import {
  createPropGeometry,
  horizontalExtent,
  PROP_UNIT_RADIUS,
  SWAYING_KINDS,
  type InstancedPropKind,
} from "./propGeometry.js";

const KINDS: InstancedPropKind[] = ["palm", "shrub", "rock", "wood", "cactus", "dry-plant"];
const palette = getBiomeDefinition("tropical").palette;

describe("procedural biome props", () => {
  for (const kind of KINDS) {
    it(`${kind}: one unit tall, standing on its base, inside its declared radius`, () => {
      const geometry = createPropGeometry(kind, palette);
      const box = geometry.boundingBox!;
      expect(box.max.y - box.min.y).toBeCloseTo(1, 5);
      // Base on y = 0; only rocks sink slightly so they never hover.
      expect(box.min.y).toBeGreaterThanOrEqual(kind === "rock" ? -0.081 : -1e-6);
      expect(box.min.y).toBeLessThanOrEqual(1e-6);
      expect(horizontalExtent(geometry)).toBeLessThanOrEqual(PROP_UNIT_RADIUS[kind]);
      geometry.dispose();
    });

    it(`${kind}: low-poly, merged into a single vertex-coloured draw`, () => {
      const geometry = createPropGeometry(kind, palette);
      expect(geometry.index).toBeNull();
      expect(geometry.groups).toHaveLength(0);
      for (const name of ["position", "normal", "color", "aSway"]) expect(geometry.getAttribute(name)).toBeDefined();
      expect(geometry.getAttribute("position").count / 3).toBeLessThanOrEqual(700);
      const sway = geometry.getAttribute("aSway");
      let maxSway = 0;
      for (let i = 0; i < sway.count; i += 1) maxSway = Math.max(maxSway, sway.getX(i));
      if (SWAYING_KINDS.has(kind)) expect(maxSway).toBeGreaterThan(0.3);
      else expect(maxSway).toBe(0);
      geometry.dispose();
    });
  }

  it("is deterministic", () => {
    const a = createPropGeometry("rock", palette).getAttribute("position").array;
    const b = createPropGeometry("rock", palette).getAttribute("position").array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
