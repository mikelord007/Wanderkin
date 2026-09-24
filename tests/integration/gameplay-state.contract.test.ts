import { describe, expect, it, vi } from "vitest";
import type { LevelExperience } from "../../shared/experience.js";
import lostColorsManifest from "../../shared/fixtures/lost-colors.json";
import { GameplayEventBus } from "../../src/game/events.js";
import { GameplaySession } from "../../src/game/modes/session.js";
import type { MonotonicClock, RaceBestTimeStore, WorldIntroStore } from "../../src/game/modes/session.js";

class FakeClock implements MonotonicClock {
  value = 10_000;
  now() { return this.value; }
  advance(milliseconds: number) { this.value += milliseconds; }
}

class MemoryBestTimes implements RaceBestTimeStore {
  values = new Map<string, number>();
  read(key: string) { return this.values.get(key) ?? null; }
  write(key: string, milliseconds: number) { this.values.set(key, milliseconds); }
}

const collectExperience = lostColorsManifest.experience as unknown as LevelExperience;

function raceExperience(): LevelExperience {
  return {
    ...collectExperience,
    mode: {
      kind: "race",
      countdownSeconds: 2,
      orderedCheckpointIds: ["checkpoint-1", "checkpoint-2"],
      finishPortalId: "finish-portal",
      restartPolicy: "full-reset",
    },
    finishPortal: { ...collectExperience.finishPortal!, activation: "all-race-checkpoints" },
  };
}

