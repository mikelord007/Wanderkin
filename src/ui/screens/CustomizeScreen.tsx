import type { GameModeId, StyleId } from "@shared/index.js";
import type { CreationSelection } from "../creationFlow.js";
import { Button, ChoiceTiles, TextField } from "../components/index.js";
import { CreationFrame } from "./CreationFrame.js";

const LOOKS = [
  { value: "cartoon", label: "Cartoon", description: "Bold color, clean edges, and playful shapes." },
  { value: "hand-painted", label: "Hand-painted", description: "Warm brush texture with a storybook feel." },
  { value: "watercolor", label: "Watercolor", description: "Soft pigment, paper grain, and airy light." },
] as const;

const ADVENTURES = [
  { value: "explore", label: "Explore", description: "Wander at your own pace." },
  { value: "collect", label: "Collect", description: "Find the lost colors and unlock the portal." },
  { value: "race", label: "Race", description: "Reach the finish as fast as you can." },
] as const;

export function CustomizeScreen({ selection, onChange, onPreview, onBack, submitting = false, error }: {
  selection: CreationSelection;
  onChange: (selection: CreationSelection) => void;
  onPreview: () => void;
  onBack: () => void;
  submitting?: boolean;
  error?: string;
}) {
  return <CreationFrame activeStep={1} eyebrow="Step 2 of 4 · Look" title="What kind of adventure is this?" onBack={onBack} style={selection.style}>
    <div className="oq-customize oq-kit-stack">
      <ChoiceTiles<StyleId>
        legend="Look"
        hint="Style examples — your actual object appears on the next step. Choosing here does not start generation."
        value={selection.style}
        onChange={style => onChange({ ...selection, style })}
        options={LOOKS.map(look => ({ ...look, image: <span className={`oq-customize__look oq-customize__look--${look.value}`} aria-hidden="true"><i /><i /><i /></span> }))}
      />
      <ChoiceTiles<GameModeId>
        legend="Adventure"
        value={selection.mode}
        onChange={mode => onChange({ ...selection, mode })}
        options={ADVENTURES}
      />
      <div>
        <TextField
          label="Atmosphere (optional)"
          value={selection.atmosphere}
          maxLength={180}
          placeholder="A floating island above the clouds…"
          helperText="A few words are enough. Leave this blank if you want a surprise."
          onChange={event => onChange({ ...selection, atmosphere: event.target.value })}
        />
        <p className="oq-customize__count" aria-live="polite">{selection.atmosphere.length}/180</p>
      </div>
      {error ? <div className="oq-customize__error" role="alert"><strong>Your preview didn’t finish.</strong><p>{error}</p></div> : null}
      <div className="oq-kit-row oq-customize__actions">
        <Button loading={submitting} loadingLabel="Creating your preview…" onClick={onPreview}>{error ? "Retry preview" : "Preview my world"}</Button>
        <Button variant="secondary" disabled={submitting} onClick={onBack}>Back</Button>
      </div>
    </div>
  </CreationFrame>;
}

