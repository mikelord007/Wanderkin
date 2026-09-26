import { useId, type ReactNode } from "react";
import { Card } from "./Card.js";
export interface ProgressStage {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "error";
  detail?: string;
}
/** A plain line for the stage that is running right now, e.g. who is doing
 * the work. Returning nothing keeps the generic "In progress". */
export type ActiveStageNote = (stage: ProgressStage) => string | undefined;

const stageNames = { pending: "Waiting", active: "In progress", complete: "Complete", error: "Needs attention" };

/**
 * Stages as numbered circles. The one running now carries a spinning ring
 * (a gently pulsing dot when motion is reduced), done stages a check, a
 * failed one "!", and stages still to come a quiet outline. `compact` draws
 * the circles alone, in a row, for small places like a world card.
 */
export function Stepper({ stages, label = "Your world’s progress", activeNote, compact = false }: {
  stages: readonly ProgressStage[]; label?: string; activeNote?: ActiveStageNote; compact?: boolean;
}) {
  return <ol className={`oq-kit-stepper${compact ? " oq-kit-stepper--compact" : ""}`} aria-label={label}>{stages.map((stage, i) => {
    const note = stage.status === "active" ? activeNote?.(stage) : undefined;
    return <li key={stage.id} data-status={stage.status} aria-current={stage.status === "active" ? "step" : undefined}
      {...(compact ? { "aria-label": `${stage.label}: ${note ?? stageNames[stage.status]}` } : {})}>
      <span className="oq-kit-stepper__marker" aria-hidden="true">
        <span className="oq-kit-stepper__glyph">{stage.status === "complete" ? "✓" : stage.status === "error" ? "!" : i + 1}</span>
      </span>
      {compact ? null : <span><strong>{stage.label}</strong><span className="oq-kit-stepper__status">{note ?? stageNames[stage.status]}</span>
        {stage.detail && <span className="oq-kit-stepper__detail">{stage.detail}</span>}</span>}
    </li>;
  })}</ol>;
}
export function ProgressPanel({ title, detail, stages, percent, actions, activeNote }: {
  title: string; detail?: string; stages: readonly ProgressStage[]; percent?: number; actions?: ReactNode; activeNote?: ActiveStageNote;
}) {
  const id = useId();
  const known = typeof percent === "number" && Number.isFinite(percent);
  return <Card className="oq-kit-stack" aria-labelledby={id}>
    <div><h3 id={id}>{title}</h3>{detail && <p className="oq-kit-muted">{detail}</p>}</div>
    <p className="oq-kit-sr-only" role="status">{stages.filter(stage => stage.status === "active" || stage.status === "error").map(stage => `${stage.label}: ${(stage.status === "active" ? activeNote?.(stage) : undefined) ?? stageNames[stage.status]}`).join(". ")}</p>
    {known && <progress className="oq-kit-progress" aria-label={title} max={100} value={Math.min(100, Math.max(0, percent))} />}
    <Stepper stages={stages} {...(activeNote ? { activeNote } : {})} />{actions && <div className="oq-kit-row">{actions}</div>}
  </Card>;
}
