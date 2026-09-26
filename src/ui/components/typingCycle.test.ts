import { afterEach, describe, expect, it, vi } from "vitest";
import {
  caretOf, caretSlot, createCycleDriver, delayFor, HEADLINE_PAIRS, highlightOf, initialState, isFaded, settle, step, TIMING,
  type CycleState,
} from "./typingCycle.js";

/** Steps from `state` until `done`, adding up the time each state was shown. */
function runUntil(state: CycleState, done: (s: CycleState) => boolean, reduced = false) {
  const seen: CycleState[] = [state];
  let elapsed = 0;
  while (!done(state)) {
    elapsed += delayFor(state, reduced, () => 0.5);
    state = step(state, HEADLINE_PAIRS, reduced);
    seen.push(state);
    if (seen.length > 500) throw new Error("cycle never finished");
  }
  return { state, seen, elapsed };
}

describe("headline pairs", () => {
  it("has eight to ten pairs, opening on the sofa", () => {
    expect(HEADLINE_PAIRS.length).toBeGreaterThanOrEqual(8);
    expect(HEADLINE_PAIRS.length).toBeLessThanOrEqual(10);
    expect(HEADLINE_PAIRS[0]).toEqual({ object: "sofa", landscape: "mountain range" });
  });

  it("never repeats a word, and every landscape reads after 'is a'", () => {
    const object = new Set(HEADLINE_PAIRS.map((p) => p.object));
    const landscape = new Set(HEADLINE_PAIRS.map((p) => p.landscape));
    expect(object.size).toBe(HEADLINE_PAIRS.length);
    expect(landscape.size).toBe(HEADLINE_PAIRS.length);
    for (const word of landscape) expect(word).toMatch(/^[^aeiou]/i);
  });

  it("keeps words short enough for the fixed two-line headline", () => {
    for (const { object, landscape } of HEADLINE_PAIRS) {
      expect(object.length).toBeLessThanOrEqual(10);
      expect(landscape.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("the typing cycle", () => {
  it("starts on the first pair, still, caret blinking after the landscape", () => {
    const start = initialState();
    expect(start).toMatchObject({ pair: 0, object: "sofa", landscape: "mountain range", phase: "hold" });
    expect(caretOf(start)).toBe("blink");
    expect(caretSlot(start)).toBe("landscape");
    expect(highlightOf(start)).toBeNull();
    expect(delayFor(start, false)).toBe(TIMING.firstHold);
  });

  it("deletes the object, types the next one, then does the same for the landscape", () => {
    const { seen } = runUntil(step(initialState()), (s) => s.phase === "hold");
    const objects = seen.filter((s) => s.slot === "object").map((s) => s.object);
    expect(objects).toEqual(["sofa", "sofa", "sof", "so", "s", "", "f", "fr", "fri", "frid", "fridg", "fridge"]);
    const landscapes = seen.filter((s) => s.slot === "landscape").map((s) => s.landscape);
    expect(landscapes[0]).toBe("mountain range");
    expect(landscapes).toContain("");
    expect(landscapes.at(-1)).toBe("glacier wall");
    // The object is finished before the caret moves on.
    expect(seen.find((s) => s.slot === "landscape")?.object).toBe("fridge");
    expect(seen.at(-1)).toMatchObject({ pair: 1, object: "fridge", landscape: "glacier wall", slot: null });
  });

  it("uses the brief's timings", () => {
    const secondHold = runUntil(step(initialState()), (s) => s.phase === "hold").state;
    expect(delayFor(secondHold, false)).toBe(2600);
    expect(TIMING.firstHold).toBe(1500);
    const highlighted = step(secondHold);
    expect(highlighted.phase).toBe("caret");
    expect(delayFor(highlighted, false)).toBe(400);
    const deleting = runUntil(step(secondHold), (s) => s.phase === "delete").state;
    expect(delayFor(deleting, false)).toBe(35);
    const typing = runUntil(deleting, (s) => s.phase === "type").state;
    expect(delayFor(typing, false, () => 0.5)).toBe(55);
    expect(delayFor(typing, false, () => 0)).toBe(55 - TIMING.typeJitter);
    expect(delayFor(typing, false, () => 1)).toBe(55 + TIMING.typeJitter);
  });

  it("always shows the caret: solid while letters change, blinking otherwise", () => {
    const { seen } = runUntil(initialState(), (s) => s.phase === "hold" && s.pair === 1);
    for (const s of seen) {
      expect(caretOf(s)).toBe(s.phase === "delete" || s.phase === "type" ? "solid" : "blink");
    }
  });

  it("keeps the caret in the slot being edited, then after the landscape", () => {
    const { seen } = runUntil(step(initialState()), (s) => s.phase === "hold");
    const places = seen.map(caretSlot).filter((slot, i, all) => slot !== all[i - 1]);
    expect(places).toEqual(["object", "landscape"]);
    expect(caretSlot(seen.at(-1)!)).toBe("landscape");
  });

  it("tints the word from just before it is deleted until the new word is typed", () => {
    const { seen } = runUntil(step(initialState()), (s) => s.phase === "hold");
    const tinted = seen.map((s) => [s.phase, highlightOf(s), s.object, s.landscape] as const);
    // On for the object from the highlight lead through the last letter typed.
    expect(tinted[0]).toEqual(["caret", "object", "sofa", "mountain range"]);
    expect(tinted.filter(([, h]) => h === "object").map(([, , o]) => o).at(-1)).toBe("fridg");
    // Off once each word is whole, and while holding.
    for (const [phase, h] of tinted) if (phase === "rest" || phase === "hold") expect(h).toBeNull();
    expect(tinted.filter(([, h]) => h === "landscape").map(([, , , l]) => l)[0]).toBe("mountain range");
    expect(tinted.filter(([, h]) => h === "landscape").map(([, , , l]) => l).at(-1)).toBe("glacier wal");
  });

  it("loops forever, back to the sofa", () => {
    let state = initialState();
    for (let i = 0; i < HEADLINE_PAIRS.length; i++) state = runUntil(step(state), (s) => s.phase === "hold").state;
    expect(state).toMatchObject({ pair: 0, object: "sofa", landscape: "mountain range" });
  });

  it("takes a few seconds per pair, not a blur", () => {
    const { elapsed } = runUntil(initialState(), (s) => s.phase === "hold" && s.pair === 1);
    expect(elapsed).toBeGreaterThan(3500);
    expect(elapsed).toBeLessThan(6000);
  });
});

describe("reduced motion", () => {
  it("never types: a static caret, and a fade to the next whole pair every four seconds", () => {
    const start = initialState();
    expect(delayFor(start, true)).toBe(TIMING.reducedHold);
    const { seen } = runUntil(step(start, HEADLINE_PAIRS, true), (s) => s.phase === "hold", true);
    expect(seen.map((s) => s.phase)).toEqual(["fadeOut", "fadeIn", "hold"]);
    expect(seen.every((s) => caretOf(s, true) === "static" && highlightOf(s) === null)).toBe(true);
    const [fadingOut, fadingIn] = seen as [CycleState, CycleState];
    expect(isFaded(fadingOut)).toBe(true);
    expect(fadingOut).toMatchObject({ object: "sofa", landscape: "mountain range" });
    expect(fadingIn).toMatchObject({ object: "fridge", landscape: "glacier wall" });
    expect(isFaded(fadingIn)).toBe(false);
  });

  it("settles a half-typed word into its whole pair", () => {
    const mid = runUntil(step(initialState()), (s) => s.phase === "type").state;
    expect(settle(mid)).toMatchObject({ phase: "hold", slot: null, object: "fridge", landscape: "glacier wall" });
  });
});

describe("the driver", () => {
  afterEach(() => { vi.useRealTimers(); });

  function drive(reducedMotion = false) {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const driver = createCycleDriver({ reducedMotion, onChange, random: () => 0.5 });
    return { driver, onChange };
  }

  it("does nothing until it is active", () => {
    const { driver, onChange } = drive();
    vi.advanceTimersByTime(10_000);
    expect(onChange).not.toHaveBeenCalled();
    expect(driver.state.phase).toBe("hold");
  });

  it("holds the first pair for 1.5 s, then starts", () => {
    const { driver } = drive();
    driver.setActive(true);
    vi.advanceTimersByTime(TIMING.firstHold - 1);
    expect(driver.state.phase).toBe("hold");
    vi.advanceTimersByTime(1);
    expect(driver.state).toMatchObject({ phase: "caret", slot: "object" });
  });

  it("pauses while hidden or off screen and picks up where it stopped", () => {
    const { driver, onChange } = drive();
    driver.setActive(true);
    vi.advanceTimersByTime(TIMING.firstHold + TIMING.caretLead + TIMING.deleteChar * 2);
    const paused = driver.state;
    expect(paused).toMatchObject({ phase: "delete", object: "so" });
    driver.setActive(false);
    const calls = onChange.mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(driver.state).toBe(paused);
    expect(onChange.mock.calls.length).toBe(calls);
    driver.setActive(true);
    vi.advanceTimersByTime(TIMING.deleteChar);
    expect(driver.state.object).toBe("s");
  });

  it("switches to fading mid-word without leaving half a word", () => {
    const { driver } = drive();
    driver.setActive(true);
    vi.advanceTimersByTime(TIMING.firstHold + TIMING.caretLead + TIMING.deleteChar * 2);
    driver.setReducedMotion(true);
    expect(driver.state).toMatchObject({ phase: "hold", object: "fridge", landscape: "glacier wall", slot: null });
    vi.advanceTimersByTime(TIMING.reducedHold);
    expect(driver.state.phase).toBe("fadeOut");
  });

  it("stops for good when disposed", () => {
    const { driver, onChange } = drive(true);
    driver.setActive(true);
    driver.dispose();
    vi.advanceTimersByTime(60_000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
