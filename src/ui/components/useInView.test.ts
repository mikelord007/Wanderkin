import { describe, expect, it } from "vitest";
import { nextViewState, OFFSCREEN } from "./useInView.js";

describe("nextViewState", () => {
  it("starts offscreen: nothing loaded, nothing running", () => {
    expect(OFFSCREEN).toEqual({ seen: false, active: false });
    expect(nextViewState(OFFSCREEN, false, false)).toBe(OFFSCREEN);
  });

  it("loads and runs once the element comes near the viewport", () => {
    expect(nextViewState(OFFSCREEN, true, false)).toEqual({ seen: true, active: true });
  });

  it("stops running when scrolled past but keeps what it loaded", () => {
    const near = nextViewState(OFFSCREEN, true, false);
    expect(nextViewState(near, false, false)).toEqual({ seen: true, active: false });
  });

  it("stops running in a background tab even while in view", () => {
    const near = nextViewState(OFFSCREEN, true, false);
    expect(nextViewState(near, true, true)).toEqual({ seen: true, active: false });
    expect(nextViewState(OFFSCREEN, true, true)).toEqual({ seen: true, active: false });
  });

  it("returns the same object when nothing changed, so React skips the render", () => {
    const near = nextViewState(OFFSCREEN, true, false);
    expect(nextViewState(near, true, false)).toBe(near);
  });
});
