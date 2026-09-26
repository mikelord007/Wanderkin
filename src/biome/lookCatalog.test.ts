import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENE_BIOME_IDS } from "@shared/index.js";
import { BIOME_IDS } from "./presets.js";
import { DEFAULT_PICKED_LOOK, FALLBACK_BIOME, LOOK_LABELS, LOOK_OPTIONS, LOOK_PICKER_OPTIONS, LOOK_PICKER_ORDER, isSceneBiomeId, lookName, manifestBiomeId, withArticle } from "./lookCatalog.js";

describe("look catalog", () => {
  it("names all seven biomes in the shared order, Original first, as the game lists them", () => {
    expect(LOOK_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ["original", "Original"], ["tropical", "Tropical Island"], ["desert", "Desert"],
      ["alpine", "Snowy Alpine"], ["autumn", "Autumn Forest"], ["ember", "Volcanic Ember"], ["monsoon", "Monsoon Marsh"],
    ]);
    expect(LOOK_OPTIONS.map((o) => o.value)).toEqual([...SCENE_BIOME_IDS]);
    expect([...BIOME_IDS]).toEqual([...SCENE_BIOME_IDS]);
  });

  it("gives every look a label, a line and a palette (Original is the photo itself)", () => {
    for (const id of SCENE_BIOME_IDS) {
      const entry = LOOK_LABELS[id];
      expect(entry.value).toBe(id);
      expect(entry.label.trim().length, id).toBeGreaterThan(0);
      expect(entry.description.trim().length, id).toBeGreaterThan(0);
      if (id === "original") expect(entry.swatch).toBeNull();
      else expect(Object.values(entry.swatch ?? {}).every((c) => /^#[0-9a-f]{6}$/i.test(c)), id).toBe(true);
    }
  });

  it("offers Monsoon first and chosen by default, Original last; the saved order is untouched", () => {
    expect(LOOK_PICKER_ORDER).toEqual(["monsoon", "tropical", "desert", "alpine", "autumn", "ember", "original"]);
    expect(LOOK_PICKER_OPTIONS.map((o) => o.value)).toEqual([...LOOK_PICKER_ORDER]);
    expect([...LOOK_PICKER_ORDER].sort()).toEqual([...SCENE_BIOME_IDS].sort());
    expect(DEFAULT_PICKED_LOOK).toBe("monsoon");
    expect(SCENE_BIOME_IDS[0]).toBe("original");
  });

  it("says what grows in every look, and shows it in a real render that ships with the app", () => {
    const public_ = new URL("../../public/", import.meta.url);
    for (const id of SCENE_BIOME_IDS) {
      const entry = LOOK_LABELS[id];
      expect(entry.elements.trim().length, id).toBeGreaterThan(10);
      expect(entry.image).toEqual({ src: `/looks/${id}.webp`, src2x: `/looks/${id}@2x.webp` });
      for (const src of [entry.image.src, entry.image.src2x]) {
        const file = new URL(src.slice(1), public_);
        expect(existsSync(file), src).toBe(true);
        expect(statSync(file).size, src).toBeLessThanOrEqual(120 * 1024);
      }
    }
    expect(LOOK_LABELS.monsoon.elements).toBe("Palms, reeds, stilt huts, steady rain");
    expect(LOOK_LABELS.original.elements).toBe("Just the place in your photo, no scenery");
  });

  it("a world saved without a biome is shown as it always was: Original", () => {
    expect(FALLBACK_BIOME).toBe("original");
    expect(manifestBiomeId({})).toBe("original");
    expect(manifestBiomeId({ biome: { id: "monsoon", seed: "s" } })).toBe("monsoon");
    // An unknown id from a newer or damaged save never breaks play.
    expect(manifestBiomeId({ biome: { id: "lunar" as never, seed: "s" } })).toBe("original");
    expect(isSceneBiomeId("desert")).toBe(true);
    expect(isSceneBiomeId("lunar")).toBe(false);
  });

  it("reads naturally in a sentence", () => {
    expect(lookName("monsoon")).toBe("Monsoon Marsh");
    expect(withArticle("Monsoon Marsh")).toBe("a Monsoon Marsh");
    expect(withArticle("Autumn Forest")).toBe("an Autumn Forest");
    expect(withArticle("Original")).toBe("an Original");
  });
});
