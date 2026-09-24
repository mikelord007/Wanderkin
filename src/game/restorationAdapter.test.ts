import { describe, expect, it, vi } from "vitest";
import { ColorRestorationAdapter } from "./restorationAdapter.js";

describe("ColorRestorationAdapter", () => {
  it("clamps renderer values and suppresses duplicate updates", () => {
    const setColorRestoration = vi.fn();
    const adapter = new ColorRestorationAdapter({ setColorRestoration }, -1);

    expect(setColorRestoration).not.toHaveBeenCalled();
    expect(adapter.apply(0)).toBe(false);
    expect(adapter.apply(0.5)).toBe(true);
    expect(adapter.apply(0.5)).toBe(false);
    expect(adapter.apply(3)).toBe(true);
    expect(adapter.current).toBe(1);
    expect(setColorRestoration.mock.calls.map(([value]) => value)).toEqual([0.5, 1]);

    adapter.reset(-2);
    expect(adapter.current).toBe(0);
    expect(setColorRestoration).toHaveBeenLastCalledWith(0);
  });
});
