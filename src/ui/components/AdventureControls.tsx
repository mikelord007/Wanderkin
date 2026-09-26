import { useId, useState } from "react";
import type { AdventureTemplateId, BiomeId, EffectsQuality } from "../../biome/types.js";
// Data only: the shared look names. No biome render code is imported.
import { LOOK_LABELS, lookName } from "../../biome/lookCatalog.js";
import { Icon } from "./Icon.js";
import "./adventure-controls.css";

export interface AdventureControlsProps {
  /** The look this world was created with. Fixed for the world: shown, never
   * offered as a choice. */
  biomeId: BiomeId;
  template: AdventureTemplateId;
  quality: EffectsQuality;
  /** The parent is preparing a new look or adventure. The current world stays
   * playable underneath until the parent swaps it in. */
  busy: boolean;
  /** Player-facing failure copy. The parent keeps the previous world. */
  error: string | null;
  disabled?: boolean;
  /** Ask before resetting. Pre-start has no progress to lose, so the parent
   * may skip the confirmation step there. Defaults to true. */
  confirmReset?: boolean;
  /** False hides the new-adventure section entirely (e.g. shared challenges,
   * whose course is fixed). Defaults to true. */
  newAdventureAvailable?: boolean;
  /** @deprecated A world's look is chosen when it is created and cannot be
   * changed in play; accepted only so existing callers still compile. */
  onBiomeChange?: (id: BiomeId) => void;
  onTemplateChange: (id: AdventureTemplateId) => void;
  onQualityChange: (quality: EffectsQuality) => void;
  onNewAdventure: () => void;
}

export interface AdventureOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const ADVENTURE_OPTIONS: readonly AdventureOption<AdventureTemplateId>[] = [
  { value: "restore-portal", label: "Restore the Portal", description: "Find three fragments, then reach the open portal." },
  { value: "reach-beacon", label: "Reach the Beacon", description: "Follow the route to a beacon at the far end." },
];

/** Copy is kept here so tests can assert the player never sees internal terms. */
export const ADVENTURE_COPY = {
  heading: "World settings",
  worldLabel: "World",
  worldLocked: "Chosen when this world was made",
  adventureLegend: "Next adventure",
  adventureHint: "Used the next time you start a new adventure.",
  reduceEffects: "Reduce effects",
  reduceEffectsHint: "Fewer plants, particles and shadows for smoother play.",
  newAdventure: "Start new adventure",
  newAdventureNote: "Builds a new route and resets your current progress.",
  confirmPrompt: "Start over? Your current progress will be lost.",
  confirm: "Reset and start",
  cancel: "Keep playing",
  busy: "Preparing your world…",
  errorKept: "Your current world is still here.",
} as const;

interface AdventureControlsViewProps extends AdventureControlsProps {
  idPrefix: string;
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
}

/** Controlled, stateless apart from the two-step reset confirmation. The
 * parent owns theme, adventure and quality state and gates pointer lock. */
export function AdventureControls(props: AdventureControlsProps) {
  const idPrefix = useId();
  const [confirming, setConfirming] = useState(false);
  return <AdventureControlsView {...props} idPrefix={idPrefix}
    confirming={confirming && !props.busy && !props.disabled} onConfirmingChange={setConfirming} />;
}

