import { describe, expect, it } from "vitest";
import { AIM_TAP_SECONDS, AimState } from "./aimState.js";

describe("hold-to-aim", () => {
  it("fires straight away on a quick tap", () => {
    const aim = new AimState();
    aim.press("mouse", 10);
    expect(aim.isAiming(10 + AIM_TAP_SECONDS / 2)).toBe(false);
    expect(aim.release("mouse", 10 + AIM_TAP_SECONDS / 2)).toBe("fire");
    expect(aim.holding).toBe(false);
  });

  it("enters aim past the threshold, and a release then fires only onto an anchor", () => {
    const aim = new AimState();
    aim.press("key", 0);
    expect(aim.isAiming(AIM_TAP_SECONDS - 0.001)).toBe(false);
    expect(aim.isAiming(AIM_TAP_SECONDS)).toBe(true);
    expect(aim.release("key", 1)).toBe("fire-if-anchor");
    expect(aim.isAiming(1)).toBe(false);
  });

  it("cancels a hold without firing", () => {
    const aim = new AimState();
    aim.press("mouse", 0);
    expect(aim.cancel()).toBe(true);
    expect(aim.release("mouse", 1)).toBe("none");
    expect(aim.cancel()).toBe(false);
  });

  it("belongs to the source that started it", () => {
    const aim = new AimState();
    aim.press("mouse", 0);
    aim.press("key", 0.05); // ignored: already holding
    expect(aim.release("key", 0.5)).toBe("none");
    expect(aim.holding).toBe(true);
    expect(aim.release("mouse", 0.5)).toBe("fire-if-anchor");
  });
});
