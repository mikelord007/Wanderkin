import { afterEach, describe, expect, it, vi } from "vitest";
import type { MovementConfig } from "@shared/index.js";
import { InputController } from "./inputController.js";

const CONFIG = {
  camera: { minPitchRadians: -1, maxPitchRadians: 1 },
} as MovementConfig;

const originalDocument = globalThis.document;

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("InputController", () => {
  it("releases pointer lock on Escape and suppresses a duplicate unlock pause", () => {
    const events: string[] = [];
    const exitPointerLock = vi.fn(() => events.push("exit"));
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { exitPointerLock, pointerLockElement: null },
    });

    const controller = new InputController(CONFIG, 0, {
      onPauseRequested: () => events.push("pause"),
      onPointerLockChange: (locked) => events.push(`locked:${locked}`),
    });
    const internals = controller as unknown as {
      locked: boolean;
      handleKeyDown: (event: { code: string }) => void;
      handlePointerLockChange: () => void;
    };
    internals.locked = true;

    internals.handleKeyDown({ code: "Escape" });
    expect(exitPointerLock).toHaveBeenCalledOnce();
    expect(events).toEqual(["exit", "pause"]);

    // The real pointerlockchange follows exitPointerLock asynchronously.
    internals.handlePointerLockChange();
    expect(events).toEqual(["exit", "pause", "locked:false"]);
  });

  it("toggles mute and gameplay capture from the keyboard, independent of pointer lock or clicks", () => {
    const events: string[] = [];
    const controller = new InputController(CONFIG, 0, {
      onPauseRequested: () => events.push("pause"),
      onPointerLockChange: () => undefined,
      onToggleMute: () => events.push("mute"),
      onToggleCapture: () => events.push("capture"),
    });
    const internals = controller as unknown as {
      handleKeyDown: (event: { code: string; repeat?: boolean; target?: EventTarget | null }) => void;
    };

    internals.handleKeyDown({ code: "KeyM" });
    internals.handleKeyDown({ code: "KeyC" });
    expect(events).toEqual(["mute", "capture"]);

    // A held key (repeat) must not fire the toggle twice.
    internals.handleKeyDown({ code: "KeyM", repeat: true });
    expect(events).toEqual(["mute", "capture"]);
  });
});