/** Hook-free so tests can call it directly and invoke its handlers. */
export function AdventureControlsView({
  biomeId, template, quality, busy, error, disabled = false, confirmReset = true, newAdventureAvailable = true,
  onTemplateChange, onQualityChange, onNewAdventure,
  idPrefix, confirming, onConfirmingChange,
}: AdventureControlsViewProps) {
  const locked = disabled || busy;
  const headingId = `${idPrefix}-heading`;
  const resetNoteId = `${idPrefix}-reset-note`;

  function requestNewAdventure() {
    if (locked) return;
    if (confirmReset) onConfirmingChange(true);
    else onNewAdventure();
  }

  function confirmNewAdventure() {
    onConfirmingChange(false);
    if (!locked) onNewAdventure();
  }

  return (
    <section className="oq-adventure" aria-labelledby={headingId} aria-busy={busy || undefined}>
      <h2 id={headingId} className="oq-adventure__heading">{ADVENTURE_COPY.heading}</h2>

      {/* The look was chosen (and locked) when the world was made: stated,
          not offered. */}
      <p className="oq-adventure__world" data-theme={biomeId}>
        <Icon name="lock" className="oq-adventure__world-lock" />
        <span><span className="oq-adventure__world-label">{ADVENTURE_COPY.worldLabel}: {lookName(biomeId)}</span>
          <span className="oq-adventure__hint">{LOOK_LABELS[biomeId].elements}. {ADVENTURE_COPY.worldLocked}.</span></span>
      </p>

      <label className="oq-adventure__toggle">
        <input
          type="checkbox"
          checked={quality === "reduced"}
          disabled={locked}
          aria-describedby={`${idPrefix}-quality-hint`}
          onChange={(event) => onQualityChange(event.currentTarget.checked ? "reduced" : "standard")}
        />
        <span>
          <span className="oq-adventure__toggle-label">{ADVENTURE_COPY.reduceEffects}</span>
          <span id={`${idPrefix}-quality-hint`} className="oq-adventure__hint">{ADVENTURE_COPY.reduceEffectsHint}</span>
        </span>
      </label>

      {/* Kept visually apart from the look controls: only this block resets. */}
      {newAdventureAvailable ? <div className="oq-adventure__reset">
        <fieldset className="oq-adventure__group" disabled={locked} aria-describedby={`${idPrefix}-adventure-hint`}>
          <legend className="oq-adventure__legend">{ADVENTURE_COPY.adventureLegend}</legend>
          <p id={`${idPrefix}-adventure-hint`} className="oq-adventure__hint">{ADVENTURE_COPY.adventureHint}</p>
          <div className="oq-adventure__options">
            {ADVENTURE_OPTIONS.map((option) => (
              <label key={option.value} className="oq-adventure__option">
                <input
                  type="radio"
                  name={`${idPrefix}-adventure`}
                  value={option.value}
                  checked={template === option.value}
                  onChange={() => { if (!locked && option.value !== template) onTemplateChange(option.value); }}
                />
                <span className="oq-adventure__option-body">
                  <span className="oq-adventure__option-label">{option.label}</span>
                  <span className="oq-adventure__option-description">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {confirming ? (
          <div className="oq-adventure__confirm" role="alertdialog" aria-labelledby={`${idPrefix}-confirm`}>
            <p id={`${idPrefix}-confirm`}>{ADVENTURE_COPY.confirmPrompt}</p>
            <div className="oq-adventure__actions">
              <button type="button" className="oq-adventure__button oq-adventure__button--danger" onClick={confirmNewAdventure}>
                {ADVENTURE_COPY.confirm}
              </button>
              <button type="button" className="oq-adventure__button" onClick={() => onConfirmingChange(false)}>
                {ADVENTURE_COPY.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className="oq-adventure__actions">
            <button
              type="button"
              className="oq-adventure__button oq-adventure__button--reset"
              disabled={locked}
              aria-describedby={resetNoteId}
              onClick={requestNewAdventure}
            >
              {ADVENTURE_COPY.newAdventure}
            </button>
            <p id={resetNoteId} className="oq-adventure__hint">{ADVENTURE_COPY.newAdventureNote}</p>
          </div>
        )}
      </div> : null}

      {busy ? (
        <p className="oq-adventure__status" role="status">
          <span className="oq-adventure__spinner" aria-hidden="true" />
          {ADVENTURE_COPY.busy}
        </p>
      ) : null}
      {error && !busy ? (
        <div className="oq-adventure__error" role="alert">
          <p>{error}</p>
          <p className="oq-adventure__hint">{ADVENTURE_COPY.errorKept}</p>
        </div>
      ) : null}
    </section>
  );
}
