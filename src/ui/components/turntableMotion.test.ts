import { describe, expect, it } from "vitest";
import { TURN_SPEED, TURNTABLE, turntableSpin } from "./turntableMotion.js";

const frame = 1 / 60;
function run(state: { spin: number; now: number }, frames: number, input: { lastInput: number; dragging?: boolean; reducedMotion?: boolean }) {
  let settle = false;
  for (let i = 0; i < frames; i++) {
    state.now += frame * 1000;
    ({ spin: state.spin, settle } = turntableSpin({ now: state.now, lastInput: input.lastInput, dragging: input.dragging ?? false, reducedMotion: input.reducedMotion ?? false, spin: state.spin, dt: frame }));
  }
  return settle;
}

describe("turntableSpin", () => {
  it("turns about once every 20 seconds when left alone", () => {
    expect(TURN_SPEED * TURNTABLE.revolutionSeconds).toBeCloseTo(Math.PI * 2);
    const state = { spin: 0, now: 0 };
    expect(run(state, 60 * 5, { lastInput: -Infinity })).toBe(true);
    expect(state.spin).toBeCloseTo(TURN_SPEED, 3);
  });

  it("ramps up from rest instead of snapping to full speed", () => {
    const state = { spin: 0, now: 0 };
    run(state, 1, { lastInput: -Infinity });
    expect(state.spin).toBeGreaterThan(0);
    expect(state.spin).toBeLessThan(TURN_SPEED * 0.1);
  });

  it("stops quickly while you drag, and does not pull the view back", () => {
    const state = { spin: TURN_SPEED, now: 10_000 };
    const settle = run(state, 30, { lastInput: 10_000, dragging: true });
    expect(settle).toBe(false);
    expect(state.spin).toBeLessThan(TURN_SPEED * 0.02);
  });

  it("waits about three seconds after you let go, then eases back into the turn", () => {
    const state = { spin: 0, now: 10_000 };
    expect(run(state, Math.floor(60 * 2.9), { lastInput: 10_000 })).toBe(false);
    expect(state.spin).toBe(0);
    expect(run(state, 12, { lastInput: 10_000 })).toBe(true);
    expect(state.spin).toBeGreaterThan(0);
    run(state, 60 * 4, { lastInput: 10_000 });
    expect(state.spin).toBeCloseTo(TURN_SPEED, 3);
  });

  it("never turns or settles on its own under reduced motion", () => {
    const state = { spin: 0, now: 0 };
    expect(run(state, 60 * 10, { lastInput: -Infinity, reducedMotion: true })).toBe(false);
    expect(state.spin).toBe(0);
  });
});
