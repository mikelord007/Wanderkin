import { describe, expect, it } from "vitest";
import type { LevelExperience } from "@shared/index.js";
import lostColorsManifest from "../../../shared/fixtures/lost-colors.json";
import { GameplaySession } from "./session.js";
import { updateGameplayProximity } from "./proximity.js";

const experience = lostColorsManifest.experience as unknown as LevelExperience;

describe("gameplay proximity triggers", () => {
  it("uses each fragment's real authored trigger volume and gates the portal", () => {
    const session = new GameplaySession({ experience, worldId: "fixture" });
    const red = experience.collectibles[0]!;
    expect(updateGameplayProximity(session, experience, { x: 50, y: 50, z: 50 })).toBe(false);
    expect(updateGameplayProximity(session, experience, {
      x: red.transform.position[0], y: red.transform.position[1], z: red.transform.position[2],
    })).toBe(true);
    expect(updateGameplayProximity(session, experience, {
      x: red.transform.position[0], y: red.transform.position[1], z: red.transform.position[2],
    })).toBe(false);
    expect(session.snapshot.requiredFragmentsCollected).toBe(1);

    const portal = experience.finishPortal!;
    expect(updateGameplayProximity(session, experience, {
      x: portal.transform.position[0], y: portal.transform.position[1], z: portal.transform.position[2],
    })).toBe(false);
  });
});
