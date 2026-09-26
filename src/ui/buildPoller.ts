import type { GenerationJob } from "@shared/index.js";

/*
 * One poller for every build shown on My worlds. However many cards are
 * waiting, there is a single timer: each tick asks for every watched job once
 * (the same GET /api/jobs/:id WorldProgressScreen uses), hands each result to
 * whoever is watching it, and drops jobs that finished. It slows right down
 * while the tab is hidden, backs off after errors, and polls again soon after
 * the tab comes back. Nothing here knows about React or the DOM beyond the
 * injected hooks, so it can be tested with fake timers.
 */

export type JobListener = (job: GenerationJob) => void;

export interface BuildPollerOptions {
  fetchJob: (jobId: string) => Promise<GenerationJob>;
  /** Between ticks while visible. */
  intervalMs?: number;
  /** Between ticks while the tab is hidden. */
  hiddenIntervalMs?: number;
  /** The most a run of failures can stretch the visible interval to. */
  maxBackoffMs?: number;
  isHidden?: () => boolean;
  /** Subscribes to visibility changes; returns an unsubscribe. */
  onVisibilityChange?: (listener: () => void) => () => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface BuildPoller {
  /** Watches one job; the listener gets every fresh copy until it is ready
   * or failed. Returns an unwatch. Watching the same job twice shares one
   * request. */
  watch(jobId: string, listener: JobListener): () => void;
  /** Job ids currently being polled. */
  watching(): string[];
  /** When the next tick is due, in ms (null when idle). For tests. */
  nextDelay(): number | null;
}

const TERMINAL = new Set<GenerationJob["state"]>(["ready", "failed"]);

export function createBuildPoller(options: BuildPollerOptions): BuildPoller {
  const intervalMs = options.intervalMs ?? 2500;
  const hiddenIntervalMs = options.hiddenIntervalMs ?? 30_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const isHidden = options.isHidden ?? (() => typeof document !== "undefined" && document.hidden);
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const onVisibilityChange = options.onVisibilityChange ?? ((listener) => {
    if (typeof document === "undefined") return () => undefined;
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  });

  const listeners = new Map<string, Set<JobListener>>();
  let timer: unknown = null;
  let delay: number | null = null;
  let failures = 0;
  let inFlight = false;
  let stopVisibility: (() => void) | null = null;

  function currentDelay(): number {
    if (isHidden()) return hiddenIntervalMs;
    return Math.min(maxBackoffMs, intervalMs * 2 ** Math.min(failures, 4));
  }

  function schedule(ms = currentDelay()): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
    delay = null;
    if (listeners.size === 0) return;
    delay = ms;
    timer = setTimer(() => { timer = null; delay = null; void tick(); }, ms);
  }

  async function tick(): Promise<void> {
    if (inFlight || listeners.size === 0) return;
    inFlight = true;
    const ids = [...listeners.keys()];
    const results = await Promise.allSettled(ids.map((id) => options.fetchJob(id)));
    inFlight = false;
    let failed = 0;
    results.forEach((result, index) => {
      const id = ids[index]!;
      if (result.status === "rejected") { failed += 1; return; }
      const job = result.value;
      for (const listener of [...(listeners.get(id) ?? [])]) listener(job);
      if (TERMINAL.has(job.state)) listeners.delete(id);
    });
    // Back off only when nothing got through, so one bad job can't slow the rest.
    failures = failed > 0 && failed === results.length ? failures + 1 : 0;
    if (listeners.size === 0) stop();
    else schedule();
  }

  function start(): void {
    if (!stopVisibility) {
      stopVisibility = onVisibilityChange(() => {
        // Back in view: catch up soon rather than waiting out the hidden interval.
        if (!isHidden()) schedule(Math.min(400, intervalMs));
      });
    }
    // The first request goes out almost at once, so a new card fills in quickly.
    if (timer === null && !inFlight) schedule(Math.min(300, intervalMs));
  }

  function stop(): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
    delay = null;
    failures = 0;
    stopVisibility?.();
    stopVisibility = null;
  }

  return {
    watch(jobId, listener) {
      let set = listeners.get(jobId);
      if (!set) { set = new Set(); listeners.set(jobId, set); }
      set.add(listener);
      start();
      return () => {
        const current = listeners.get(jobId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(jobId);
        // Stop only if nothing re-watches straight away: a screen that swaps
        // its watches in one go (React's effect cleanup then setup) keeps
        // the running timer instead of triggering an extra early poll.
        if (listeners.size === 0) queueMicrotask(() => { if (listeners.size === 0) stop(); });
      };
    },
    watching: () => [...listeners.keys()],
    nextDelay: () => delay,
  };
}
