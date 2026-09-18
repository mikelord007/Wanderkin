import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationJob } from "@shared/index.js";
import { getJob } from "./api.js";
import { startJobPolling, type JobPollerHandle } from "./jobPoller.js";

export interface JobPollingState {
  job: GenerationJob | null;
  /** Friendly text only — set on repeated poll failures, cleared on the next success. */
  connectionIssue: string | null;
  polling: boolean;
  /** Resumes polling the same job id after an external action (e.g. a
   * successful retry) may have moved a terminal `failed` job back to a
   * non-terminal state server-side. */
  restart: () => void;
}

/**
 * React wrapper around jobPoller's framework-independent engine. Clears
 * stale job state immediately when `jobId` changes so a screen never shows
 * a previous job's stage/elapsed time while the first fetch for the new id
 * is in flight.
 */
export function useJobPolling(jobId: string | null): JobPollingState {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const handleRef = useRef<JobPollerHandle | null>(null);

  useEffect(() => {
    if (!jobId) {
      handleRef.current?.stop();
      handleRef.current = null;
      setJob(null);
      setConnectionIssue(null);
      setPolling(false);
      return;
    }

    setJob(null);
    setConnectionIssue(null);
    const handle = startJobPolling(jobId, {
      fetchJob: getJob,
      onUpdate: setJob,
      onConnectionIssue: setConnectionIssue,
      onPollingChange: setPolling,
    });
    handleRef.current = handle;

    return () => {
      handle.stop();
      handleRef.current = null;
    };
  }, [jobId]);

  const restart = useCallback(() => {
    handleRef.current?.restart();
  }, []);

  return { job, connectionIssue, polling, restart };
}
