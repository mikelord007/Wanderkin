/**
 * The landing turntable's motion, kept apart from three.js so it can be
 * tested. The model turns once every `revolutionSeconds`. Any drag or key
 * press brings the turn to a quick stop; `idleMs` after the last input it
 * ramps back up over a second or so (never a snap), and the view settles back
 * to the front. Under reduced motion it never turns on its own.
 */
export const TURNTABLE = {
  revolutionSeconds: 20,
  idleMs: 3000,
  /** How fast the turn stops when you take hold (per second, exponential). */
  stopRate: 9,
  /** How fast it comes back once you let go: about 1.5 s to full speed. */
  resumeRate: 2.2,
  /** How fast the camera drifts back to the front view. */
  settleRate: 1.6,
  /** One arrow-key press turns the model by 15 degrees. */
  keyStep: Math.PI / 12,
} as const;

export const TURN_SPEED = (Math.PI * 2) / TURNTABLE.revolutionSeconds;

export interface SpinInput {
  now: number;
  lastInput: number;
  dragging: boolean;
  reducedMotion: boolean;
  /** Current turn speed, radians per second. */
  spin: number;
  /** Seconds since the last frame. */
  dt: number;
}

/** Next turn speed, and whether the camera should drift back to the front. */
export function turntableSpin({ now, lastInput, dragging, reducedMotion, spin, dt }: SpinInput): { spin: number; settle: boolean } {
  const idle = !dragging && now - lastInput >= TURNTABLE.idleMs;
  if (reducedMotion) return { spin: 0, settle: false };
  const target = idle ? TURN_SPEED : 0;
  const rate = idle ? TURNTABLE.resumeRate : TURNTABLE.stopRate;
  const next = target + (spin - target) * Math.exp(-rate * dt);
  return { spin: Math.abs(next - target) < 1e-4 ? target : next, settle: idle };
}
