import type { CreationSelection } from "../creationFlow.js";
import { Button, Card } from "../components/index.js";
import { CreationFrame } from "./CreationFrame.js";

export type StylePreviewState = "loading" | "ready" | "failed";

export function StylePreviewScreen({
  originalUrl,
  previewUrl,
  selection,
  state,
  approved,
  error,
  onApprove,
  onBuild,
  onChangeLook,
  onRetry,
  onBack,
  approving = false,
  building = false,
}: {
  originalUrl: string;
  previewUrl?: string;
  selection: CreationSelection;
  state: StylePreviewState;
  approved: boolean;
  error?: string;
  onApprove: () => void;
  onBuild: () => void;
  onChangeLook: () => void;
  onRetry: () => void;
  onBack: () => void;
  approving?: boolean;
  building?: boolean;
}) {
  const lookLabel = selection.style === "hand-painted" ? "Hand-painted" : selection.style === "watercolor" ? "Watercolor" : "Cartoon";
  return <CreationFrame activeStep={2} eyebrow="Step 3 of 4 · Preview" title="Like this direction?" onBack={onBack} style={selection.style}>
    <section className="oq-style-preview">
      <div className="oq-style-preview__compare">
        <Card><figure><div className="oq-style-preview__image"><img src={originalUrl} alt="Your original object" /></div><figcaption>Original object</figcaption></figure></Card>
        <Card data-state={state}>
          <figure>
            <div className="oq-style-preview__image">
              {previewUrl ? <img src={previewUrl} alt={`Your object in the ${lookLabel} style`} /> : <div className="oq-style-preview__placeholder" />}
              {state === "loading" ? <div className="oq-style-preview__loading" role="status"><span className="oq-kit-spinner" aria-hidden="true" />Finding your world’s look…</div> : null}
            </div>
            <figcaption><span>{lookLabel}</span>{approved ? <strong>✓ Approved for build</strong> : "Style preview"}</figcaption>
          </figure>
        </Card>
      </div>
      <Card className="oq-style-preview__decision oq-kit-stack">
        <div><p className="oq-kit-eyebrow">Visual direction</p><h2>{lookLabel}</h2></div>
        <p>{selection.atmosphere.trim() ? `Atmosphere: ${selection.atmosphere.trim()}` : "No extra atmosphere — keep it delightfully surprising."}</p>
        <p className="oq-kit-muted">This is the visual direction. Your playable world may look a little different.</p>
        {error ? <div className="oq-style-preview__error" role="alert"><strong>This preview didn’t finish.</strong><p>{error}</p>{previewUrl ? <p>Your last successful preview is still safe.</p> : null}</div> : null}
        <div className="oq-style-preview__actions">
          {!approved ? <Button onClick={onApprove} disabled={state !== "ready" || !previewUrl} loading={approving} loadingLabel="Approving preview…">Use this preview</Button> : <Button onClick={onBuild} loading={building} loadingLabel="Starting your world…">Build my world</Button>}
          <Button variant="secondary" onClick={onChangeLook} disabled={approving || building}>Change look</Button>
          <Button variant="secondary" onClick={onRetry} disabled={state === "loading" || approving || building}>Try another preview</Button>
          <Button variant="ghost" onClick={onBack} disabled={approving || building}>Back</Button>
        </div>
        {state !== "ready" && !previewUrl ? <p className="oq-kit-muted">Build becomes available after a successful preview is approved.</p> : null}
      </Card>
    </section>
  </CreationFrame>;
}

