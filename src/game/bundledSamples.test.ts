import { describe, expect, it } from "vitest";
import { BUNDLED_AUDIO_URLS } from "../audio/assets.js";
import { EXPLORE_SAMPLE, LOST_COLORS_SAMPLE } from "./bundledSamples.js";

describe("bundled Lost Colors sample", () => {
  it("uses the real local Rodin asset and has a complete playable quest", () => {
    expect(LOST_COLORS_SAMPLE.assets[0]?.url).toBe("/samples/rodin.glb");
    expect(LOST_COLORS_SAMPLE.experience.mode.kind).toBe("collect");
    expect(LOST_COLORS_SAMPLE.experience.collectibles).toHaveLength(3);
    expect(LOST_COLORS_SAMPLE.experience.finishPortal?.activation).toBe("all-required-collectibles");
    expect(LOST_COLORS_SAMPLE.entities.some((entity) => entity.kind === "ramp" || entity.kind === "box")).toBe(true);
    expect(LOST_COLORS_SAMPLE.courseValidation.status).not.toBe("unvalidated");
    expect(LOST_COLORS_SAMPLE.media.audio.filter((asset) => asset.kind === "sfx")).toHaveLength(7);
    expect(LOST_COLORS_SAMPLE.media.audio.some((asset) => asset.kind === "music")).toBe(true);
    expect(LOST_COLORS_SAMPLE.media.audio.some((asset) => asset.kind === "narration")).toBe(false);
    expect(LOST_COLORS_SAMPLE.experience.quest).not.toHaveProperty("narrationScript");
    expect(LOST_COLORS_SAMPLE.media.audio).toHaveLength(9);
    expect(LOST_COLORS_SAMPLE.media.audio.map((asset) => asset.url)).toEqual(Object.values(BUNDLED_AUDIO_URLS));
    expect(Math.max(...LOST_COLORS_SAMPLE.media.audio.map((asset) => asset.sizeBytes))).toBeLessThan(200_000);
  });

  it("offers a timer-free Explore variant over the same local asset", () => {
    expect(EXPLORE_SAMPLE.assets).toStrictEqual(LOST_COLORS_SAMPLE.assets);
    expect(EXPLORE_SAMPLE.experience.mode.kind).toBe("explore");
    expect(EXPLORE_SAMPLE.experience.mode.kind === "explore" && EXPLORE_SAMPLE.experience.mode.destinations).toHaveLength(5);
  });
});
