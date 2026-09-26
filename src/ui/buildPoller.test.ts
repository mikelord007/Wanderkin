import { describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "@shared/index.js";
import { createBuildPoller } from "./buildPoller.js";

function job(id: string, state: GenerationJob["state"]): GenerationJob {
  return {
    schemaVersion: 1, id, idempotencyKey: id, providerId: "fixture", providerJobId: null,
    capabilityRequested: "rodin-i3d", capabilityUsed: null, fallbackFired: null, state,
    photoOrder: [], createdAt: "2026-09-26T09:00:00.000Z", updatedAt: "2026-09-26T09:00:00.000Z", retryCount: 0, maxRetries: 2,
  };
}

/** A hand-cranked clock: timers only fire when the test says so. */
function fakeClock() {
  const timers: { callback: () => void; ms: number }[] = [];
  return {
    timers,
    setTimer: (callback: () => void, ms: number) => { const handle = { callback, ms }; timers.push(handle); return handle; },
    clearTimer: (handle: unknown) => { const index = timers.indexOf(handle as never); if (index >= 0) timers.splice(index, 1); },
    async fire() { const next = timers.shift(); if (!next) throw new Error("no timer"); next.callback(); await new Promise((r) => setTimeout(r, 0)); },
  };
}

function setup(states: Record<string, GenerationJob["state"] | Error>, hidden = { value: false }) {
  const clock = fakeClock();
  const fetchJob = vi.fn(async (id: string) => { const state = states[id]; if (state instanceof Error || state === undefined) throw state ?? new Error("missing"); return job(id, state); });
  let visibilityListener: (() => void) | null = null;
  const poller = createBuildPoller({
    fetchJob, intervalMs: 2000, hiddenIntervalMs: 30_000, maxBackoffMs: 20_000,
    isHidden: () => hidden.value,
    onVisibilityChange: (listener) => { visibilityListener = listener; return () => { visibilityListener = null; }; },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  return { clock, fetchJob, poller, hidden, fireVisibility: () => visibilityListener?.() };
}

describe("createBuildPoller", () => {
  it("polls every card's jobs on one timer, one request per job", async () => {
    const { clock, fetchJob, poller } = setup({ a: "generating", b: "queued" });
    const seenA: string[] = [];
    poller.watch("a", (j) => seenA.push(j.state));
    poller.watch("a", () => undefined); // a second card watching the same job
    poller.watch("b", () => undefined);
    expect(clock.timers).toHaveLength(1);
    await clock.fire();
    expect(fetchJob.mock.calls.map(([id]) => id).sort()).toEqual(["a", "b"]);
    expect(seenA).toEqual(["generating"]);
    expect(clock.timers).toHaveLength(1);
    expect(poller.nextDelay()).toBe(2000);
  });

  it("stops watching a job once it is ready or failed, and goes idle when none are left", async () => {
    const states: Record<string, GenerationJob["state"]> = { a: "generating" };
    const { clock, poller } = setup(states);
    const seen: string[] = [];
    poller.watch("a", (j) => seen.push(j.state));
    await clock.fire();
    states.a = "ready";
    await clock.fire();
    expect(seen).toEqual(["generating", "ready"]);
    expect(poller.watching()).toEqual([]);
    expect(clock.timers).toHaveLength(0);
  });

  it("slows right down while the tab is hidden, and catches up soon after it returns", async () => {
    const { clock, poller, hidden, fireVisibility } = setup({ a: "generating" });
    poller.watch("a", () => undefined);
    hidden.value = true;
    await clock.fire();
    expect(poller.nextDelay()).toBe(30_000);
    hidden.value = false;
    fireVisibility();
    expect(poller.nextDelay()).toBeLessThanOrEqual(400);
    expect(clock.timers).toHaveLength(1);
  });

  it("backs off when every request fails, and recovers on the next success", async () => {
    const states: Record<string, GenerationJob["state"] | Error> = { a: new Error("offline") };
    const { clock, poller } = setup(states);
    poller.watch("a", () => undefined);
    await clock.fire();
    expect(poller.nextDelay()).toBe(4000);
    await clock.fire();
    expect(poller.nextDelay()).toBe(8000);
    states.a = "generating";
    await clock.fire();
    expect(poller.nextDelay()).toBe(2000);
  });

  it("does not let one broken job slow the others", async () => {
    const { clock, poller } = setup({ a: new Error("gone") as never, b: "generating" });
    poller.watch("a", () => undefined);
    poller.watch("b", () => undefined);
    await clock.fire();
    expect(poller.nextDelay()).toBe(2000);
  });

  it("clears its timer when the last card stops watching", async () => {
    const { clock, poller } = setup({ a: "generating" });
    const unwatch = poller.watch("a", () => undefined);
    expect(clock.timers).toHaveLength(1);
    unwatch();
    await Promise.resolve();
    expect(clock.timers).toHaveLength(0);
    expect(poller.nextDelay()).toBeNull();
  });

  it("keeps its running timer when watches are swapped in one go", async () => {
    const { clock, poller } = setup({ a: "generating", b: "generating" });
    const unwatch = poller.watch("a", () => undefined);
    await clock.fire(); // now on the normal interval
    const timer = clock.timers[0];
    unwatch();
    poller.watch("b", () => undefined);
    await Promise.resolve();
    expect(clock.timers).toEqual([timer]);
    expect(poller.nextDelay()).toBe(2000);
  });
});
