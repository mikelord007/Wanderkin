import { useEffect, useState } from "react";
import type { GenerationJob, JobState } from "@shared/index.js";
import { describeApiError, retryJob } from "../api.js";
import { useJobPolling } from "../useJobPolling.js";
import { formatElapsed, useElapsedSeconds } from "../useElapsedSeconds.js";
import { LoadingScreen } from "../components/LoadingScreen.js";

interface GenerationScreenProps {
  jobId: string;
  onReady: (job: GenerationJob) => void;
  onCancel: () => void;
}

const STAGE_TEXT: Record<JobState, string> = {
  queued: "Waiting for a generation slot…",
  uploading: "Uploading your photos…",
  generating: "Generating the 3D model…",
  downloading: "Downloading the generated model…",
  preparing: "Preparing the level…",
  ready: "Ready.",
  failed: "Generation failed.",
};

function LegacyGenerationScreen({ jobId, onReady, onCancel }: GenerationScreenProps) {
  const { job, connectionIssue, polling, restart } = useJobPolling(jobId);
  const elapsed = useElapsedSeconds(job?.startedAt ?? job?.createdAt);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (job?.state === "ready") {
      onReady(job);
    }
  }, [job, onReady]);

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryJob(jobId);
      // The poll loop already stopped after the terminal `failed` state;
      // explicitly resume it so the now-restarted job's progress shows up
      // instead of leaving the screen stuck on the old failure.
      restart();
    } catch (error) {
      setRetryError(describeApiError(error));
    } finally {
      setRetrying(false);
    }
  }

  if (!job) {
    return (
      <div className="oq-screen oq-screen--generation">
        <LoadingScreen stage="Reconnecting to your generation job…" />
      </div>
    );
  }

  const stageText = job.uiMessage ?? STAGE_TEXT[job.state];

  return (
    <div className="oq-screen oq-screen--generation">
      <header className="oq-screen__header">
        <h1>Building your level</h1>
      </header>

      {job.state === "failed" ? (
        <div className="oq-panel oq-panel--error">
          <p className="oq-error-text">{job.lastError?.message ?? "The generation job failed."}</p>
          {retryError ? <p className="oq-error-text">{retryError}</p> : null}
          <div className="oq-actions">
            {job.lastError?.retryable !== false ? (
              <button
                type="button"
                className="oq-button oq-button--primary"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? "Retrying…" : "Retry"}
              </button>
            ) : null}
            <button type="button" className="oq-button oq-button--ghost" onClick={onCancel}>
              Back to photos
            </button>
          </div>
        </div>
      ) : (
        <div className="oq-panel">
          <LoadingScreen stage={stageText} />
          <dl className="oq-job-facts">
            <div>
              <dt>Elapsed</dt>
              <dd>{formatElapsed(elapsed)}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{job.capabilityUsed ?? job.capabilityRequested}</dd>
            </div>
            {job.fallbackFired ? (
              <div>
                <dt>Fallback</dt>
                <dd>Used {job.fallbackFired} instead of the requested model</dd>
              </div>
            ) : null}
          </dl>
          {connectionIssue ? <p className="oq-warning-text">{connectionIssue}</p> : null}
          {!polling && !connectionIssue ? (
            <p className="oq-warning-text">Polling stopped unexpectedly. Reload to resume.</p>
          ) : null}
          <div className="oq-actions">
            <button type="button" className="oq-button oq-button--ghost" onClick={onCancel}>
              Back to photos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

void LegacyGenerationScreen;
export { WorldProgressScreen as GenerationScreen } from "./WorldProgressScreen.js";
