import { useId, useState } from "react";
import type { CSSProperties } from "react";
import type { AdventureTemplateId, BiomeId, EffectsQuality } from "../../biome/types.js";
// Data only: the shared list of look ids. No biome render code is imported.
import { BIOME_IDS } from "../../biome/presets.js";
import { Icon } from "./Icon.js";
import "./adventure-controls.css";

export interface AdventureControlsProps {
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
  onBiomeChange: (id: BiomeId) => void;
  onTemplateChange: (id: AdventureTemplateId) => void;
  onQualityChange: (quality: EffectsQuality) => void;
  onNewAdventure: () => void;
}

export interface AdventureOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

/** A look's tile art: a tiny landscape (sky fading to horizon over ground, with
 * one glint of its collectible colour), hand-copied from the palettes in
 * `src/biome/definitions/*.ts` so this control never imports biome code. */
export interface LookSwatch { zenith: string; horizon: string; ground: string; glint: string }

/** The player-facing name, one short line and a swatch for every look. The
 * record is keyed by every biome id, so a new id fails to compile until it is
 * named here; the tile list itself follows {@link BIOME_IDS}. */
export const LOOK_LABELS: Record<BiomeId, AdventureOption<BiomeId> & { swatch: LookSwatch | null }> = {
  original: { value: "original", label: "Original", description: "Back to your photo", swatch: null },
  tropical: { value: "tropical", label: "Tropical Island", description: "Sand, palms and sea", swatch: { zenith: "#4fb4f5", horizon: "#d9f3ff", ground: "#f0d59a", glint: "#ffb347" } },
  desert: { value: "desert", label: "Desert", description: "Dunes, cacti and dust", swatch: { zenith: "#3f97e0", horizon: "#f4e2c4", ground: "#e6c089", glint: "#ff7a3d" } },
  alpine: { value: "alpine", label: "Snowy Alpine", description: "Snow, pines, cold light", swatch: { zenith: "#6fa8dc", horizon: "#e8f1f8", ground: "#f2f6fa", glint: "#ffb020" } },
  autumn: { value: "autumn", label: "Autumn Forest", description: "Russet leaves, low sun", swatch: { zenith: "#86a9c9", horizon: "#f0e2c8", ground: "#b3864f", glint: "#3fc9d6" } },
  ember: { value: "ember", label: "Volcanic Ember", description: "Ash, glow and dusk", swatch: { zenith: "#4a4a6e", horizon: "#e7a37a", ground: "#6a5650", glint: "#62d8ff" } },
  monsoon: { value: "monsoon", label: "Monsoon Marsh", description: "Rain, reeds and puddles", swatch: { zenith: "#6d7f8c", horizon: "#b9c6cb", ground: "#5f6e68", glint: "#ffc23a" } },
};

/** Every look, in the shared biome order ("Original" is always first). */
export const THEME_OPTIONS: readonly (AdventureOption<BiomeId> & { swatch: LookSwatch | null })[] =
  BIOME_IDS.map((id) => LOOK_LABELS[id]);

export const ADVENTURE_OPTIONS: readonly AdventureOption<AdventureTemplateId>[] = [
  { value: "restore-portal", label: "Restore the Portal", description: "Find three fragments, then reach the open portal." },
  { value: "reach-beacon", label: "Reach the Beacon", description: "Follow the route to a beacon at the far end." },
];

/** Copy is kept here so tests can assert the player never sees internal terms. */
export const ADVENTURE_COPY = {
  heading: "World settings",
  themeLegend: "Look",
  themeHint: "Changes how your world looks. Your progress is kept.",
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
  onBiomeChange, onTemplateChange, onQualityChange, onNewAdventure,
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

      <fieldset className="oq-adventure__group" disabled={locked} aria-describedby={`${idPrefix}-theme-hint`}>
        <legend id={`${idPrefix}-theme-legend`} className="oq-adventure__legend">{ADVENTURE_COPY.themeLegend}</legend>
        <p id={`${idPrefix}-theme-hint`} className="oq-adventure__hint">{ADVENTURE_COPY.themeHint}</p>
        {/* Native radios sharing one name: arrow keys move between looks, and
            the group is announced with the legend as its name. */}
        <div className="oq-adventure__looks" role="radiogroup" aria-labelledby={`${idPrefix}-theme-legend`}>
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="oq-adventure__option oq-adventure__look" data-theme={option.value}>
              <input
                type="radio"
                name={`${idPrefix}-theme`}
                value={option.value}
                checked={biomeId === option.value}
                onChange={() => { if (!locked && option.value !== biomeId) onBiomeChange(option.value); }}
              />
              <span className="oq-adventure__option-body">
                {option.swatch ? (
                  <span className="oq-adventure__swatch" aria-hidden="true" style={{
                    "--sw-zenith": option.swatch.zenith, "--sw-horizon": option.swatch.horizon,
                    "--sw-ground": option.swatch.ground, "--sw-glint": option.swatch.glint,
                  } as CSSProperties} />
                ) : (
                  <span className="oq-adventure__swatch oq-adventure__swatch--photo" aria-hidden="true"><Icon name="photo" /></span>
                )}
                <span className="oq-adventure__look-text">
                  <span className="oq-adventure__option-label">{option.label}</span>
                  <span className="oq-adventure__option-description">{option.description}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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
