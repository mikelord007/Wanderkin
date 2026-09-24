import { describe, expect, it, vi } from "vitest";
import type { LevelExperience } from "../../shared/experience.js";
import lostColorsManifest from "../../shared/fixtures/lost-colors.json";
import { GameplayEventBus } from "../../src/game/events.js";
import { GameplaySession } from "../../src/game/modes/session.js";

describe("ObjectQuest v2 gameplay state integration contracts", () => {
  it("collects each Lost Colors fragment once and restores color monotonically from 0/3 to 3/3", () => {
    const bus = new GameplayEventBus();
    const received = vi.fn();
    bus.on("*", received);
    const session = new GameplaySession({
      experience: lostColorsManifest.experience as unknown as LevelExperience,
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

  it.skip("applies independent finish rules for Explore, Collect, and Race", () => {
    // Explore: the authored goal/portal completes under its configured rule.
    // Collect: the portal rejects early entry and activates only after every
    // required unique fragment. Race: ordered required checkpoints plus finish
    // complete the run; skipped/out-of-order checkpoints cannot finish it.

    // In every mode completion is emitted once, freezes the final result, and
    // repeated trigger overlap cannot award another completion or result.
    throw new Error("Contract stub: connect Worker 5 mode finish state machines");
  });

  it.skip("keeps restart and respawn state distinct and internally consistent", () => {
    // Given collected rewards, a safe checkpoint, fired one-shot narration,
    // and an active race clock, exercise manual respawn and out-of-bounds respawn.

    // Respawn restores position/velocity to the safe pose while preserving the
    // mode's collected/checkpoint progress and never repeats rewards/narration.

    // Restart applies the documented mode reset: start pose, clean timer/countdown,
    // initial progress, no stale completion, and one new-run event sequence.
    throw new Error("Contract stub: connect Worker 5 run/session state boundary");
  });

  it.skip("uses deterministic race timing across countdown, pause, restart, completion, and comparison", () => {
    // Inject a monotonic fake clock. Verify countdown time is excluded, active
    // elapsed time never decreases, pause/background policy is explicit, and
    // restart returns elapsed time and checkpoint order to their initial state.

    // Completion freezes elapsed milliseconds once, updates personal best only
    // when lower, and binds the result/comparison target to the exact immutable
    // published version ID. Editing or republishing the source cannot retarget it.
    throw new Error("Contract stub: connect Worker 5 timer and Worker 7 versioned records");
  });
});
