import { useEffect, useState } from "react";
import type { GenerationJob } from "@shared/index.js";
import { Button, Card, ProgressPanel } from "../components/index.js";
import { describeApiError, getJob, retryJob, submitGeneration } from "../api.js";
import { loadActiveCreation, loadCreationRecords, saveCreationRecord, updateCreationJob } from "../creationStorage.js";
import type { CreationAttentionStage, CreationRecord } from "../creationFlow.js";
import { extraRetryMode, extrasToSubmit, failedExtraStage, worldBuildStages, worldChoicesLine, type ExtraStage } from "../pendingWorlds.js";
import { formatElapsed, useElapsedSeconds } from "../useElapsedSeconds.js";
import { useJobPolling } from "../useJobPolling.js";
import { EXTRAS_REASK_MS, reaskMissingExtras } from "../worldBuild.js";
import { CreationFrame } from "./CreationFrame.js";
import { buildStageNote } from "../buildStageNotes.js";
import { creationWorldName } from "../worldName.js";

interface WorldProgressScreenProps { jobId: string; onReady: (job: GenerationJob) => void; onCancel: () => void; }
function key(prefix: string) { return `${prefix}-${"randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`; }
type FullJobs = Partial<Record<CreationAttentionStage, GenerationJob>>;

export function WorldProgressScreen({ jobId, onReady, onCancel }: WorldProgressScreenProps) {
  const { job: shapeJob, connectionIssue, restart } = useJobPolling(jobId);
  const [record, setRecord] = useState<CreationRecord | null>(() => loadActiveCreation());
  const [jobs, setJobs] = useState<FullJobs>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<CreationAttentionStage | null>(null);
  const elapsed = useElapsedSeconds(shapeJob?.startedAt ?? shapeJob?.createdAt);

  function persistJob(stage: CreationAttentionStage, job: GenerationJob) {
    // This screen's own creation, even if another one has since become active.
    const current = loadCreationRecords().find(candidate => candidate.id === record?.id) ?? record; if (!current) return;
    const next = updateCreationJob(current, stage, job); saveCreationRecord(next); setRecord(next);
    setJobs(previous => ({ ...previous, [stage]: job }));
  }

  useEffect(() => { if (shapeJob) persistJob("shape", shapeJob); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shapeJob?.state, shapeJob?.updatedAt]);

  useEffect(() => {
    const id = record?.id; if (!id) return;
    // Only what is still missing: never asked for, turned away (busy, over a
    // limit), or the superseded 60 s soundtrack; asked again every so often
    // while this screen is open. A real failure waits for Retry.
    const ask = () => {
      const current = loadCreationRecords().find(candidate => candidate.id === id);
      if (current) void reaskMissingExtras(current, { submit: request => submitGeneration({ request, worldId: id }), record: persistJob, key });
    };
    ask(); const timer = window.setInterval(ask, EXTRAS_REASK_MS);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  useEffect(() => {
    if (!record) return;
    const refs = (["music"] as const).map(stage => [stage, record.jobs[stage]] as const).filter(([, ref]) => ref && ref.state !== "ready" && ref.state !== "failed");
    if (!refs.length) return; let cancelled = false;
    const timer = window.setInterval(() => { for (const [stage, ref] of refs) if (ref) void getJob(ref.id).then(job => { if (!cancelled) persistJob(stage, job); }).catch(() => undefined); }, 1200);
    return () => { cancelled = true; window.clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.jobs.music?.state]);

  function submitExtra(stage: ExtraStage, request: Parameters<typeof submitGeneration>[0]["request"]) {
    if (!record) return Promise.resolve();
    return submitGeneration({ request, worldId: record.id }).then(job => persistJob(stage, job)).catch(error => setActionError(describeApiError(error)));
  }

  async function retry(stage: CreationAttentionStage) {
    if (stage === "music" && record && extraRetryMode(record.jobs[stage]) === "resubmit") {
      // The server would hand back the same failed job; ask for a fresh one.
      setRetrying(stage); setActionError(null);
      try { for (const [extraStage, request] of extrasToSubmit(record, key, [stage])) if (extraStage === stage) await submitExtra(stage, request); }
      finally { setRetrying(null); }
      return;
    }
    const ref = stage === "shape" ? shapeJob : record?.jobs[stage] ? jobs[stage] ?? record.jobs[stage] : undefined;
    if (!ref) return; setRetrying(stage); setActionError(null);
    try { const next = await retryJob(ref.id); persistJob(stage, next); if (stage === "shape") restart(); }
    catch (error) { setActionError(describeApiError(error)); } finally { setRetrying(null); }
  }

  const title = record ? creationWorldName(record) : "Your little world";
  const music = jobs.music?.result?.kind === "music" ? jobs.music.result.asset : null;
  const shapeState = shapeJob?.state;
  // The same stages and alarm rule a My worlds card uses (pendingWorlds.ts).
  const optionalFailed = failedExtraStage(record);
  const stages = worldBuildStages(record, shapeJob ? { state: shapeJob.state, uiMessage: shapeJob.uiMessage } : null);

  return <CreationFrame activeStep={4} eyebrow="Step 5 of 5 · World" title="Your world is taking shape." style={record?.selection.style ?? "cartoon"}>
    <section className="oq-world-progress">
      <Card className="oq-world-progress__preview">
        {record?.preview?.asset.url ? <img src={record.preview.asset.url} alt="Approved visual direction for your world" /> : <div className="oq-world-progress__placeholder" />}
        {/* No title or mission here while it builds: just what it is. */}
        <div className="oq-world-progress__glimpse"><p className="oq-kit-eyebrow">A first glimpse</p><h2>{title}</h2>{record ? <p className="oq-world-progress__choices">{worldChoicesLine(record.selection.style, record.selection.mode, record.selection.biome)}</p> : null}</div>
        {music ? <div className="oq-world-progress__audio">
          <label>Music preview<audio controls preload="none" src={music.url} /></label>
          <p className="oq-kit-muted">Sound plays only when you press play.</p>
        </div> : null}
      </Card>
      <ProgressPanel title="Making your world" detail={shapeJob ? `Elapsed ${formatElapsed(elapsed)}` : "Finding your world’s progress"} stages={stages} activeNote={buildStageNote} actions={<>
        {shapeState === "ready" ? <Button onClick={() => shapeJob && onReady(shapeJob)}>Prepare my course</Button> : null}
        {shapeState === "failed" ? <Button onClick={() => void retry("shape")} loading={retrying === "shape"} loadingLabel="Retrying 3D shape…">Retry 3D shape</Button> : null}
        <Button variant="secondary" onClick={onCancel}>My worlds</Button>
      </>} />
    </section>
    {optionalFailed ? <Card className="oq-world-progress__optional-error"><strong>Your world is still safe.</strong><p>Its music needs another try. The finished shape will not be regenerated.</p><Button variant="secondary" onClick={() => void retry(optionalFailed)} loading={retrying === optionalFailed}>Retry music</Button></Card> : null}
    {connectionIssue ? <p className="oq-world-progress__notice" role="status">{connectionIssue}</p> : null}
    {actionError ? <p className="oq-kit-error" role="alert">{actionError}</p> : null}
    <p className="oq-world-progress__leave-note">You can leave this page. Work continues, and My worlds will bring you back to this same progress.</p>
  </CreationFrame>;
}
