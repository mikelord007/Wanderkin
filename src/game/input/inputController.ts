/**
 * Keyboard, mouse-look and pointer-lock handling.
 *
 * Kept out of React state deliberately: input is read once per animation
 * frame by the simulation, and routing it through `useState` would re-render
 * the whole tree on every key. Edge-triggered actions (jump, mantle,
 * respawn) are latched here and cleared when consumed, so a press between
 * frames is never dropped.
 */

import type { MovementConfig } from "@shared/index.js";
import type { SimulationInput } from "../core/simulation.js";
import { MOUSE_SENSITIVITY } from "../core/constants.js";
import { clamp } from "../core/vec.js";

const MOVE_FORWARD = new Set(["KeyW", "ArrowUp"]);
const MOVE_BACK = new Set(["KeyS", "ArrowDown"]);
const MOVE_LEFT = new Set(["KeyA", "ArrowLeft"]);
const MOVE_RIGHT = new Set(["KeyD", "ArrowRight"]);

export interface InputControllerCallbacks {
  /** Escape, or the browser dropping pointer lock during play. */
  onPauseRequested: () => void;
  onPointerLockChange: (locked: boolean) => void;
}

export class InputController {
  private readonly config: MovementConfig;
  private readonly callbacks: InputControllerCallbacks;
  private readonly held = new Set<string>();

  private element: HTMLElement | null = null;
  private jumpLatched = false;
  private mantleLatched = false;
  private respawnLatched = false;
  private locked = false;
  /** Suppresses the pause that a deliberate pointer-lock release would fire. */
  private suppressNextUnlockPause = false;

  yaw: number;
  pitch: number;

  constructor(config: MovementConfig, initialYaw: number, callbacks: InputControllerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.yaw = initialYaw;
    // Start slightly above the character, looking gently down at the scene.
    this.pitch = clamp(0.28, config.camera.minPitchRadians, config.camera.maxPitchRadians);
  }

  attach(element: HTMLElement): () => void {
    this.element = element;

    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isInteractiveTarget(event.target)) this.held.delete(event.code);
    };
    const onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
    const onPointerLockChange = () => this.handlePointerLockChange();
    const onBlur = () => this.held.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      this.held.clear();
      this.element = null;
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // HUD buttons and sliders must retain normal keyboard behavior. In
    // particular, Arrow keys adjust AudioControls instead of moving the
    // player or being preventDefault-ed by the global game listener.
    if (isInteractiveTarget(event.target)) return;
    if (event.code === "Escape") {
      // Explicitly release here as well as listening for the browser's
      // pointerlockchange. Automation and embedded browsers can deliver the
      // key event without performing the browser-chrome Escape release.
      // releasePointerLock suppresses the resulting duplicate pause.
      this.releasePointerLock();
      this.callbacks.onPauseRequested();
      return;
    }

    if (event.repeat) return;

    switch (event.code) {
      case "Space":
        this.jumpLatched = true;
        // Stop the page scrolling out from under the canvas.
        event.preventDefault();
        break;
      case "KeyE":
        this.mantleLatched = true;
        break;
      case "KeyR":
        this.respawnLatched = true;
        break;
      default:
        break;
    }

    if (
      MOVE_FORWARD.has(event.code) ||
      MOVE_BACK.has(event.code) ||
      MOVE_LEFT.has(event.code) ||
      MOVE_RIGHT.has(event.code)
    ) {
      event.preventDefault();
    }

    this.held.add(event.code);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.locked) return;

    // Moving the mouse right turns the character to its right, which is the
    // -X direction when facing +Z, so yaw decreases.
    this.yaw -= event.movementX * MOUSE_SENSITIVITY;
    this.pitch = clamp(
      this.pitch + event.movementY * MOUSE_SENSITIVITY,
      this.config.camera.minPitchRadians,
      this.config.camera.maxPitchRadians,
    );
  }

  private handlePointerLockChange(): void {
    const locked = this.element !== null && document.pointerLockElement === this.element;
    if (locked === this.locked) return;

    this.locked = locked;
    this.callbacks.onPointerLockChange(locked);

    if (!locked) {
      this.held.clear();
      if (this.suppressNextUnlockPause) {
        this.suppressNextUnlockPause = false;
      } else {
        this.callbacks.onPauseRequested();
      }
    }
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  requestPointerLock(): void {
    const element = this.element;
    if (!element || this.locked) return;
    // Some browsers reject this outside a user gesture; a rejection just
    // leaves the "click to play" prompt visible, which is the right result.
    void Promise.resolve(element.requestPointerLock()).catch(() => undefined);
  }

  /** Releases pointer lock without treating it as a new pause request. */
  releasePointerLock(): void {
    if (!this.locked) return;
    this.suppressNextUnlockPause = true;
    document.exitPointerLock();
  }

  /** Re-aims the camera, e.g. after respawning at a checkpoint's heading. */
  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  /** Reads current input and clears latched edges. */
  consume(): SimulationInput {
    const forward = (this.anyHeld(MOVE_FORWARD) ? 1 : 0) - (this.anyHeld(MOVE_BACK) ? 1 : 0);
    const right = (this.anyHeld(MOVE_RIGHT) ? 1 : 0) - (this.anyHeld(MOVE_LEFT) ? 1 : 0);

    const input: SimulationInput = {
      forward,
      right,
      jump: this.jumpLatched,
      mantle: this.mantleLatched,
      respawn: this.respawnLatched,
      cameraYaw: this.yaw,
    };

    this.jumpLatched = false;
    this.mantleLatched = false;
    this.respawnLatched = false;
    return input;
  }

  /** Drops held keys and latches, e.g. when the game pauses. */
  clear(): void {
    this.held.clear();
    this.jumpLatched = false;
    this.mantleLatched = false;
    this.respawnLatched = false;
  }

  private anyHeld(codes: Set<string>): boolean {
    for (const code of codes) if (this.held.has(code)) return true;
    return false;
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.matches("input, button, select, textarea, a[href], [contenteditable='true']");
}
