import { describe, expect, it } from "vitest";
import { registeredBiomeArt } from "./biomes/index.js";
import { regionalTone } from "./compose.js";

describe("regional tone drift", () => {
  it("regional tone drift is deterministic, smooth and within the art's jitter", () => {
    for (const art of registeredBiomeArt()) {
      const a = regionalTone(art, 0.31, -0.7);
      expect(regionalTone(art, 0.31, -0.7)).toEqual(a);
      expect(Math.abs(a.light)).toBeLessThanOrEqual(art.variation.toneJitter * 0.8 + 1e-9);
      expect(Math.abs(a.hue)).toBeLessThanOrEqual((art.variation.hueJitterDeg * 0.6 * Math.PI) / 180 + 1e-9);
      // Close points differ only a little (patchiness, not noise).
      const b = regionalTone(art, 0.33, -0.7);
      expect(Math.abs(a.light - b.light)).toBeLessThan(art.variation.toneJitter * 0.2 + 1e-9);
    }
  });
});
