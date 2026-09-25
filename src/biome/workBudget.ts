/**
 * Wall-clock budget for synchronous adventure preparation.
 *
 * Generation runs on the main thread, so a scene that keeps failing late
 * (every structure trial, objective pick and publish check refused, then the
 * same again on a fallback floor) must stop with an explicit refusal rather
 * than freeze the page. One budget spans the whole request: both geometry
 * attempts and every structure and objective loop.
 *
 * This is a deadline checked BETWEEN stages, not a hard timeout. A synchronous
 * clock cannot interrupt a stage that is already running, so the real worst
 * case is the limit plus the longest single stage: one course-planner call, or
 * one structure trial, route check or publish check (each a full re-analysis
 * plus a route search). `ADVENTURE_MAX_ANALYSED_TRIANGLES` in `adventures.ts`
 * bounds that stage.
 *
 * A check only ever throws; it never steers generation. With enough budget,
 * the layout for a given source, template and seed is exactly the one produced
 * without a budget. Running out never swaps in a cheaper, different layout.
 */
import { BiomeGeometryError } from "./geometry.js";

/** Measured successful preparation on the bundled real scans is 120–360 ms, so
 * this leaves more than 5× headroom for slower devices before refusing. */
export const ADVENTURE_TIME_BUDGET_MS = 2000;

export class AdventureBudgetExhaustedError extends BiomeGeometryError {
  constructor(
    readonly stage: string,
    readonly elapsedMs: number,
    readonly limitMs: number,
  ) {
    super(
      `Adventure preparation used its ${limitMs} ms budget (${Math.round(elapsedMs)} ms elapsed, stopped before ${stage}); nothing was changed.`,
    );
    this.name = "AdventureBudgetExhaustedError";
  }
}

export class WorkDeadline {
  private readonly startedAt: number;
  private checks = 0;

  constructor(
    readonly limitMs: number = ADVENTURE_TIME_BUDGET_MS,
    /** Injectable for deterministic tests; production uses `performance.now`. */
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = now();
  }

  /** Number of stage boundaries checked so far (diagnostics and tests). */
  get checkCount(): number {
    return this.checks;
  }

  /** Throws `AdventureBudgetExhaustedError` once the budget is spent. Call only
   * between stages, where nothing partial has been kept yet. */
  check(stage: string): void {
    this.checks += 1;
    const elapsed = this.now() - this.startedAt;
    if (elapsed > this.limitMs) throw new AdventureBudgetExhaustedError(stage, elapsed, this.limitMs);
  }
}