describe("ObjectQuest v2 gameplay state integration contracts", () => {
  it("collects each Lost Colors fragment once and restores color monotonically from 0/3 to 3/3", () => {
    const bus = new GameplayEventBus();
    const received = vi.fn();
    bus.on("*", received);
    const session = new GameplaySession({
      experience: collectExperience,
      worldId: lostColorsManifest.levelId,
      eventBus: bus,
    });

    const progression = [session.snapshot];
    expect(session.collectFragment("not-authored")).toBe(false);
    for (const fragment of lostColorsManifest.experience.collectibles) {
      expect(session.collectFragment(fragment.id)).toBe(true);
      expect(session.collectFragment(fragment.id)).toBe(false);
      progression.push(session.snapshot);
    }

    expect(progression.map((state) => state.requiredFragmentsCollected)).toEqual([0, 1, 2, 3]);
    expect(progression.map((state) => state.restoration)).toEqual([
      0,
      0.3333333333,
      0.6666666667,
      1,
    ]);
    expect(received.mock.calls.filter(([event]) => event.type === "fragmentCollected")).toHaveLength(3);
    expect(received.mock.calls.filter(([event]) => event.type === "allFragmentsCollected")).toHaveLength(1);
  });

  it("applies independent finish rules for Explore, Collect, and Race", () => {
    const collect = new GameplaySession({ experience: collectExperience, worldId: "collect" });
    expect(collect.enterPortal("finish-portal")).toBe(false);
    collectExperience.mode.kind === "collect" &&
      collectExperience.mode.requiredCollectibleIds.forEach((id) => collect.collectFragment(id));
    expect(collect.enterPortal("finish-portal")).toBe(true);
    expect(collect.enterPortal("finish-portal")).toBe(false);

    const explore = new GameplaySession({
      worldId: "explore",
      experience: {
        ...collectExperience,
        mode: {
          kind: "explore",
          destinations: [{ id: "summit", position: [0, 1, 0], label: "Summit" }],
          optionalCollectibleIds: [],
        },
      },
    });
    expect(explore.reachDestination("summit")).toBe(true);
    expect(explore.snapshot.completed).toBe(true);

    const clock = new FakeClock();
    const race = new GameplaySession({
      experience: raceExperience(),
      worldId: "race",
      clock,
      bestTimeStore: new MemoryBestTimes(),
    });
    race.start();
    clock.advance(2_000);
    race.update();
    expect(race.reachCheckpoint("checkpoint-2")).toBe(false);
    expect(race.reachCheckpoint("checkpoint-1")).toBe(true);
    expect(race.enterPortal("finish-portal")).toBe(false);
    expect(race.reachCheckpoint("checkpoint-2")).toBe(true);
    expect(race.enterPortal("finish-portal")).toBe(true);
    expect(race.enterPortal("finish-portal")).toBe(false);
  });

  it("keeps restart and respawn state distinct and internally consistent", () => {
    const seenIntros = new Set<string>();
    const introStore: WorldIntroStore = {
      hasSeen: (worldId) => seenIntros.has(worldId),
      markSeen: (worldId) => { seenIntros.add(worldId); },
    };
    const bus = new GameplayEventBus();
    const events = vi.fn();
    bus.on("*", events);
    const collect = new GameplaySession({
      experience: collectExperience,
      worldId: "collect-respawn",
      introStore,
      eventBus: bus,
    });
    collect.showIntroOnce();
    collect.collectFragment("fragment-red");
    collect.respawn("manual", "checkpoint-1");
    collect.respawn("fell", "checkpoint-1");
    expect(collect.snapshot.collectedFragmentIds.has("fragment-red")).toBe(true);
    expect(events.mock.calls.filter(([event]) => event.type === "fragmentCollected")).toHaveLength(1);
    expect(events.mock.calls.filter(([event]) => event.type === "introShown")).toHaveLength(1);
    expect(events.mock.calls.filter(([event]) => event.type === "respawned")).toHaveLength(2);

    collect.restart();
    expect(collect.snapshot.collectedFragmentIds.size).toBe(0);
    expect(collect.snapshot.completed).toBe(false);
    expect(collect.showIntroOnce()).toBe(false);

    const clock = new FakeClock();
    const race = new GameplaySession({
      experience: raceExperience(),
      worldId: "race-restart",
      clock,
      bestTimeStore: new MemoryBestTimes(),
    });
    race.start();
    clock.advance(2_000);
    race.update();
    clock.advance(500);
    race.reachCheckpoint("checkpoint-1");
    race.restart();
    expect(race.snapshot.race.phase).toBe("countdown");
    expect(race.snapshot.race.elapsedMilliseconds).toBe(0);
    expect(race.snapshot.reachedCheckpointIds).toEqual([]);
  });

  it("uses deterministic race timing across countdown, pause, restart, completion, and comparison", () => {
    const clock = new FakeClock();
    const bestTimes = new MemoryBestTimes();
    const session = new GameplaySession({
      experience: raceExperience(),
      worldId: "source-level",
      publishedVersionId: "immutable-version-4",
      clock,
      bestTimeStore: bestTimes,
    });

    session.start();
    clock.advance(2_000);
    session.update();
    clock.advance(1_200);
    expect(session.snapshot.race.elapsedMilliseconds).toBe(1_200);
    session.setPaused(true);
    clock.advance(4_000);
    expect(session.snapshot.race.elapsedMilliseconds).toBe(1_200);
    session.setPaused(false);
    session.reachCheckpoint("checkpoint-1");
    clock.advance(800);
    session.reachCheckpoint("checkpoint-2");
    session.enterPortal("finish-portal");

    expect(session.snapshot.race.elapsedMilliseconds).toBe(2_000);
    expect(session.snapshot.race.bestMilliseconds).toBe(2_000);
    expect(session.snapshot.race.publishedVersionId).toBe("immutable-version-4");
    expect(bestTimes.values.get("objectquest:race-best:immutable-version-4")).toBe(2_000);

    clock.advance(9_000);
    expect(session.snapshot.race.elapsedMilliseconds).toBe(2_000);
    session.restart();
    expect(session.snapshot.race.elapsedMilliseconds).toBe(0);
    expect(session.snapshot.reachedCheckpointIds).toEqual([]);
  });
});
