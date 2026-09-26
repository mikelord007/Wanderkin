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

  it("fires the hook on a quick tap of F, and holding aims until release", () => {
    let now = 0;
    const controller = new InputController(CONFIG, 0, {
      onPauseRequested: () => undefined,
      onPointerLockChange: () => undefined,
    }, () => now);
    const internals = controller as unknown as {
      handleKeyDown: (event: { code: string; repeat?: boolean; preventDefault?: () => void }) => void;
      handleKeyUp: (event: { code: string }) => void;
    };

    // Tap: fires on release, may whiff.
    internals.handleKeyDown({ code: "KeyF" });
    expect(controller.consume().grapple).toBe(false);
    now = 0.08;
    internals.handleKeyUp({ code: "KeyF" });
    expect(controller.aiming).toBe(false);
    expect(controller.consume()).toMatchObject({ grapple: true, grappleRequireAnchor: false });
    expect(controller.consume().grapple).toBe(false);

    // Hold: aims, and the release fires only onto an anchor.
    now = 1;
    internals.handleKeyDown({ code: "KeyF" });
    internals.handleKeyDown({ code: "KeyF", repeat: true });
    now = 1.4;
    expect(controller.aiming).toBe(true);
    internals.handleKeyUp({ code: "KeyF" });
    expect(controller.aiming).toBe(false);
    expect(controller.consume()).toMatchObject({ grapple: true, grappleRequireAnchor: true });

    // Space while aiming cancels the aim and does not jump.
    now = 2;
    internals.handleKeyDown({ code: "KeyF" });
    now = 2.5;
    internals.handleKeyDown({ code: "Space", preventDefault: () => undefined });
    expect(controller.aiming).toBe(false);
    internals.handleKeyUp({ code: "KeyF" });
    expect(controller.consume()).toMatchObject({ grapple: false, jump: false });

    // While the hook is out, a press lets go at once instead of aiming.
    controller.setGrappleOut(true);
    internals.handleKeyDown({ code: "KeyF" });
    expect(controller.aiming).toBe(false);
    expect(controller.consume()).toMatchObject({ grapple: true, grappleRequireAnchor: false });
    controller.setGrappleOut(false);

    controller.fireGrapple();
    expect(controller.consume().grapple).toBe(true);

    // Pausing drops a latched shot.
    controller.fireGrapple();
    controller.clear();
    expect(controller.consume().grapple).toBe(false);
  });
});
