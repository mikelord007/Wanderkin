import { describe, expect, it } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import lostColors from "../../shared/fixtures/lost-colors.json";
import { adventureHudCopy } from "./missionCopy.js";
import { getBiomeDefinition } from "./presets.js";

const source = lostColors as unknown as SceneManifest;
const withAdventure = (template: "restore-portal" | "reach-beacon"): SceneManifest =>
  ({ ...source, adventure: { template, seed: "s", generator: 1 } });

describe("adventureHudCopy", () => {
  it("leaves authored worlds alone", () => {
    for (const id of ["original", "tropical", "desert"] as const) {
      expect(adventureHudCopy(source, getBiomeDefinition(id))).toBeNull();
    }
  });

  it("names the portal adventure after the look without changing what is required", () => {
    const tropical = adventureHudCopy(withAdventure("restore-portal"), getBiomeDefinition("tropical"))!;
    expect(tropical.title).toBe("Wake the island gate");
    expect(tropical.counterLabel).toBe("Fragments");
    expect(tropical.objective).toBe("Collect 3 sun fragments, then step through the island gate.");
    expect(tropical.pickup(1, 3)).toBe("Sun fragment found — 1 of 3");
    const desert = adventureHudCopy(withAdventure("restore-portal"), getBiomeDefinition("desert"))!;
    expect(desert.objective).toBe("Collect 3 relic fragments, then step through the oasis gate.");
    const original = adventureHudCopy(withAdventure("restore-portal"), getBiomeDefinition("original"))!;
    expect(original.objective).toBe("Collect 3 energy fragments, then step through the portal.");
  });

  it("names the beacon adventure", () => {
    const copy = adventureHudCopy(withAdventure("reach-beacon"), getBiomeDefinition("desert"))!;
    expect(copy.title).toBe("Reach the oasis beacon");
    expect(copy.counterLabel).toBe("Beacon");
    expect(copy.objective).toBe("Follow the route and reach the oasis beacon.");
  });

  it("prefers validated plan flavour", () => {
    const copy = adventureHudCopy(withAdventure("restore-portal"), getBiomeDefinition("tropical"),
      { title: "the sunlit desk isle", fragmentName: "shell", destinationName: "coral arch" })!;
    expect(copy.title).toBe("The sunlit desk isle");
    expect(copy.objective).toBe("Collect 3 shells, then step through the coral arch.");
  });

  it("never mentions recognised objects or internal terms", () => {
    for (const id of ["original", "tropical", "desert"] as const) {
      for (const template of ["restore-portal", "reach-beacon"] as const) {
        const copy = adventureHudCopy(withAdventure(template), getBiomeDefinition(id))!;
        const text = [copy.title, copy.objective, copy.exitOpenHint, copy.counterLabel, copy.pickup(1, 3)].join(" ");
        expect(text).not.toMatch(/\b(biome|seed|template|model|desk|laptop|toaster|pillow|door)\b/i);
      }
    }
  });
});
