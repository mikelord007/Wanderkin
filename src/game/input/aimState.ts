/**
 * Hold-to-aim for the grappling hook.
 *
 * Holding right mouse (or F) past a short tap threshold enters aim: the
 * camera moves over the shoulder and the reticle shows in full. Letting go
 * then fires only if the reticle is over a valid anchor, otherwise it simply
 * cancels. A quick tap keeps the instant fire straight down the centre.
 * Space or Escape while holding cancels. Plain data and a clock, so the whole
 * state machine is unit-tested without a browser.
 */

/** A press shorter than this is a tap: fire immediately on release. */
export const AIM_TAP_SECONDS = 0.15;

export type AimSource = "key" | "mouse";

/**
 * What a release asks of the hook: `fire` (a tap: fire, a miss whiffs),
 * `fire-if-anchor` (a held aim: fire only onto a valid anchor, else cancel),
 * or `none` (nothing was being held by that source).
 */
export type AimRelease = "fire" | "fire-if-anchor" | "none";

export class AimState {
  private pressedAt: number | null = null;
  private source: AimSource | null = null;

  /** Starts a hold. A second source pressed during a hold is ignored. */
  press(source: AimSource, nowSeconds: number): void {
    if (this.pressedAt !== null) return;
    this.pressedAt = nowSeconds;
    this.source = source;
  }

  /** Ends the hold if `source` started it, and says what to do. */
  release(source: AimSource, nowSeconds: number): AimRelease {
    if (this.pressedAt === null || this.source !== source) return "none";
    const held = nowSeconds - this.pressedAt;
    this.pressedAt = null;
    this.source = null;
    return held < AIM_TAP_SECONDS ? "fire" : "fire-if-anchor";
  }

  /** Drops a hold without firing (Space, Escape, pause, lost focus). */
  cancel(): boolean {
    const was = this.pressedAt !== null;
    this.pressedAt = null;
    this.source = null;
    return was;
  }

  get holding(): boolean {
    return this.pressedAt !== null;
  }

  /** True once a hold has lasted past the tap threshold. */
  isAiming(nowSeconds: number): boolean {
    return this.pressedAt !== null && nowSeconds - this.pressedAt >= AIM_TAP_SECONDS;
  }
}
