import { useEffect, useRef, useState } from "react";
import type { GenerationJob } from "@shared/index.js";
import { Button, Card, ProgressPanel, type ProgressStage } from "../components/index.js";
import { describeApiError, getJob, retryJob, submitGeneration } from "../api.js";
import { loadActiveCreation, saveCreationRecord, updateCreationJob } from "../creationStorage.js";
import { buildWorldExtrasRequests, type CreationAttentionStage, type CreationRecord } from "../creationFlow.js";
import { formatElapsed, useElapsedSeconds } from "../useElapsedSeconds.js";
import { useJobPolling } from "../useJobPolling.js";
import { CreationFrame } from "./CreationFrame.js";

interface WorldProgressScreenProps { jobId: string; onReady: (job: GenerationJob) => void; onCancel: () => void; }
function key(prefix: string) { return `${prefix}-${"randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`; }
type FullJobs = Partial<Record<CreationAttentionStage, GenerationJob>>;

export function WorldProgressScreen({ jobId, onReady, onCancel }: WorldProgressScreenProps) {
  const { job: shapeJob, connectionIssue, restart } = useJobPolling(jobId);
  const [record, setRecord] = useState<CreationRecord | null>(() => loadActiveCreation());
  const [jobs, setJobs] = useState<FullJobs>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<CreationAttentionStage | null>(null);
  const started = useRef(false);
  const elapsed = useElapsedSeconds(shapeJob?.startedAt ?? shapeJob?.createdAt);

  function persistJob(stage: CreationAttentionStage, job: GenerationJob) {
    const current = loadActiveCreation() ?? record; if (!current) return;
    const next = updateCreationJob(current, stage, job); saveCreationRecord(next); setRecord(next);
    setJobs(previous => ({ ...previous, [stage]: job }));
  }

  useEffect(() => { if (shapeJob) persistJob("shape", shapeJob); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shapeJob?.state, shapeJob?.updatedAt]);

  useEffect(() => {
    if (!record || started.current) return; started.current = true;
    for (const [stage, request] of buildWorldExtrasRequests(record, key)) submitGeneration({ request, worldId: record.id }).then(job => persistJob(stage, job)).catch(error => setActionError(describeApiError(error)));
  // one orchestration pass per mounted durable creation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  useEffect(() => {
    if (!record) return;
    const refs = (["story", "music"] as const).map(stage => [stage, record.jobs[stage]] as const).filter(([, ref]) => ref && ref.state !== "ready" && ref.state !== "failed");
    if (!refs.length) return; let cancelled = false;
    const timer = window.setInterval(() => { for (const [stage, ref] of refs) if (ref) void getJob(ref.id).then(job => { if (!cancelled) persistJob(stage, job); }).catch(() => undefined); }, 1200);
    return () => { cancelled = true; window.clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.jobs.story?.state, record?.jobs.music?.state]);

  async function retry(stage: CreationAttentionStage) {
    const ref = stage === "shape" ? shapeJob : record?.jobs[stage] ? jobs[stage] ?? record.jobs[stage] : undefined;
    if (!ref) return; setRetrying(stage); setActionError(null);
    try { const next = await retryJob(ref.id); persistJob(stage, next); if (stage === "shape") restart(); }
    catch (error) { setActionError(describeApiError(error)); } finally { setRetrying(null); }
  }

  const story = jobs.story;
  const structured = story?.result?.kind === "text" && story.result.output.structured && typeof story.result.output.structured === "object" ? story.result.output.structured as Record<string, unknown> : null;
  const title = typeof structured?.title === "string" ? structured.title : record?.title ?? "Your little world";
  const intro = typeof structured?.intro === "string" ? structured.intro : typeof structured?.objective === "string" ? structured.objective : record?.questIntro;
  const music = jobs.music?.result?.kind === "music" ? jobs.music.result.asset : null;
  const shapeState = shapeJob?.state;
  const optionalFailed = (["story", "music"] as const).find(stage => record?.jobs[stage]?.state === "failed");
  const stages: ProgressStage[] = [
    { id: "object", label: "Preparing your object", status: record?.jobs.object?.state === "failed" ? "error" : "complete" },
    { id: "shape", label: "Building its 3D shape", status: shapeState === "failed" ? "error" : shapeState === "ready" ? "complete" : "active", ...(shapeJob?.uiMessage ? { detail: shapeJob.uiMessage } : {}) },
    { id: "course", label: "Creating your course", status: shapeState === "ready" ? "active" : "pending", detail: shapeState === "ready" ? "The shape is ready for course preparation." : "Begins when the shape is ready." },
    { id: "story", label: "Adding its story and sound", status: optionalFailed ? "error" : record?.jobs.story?.state === "ready" && record.jobs.music?.state === "ready" ? "complete" : record?.jobs.story || record?.jobs.music ? "active" : "pending", ...(optionalFailed ? { detail: "Your world stays playable. Sound can be added later." } : {}) },
  ];

  return <CreationFrame activeStep={3} eyebrow="Step 4 of 4 · World" title="Your world is taking shape." style={record?.selection.style ?? "cartoon"}>
    <section className="oq-world-progress">
      <Card className="oq-world-progress__preview">
        {record?.preview?.asset.url ? <img src={record.preview.asset.url} alt="Approved visual direction for your world" /> : <div className="oq-world-progress__placeholder" />}
        <div><p className="oq-kit-eyebrow">A first glimpse</p><h2>{title}</h2>{intro ? <p>{intro}</p> : <p className="oq-kit-muted">Your title and mission will appear here when they are ready.</p>}</div>
        {music ? <div className="oq-world-progress__audio">
          <label>Music preview<audio controls preload="none" src={music.url} /></label>
          <p className="oq-kit-muted">Sound plays only when you press play.</p>
        </div> : null}
      </Card>
      <ProgressPanel title="Making your world" detail={shapeJob ? `Elapsed ${formatElapsed(elapsed)}` : "Finding your world’s progress"} stages={stages} actions={<>
        {shapeState === "ready" ? <Button onClick={() => shapeJob && onReady(shapeJob)}>Prepare my course</Button> : null}
        {shapeState === "failed" ? <Button onClick={() => void retry("shape")} loading={retrying === "shape"} loadingLabel="Retrying 3D shape…">Retry 3D shape</Button> : null}
        <Button variant="secondary" onClick={onCancel}>My worlds</Button>
      </>} />
    </section>
    {optionalFailed ? <Card className="oq-world-progress__optional-error"><strong>Your world is still safe.</strong><p>{optionalFailed === "story" ? "The story" : "Music"} needs another try. The finished shape will not be regenerated.</p><Button variant="secondary" onClick={() => void retry(optionalFailed)} loading={retrying === optionalFailed}>Retry {optionalFailed}</Button></Card> : null}
    {connectionIssue ? <p className="oq-world-progress__notice" role="status">{connectionIssue}</p> : null}
    {actionError ? <p className="oq-kit-error" role="alert">{actionError}</p> : null}
    <p className="oq-world-progress__leave-note">You can leave this page. Work continues, and My worlds will bring you back to this same progress.</p>
  </CreationFrame>;
}
