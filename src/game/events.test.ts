import { describe, expect, it, vi } from "vitest";
import { GameplayEventBus } from "./events.js";

describe("GameplayEventBus", () => {
  it("delivers typed gameplay events to specific and wildcard listeners", () => {
    const bus = new GameplayEventBus();
    const fragment = vi.fn();
    const all = vi.fn();
    bus.on("fragmentCollected", fragment);
    bus.on("*", all);

    bus.emit({
      type: "fragmentCollected",
      fragmentId: "red",
      collected: 1,
      required: 3,
      restoration: 1 / 3,
      color: "#f00",
    });

    expect(fragment).toHaveBeenCalledOnce();
    expect(all).toHaveBeenCalledOnce();
  });

  it("unsubscribes without disturbing other listeners", () => {
    const bus = new GameplayEventBus();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = bus.on("introShown", first);
    bus.on("introShown", second);
    unsubscribe();

    bus.emit({ type: "introShown", worldId: "world-1" });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
