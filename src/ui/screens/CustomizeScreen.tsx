import type { GameModeId, StyleId } from "@shared/index.js";
import type { CreationSelection } from "../creationFlow.js";
import { Button, ChoiceTiles, STYLE_EXAMPLES, TextField } from "../components/index.js";
import { CreationFrame } from "./CreationFrame.js";

const ADVENTURES = [
  { value: "explore", label: "Explore", description: "Wander at your own pace. Nothing is chasing you." },
  { value: "collect", label: "Collect", description: "Find the lost colors scattered around, then open the portal." },
  { value: "race", label: "Race", description: "One route, one clock. Reach the finish as fast as you can." },
] as const;

export function CustomizeScreen({ selection, onChange, onContinue, onBack, error }: {
  selection: CreationSelection;
  onChange: (selection: CreationSelection) => void;
  /** On to the biome step. */
  onContinue: () => void;
  onBack: () => void;
  error?: string;
}) {
  return <CreationFrame activeStep={1} eyebrow="Step 2 of 5 · Look" title="Pick a look, pick an adventure." onBack={onBack} style={selection.style}>
    <div className="oq-customize">
      {/* Two decisions of the same weight, so they get the same treatment: a
          heading in the display face, a rule, and the tiles. The old screen
          gave each one a shadowed card, which made three stacked boxes that
          all shouted equally and left no room to breathe between them. */}
      <section className="oq-customize__group">
        <ChoiceTiles<StyleId>
          legend="Look"
          hint="Pick the look for your world. Each example shows the same room in that style."
          value={selection.style}
          onChange={style => onChange({ ...selection, style })}
          options={STYLE_EXAMPLES.map(example => ({
            value: example.id,
            label: example.label,
            description: example.description,
            image: <img src={example.src} alt={example.alt} loading="lazy" width={1120} height={605} />,
          }))}
        />
      </section>

      <section className="oq-customize__group">
        <ChoiceTiles<GameModeId>
          legend="Adventure"
          hint="What you will actually be doing in there."
          value={selection.mode}
          onChange={mode => onChange({ ...selection, mode })}
          options={ADVENTURES}
        />
      </section>

      <section className="oq-customize__group oq-customize__group--atmosphere">
        <TextField
          label="Atmosphere (optional)"
          value={selection.atmosphere}
          maxLength={180}
          placeholder="A floating island above the clouds…"
          helperText="A few words are enough. Leave it blank for a surprise."
          onChange={event => onChange({ ...selection, atmosphere: event.target.value })}
        />
        <p className="oq-customize__count" aria-live="polite">{selection.atmosphere.length}/180</p>
      </section>

      {error ? <div className="oq-customize__error" role="alert"><strong>Your preview didn’t finish.</strong><p>{error}</p></div> : null}
      <div className="oq-kit-row oq-customize__actions">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  </CreationFrame>;
}
