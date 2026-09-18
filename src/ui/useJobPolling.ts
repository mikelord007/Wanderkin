import { useEffect, useRef, useState } from "react";
import { isTerminalJobState, type GenerationJob } from "@shared/index.js";
import { ApiError, getJob } from "./api.js";

const INITIAL_DELAY_MS = 1200;
const MAX_DELAY_MS = 15000;
const BACKOFF_MULTIPLIER = 1.6;

export interface JobPollingState {
  job: GenerationJob | null;
  /** Friendly text only — set on repeated poll failures, cleared on the next success. */
  connectionIssue: string | null;
  polling: boolean;
}

/**
 * Polls GET /api/jobs/:id with exponential backoff. Backoff resets whenever
 * the job's state changes (fresh activity) and grows on repeated identical
 * responses or transient network failures. Stops once the job reaches a
 * terminal state (shared/job.ts isTerminalJobState).
 */
export function useJobPolling(jobId: string | null): JobPollingState {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const lastStateRef = useRef<string | null>(null);
  const delayRef = useRef(INITIAL_DELAY_MS);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setConnectionIssue(null);
      setPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    lastStateRef.current = null;
    delayRef.current = INITIAL_DELAY_MS;
    setPolling(true);

    async function poll() {
      try {
        const next = await getJob(jobId!);
        if (cancelled) return;
        setJob(next);
        setConnectionIssue(null);

        if (next.state !== lastStateRef.current) {
          delayRef.current = INITIAL_DELAY_MS;
          lastStateRef.current = next.state;
        } else {
          delayRef.current = Math.min(delayRef.current * BACKOFF_MULTIPLIER, MAX_DELAY_MS);
        }

        if (isTerminalJobState(next.state)) {
          setPolling(false);
          return;
        }
        timer = setTimeout(poll, delayRef.current);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Lost the connection to the server. Retrying...";
        setConnectionIssue(message);
        delayRef.current = Math.min(delayRef.current * BACKOFF_MULTIPLIER, MAX_DELAY_MS);
        timer = setTimeout(poll, delayRef.current);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setPolling(false);
    };
  }, [jobId]);

  return { job, connectionIssue, polling };
}
