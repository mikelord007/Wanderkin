import { describe, expect, it, vi } from "vitest";
import type { LevelExperience } from "@shared/index.js";
import lostColorsManifest from "../../../shared/fixtures/lost-colors.json";
import { GameplayEventBus } from "../events.js";
import { GameplaySession } from "./session.js";

const experience = lostColorsManifest.experience as unknown as LevelExperience;

describe("GameplaySession collect mode", () => {
  it("credits each authored fragment once and restores color monotonically", () => {
    const bus = new GameplayEventBus();
    const events = vi.fn();
    bus.on("*", events);
    const session = new GameplaySession({ experience, worldId: lostColorsManifest.levelId, eventBus: bus });

    expect(session.snapshot.restoration).toBe(0);
    expect(session.collectFragment("unknown")).toBe(false);
    expect(session.collectFragment("fragment-red")).toBe(true);
    expect(session.collectFragment("fragment-red")).toBe(false);
    expect(session.snapshot.restoration).toBeCloseTo(1 / 3);
    expect(session.collectFragment("fragment-yellow")).toBe(true);
    expect(session.snapshot.restoration).toBeCloseTo(2 / 3);
    expect(session.collectFragment("fragment-blue")).toBe(true);

    expect(session.snapshot.requiredFragmentsCollected).toBe(3);
    expect(session.snapshot.restoration).toBe(1);
    expect(session.snapshot.portalActive).toBe(true);
    expect(events.mock.calls.map(([event]) => event.type)).toEqual([
      "fragmentCollected",
      "fragmentCollected",
      "fragmentCollected",
      "allFragmentsCollected",
      "portalActivated",
    ]);
  });

  it("gates the portal, completes once, preserves collection through respawn, and resets on restart", () => {
    const bus = new GameplayEventBus();
    const events = vi.fn();
    bus.on("*", events);
    const session = new GameplaySession({ experience, worldId: lostColorsManifest.levelId, eventBus: bus });

    expect(session.enterPortal("finish-portal")).toBe(false);
    for (const id of experience.mode.kind === "collect" ? experience.mode.requiredCollectibleIds : []) {
      session.collectFragment(id);
    }
    session.respawn("fell", "checkpoint-2");
    expect(session.snapshot.requiredFragmentsCollected).toBe(3);
    expect(session.enterPortal("finish-portal")).toBe(true);
    expect(session.enterPortal("finish-portal")).toBe(false);
    expect(events.mock.calls.filter(([event]) => event.type === "worldCompleted")).toHaveLength(1);

    session.restart();
    expect(session.snapshot.requiredFragmentsCollected).toBe(0);
    expect(session.snapshot.restoration).toBe(0);
    expect(session.snapshot.portalActive).toBe(false);
    expect(session.snapshot.completed).toBe(false);
  });
});
