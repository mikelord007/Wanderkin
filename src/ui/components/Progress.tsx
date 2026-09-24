import { useId, type ReactNode } from "react";
import { Card } from "./Card.js";
export interface ProgressStage {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "error";
  detail?: string;
}
const stageNames = { pending: "Waiting", active: "In progress", complete: "Complete", error: "Needs attention" };
export function Stepper({ stages, label = "Your world’s progress" }: { stages: readonly ProgressStage[]; label?: string }) {
  return <ol className="oq-kit-stepper" aria-label={label}>{stages.map((stage, i) => <li key={stage.id}
    data-status={stage.status} aria-current={stage.status === "active" ? "step" : undefined}>
    <span className="oq-kit-stepper__marker" aria-hidden="true">{stage.status === "complete" ? "✓" : stage.status === "error" ? "!" : i + 1}</span>
    <span><strong>{stage.label}</strong><span className="oq-kit-stepper__status">{stageNames[stage.status]}</span>
      {stage.detail && <span className="oq-kit-stepper__detail">{stage.detail}</span>}</span>
  </li>)}</ol>;
}
export function ProgressPanel({ title, detail, stages, percent, actions }: {
  title: string; detail?: string; stages: readonly ProgressStage[]; percent?: number; actions?: ReactNode;
}) {
  const id = useId();
  const known = typeof percent === "number" && Number.isFinite(percent);
  return <Card className="oq-kit-stack" aria-labelledby={id}>
    <div><h3 id={id}>{title}</h3>{detail && <p className="oq-kit-muted">{detail}</p>}</div>
    <p className="oq-kit-sr-only" role="status">{stages.filter(stage => stage.status === "active" || stage.status === "error").map(stage => `${stage.label}: ${stageNames[stage.status]}`).join(". ")}</p>
    {known && <progress className="oq-kit-progress" aria-label={title} max={100} value={Math.min(100, Math.max(0, percent))} />}
    <Stepper stages={stages} />{actions && <div className="oq-kit-row">{actions}</div>}
  </Card>;
}
