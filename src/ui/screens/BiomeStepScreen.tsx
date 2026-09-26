import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SceneBiomeId, StyleId } from "@shared/index.js";
import { LOOK_LABELS, LOOK_OPTIONS, withArticle, type LookEntry } from "../../biome/lookCatalog.js";
import { Button, ChoiceTiles, Icon } from "../components/index.js";
import { CreationFrame } from "./CreationFrame.js";

/** How long the locking moment shows each beat. */
export const GROW_MS = 1100;
export const LOCKED_MS = 700;

export const BIOME_STEP_COPY = {
  eyebrow: "Step 3 of 5 · Biome",
  chooseTitle: "Where will it grow?",
  growingTitle: "Growing its world…",
  lockedTitle: "Its biome is locked in.",
  legend: "Biome",
  lead: "Pick the world it grows into. This is locked once you continue.",
  continue: "Continue",
  continueLocked: "Continue to preview",
  growing: (label: string) => `Growing ${withArticle(label)} world for your object`,
  lockedIn: "Locked in",
  lockedForWorld: "Locked in for this world",
  lockedNote: "To grow a different biome, start a new world or use another photo.",
} as const;

/** choose: the tiles; growing / locked: the locking moment after Continue. */
export type BiomeStepPhase = "choose" | "growing" | "locked";

function swatchStyle(entry: LookEntry): CSSProperties | undefined {
  const swatch = entry.swatch;
  return swatch ? { "--sw-zenith": swatch.zenith, "--sw-horizon": swatch.horizon, "--sw-ground": swatch.ground, "--sw-glint": swatch.glint } as CSSProperties : undefined;
}

/** The same tiny landscape the in-game panel used for each look, or a photo
 * glyph for Original (the place in the photo itself). */
function Swatch({ entry, className }: { entry: LookEntry; className: string }) {
  return entry.swatch
    ? <span className={className} style={swatchStyle(entry)} aria-hidden="true" />
    : <span className={`${className} ${className}--photo`} aria-hidden="true"><Icon name="photo" /></span>;
}

export interface BiomeStepViewProps {
  style: StyleId;
  /** The object's cut-out (or photo), set into the chosen biome's card. */
  objectUrl?: string;
  /** Chosen on this screen but not yet locked. */
  picked: SceneBiomeId | null;
  /** Locked into the creation: shown, never offered again. */
  lockedBiome?: SceneBiomeId | undefined;
  phase: BiomeStepPhase;
  onPick: (id: SceneBiomeId) => void;
  onLockIn: () => void;
  onContinue: () => void;
  onBack: () => void;
}

/** Hook-free, so tests and the gallery can render any phase directly. */
export function BiomeStepView({ style, objectUrl, picked, lockedBiome, phase, onPick, onLockIn, onContinue, onBack }: BiomeStepViewProps) {
  const shown = lockedBiome ?? picked;
  const readOnly = phase === "choose" && Boolean(lockedBiome);
  const choosing = phase === "choose" && !lockedBiome;
  return <CreationFrame activeStep={2} eyebrow={BIOME_STEP_COPY.eyebrow} title={choosing ? BIOME_STEP_COPY.chooseTitle : phase === "growing" ? BIOME_STEP_COPY.growingTitle : BIOME_STEP_COPY.lockedTitle}
    {...(phase === "choose" ? { onBack } : {})} style={style}>
    <div className="oq-biome" data-phase={phase}>
      {choosing ? <>
        <ChoiceTiles<SceneBiomeId>
          legend={BIOME_STEP_COPY.legend}
          hint={BIOME_STEP_COPY.lead}
          // No tile is chosen until the player picks one.
          value={(picked ?? "") as SceneBiomeId}
          onChange={onPick}
          options={LOOK_OPTIONS.map((entry) => ({
            value: entry.value,
            label: entry.label,
            description: entry.description,
            image: <Swatch entry={entry} className="oq-biome__swatch" />,
          }))}
        />
        <div className="oq-kit-row oq-biome__actions">
          <Button variant="secondary" onClick={onBack}>Back</Button>
          <Button onClick={onLockIn} disabled={!picked}>{BIOME_STEP_COPY.continue}</Button>
        </div>
      </> : shown ? <>
        <BiomeCard entry={LOOK_LABELS[shown]} objectUrl={objectUrl} phase={phase} />
        {readOnly ? <>
          <p className="oq-biome__note">{BIOME_STEP_COPY.lockedNote}</p>
          <div className="oq-kit-row oq-biome__actions">
            <Button variant="secondary" onClick={onBack}>Back</Button>
            <Button onClick={onContinue}>{BIOME_STEP_COPY.continueLocked}</Button>
          </div>
        </> : null}
      </> : null}
    </div>
  </CreationFrame>;
}

/** The chosen tile grown into a full-width card: the place, the object set
 * into it, and what is happening to it. */
function BiomeCard({ entry, objectUrl, phase }: { entry: LookEntry; objectUrl?: string | undefined; phase: BiomeStepPhase }) {
  return <section className="oq-biome-card" data-phase={phase} data-theme={entry.value} aria-labelledby="oq-biome-card-title">
    <div className="oq-biome-card__scene">
      <Swatch entry={entry} className="oq-biome-card__land" />
      {objectUrl ? <img className="oq-biome-card__object" src={objectUrl} alt="" /> : null}
      {phase !== "growing" ? <span className="oq-biome-card__seal" aria-hidden="true"><Icon name="lock" /></span> : null}
    </div>
    <div className="oq-biome-card__body">
      <p className="oq-kit-eyebrow">{BIOME_STEP_COPY.legend}</p>
      <h2 id="oq-biome-card-title">{entry.label}</h2>
      <p className="oq-biome-card__description">{entry.description}</p>
      <p className="oq-biome-card__status" role="status">
        {phase === "growing"
          ? <><span className="oq-kit-spinner" aria-hidden="true" />{BIOME_STEP_COPY.growing(entry.label)}</>
          : <><Icon name="lock" />{phase === "locked" ? BIOME_STEP_COPY.lockedIn : BIOME_STEP_COPY.lockedForWorld}</>}
      </p>
    </div>
  </section>;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Step 3: choose the biome the world grows into. Continue locks it into the
 * creation at once (`onLock`), plays a short locking moment, then moves on
 * (`onContinue`); with reduced motion it moves on straight away. Coming back
 * to a creation whose biome is locked shows it read-only.
 */
export function BiomeStepScreen({ style, objectUrl, lockedBiome, onLock, onContinue, onBack }: {
  style: StyleId;
  objectUrl?: string;
  lockedBiome?: SceneBiomeId | undefined;
  onLock: (id: SceneBiomeId) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<SceneBiomeId | null>(null);
  const [phase, setPhase] = useState<BiomeStepPhase>("choose");
  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;

  useEffect(() => {
    if (phase === "choose") return;
    const timer = window.setTimeout(() => {
      if (phase === "growing") setPhase("locked");
      else continueRef.current();
    }, phase === "growing" ? GROW_MS : LOCKED_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function lockIn() {
    if (!picked || lockedBiome) return;
    onLock(picked);
    if (prefersReducedMotion()) onContinue();
    else setPhase("growing");
  }

  return <BiomeStepView style={style} {...(objectUrl ? { objectUrl } : {})} picked={picked} lockedBiome={lockedBiome} phase={phase}
    onPick={setPicked} onLockIn={lockIn} onContinue={onContinue} onBack={onBack} />;
}
