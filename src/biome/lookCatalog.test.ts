import { describe, expect, it } from "vitest";
import { SCENE_BIOME_IDS } from "@shared/index.js";
import { BIOME_IDS } from "./presets.js";
import { FALLBACK_BIOME, LOOK_LABELS, LOOK_OPTIONS, isSceneBiomeId, lookName, manifestBiomeId, withArticle } from "./lookCatalog.js";

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
