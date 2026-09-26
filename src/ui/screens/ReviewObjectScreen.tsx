import { useState } from "react";
import type { CropSettings } from "../creationFlow.js";
import { Button, Card } from "../components/index.js";
import { CreationFrame } from "./CreationFrame.js";
import { TinyExplorer } from "../components/Scenery.js";

export type ObjectReviewState = "loading" | "ready" | "broken";

export interface ReviewObjectScreenProps {
  originalUrl: string;
  cutoutUrl?: string;
  state: ObjectReviewState;
  detail?: string;
  crop: CropSettings;
  onCropChange: (crop: CropSettings) => void;
  onAccept: () => void;
  onUseOriginal: () => void;
  onReplace: () => void;
  onRetryIsolation: () => void;
  onBack: () => void;
}

export function ReviewObjectScreen({
  originalUrl,
  cutoutUrl,
  state,
  detail,
  crop,
  onCropChange,
  onAccept,
  onUseOriginal,
  onReplace,
  onRetryIsolation,
  onBack,
}: ReviewObjectScreenProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const visibleUrl = showOriginal || !cutoutUrl ? originalUrl : cutoutUrl;

  return (
    <CreationFrame activeStep={0} eyebrow="Step 1 of 5 · Review" title="Here’s your object." onBack={onBack}>
      <section className="oq-review">
        <Card className="oq-review__visual">
          <div className="oq-review__toolbar" aria-label="Object view">
            <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)} disabled={!cutoutUrl}>Isolated object</button>
            <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>Original photo</button>
          </div>
          <div className="oq-review__stage" aria-busy={state === "loading"}>
            {/* A scale cue: the explorer beside your object, for size. */}
            <TinyExplorer className="oq-review__explorer" />
            <img
              src={visibleUrl}
              alt={showOriginal ? "Original object photo" : "Isolated object preview"}
              style={{ transform: `translate(${crop.x}%, ${crop.y}%) scale(${crop.scale})` }}
            />
            {state === "loading" ? <div className="oq-review__loading" role="status"><span className="oq-kit-spinner" aria-hidden="true" />Preparing your object…</div> : null}
          </div>
          {adjusting ? (
            <fieldset className="oq-review__crop">
              <legend>Adjust crop</legend>
              <label>Size <output>{Math.round(crop.scale * 100)}%</output><input type="range" min="1" max="2" step="0.05" value={crop.scale} onChange={(event) => onCropChange({ ...crop, scale: Number(event.target.value) })} /></label>
              <label>Move left or right <output>{crop.x}%</output><input type="range" min="-50" max="50" step="1" value={crop.x} onChange={(event) => onCropChange({ ...crop, x: Number(event.target.value) })} /></label>
              <label>Move up or down <output>{crop.y}%</output><input type="range" min="-50" max="50" step="1" value={crop.y} onChange={(event) => onCropChange({ ...crop, y: Number(event.target.value) })} /></label>
              <Button variant="ghost" onClick={() => setAdjusting(false)}>Done adjusting</Button>
            </fieldset>
          ) : null}
        </Card>

        <aside className="oq-review__panel">
          <p className="oq-kit-eyebrow">A quick object check</p>
          <h2>Is the whole object here?</h2>
          <ul className="oq-review__checklist">
            <li>Every important edge is visible</li>
            <li>No large pieces are missing</li>
            <li>The shape still looks like your object</li>
          </ul>
          {state === "loading" ? <p className="oq-kit-muted" role="status">We’re separating the object from its background. Nothing else will start yet.</p> : null}
          {state === "broken" ? (
            <div className="oq-review__notice" role="alert">
              <strong>Some of your object is missing.</strong>
              <p>{detail ?? "Try isolating it again, use the original photo, or choose another photo."}</p>
            </div>
          ) : detail ? <p className="oq-kit-muted">{detail}</p> : null}
          <div className="oq-review__actions">
            <Button onClick={onAccept} disabled={state !== "ready" || !cutoutUrl}>Looks good</Button>
            <Button variant="secondary" onClick={() => setAdjusting(true)} disabled={state === "loading"}>Adjust crop</Button>
            <Button variant="secondary" onClick={onReplace}>Replace photo</Button>
            <Button variant="ghost" onClick={onUseOriginal} disabled={state === "loading"}>Use original photo</Button>
            {state === "broken" ? <Button variant="ghost" onClick={onRetryIsolation}>Retry object preparation</Button> : null}
          </div>
        </aside>
      </section>
    </CreationFrame>
  );
}

