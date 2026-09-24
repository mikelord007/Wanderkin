import { describe, expect, it, vi } from "vitest";
import type { LevelExperience } from "@shared/index.js";
import lostColorsManifest from "../../../shared/fixtures/lost-colors.json";
import { GameplayEventBus } from "../events.js";
import { GameplaySession } from "./session.js";
import type { MonotonicClock, RaceBestTimeStore, WorldIntroStore } from "./session.js";

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

  it("shows the movement intro once per world, including across restart and remount", () => {
    const seen = new Set<string>();
    const introStore: WorldIntroStore = {
      hasSeen: (worldId) => seen.has(worldId),
      markSeen: (worldId) => { seen.add(worldId); },
    };
    const bus = new GameplayEventBus();
    const intro = vi.fn();
    bus.on("introShown", intro);
    const session = new GameplaySession({
      experience,
      worldId: "same-world",
      introStore,
      eventBus: bus,
    });

    expect(session.showIntroOnce()).toBe(true);
    session.respawn("fell", null);
    session.restart();
    expect(session.showIntroOnce()).toBe(false);
    const remounted = new GameplaySession({ experience, worldId: "same-world", introStore, eventBus: bus });
    expect(remounted.showIntroOnce()).toBe(false);
    expect(intro).toHaveBeenCalledOnce();
  });
});

describe("GameplaySession explore mode", () => {
  const exploreExperience: LevelExperience = {
    ...experience,
    mode: {
      kind: "explore",
      destinations: [
        { id: "lookout", position: [1, 0, 0], label: "Cloud lookout" },
        { id: "garden", position: [2, 0, 0], label: "Tiny garden" },
      ],
      optionalCollectibleIds: ["fragment-red"],
    },
    finishPortal: { ...experience.finishPortal!, activation: "always" },
  };

  it("has no timer, allows optional fragments, and completes on all destinations", () => {
    const bus = new GameplayEventBus();
    const events = vi.fn();
    bus.on("*", events);
    const session = new GameplaySession({ experience: exploreExperience, worldId: "explore-world", eventBus: bus });

    expect(session.snapshot.race.phase).toBe("not-applicable");
    expect(session.snapshot.race.elapsedMilliseconds).toBe(0);
    expect(session.collectFragment("fragment-red")).toBe(true);
    expect(session.reachDestination("not-authored")).toBe(false);
    expect(session.reachDestination("lookout")).toBe(true);
    expect(session.reachDestination("lookout")).toBe(false);
    expect(session.snapshot.completed).toBe(false);
    expect(session.reachDestination("garden")).toBe(true);
    expect(session.snapshot.completed).toBe(true);
    expect(events.mock.calls.filter(([event]) => event.type === "worldCompleted")).toHaveLength(1);
  });

  it("allows an always-active authored portal to finish exploration", () => {
    const session = new GameplaySession({ experience: exploreExperience, worldId: "explore-world" });
    expect(session.snapshot.portalActive).toBe(true);
    expect(session.enterPortal("finish-portal")).toBe(true);
  });
});

describe("GameplaySession race mode", () => {
  class FakeClock implements MonotonicClock {
    value = 1_000;
    now() { return this.value; }
    advance(milliseconds: number) { this.value += milliseconds; }
  }

  class MemoryBestTimes implements RaceBestTimeStore {
    values = new Map<string, number>();
    read(key: string) { return this.values.get(key) ?? null; }
    write(key: string, milliseconds: number) { this.values.set(key, milliseconds); }
  }

  const raceExperience: LevelExperience = {
    ...experience,
    mode: {
      kind: "race",
      countdownSeconds: 3,
      orderedCheckpointIds: ["checkpoint-1", "checkpoint-2"],
      finishPortalId: "finish-portal",
      restartPolicy: "full-reset",
    },
    finishPortal: { ...experience.finishPortal!, activation: "all-race-checkpoints" },
  };

  it("excludes countdown and pause, enforces order, freezes the result, and stores a version-bound best", () => {
    const clock = new FakeClock();
    const store = new MemoryBestTimes();
    const bus = new GameplayEventBus();
    const events = vi.fn();
    bus.on("*", events);
    const session = new GameplaySession({
      experience: raceExperience,
      worldId: "race-world",
      publishedVersionId: "published-v7",
      clock,
      bestTimeStore: store,
      eventBus: bus,
    });

    session.start();
    expect(session.reachCheckpoint("checkpoint-1")).toBe(false);
    clock.advance(2_000);
    session.update();
    expect(session.snapshot.race.countdownSecondsRemaining).toBe(1);
    clock.advance(1_000);
    session.update();
    expect(session.snapshot.race.phase).toBe("running");
    expect(session.snapshot.race.elapsedMilliseconds).toBe(0);

    clock.advance(1_250);
    session.setPaused(true);
    clock.advance(5_000);
    session.update();
    expect(session.snapshot.race.elapsedMilliseconds).toBe(1_250);
    session.setPaused(false);
    expect(session.reachCheckpoint("checkpoint-2")).toBe(false);
    expect(session.reachCheckpoint("checkpoint-1")).toBe(true);
    clock.advance(750);
    expect(session.reachCheckpoint("checkpoint-2")).toBe(true);
    expect(session.snapshot.portalActive).toBe(true);
    expect(session.enterPortal("finish-portal")).toBe(true);

    expect(session.snapshot.race.elapsedMilliseconds).toBe(2_000);
    expect(session.snapshot.race.bestMilliseconds).toBe(2_000);
    expect(store.values.get("objectquest:race-best:published-v7")).toBe(2_000);
    expect(session.enterPortal("finish-portal")).toBe(false);
    expect(events.mock.calls.filter(([event]) => event.type === "raceFinished")).toHaveLength(1);
    expect(events.mock.calls.find(([event]) => event.type === "raceFinished")?.[0]).toMatchObject({
      publishedVersionId: "published-v7",
      isPersonalBest: true,
    });
  });

  it("fully resets checkpoint and clock state on restart", () => {
    const clock = new FakeClock();
    const session = new GameplaySession({
      experience: raceExperience,
      worldId: "race-world",
      clock,
      bestTimeStore: new MemoryBestTimes(),
    });
    session.start();
    clock.advance(3_000);
    session.update();
    session.reachCheckpoint("checkpoint-1");
    clock.advance(900);

    session.restart();
    expect(session.snapshot.reachedCheckpointIds).toEqual([]);
    expect(session.snapshot.race.phase).toBe("countdown");
    expect(session.snapshot.race.elapsedMilliseconds).toBe(0);
    expect(session.snapshot.race.countdownSecondsRemaining).toBe(3);
  });
});
