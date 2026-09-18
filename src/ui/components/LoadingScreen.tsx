interface LoadingScreenProps {
  stage: string;
  detail?: string;
  /** Only pass when a real total is known (e.g. bytes downloaded / total). */
  percent?: number;
}

/** Indeterminate by default — a percent is only ever shown when the caller
 * has an actual known total, never invented. */
export function LoadingScreen({ stage, detail, percent }: LoadingScreenProps) {
  const known = typeof percent === "number" && Number.isFinite(percent);
  return (
    <div className="oq-loading" role="status" aria-live="polite">
      <div className="oq-loading__spinner" aria-hidden="true">
        <div className="oq-loading__spinner-dot" />
        <div className="oq-loading__spinner-dot" />
        <div className="oq-loading__spinner-dot" />
      </div>
      <p className="oq-loading__stage">{stage}</p>
      {known ? (
        <div className="oq-progressbar" aria-hidden="true">
          <div className="oq-progressbar__fill" style={{ width: `${Math.round(percent!)}%` }} />
        </div>
      ) : null}
      {detail ? <p className="oq-loading__detail">{detail}</p> : null}
    </div>
  );
}
