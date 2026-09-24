import { describe, expect, it } from "vitest";
import { LOST_COLORS_SAMPLE } from "./bundledSamples.js";

describe("bundled Lost Colors sample", () => {
  it("uses the real local Rodin asset and has a complete playable quest", () => {
    expect(LOST_COLORS_SAMPLE.assets[0]?.url).toBe("/samples/rodin.glb");
    expect(LOST_COLORS_SAMPLE.experience.mode.kind).toBe("collect");
    expect(LOST_COLORS_SAMPLE.experience.collectibles).toHaveLength(3);
    expect(LOST_COLORS_SAMPLE.experience.finishPortal?.activation).toBe("all-required-collectibles");
    expect(LOST_COLORS_SAMPLE.courseValidation.status).not.toBe("unvalidated");
  });
});
