import { isTerminalJobState, type GenerationJob } from "@shared/index.js";

export interface JobPollerOptions {
  fetchJob: (jobId: string) => Promise<GenerationJob>;
  onUpdate: (job: GenerationJob) => void;
  /** Friendly text only, or null to clear a previously reported issue. */
  onConnectionIssue: (message: string | null) => void;
  onPollingChange: (polling: boolean) => void;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export interface JobPollerHandle {
  stop: () => void;
  /** Resets backoff and resumes polling the same job id immediately —
   * required after a retry that may have moved a `failed` job back to a
   * non-terminal state server-side, since a terminal state otherwise ends
   * the poll loop for good. */
  restart: () => void;
}

/**
 * Framework-independent polling engine (no React) so backoff/restart/
 * terminal-stop behavior is unit-testable with fake timers. `useJobPolling`
 * is a thin React wrapper around this.
 *
 * A monotonic `generation` counter invalidates any in-flight fetch that
 * resolves after `stop()`/`restart()` fired, so a stale response from a
 * pre-restart request can never overwrite fresher state.
 */
export function startJobPolling(jobId: string, options: JobPollerOptions): JobPollerHandle {
  const {
    fetchJob,
    onUpdate,
    onConnectionIssue,
    onPollingChange,
    initialDelayMs = 1200,
    maxDelayMs = 15000,
    backoffMultiplier = 1.6,
  } = options;

  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastState: string | null = null;
  let delay = initialDelayMs;
  let stopped = false;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function poll(myGeneration: number) {
    fetchJob(jobId).then(
      (result) => {
        if (stopped || myGeneration !== generation) return;
        onUpdate(result);
        onConnectionIssue(null);

        if (result.state !== lastState) {
          delay = initialDelayMs;
          lastState = result.state;
        } else {
          delay = Math.min(delay * backoffMultiplier, maxDelayMs);
        }

        if (isTerminalJobState(result.state)) {
          onPollingChange(false);
          return;
        }
        timer = setTimeout(() => poll(myGeneration), delay);
      },
      (error: unknown) => {
        if (stopped || myGeneration !== generation) return;
        const message =
          error instanceof Error ? error.message : "Lost the connection to the server. Retrying…";
        onConnectionIssue(message);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
        timer = setTimeout(() => poll(myGeneration), delay);
      },
    );
  }

  function begin() {
    clearTimer();
    generation += 1;
    const myGeneration = generation;
    lastState = null;
    delay = initialDelayMs;
    stopped = false;
    onPollingChange(true);
    poll(myGeneration);
  }

  begin();

  return {
    stop() {
      stopped = true;
      generation += 1;
      clearTimer();
      onPollingChange(false);
    },
    restart() {
      begin();
    },
  };
}
